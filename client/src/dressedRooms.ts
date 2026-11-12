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
  /** Every map room this build covers, when it is several baked as one (the corridor ring). */
  rooms?: string[];
  /** Every file the room downloads (paths under assets/, textures in both sets) → bytes. */
  files?: Record<string, number>;
}

/** How much of the hotel has downloaded, in bytes. */
export type LoadProgress = (loaded: number, total: number) => void;

/** A loaded file's path under assets/ ("textures/ab12.ktx2"), however its URL was written. */
const ASSET_KEY = /(?:^|\/)((?:rooms|textures|textures-1k)\/[^/?#]+)(?:[?#].*)?$/;

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

  /**
   * probes: where to capture reflections (x, z in the world). A room has one, in its middle; a
   * ring of corridors around a courtyard needs one per corridor, as its middle is out of doors.
   * Each surface reflects the nearest; a material used near two of them is copied for each.
   */
  add(rooms: string[], scene: THREE.Group, lightmap: THREE.Texture, scale: number, drawn: string[], probes?: { x: number; z: number }[]) {
    lightmap.channel = 1; // the lightmap has its own UVs (TEXCOORD_1)
    // three adds the lightmap as irradiance and divides by π for diffuse; Blender baked radiance.
    const intensity = scale * Math.PI;
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const y = bounds.min.y + PROBE_HEIGHT_M;
    const middle = bounds.getCenter(new THREE.Vector3());
    const groups = (probes?.length ? probes : [middle]).map((p) => ({ at: new THREE.Vector3(p.x, y, p.z), materials: [] as THREE.MeshStandardMaterial[] }));
    /** Each original material's copy for each probe (the original itself for the first probe that uses it). */
    const copies = new Map<THREE.Material, Map<number, THREE.MeshStandardMaterial>>();
    const bulbsSeen = new Set<THREE.Material>();
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    let missingUv = 0;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
      const material = obj.material as THREE.MeshStandardMaterial;
      if (obj.name.startsWith(BULB_PREFIX)) {
        if (!bulbsSeen.has(material)) this.bulbs.push({ material, full: material.emissiveIntensity });
        bulbsSeen.add(material);
        return;
      }
      if (!obj.geometry.getAttribute("uv1")) missingUv++;
      let nearest = 0;
      if (groups.length > 1) {
        box.setFromObject(obj).getCenter(centre);
        let best = Infinity;
        groups.forEach((g, i) => {
          const d = (g.at.x - centre.x) ** 2 + (g.at.z - centre.z) ** 2;
          if (d < best) [best, nearest] = [d, i];
        });
      }
      let byProbe = copies.get(material);
      if (!byProbe) copies.set(material, (byProbe = new Map()));
      let mine = byProbe.get(nearest);
      if (!mine) {
        mine = byProbe.size === 0 ? material : material.clone();
        byProbe.set(nearest, mine);
        mine.lightMap = lightmap;
        mine.lightMapIntensity = intensity;
        mine.needsUpdate = true;
        this.lightmaps.push({ material: mine, full: intensity });
        groups[nearest]!.materials.push(mine);
      }
      obj.material = mine;
    });
    if (missingUv) console.warn(`${rooms[0]}: ${missingUv} meshes have no lightmap UVs and will look unlit`);
    for (const g of groups) this.probes.push(g);
    for (const room of rooms) this.rooms.add(room);
    for (const id of drawn) this.drawn.add(id);
    this.objects.push(scene);
  }
}

/** Loads every built room of this map's dressing. Never fails: a room that can't load stays grey. */
export async function loadDressedRooms(loaders: ModelLoaders, dressing: MapDressing | undefined, onProgress?: LoadProgress): Promise<DressedRooms> {
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
  // The files to download, each once (rooms share textures), from the texture set being loaded.
  const skip = loaders.lowTextures ? "textures/" : "textures-1k/";
  const sizes = new Map<string, number>();
  for (const room of dressing.rooms) {
    for (const [path, bytes] of Object.entries(manifest[room.room]?.files ?? {})) if (!path.startsWith(skip)) sizes.set(path, bytes);
  }
  let total = 0;
  for (const bytes of sizes.values()) total += bytes;
  let loaded = 0;
  onProgress?.(0, total);
  loaders.manager.onProgress = (url) => {
    const key = ASSET_KEY.exec(url)?.[1];
    const bytes = key ? sizes.get(key) : undefined;
    if (key === undefined || bytes === undefined) return;
    sizes.delete(key); // count each file once
    loaded += bytes;
    onProgress?.(loaded, total);
  };
  await Promise.all(
    dressing.rooms.map(async (room) => {
      const entry = manifest[room.room];
      if (!entry) return;
      try {
        const [model, lightmap] = await Promise.all([gltf.loadAsync(base + entry.glb), ktx2.loadAsync(base + entry.lightmap)]);
        result.add(entry.rooms ?? [room.room], model.scene, lightmap, entry.lightmapScale, entry.drawn ?? [], room.probes);
      } catch (err) {
        console.error(`${room.room}: its dressed room failed to load, so it is drawn as grey boxes`, err);
      }
    }),
  );
  loaders.manager.onProgress = () => {};
  onProgress?.(total, total); // files that failed still end the bar
  return result;
}
