import * as THREE from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

// The rooms' textures arrive after the match can start (owner, 2026-11-14: "No one will wait that
// long for a match"). A room is put together with a plain stand-in for each texture: one pixel of a
// neutral colour, a flat bump map, a matt shine map. Once the hotel's models and lightmaps are in,
// the real textures download, the nearest rooms to you first, and each replaces its stand-in in
// place, so every material that uses it (and every copy of it) picks it up. A texture used in
// several rooms downloads and sits in graphics memory once.

/** Textures downloading at once. */
const AT_ONCE = 6;

/** A room whose textures stream in: where it is, and what to do once they all have. */
export interface StreamGroup {
  /** The room's middle in the world; set once its model is in (before the stream starts). */
  centre: THREE.Vector3 | null;
  /** All its textures are in (its reflections can be taken again). */
  onDone?: () => void;
  pending: Set<string>;
}

interface Job {
  key: string;
  load: () => Promise<THREE.Texture>;
  groups: Set<StreamGroup>;
}

type Slot = "colour" | "normal" | "shine" | "other";
const STAND_IN: Record<Slot, [number, number, number, number]> = {
  colour: [96, 92, 88, 255],
  normal: [128, 128, 255, 255],
  shine: [255, 200, 0, 255],
  other: [128, 128, 128, 255],
};

export class TextureStream {
  private standIns = new Map<string, THREE.CompressedTexture>();
  private jobs = new Map<string, Job>();
  private running = 0;
  private started = false;
  private near: () => THREE.Vector3 = () => new THREE.Vector3();
  private finished: () => void = () => {};
  /** Textures still to come. */
  get left(): number {
    return this.jobs.size + this.running;
  }

  /** A glTF loader plugin that gives this room stand-ins and queues its real textures. */
  plugin(group: StreamGroup): (parser: GLTFParser) => GLTFLoaderPlugin {
    return (parser) => ({
      name: "haunted_texture_stream",
      loadTexture: (index: number) => {
        const json = parser.json;
        const def = json.textures?.[index];
        const basisu = def?.extensions?.KHR_texture_basisu;
        const real = (parser as unknown as { plugins: Record<string, GLTFLoaderPlugin> }).plugins.KHR_texture_basisu;
        if (!basisu || !real?.loadTexture) return null; // not ours: loaded as usual
        const key = `${json.images[basisu.source].uri}:${def.sampler ?? ""}`;
        let standIn = this.standIns.get(key);
        if (!standIn) {
          standIn = makeStandIn(slotOf(json, index));
          this.standIns.set(key, standIn);
          this.jobs.set(key, { key, load: () => real.loadTexture!(index) as Promise<THREE.Texture>, groups: new Set() });
        }
        const job = this.jobs.get(key);
        if (job) {
          job.groups.add(group);
          group.pending.add(key);
        }
        return Promise.resolve(standIn);
      },
    });
  }

  /** Starts downloading, nearest rooms to `near` first; `finished` once every texture is in. */
  start(near: () => THREE.Vector3, finished: () => void) {
    this.near = near;
    this.finished = finished;
    this.started = true;
    for (const group of new Set([...this.jobs.values()].flatMap((j) => [...j.groups]))) if (group.pending.size === 0) group.onDone?.();
    this.next();
  }

  private next() {
    if (!this.started) return;
    if (this.jobs.size === 0 && this.running === 0) {
      this.finished();
      return;
    }
    while (this.running < AT_ONCE && this.jobs.size > 0) {
      const job = this.nearest();
      this.jobs.delete(job.key);
      this.running++;
      job
        .load()
        .then((texture) => swapIn(this.standIns.get(job.key)!, texture))
        .catch((err) => console.error(`A texture failed to load (${job.key}); its stand-in stays`, err))
        .finally(() => {
          this.running--;
          for (const group of job.groups) {
            group.pending.delete(job.key);
            if (group.pending.size === 0) group.onDone?.();
          }
          this.next();
        });
    }
  }

  private nearest(): Job {
    const here = this.near();
    let best: Job | null = null;
    let bestD = Infinity;
    for (const job of this.jobs.values()) {
      let d = Infinity;
      for (const g of job.groups) if (g.centre) d = Math.min(d, g.centre.distanceToSquared(here));
      if (d < bestD || !best) [best, bestD] = [job, d];
    }
    return best!;
  }
}

/** What a texture is used for in this model (the first material that uses it decides). */
function slotOf(json: GLTFParser["json"], index: number): Slot {
  for (const m of json.materials ?? []) {
    if (m.pbrMetallicRoughness?.baseColorTexture?.index === index || m.emissiveTexture?.index === index) return "colour";
    if (m.normalTexture?.index === index) return "normal";
    if (m.pbrMetallicRoughness?.metallicRoughnessTexture?.index === index) return "shine";
  }
  return "other";
}

function makeStandIn(slot: Slot): THREE.CompressedTexture {
  const pixel = { data: new Uint8Array(STAND_IN[slot]), width: 1, height: 1 };
  const t = new THREE.CompressedTexture([pixel], 1, 1, THREE.RGBAFormat as unknown as THREE.CompressedPixelFormat, THREE.UnsignedByteType);
  t.flipY = false;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * Puts the real texture's pictures into the stand-in, which every material already holds. A new
 * source makes three.js give it a new GPU texture of the right size and format.
 */
function swapIn(standIn: THREE.CompressedTexture, real: THREE.Texture) {
  const r = real as THREE.CompressedTexture;
  standIn.source = r.source;
  standIn.mipmaps = r.mipmaps;
  standIn.format = r.format;
  standIn.type = r.type;
  standIn.minFilter = r.minFilter;
  standIn.magFilter = r.magFilter;
  standIn.wrapS = r.wrapS;
  standIn.wrapT = r.wrapT;
  standIn.anisotropy = r.anisotropy;
  standIn.generateMipmaps = false;
  standIn.name = r.name;
  standIn.needsUpdate = true;
}
