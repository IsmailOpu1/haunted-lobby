import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { config } from "@haunted/shared";
import { modelLoaders, type ModelLoaders } from "./loaders.ts";

// The eight player characters (GDD 22.1) and their shared animations, built by
// tools/art/build-characters.ts. A character is only downloaded once someone in the night has
// been dealt it, so the hotel does not wait for all eight.

const FOLDER = `${import.meta.env.BASE_URL}assets/characters/`;
export const CLIPS = ["idle", "walk", "run", "crouch-idle", "crouch-walk", "crawl", "downed-idle", "knocked-down", "dying"] as const;
export type ClipName = (typeof CLIPS)[number];
/** Clips that repeat; the rest play once and hold their last frame. */
const LOOPS = new Set<ClipName>(["idle", "walk", "run", "crouch-idle", "crouch-walk", "crawl", "downed-idle"]);
const HIPS = "mixamorigHips";
const HEAD_TOP = "mixamorigHeadTop_End";
/** The fall to the floor: the rest of the Mixamo clip is lying still, which downed-idle does better. */
const KNOCKED_DOWN_SEC = 2.7;
/**
 * The downed clips lie on the back with the head toward the body's back; the crawl goes that way
 * too (pushing along on the back). While crawling the body is turned round so it goes head first
 * the way the player moves.
 */
export const CRAWL_TURN_RAD = Math.PI;
/** Slower than this counts as standing still (m/s). */
export const MOVING_MPS = 0.2;

/**
 * Which clip a player's body plays (GDD 9: alive, downed, dead). `knockedDownDone`: the fall to the
 * floor has finished playing, so a downed player now lies breathing or crawls.
 */
export function chooseClip(health: string, crouching: boolean, speed: number, knockedDownDone: boolean): ClipName {
  const moving = speed > MOVING_MPS;
  if (health === "dead") return "dying";
  if (health === "downed") {
    if (!knockedDownDone) return "knocked-down";
    return moving ? "crawl" : "downed-idle";
  }
  if (crouching) return moving ? "crouch-walk" : "crouch-idle";
  if (speed > (config.movement.walk + config.movement.run) / 2) return "run";
  return moving ? "walk" : "idle";
}

/** One player's copy of a character: its own bones and materials, ready to animate. */
export interface CharacterBody {
  /** Stands on the floor at its origin, facing -Z like the camera, config.body.heightM tall. */
  root: THREE.Object3D;
  clips: Map<ClipName, THREE.AnimationClip>;
  /** Every material, with the colour it was made with (so it can be darkened and restored). */
  materials: { material: THREE.MeshStandardMaterial; colour: THREE.Color }[];
}

interface Loaded {
  gltf: GLTF;
  clips: Map<ClipName, THREE.AnimationClip>;
  /** Scales the model to config.body.heightM. */
  scale: number;
}

export class CharacterModels {
  private loaders: ModelLoaders | null = null;
  private anims: Promise<GLTF> | null = null;
  private loaded = new Map<string, Promise<Loaded>>();
  /**
   * Low quality (Options): each character's Low copy (characters/low, build-characters.ts), a
   * quarter of the triangles in a few draw calls with 1K textures, so seven players in view keep
   * Low under its limits (PRD 9).
   */
  private low = false;

  constructor(private renderer: THREE.WebGLRenderer) {}

  setLowQuality(low: boolean) {
    this.low = low;
  }

  /** Which file a body of this character comes from now ("" for none dealt). */
  fileFor(character: string): string {
    return character && (this.low ? `low/${character}` : character);
  }

  /** A fresh body of this character, or null if it can't be loaded. */
  async body(character: string): Promise<CharacterBody | null> {
    const file = this.fileFor(character);
    let entry = this.loaded.get(file);
    if (!entry) {
      entry = this.load(file);
      this.loaded.set(file, entry);
    }
    try {
      const { gltf, clips, scale } = await entry;
      const model = cloneSkinned(gltf.scene);
      const materials: CharacterBody["materials"] = [];
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Bounds are from the standing pose; a body lying down or crawling would be culled wrongly.
        mesh.frustumCulled = false;
        const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
          const copy = (m as THREE.MeshStandardMaterial).clone();
          materials.push({ material: copy, colour: copy.color.clone() });
          return copy;
        });
        mesh.material = Array.isArray(mesh.material) ? own : own[0]!;
      });
      model.scale.setScalar(scale);
      // The models face +Z; players look along -Z.
      model.rotation.y = Math.PI;
      const root = new THREE.Group();
      root.add(model);
      return { root, clips, materials };
    } catch (err) {
      console.warn(`Character ${file} failed to load`, err);
      return null;
    }
  }

  private gltfLoader() {
    this.loaders ??= modelLoaders(this.renderer, false);
    return this.loaders.gltf;
  }

  private async load(file: string): Promise<Loaded> {
    const loader = this.gltfLoader();
    this.anims ??= loader.loadAsync(`${FOLDER}anims.glb`);
    const [gltf, anims] = await Promise.all([loader.loadAsync(`${FOLDER}${file}.glb`), this.anims]);
    gltf.scene.updateMatrixWorld(true);
    const top = gltf.scene.getObjectByName(HEAD_TOP);
    const topY = top ? top.getWorldPosition(new THREE.Vector3()).y : config.body.heightM;
    const scale = config.body.heightM / topY;
    // The animations were made on another body: its hips sit at another height, so the hips'
    // movement is scaled to this body's legs.
    const ownHips = gltf.scene.getObjectByName(HIPS);
    const animHips = anims.scene.getObjectByName(HIPS);
    const legs = ownHips && animHips && animHips.position.length() > 0 ? ownHips.position.length() / animHips.position.length() : 1;
    const clips = new Map<ClipName, THREE.AnimationClip>();
    for (const clip of anims.animations) {
      const name = clip.name as ClipName;
      if (!CLIPS.includes(name)) continue;
      if (name === "knocked-down") {
        clip.duration = KNOCKED_DOWN_SEC;
        clip.trim();
      }
      clips.set(name, prepareClip(clip, legs, LOOPS.has(name)));
    }
    return { gltf, clips, scale };
  }

  dispose() {
    this.loaders?.dispose();
  }
}

/**
 * Keeps only the hips' movement among position tracks (bones keep their own lengths), scales it
 * to this body, and removes any drift across the floor so the body moves on the spot: the server
 * moves the player. Repeating clips also lose any drift up or down, so they loop cleanly.
 */
function prepareClip(clip: THREE.AnimationClip, legs: number, loop: boolean): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    if (track.name.endsWith(".scale")) continue;
    if (!track.name.endsWith(".position")) {
      tracks.push(track);
      continue;
    }
    if (!track.name.startsWith(`${HIPS}.`)) continue;
    const t = track.clone();
    const v = t.values;
    const n = t.times.length;
    if (n > 1) {
      const span = t.times[n - 1]! - t.times[0]!;
      // The hips' own space: x and y lie across the floor, z is height.
      for (const axis of loop ? [0, 1, 2] : [0, 1]) {
        const drift = v[(n - 1) * 3 + axis]! - v[axis]!;
        for (let i = 0; i < n; i++) v[i * 3 + axis] = v[i * 3 + axis]! - (span > 0 ? (drift * (t.times[i]! - t.times[0]!)) / span : 0);
      }
    }
    for (let i = 0; i < v.length; i++) v[i] = v[i]! * legs;
    tracks.push(t);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
