import * as THREE from "three";
import type { MapDressing } from "@haunted/shared";
import type { ModelLoaders } from "./loaders.ts";

// Dressed rooms (Phase 8): rooms built and lit in Blender (tools/art/build-room.ts), with their
// lamps baked into a lightmap. A room with no build, or whose files fail to load, stays grey boxes.

const ASSETS = `${import.meta.env.BASE_URL}assets/rooms/`;
/** How fast the lamps die and come back for Blackout (GDD 14.2): the whole way in 1 / this seconds. */
const POWER_FADE_PER_SEC = 4;
/** Objects named so are the lamps' glowing bulbs (tools/art/blender/build_room.py). */
const BULB_PREFIX = "bulb_";
/** Reflections are captured from this high in each room (about eye height). */
const PROBE_HEIGHT_M = 1.6;
/** Size of each face of the captured reflection cube, in pixels. */
const PROBE_SIZE_PX = 256;

interface ManifestEntry {
  glb: string;
  lightmap: string;
  /** The lightmap stores light / this (so it fits in 8 bits); the game multiplies back. */
  lightmapScale: number;
  /** Map furniture and hiding spots this build draws (their grey boxes are left out). */
  drawn: string[];
}

interface Dimmable {
  material: THREE.MeshStandardMaterial;
  full: number;
}

/** The dressed rooms of a map: what to add to the scene, and which grey boxes they replace. */
export class DressedRooms {
  /** Rooms drawn from a build: their grey floor, ceiling and wall colour are not drawn. */
  readonly rooms = new Set<string>();
  /** Map furniture whose grey box a model replaces (DressingProp.draws). */
  readonly drawn = new Set<string>();
  readonly objects: THREE.Object3D[] = [];
  private lightmaps: Dimmable[] = [];
  private bulbs: Dimmable[] = [];
  /** Each room's shiny materials and the middle of the room, for its reflection probe. */
  private probes: { at: THREE.Vector3; materials: THREE.MeshStandardMaterial[] }[] = [];
  private envTargets: THREE.WebGLRenderTarget[] = [];
  private power = 1;
  private target = 1;

  /** Blackout turns the lamps off; fixing the fuse box turns them back on. */
  setPower(on: boolean) {
    this.target = on ? 1 : 0;
  }

  update(dt: number) {
    if (this.power === this.target) return;
    const step = POWER_FADE_PER_SEC * dt;
    const diff = this.target - this.power;
    this.power = Math.abs(diff) <= step ? this.target : this.power + Math.sign(diff) * step;
    for (const l of this.lightmaps) l.material.lightMapIntensity = l.full * this.power;
    for (const b of this.bulbs) b.material.emissiveIntensity = b.full * this.power;
    for (const p of this.probes) for (const m of p.materials) m.envMapIntensity = this.power;
  }

  /** The lamps now: 1 lit, fading to 0 in a blackout. */
  get lamps(): number {
    return this.power;
  }

  /**
   * Gives each dressed room's metal, glass and mirrors something to reflect: one snapshot of the
   * lit room, all around, from its middle (a reflection probe). Call once the whole world is in
   * the scene, with any light that moves (the flashlight) switched off.
   */
  captureReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const fog = scene.fog;
    scene.fog = null;
    for (const probe of this.probes) {
      const target = pmrem.fromScene(scene, 0, 0.05, 50, { size: PROBE_SIZE_PX, position: probe.at });
      this.envTargets.push(target);
      for (const m of probe.materials) {
        m.envMap = target.texture;
        m.envMapIntensity = this.power;
        m.needsUpdate = true;
      }
    }
    scene.fog = fog;
    pmrem.dispose();
  }

  add(room: string, scene: THREE.Group, lightmap: THREE.Texture, scale: number, drawn: string[]) {
    lightmap.channel = 1; // the lightmap has its own UVs (TEXCOORD_1)
    // three adds the lightmap as irradiance and divides by π for diffuse; Blender baked radiance.
    const intensity = scale * Math.PI;
    const seen = new Set<THREE.Material>();
    const materials: THREE.MeshStandardMaterial[] = [];
    let missingUv = 0;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
      const material = obj.material as THREE.MeshStandardMaterial;
      if (obj.name.startsWith(BULB_PREFIX)) {
        if (!seen.has(material)) this.bulbs.push({ material, full: material.emissiveIntensity });
      } else {
        if (!obj.geometry.getAttribute("uv1")) missingUv++;
        if (!seen.has(material)) {
          material.lightMap = lightmap;
          material.lightMapIntensity = intensity;
          material.needsUpdate = true;
          this.lightmaps.push({ material, full: intensity });
          materials.push(material);
        }
      }
      seen.add(material);
    });
    if (missingUv) console.warn(`${room}: ${missingUv} meshes have no lightmap UVs and will look unlit`);
    const bounds = new THREE.Box3().setFromObject(scene);
    const at = bounds.getCenter(new THREE.Vector3());
    at.y = bounds.min.y + PROBE_HEIGHT_M;
    this.probes.push({ at, materials });
    this.rooms.add(room);
    for (const id of drawn) this.drawn.add(id);
    this.objects.push(scene);
  }
}

/** Loads every built room of this map's dressing. Never fails: a room that can't load stays grey. */
export async function loadDressedRooms(loaders: ModelLoaders, dressing: MapDressing | undefined): Promise<DressedRooms> {
  const result = new DressedRooms();
  if (!dressing) return result;
  let manifest: Record<string, ManifestEntry>;
  try {
    const res = await fetch(`${ASSETS}rooms.json`);
    if (!res.ok) return result; // nothing built yet
    manifest = await res.json();
  } catch {
    return result;
  }
  const { gltf, ktx2 } = loaders;
  const base = import.meta.env.BASE_URL;
  await Promise.all(
    dressing.rooms.map(async (room) => {
      const entry = manifest[room.room];
      if (!entry) return;
      try {
        const [model, lightmap] = await Promise.all([gltf.loadAsync(base + entry.glb), ktx2.loadAsync(base + entry.lightmap)]);
        result.add(room.room, model.scene, lightmap, entry.lightmapScale, entry.drawn ?? []);
      } catch (err) {
        console.error(`${room.room}: its dressed room failed to load, so it is drawn as grey boxes`, err);
      }
    }),
  );
  return result;
}
