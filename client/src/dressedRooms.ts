import * as THREE from "three";
import { levelOf, toWorld, type MapData, type MapDressing } from "@haunted/shared";
import type { ModelLoaders } from "./loaders.ts";
import { type LighterDone, type LighterJob, type LighterPiece, LOW_DETAIL_MIN_TRIANGLES } from "./lighter.ts";
import { RoomSight } from "./roomSight.ts";
import type { StreamGroup } from "./textureStream.ts";

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
/** While reflections are taken the fog is moved this far away (metres), so it shows in none of them. */
const FOG_AWAY_M = 100_000;
/** What a reflection sees: from this close to this far (metres). */
const PROBE_NEAR_M = 0.05;
const PROBE_FAR_M = 50;
/**
 * On Low quality, glass that bends what is behind it (bottles, spectacles, lantern panes) is drawn
 * as plain see-through glass this solid instead: real glass makes the renderer draw the whole room
 * a second time whenever any is on screen, which doubled Low's cost. Metal in the same material
 * (a lantern's brass frame) stays solid.
 */
const PLAIN_GLASS_ALPHA = 0.3;
/** Plain glass's own colour is this dark (glass shows what is behind it, not a lit surface of its own). */
const PLAIN_GLASS_SHADE = 0.3;
/** Something that moves (a door) takes its light from a room's probe no further away than this. */
const MOVABLE_PROBE_RANGE_M = 20;
/** A probe is on the same floor as a thing whose floor is within this of the probe's floor. */
const SAME_FLOOR_M = 1.5;
/** Which rooms might be seen is worked out again once you have moved this far (roomSight.ts allows for it). */
const SIGHT_MOVE_M = 0.25;
/** From this close to the end of a flight of stairs, the floor at its other end is drawn too. */
const STAIR_VIEW_M = 8;

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

/** How many jobs of detailed pieces the lighter-copy worker is given at once. */
const LIGHTER_JOBS_AT_ONCE = 2;

/** Detailed pieces waiting for their lighter copies: one on its own, or a batch's (by instance). */
type Lighten = (
  | { mesh: THREE.Mesh }
  | {
      batch: { mesh: THREE.BatchedMesh; vertices: number; indices: number };
      pieces: { geometry: THREE.BufferGeometry; full: number; instances: number[] }[];
    }
) & { sent?: THREE.BufferGeometry[] };

/** A build, the height of its floor, the space it fills, the map rooms it covers, and whether it has stairs. */
interface BuiltFloor {
  obj: THREE.Object3D;
  y: number;
  box: THREE.Box3;
  rooms: string[];
  stairs: boolean;
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
  /** Each material of something that moves, copied for each probe that lights it. */
  private movableCopies = new Map<THREE.Material, Map<number, THREE.MeshStandardMaterial>>();
  private power = 1;
  /** Each bending-glass material and how it was made, so Low can draw it plain and High restore it. */
  private glass: { material: THREE.MeshPhysicalMaterial; transmission: number; transparent: boolean }[] = [];
  /** Pieces with a lighter copy for Low quality: in a batch (by instance) or on their own. */
  private lighter: { batch: THREE.BatchedMesh; instance: number; full: number; low: number }[] = [];
  private lighterSingles: { mesh: THREE.Mesh; full: THREE.BufferGeometry; low: THREE.BufferGeometry }[] = [];
  /** Detailed pieces whose lighter copies are made once Low is first chosen (lighter.ts). */
  private toLighten: Lighten[] = [];
  /** Each detailed piece's lighter copy once made (null: it has none). */
  private lowOf = new Map<THREE.BufferGeometry, THREE.BufferGeometry | null>();
  private lighterWorker: Worker | null = null;
  /** Jobs sent to the worker and not yet answered, by id. */
  private lightening = new Map<number, Lighten>();
  private nextLighterJob = 0;
  private lowQuality = false;
  private target = 1;

  /** Blackout turns the lamps off; fixing the fuse box turns them back on. */
  setPower(on: boolean) {
    this.target = on ? 1 : 0;
  }

  update(dt: number) {
    this.retakeStep();
    this.sendLighterJob();
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
   * Gets each dressed room's metal, glass and mirrors ready to reflect: they get a blank
   * reflection now, so their shaders are built once, with the game's, already as they will be
   * drawn. Call once the whole world is in the scene and before anything else (players, lights
   * that move): only what is in the scene now shows in reflections. captureReflections takes them.
   */
  prepareReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const blank = pmrem.fromScene(new THREE.Scene(), 0, PROBE_NEAR_M, PROBE_FAR_M, { size: PROBE_SIZE_PX });
    this.reflect = { scene, pmrem, world: new Set(scene.children), blank };
    for (const p of this.probes) {
      for (const m of p.materials) {
        m.envMap = blank.texture;
        m.envMapIntensity = this.power;
        m.needsUpdate = true;
      }
    }
  }

  /**
   * Takes every room's reflection: one snapshot of the lit room, all around, from its middle (a
   * reflection probe). Call after prepareReflections, once the shaders are built.
   */
  captureReflections() {
    this.capture(this.probes.map((_, i) => i));
  }

  /**
   * A room's textures have all arrived (textureStream.ts). The reflections were first taken with
   * stand-ins, so each probe is taken again, once, when every room it sees has its textures: one
   * probe a frame (update).
   */
  texturesArrived(root: THREE.Object3D) {
    this.texturesIn.add(root);
    this.probes.forEach((_, i) => {
      if (this.final.has(i) || this.retake.includes(i)) return;
      if (this.seenBy(i).every((f) => this.texturesIn.has(f.obj))) this.retake.push(i);
    });
  }

  /** Every room's textures are in (the stream has finished): any probe not yet taken again is. */
  allTexturesArrived() {
    for (const f of this.floors) this.texturesIn.add(f.obj);
    this.probes.forEach((_, i) => {
      if (!this.final.has(i) && !this.retake.includes(i)) this.retake.push(i);
    });
  }

  /**
   * Draws the probes given. Each shows only the rooms as lit, never another reflection (every
   * reflection is blank while they are drawn), so each is the same whichever is drawn first.
   */
  private capture(indices: number[]) {
    if (!this.reflect) return;
    const { scene, pmrem, blank } = this.reflect;
    const reflections = this.probes.map((p) => p.materials.map((m) => m.envMap));
    for (const p of this.probes) for (const m of p.materials) m.envMap = blank.texture;
    const taken = indices.map((i) => this.worldOnly(i, () => pmrem.fromScene(scene, 0, PROBE_NEAR_M, PROBE_FAR_M, { size: PROBE_SIZE_PX, position: this.probes[i]!.at })));
    this.probes.forEach((p, n) => p.materials.forEach((m, k) => (m.envMap = reflections[n]![k]!)));
    indices.forEach((i, n) => {
      this.setProbe(i, taken[n]!);
      if (this.seenBy(i).every((f) => this.texturesIn.has(f.obj))) this.final.add(i);
    });
  }

  /** Takes the next probe waiting to be taken again, if any. */
  private retakeStep() {
    const probe = this.retake.shift();
    if (probe !== undefined) this.capture([probe]);
  }

  private setProbe(i: number, target: THREE.WebGLRenderTarget) {
    this.envTargets[i]?.dispose();
    this.envTargets[i] = target;
    for (const m of this.probes[i]!.materials) m.envMap = target.texture;
  }

  /**
   * Runs draw with only the world showing, as probe i sees it: never players, or the light of
   * anything that moves. Every light stays in the scene (unlit), and the fog stays (out of reach),
   * so the shaders drawing it are the game's own, already built: changing either makes three build
   * every shader again, which froze the game each time a room's textures arrived. Rooms on other
   * floors are left out (they are behind floors and ceilings: the hotel six times over was slow),
   * except from a room with stairs, which sees up and down them.
   */
  private worldOnly<T>(i: number, draw: () => T): T {
    const { scene, world } = this.reflect!;
    const hidden: THREE.Object3D[] = [];
    const unlit: { light: THREE.Light; intensity: number }[] = [];
    for (const child of scene.children) {
      if (world.has(child)) continue;
      child.traverse((o) => {
        if ((o as THREE.Light).isLight) {
          const light = o as THREE.Light;
          unlit.push({ light, intensity: light.intensity });
          light.intensity = 0;
        } else if (o.visible && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) {
          hidden.push(o);
          o.visible = false;
        }
      });
    }
    const wasShown = this.floors.map((f) => f.obj.visible);
    const seen = new Set(this.seenBy(i));
    for (const f of this.floors) f.obj.visible = seen.has(f);
    const fog = scene.fog as THREE.Fog | null;
    const fogAt = fog?.isFog ? { near: fog.near, far: fog.far } : null;
    if (fog?.isFog) [fog.near, fog.far] = [FOG_AWAY_M, FOG_AWAY_M * 2];
    try {
      return draw();
    } finally {
      if (fog && fogAt) Object.assign(fog, fogAt);
      this.floors.forEach((f, n) => (f.obj.visible = wasShown[n]!));
      for (const o of hidden) o.visible = true;
      for (const u of unlit) u.light.intensity = u.intensity;
    }
  }

  /**
   * The rooms (builds) probe i sees: those on the floor it is on, as well as its own; every floor
   * from a room with stairs, which sees up and down them.
   */
  private seenBy(i: number): BuiltFloor[] {
    const own = this.floors.find((f) => this.probesOf.get(f.obj)?.includes(i));
    const feet = this.probes[i]!.at.y - PROBE_HEIGHT_M;
    const floorY = own && !own.stairs ? this.floors.find((f) => Math.abs(f.y - feet) < SAME_FLOOR_M)?.y : undefined;
    if (floorY === undefined) return this.floors;
    return this.floors.filter((f) => f === own || Math.abs(f.y - floorY) < SAME_FLOOR_M);
  }

  /** What reflections are taken with: the scene, what belonged to the world, and the blank one. */
  private reflect: { scene: THREE.Scene; pmrem: THREE.PMREMGenerator; world: Set<THREE.Object3D>; blank: THREE.WebGLRenderTarget } | null = null;
  /** Each build's reflection probes (indices into probes). */
  private probesOf = new Map<THREE.Object3D, number[]>();
  /** Probes to take again, now the rooms they see have their textures; those taken with them all. */
  private retake: number[] = [];
  private final = new Set<number>();
  /** Builds whose textures have all arrived. */
  private texturesIn = new Set<THREE.Object3D>();

  /**
   * Lights something that moves (a door), which the baked lightmaps can't, by the nearest dressed
   * room's probe on its floor: it takes that room's lamps, and dims with them in a blackout. With no
   * dressed room near (an undressed floor) it is lit by the ambient light alone. floorY: the height
   * of the floor it stands on. Call before prepareReflections.
   */
  lightMovable(obj: THREE.Object3D, x: number, floorY: number, z: number) {
    let nearest = -1;
    let best = MOVABLE_PROBE_RANGE_M ** 2;
    this.probes.forEach((p, i) => {
      if (Math.abs(p.at.y - PROBE_HEIGHT_M - floorY) > SAME_FLOOR_M) return;
      const d = (p.at.x - x) ** 2 + (p.at.z - z) ** 2;
      if (d < best) [best, nearest] = [d, i];
    });
    if (nearest < 0) return;
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      let byProbe = this.movableCopies.get(o.material);
      if (!byProbe) this.movableCopies.set(o.material, (byProbe = new Map()));
      let mine = byProbe.get(nearest);
      if (!mine) {
        mine = o.material.clone();
        byProbe.set(nearest, mine);
        this.probes[nearest]!.materials.push(mine);
      }
      o.material = mine;
    });
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
    const first = this.probes.length;
    for (const g of groups) this.probes.push(g);
    this.probesOf.set(scene, groups.map((_, i) => first + i));
    for (const room of rooms) this.rooms.add(room);
    for (const id of drawn) this.drawn.add(id);
    this.objects.push(scene);
    this.built.push({ obj: scene, rooms });
  }

  /**
   * Draws each build's still pieces that share a material as one batch: a room is hundreds of
   * pieces, and drawing them one by one made the hotel far too slow for an ordinary laptop
   * (PRD 9: under 250 draws on Low). Each piece keeps its own place, so nothing looks different,
   * and pieces out of view are still skipped. Bulbs batch too: Blackout dims their shared material.
   * Call once everything that reads the rooms' pieces (the flashlight's glare check) has read them.
   */
  batch() {
    const seenGlass = new Set<THREE.Material>();
    for (const root of this.objects) {
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          if (!(m instanceof THREE.MeshPhysicalMaterial) || m.transmission <= 0 || seenGlass.has(m)) continue;
          seenGlass.add(m);
          this.glass.push({ material: m, transmission: m.transmission, transparent: m.transparent });
        }
      });
    }
    const inverse = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    for (const root of this.objects) {
      root.updateMatrixWorld(true);
      inverse.copy(root.matrixWorld).invert();
      const groups = new Map<string, THREE.Mesh[]>();
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || Array.isArray(obj.material)) return;
        const key = batchKey(obj);
        let list = groups.get(key);
        if (!list) groups.set(key, (list = []));
        list.push(obj);
      });
      for (const meshes of groups.values()) {
        const geometries = [...new Set(meshes.map((m) => m.geometry))];
        if (meshes.length < 2) {
          const mesh = meshes[0]!;
          if (detailed(mesh.geometry)) this.toLighten.push({ mesh });
          continue;
        }
        const vertices = geometries.reduce((n, g) => n + g.getAttribute("position").count, 0);
        const indices = Math.max(geometries.reduce((n, g) => n + (g.index?.count ?? 0), 0), 1);
        const first = meshes[0]!;
        const batch = new THREE.BatchedMesh(meshes.length, vertices, indices, first.material as THREE.Material);
        batch.name = `batch_${first.name}`;
        batch.castShadow = first.castShadow;
        batch.receiveShadow = first.receiveShadow;
        batch.renderOrder = first.renderOrder;
        const pieces = new Map<THREE.BufferGeometry, { geometry: THREE.BufferGeometry; full: number; instances: number[] }>();
        for (const g of geometries) pieces.set(g, { geometry: g, full: batch.addGeometry(g), instances: [] });
        for (const mesh of meshes) {
          const piece = pieces.get(mesh.geometry)!;
          const id = batch.addInstance(piece.full);
          batch.setMatrixAt(id, local.multiplyMatrices(inverse, mesh.matrixWorld));
          piece.instances.push(id);
        }
        const heavy = [...pieces.values()].filter((p) => detailed(p.geometry));
        if (heavy.length) this.toLighten.push({ batch: { mesh: batch, vertices, indices }, pieces: heavy });
        for (const mesh of meshes) mesh.removeFromParent();
        root.add(batch);
      }
    }
  }

  /**
   * Low quality: plain see-through glass (PLAIN_GLASS_ALPHA) and the lighter copies of the most
   * detailed pieces. High: everything as it was made.
   */
  setLowQuality(low: boolean) {
    this.lowQuality = low;
    this.setPlainGlass(low);
    for (const l of this.lighter) l.batch.setGeometryIdAt(l.instance, low ? l.low : l.full);
    for (const l of this.lighterSingles) l.mesh.geometry = low ? l.low : l.full;
    if (low && !this.lighterWorker && this.toLighten.length && typeof Worker !== "undefined") {
      this.lighterWorker = new Worker(new URL("./lighterWorker.ts", import.meta.url), { type: "module" });
      this.lighterWorker.onmessage = (e: MessageEvent<LighterDone>) => this.lighterDone(e.data);
    }
  }

  /** Gives the worker the next detailed pieces: a job a frame, at most LIGHTER_JOBS_AT_ONCE unanswered. */
  private sendLighterJob() {
    if (!this.lighterWorker || this.lightening.size >= LIGHTER_JOBS_AT_ONCE) return;
    const job = this.toLighten.shift();
    if (!job) {
      if (!this.lightening.size) {
        this.lighterWorker.terminate();
        this.lighterWorker = null;
      }
      return;
    }
    const geometries = "mesh" in job ? [job.mesh.geometry] : job.pieces.map((p) => p.geometry);
    job.sent = geometries.filter((g) => !this.lowOf.has(g));
    const id = this.nextLighterJob++;
    this.lightening.set(id, job);
    const pieces = job.sent.map(lighterPiece);
    const message: LighterJob = { id, pieces };
    this.lighterWorker.postMessage(message, pieces.flatMap((p) => [p.positions.buffer, p.normals.buffer, p.indices.buffer]));
  }

  /** The worker's answer: the lighter copies are made and put in, and drawn at once on Low. */
  private lighterDone(done: LighterDone) {
    const job = this.lightening.get(done.id);
    if (!job) return;
    this.lightening.delete(done.id);
    job.sent?.forEach((g, i) => {
      const kept = done.kept[i];
      this.lowOf.set(g, kept ? lighterGeometry(g, kept) : null);
    });
    if ("mesh" in job) {
      const low = this.lowOf.get(job.mesh.geometry);
      if (!low) return;
      this.lighterSingles.push({ mesh: job.mesh, full: job.mesh.geometry, low });
      if (this.lowQuality) job.mesh.geometry = low;
      return;
    }
    const lows = job.pieces.filter((p) => this.lowOf.get(p.geometry));
    if (!lows.length) return;
    const { batch } = job;
    const lowGeometries = [...new Set(lows.map((p) => this.lowOf.get(p.geometry)!))];
    const needVertices = lowGeometries.reduce((n, g) => n + g.getAttribute("position").count, 0);
    const needIndices = lowGeometries.reduce((n, g) => n + g.index!.count, 0);
    if (needVertices > batch.mesh.unusedVertexCount || needIndices > batch.mesh.unusedIndexCount) {
      batch.vertices += Math.max(0, needVertices - batch.mesh.unusedVertexCount);
      batch.indices += Math.max(0, needIndices - batch.mesh.unusedIndexCount);
      batch.mesh.setGeometrySize(batch.vertices, batch.indices);
    }
    const ids = new Map<THREE.BufferGeometry, number>();
    for (const g of lowGeometries) ids.set(g, batch.mesh.addGeometry(g));
    for (const p of lows) {
      const low = ids.get(this.lowOf.get(p.geometry)!)!;
      for (const instance of p.instances) {
        this.lighter.push({ batch: batch.mesh, instance, full: p.full, low });
        if (this.lowQuality) batch.mesh.setGeometryIdAt(instance, low);
      }
    }
  }

  private setPlainGlass(plain: boolean) {
    for (const g of this.glass) {
      const m = g.material;
      if (plain === (m.transmission === 0)) continue;
      m.transmission = plain ? 0 : g.transmission;
      m.transparent = plain || g.transparent;
      m.onBeforeCompile = plain ? plainGlassShader(g.transmission, m.attenuationColor) : () => {};
      m.customProgramCacheKey = plain ? () => `plain-glass-${g.transmission}-${m.attenuationColor.getHexString()}` : () => "";
      m.needsUpdate = true;
    }
  }

  /** Each build with the rooms it covers, until setMap gives each its floor. */
  private built: { obj: THREE.Object3D; rooms: string[] }[] = [];
  /** Each build, the height of its floor, the space it fills, and the map rooms it covers. */
  private floors: BuiltFloor[] = [];
  private sight: RoomSight | null = null;
  /** Where the rooms in sight were last worked out, and what they were (null: between floors). */
  private sightAt = new THREE.Vector3(Infinity, 0, 0);
  private seen: Set<string> | null = null;
  /** Every flight of stairs: its two ends in the world. */
  private flights: [THREE.Vector3, THREE.Vector3][] = [];

  /** Learns which floor each built room is on, and where the stairs between floors are. */
  setMap(map: MapData) {
    for (const { obj, rooms } of this.built) {
      const def = map.rooms.find((r) => r.name === rooms[0]);
      const y = def ? levelOf(map, (def.minX + def.maxX) / 2, (def.minZ + def.maxZ) / 2).y : 0;
      this.floors.push({ obj, y, box: new THREE.Box3().setFromObject(obj), rooms, stairs: false });
    }
    this.sight = new RoomSight(map);
    const end = (x: number, z: number) => {
      const p = toWorld(map, x, z);
      return new THREE.Vector3(p.x, p.y, p.z);
    };
    for (const s of map.stairs) {
      const [ux, uz] = s.dir === "+x" ? [1, 0] : s.dir === "-x" ? [-1, 0] : s.dir === "+z" ? [0, 1] : [0, -1];
      const ends: [number, number][] = [[s.x, s.z], [s.x + ux * s.lengthM, s.z + uz * s.lengthM]];
      this.flights.push([end(...ends[0]!), end(...ends[1]!)]);
      // A build with either end of the flight in one of its rooms, on its floor, has stairs.
      for (const f of this.floors) {
        f.stairs ||= ends.some(([x, z]) => {
          if (Math.abs(toWorld(map, x, z).y - f.y) >= SAME_FLOOR_M) return false;
          return map.rooms.some((r) => f.rooms.includes(r.name) && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
        });
      }
    }
  }

  /**
   * Draws only the rooms on the floor you are on: the floors above and below are hidden behind
   * ceilings and floors anyway, and drawing them all made upstairs slow (millions of triangles).
   * Near a flight of stairs, or on it, the room at its other end is drawn too, so you see down
   * (or up) the flight. On your own floor, a room behind walls you can't see past is not drawn
   * either (roomSight.ts).
   */
  showFloorsNear(x: number, feetY: number, z: number) {
    const me = this.at.set(x, feetY, z);
    const onStairs = !this.floors.some((f) => Math.abs(f.y - feetY) < SAME_FLOOR_M);
    if (this.sight && this.sightAt.distanceTo(me) > SIGHT_MOVE_M) {
      this.sightAt.copy(me);
      this.seen = this.sight.seen(x, feetY, z);
    }
    const seen = onStairs ? null : this.seen;
    for (const f of this.floors) {
      const mine = Math.abs(f.y - feetY) < SAME_FLOOR_M;
      f.obj.visible = mine ? !seen || f.rooms.some((r) => seen.has(r)) : onStairs && f.box.distanceToPoint(me) < STAIR_VIEW_M;
    }
    for (const [a, b] of this.flights) {
      for (const [here, there] of [[a, b], [b, a]] as const) {
        if (Math.abs(here.y - feetY) >= SAME_FLOOR_M || Math.hypot(here.x - x, here.z - z) >= STAIR_VIEW_M) continue;
        for (const f of this.floors) if (f.box.distanceToPoint(there) < SAME_FLOOR_M) f.obj.visible = true;
      }
    }
  }
  private at = new THREE.Vector3();
}

/** A piece detailed enough that Low quality draws a lighter copy of it (lighter.ts). */
function detailed(geometry: THREE.BufferGeometry): boolean {
  return !!geometry.index && geometry.index.count / 3 >= LOW_DETAIL_MIN_TRIANGLES;
}

/** A piece's corners, normals and triangles, as the worker that makes its lighter copy reads them. */
function lighterPiece(geometry: THREE.BufferGeometry): LighterPiece {
  const position = geometry.getAttribute("position");
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const normal = geometry.getAttribute("normal");
  const normals = new Float32Array(position.count * 3);
  if (normal) {
    for (let i = 0; i < normal.count; i++) {
      normals[i * 3] = normal.getX(i);
      normals[i * 3 + 1] = normal.getY(i);
      normals[i * 3 + 2] = normal.getZ(i);
    }
  }
  const index = geometry.index!;
  const indices = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);
  return { positions, normals, indices };
}

/** A piece's lighter copy from the triangles it keeps: only the corners those use, in the same kinds of numbers. */
function lighterGeometry(geometry: THREE.BufferGeometry, kept: Uint32Array): THREE.BufferGeometry {
  const remap = new Map<number, number>();
  const newIndex = new Uint32Array(kept.length);
  for (let i = 0; i < kept.length; i++) {
    const old = kept[i]!;
    let n = remap.get(old);
    if (n === undefined) remap.set(old, (n = remap.size));
    newIndex[i] = n;
  }
  const low = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const Array_ = attr.array.constructor as new (n: number) => THREE.TypedArray;
    const copy = new THREE.BufferAttribute(new Array_(remap.size * attr.itemSize), attr.itemSize, attr.normalized);
    for (const [old, n] of remap) for (let c = 0; c < attr.itemSize; c++) copy.setComponent(n, c, attr.getComponent(old, c));
    low.setAttribute(name, copy);
  }
  low.setIndex(new THREE.BufferAttribute(remap.size > 65535 ? newIndex : Uint16Array.from(newIndex), 1));
  return low;
}

/**
 * Makes the glass part of a material (where it is not metal) plain glass: see-through to
 * PLAIN_GLASS_ALPHA, dark (PLAIN_GLASS_SHADE) and tinted the colour the real glass tints light.
 */
function plainGlassShader(transmission: number, tint: THREE.Color): THREE.Material["onBeforeCompile"] {
  const f = (n: number) => n.toFixed(3);
  return (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      `#include <metalnessmap_fragment>
      float plainGlass = ${f(transmission)} * (1.0 - metalnessFactor);
      diffuseColor.rgb *= mix(vec3(1.0), ${f(PLAIN_GLASS_SHADE)} * vec3(${f(tint.r)}, ${f(tint.g)}, ${f(tint.b)}), plainGlass);
      diffuseColor.a *= mix(1.0, ${f(PLAIN_GLASS_ALPHA)}, plainGlass);`,
    );
  };
}

/** Pieces with the same key can be drawn as one batch: same material and same kind of data. */
function batchKey(mesh: THREE.Mesh): string {
  const g = mesh.geometry;
  const attrs = Object.entries(g.attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`);
  return [(mesh.material as THREE.Material).uuid, g.index ? "i" : "n", mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, ...attrs].join("|");
}

/** Loads every built room of this map's dressing. Never fails: a room that can't load stays grey. */
export async function loadDressedRooms(loaders: ModelLoaders, dressing: MapDressing | undefined): Promise<DressedRooms> {
  const result = new DressedRooms();
  if (!dressing) return result;
  let manifest: Record<string, ManifestEntry>;
  try {
    // Always asked again (a small file): an old copy would name the wrong grey boxes to leave out.
    const res = await fetch(`${ASSETS}rooms.json`, { cache: "no-cache" });
    if (!res.ok) return result; // nothing built yet
    manifest = await res.json();
  } catch {
    return result;
  }
  const { ktx2 } = loaders;
  const base = import.meta.env.BASE_URL;
  // The files to download before the match can start, for the loading bar (loaders.ts counts each
  // once): the models and lightmaps. Textures stream in afterwards (textureStream.ts).
  for (const room of dressing.rooms) {
    const files = Object.entries(manifest[room.room]?.files ?? {}).filter(([path]) => path.startsWith("rooms/"));
    loaders.expect(Object.fromEntries(files));
  }
  // A rebuilt room keeps its file names, so each room's files are asked for under a version (from
  // every file it uses, by name and size): a browser holding an older build fetches the new one,
  // even when only the textures it points to changed (tools/art/shrink-textures.ts) and its own
  // files kept their sizes.
  for (const entry of Object.values(manifest)) {
    const files = Object.entries(entry.files ?? {});
    let version = 5381;
    for (const [path, bytes] of files.sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (const c of `${path}:${bytes};`) version = (Math.imul(version, 33) + c.charCodeAt(0)) >>> 0;
    }
    for (const [path] of files) if (path.startsWith("rooms/")) loaders.roomVersions.set(path, version);
  }
  await Promise.all(
    dressing.rooms.map(async (room) => {
      const entry = manifest[room.room];
      if (!entry) return;
      const group: StreamGroup = { centre: null, pending: new Set() };
      try {
        const [model, lightmap] = await Promise.all([loaders.roomLoader(group).loadAsync(base + entry.glb), ktx2.loadAsync(base + entry.lightmap)]);
        result.add(entry.rooms ?? [room.room], model.scene, lightmap, entry.lightmapScale, entry.drawn ?? [], room.probes);
        group.centre = new THREE.Box3().setFromObject(model.scene).getCenter(new THREE.Vector3());
        group.onDone = () => result.texturesArrived(model.scene);
      } catch (err) {
        console.error(`${room.room}: its dressed room failed to load, so it is drawn as grey boxes`, err);
      }
    }),
  );
  return result;
}
