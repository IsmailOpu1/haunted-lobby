import * as THREE from "three";
import { levelOf, toWorld, type MapData, type MapDressing } from "@haunted/shared";
import type { ModelLoaders } from "./loaders.ts";
import { MeshoptSimplifier } from "meshoptimizer";
import { RoomSight } from "./roomSight.ts";

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
/**
 * On Low quality, glass that bends what is behind it (bottles, spectacles, lantern panes) is drawn
 * as plain see-through glass this solid instead: real glass makes the renderer draw the whole room
 * a second time whenever any is on screen, which doubled Low's cost. Metal in the same material
 * (a lantern's brass frame) stays solid.
 */
const PLAIN_GLASS_ALPHA = 0.3;
/** Plain glass's own colour is this dark (glass shows what is behind it, not a lit surface of its own). */
const PLAIN_GLASS_SHADE = 0.3;
/**
 * On Low quality, a piece this detailed or more (triangles) is drawn from a lighter copy: the
 * free models are made for close-ups (a candlestick of 20,000 triangles), and a laptop can't draw
 * the hotel's millions. The copy keeps about this share of the triangles, and its surface stays
 * within this share of the piece's size of the original (1% of a 20 cm candlestick is 2 mm).
 */
const LOW_DETAIL_MIN_TRIANGLES = 1500;
const LOW_DETAIL_SHARE = 0.25;
const LOW_DETAIL_ERROR = 0.01;
/** A lighter copy is only kept if it saves at least this share of the triangles. */
const LOW_DETAIL_WORTH = 0.3;
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
   * Lights something that moves (a door), which the baked lightmaps can't, by the nearest dressed
   * room's probe on its floor: it takes that room's lamps, and dims with them in a blackout. With no
   * dressed room near (an undressed floor) it is lit by the ambient light alone. floorY: the height
   * of the floor it stands on. Call before captureReflections.
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
    for (const g of groups) this.probes.push(g);
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
        const lowOf = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
        for (const g of geometries) {
          const low = lighterCopy(g);
          if (low) lowOf.set(g, low);
        }
        if (meshes.length < 2) {
          const mesh = meshes[0]!;
          const low = lowOf.get(mesh.geometry);
          if (low) this.lighterSingles.push({ mesh, full: mesh.geometry, low });
          continue;
        }
        const all = [...geometries, ...lowOf.values()];
        const vertices = all.reduce((n, g) => n + g.getAttribute("position").count, 0);
        const indices = all.reduce((n, g) => n + (g.index?.count ?? 0), 0);
        const first = meshes[0]!;
        const batch = new THREE.BatchedMesh(meshes.length, vertices, Math.max(indices, 1), first.material as THREE.Material);
        batch.name = `batch_${first.name}`;
        batch.castShadow = first.castShadow;
        batch.receiveShadow = first.receiveShadow;
        batch.renderOrder = first.renderOrder;
        const ids = new Map<THREE.BufferGeometry, number>();
        for (const g of all) ids.set(g, batch.addGeometry(g));
        for (const mesh of meshes) {
          const full = ids.get(mesh.geometry)!;
          const id = batch.addInstance(full);
          batch.setMatrixAt(id, local.multiplyMatrices(inverse, mesh.matrixWorld));
          const low = lowOf.get(mesh.geometry);
          if (low) this.lighter.push({ batch, instance: id, full, low: ids.get(low)! });
        }
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
    this.setPlainGlass(low);
    for (const l of this.lighter) l.batch.setGeometryIdAt(l.instance, low ? l.low : l.full);
    for (const l of this.lighterSingles) l.mesh.geometry = low ? l.low : l.full;
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
  private floors: { obj: THREE.Object3D; y: number; box: THREE.Box3; rooms: string[] }[] = [];
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
      this.floors.push({ obj, y, box: new THREE.Box3().setFromObject(obj), rooms });
    }
    this.sight = new RoomSight(map);
    const end = (x: number, z: number) => {
      const p = toWorld(map, x, z);
      return new THREE.Vector3(p.x, p.y, p.z);
    };
    for (const s of map.stairs) {
      const [ux, uz] = s.dir === "+x" ? [1, 0] : s.dir === "-x" ? [-1, 0] : s.dir === "+z" ? [0, 1] : [0, -1];
      this.flights.push([end(s.x, s.z), end(s.x + ux * s.lengthM, s.z + uz * s.lengthM)]);
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

/**
 * A lighter copy of a detailed piece for Low quality (LOW_DETAIL_*), using only the corners it
 * still needs, or null if the piece is light already or simplifying would not save enough.
 */
function lighterCopy(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const index = geometry.index;
  const position = geometry.getAttribute("position");
  if (!index || !MeshoptSimplifier.supported || index.count / 3 < LOW_DETAIL_MIN_TRIANGLES) return null;
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
  const indices = Uint32Array.from({ length: index.count }, (_, i) => index.getX(i));
  const target = Math.floor((index.count * LOW_DETAIL_SHARE) / 3) * 3;
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, normals, 3, [0.5, 0.5, 0.5], null, target, LOW_DETAIL_ERROR);
  if (kept.length > index.count * (1 - LOW_DETAIL_WORTH) || kept.length === 0) return null;
  // Only the corners the lighter copy uses, in the same kinds of numbers as the original.
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
  const { gltf, ktx2 } = loaders;
  const base = import.meta.env.BASE_URL;
  // The files to download, for the loading bar (loaders.ts counts each once).
  for (const room of dressing.rooms) loaders.expect(manifest[room.room]?.files ?? {});
  // A rebuilt room keeps its file names, so each room's files are asked for under a version (the
  // sizes of its own files added up): a browser holding an older build fetches the new one.
  for (const entry of Object.values(manifest)) {
    const own = Object.entries(entry.files ?? {}).filter(([path]) => path.startsWith("rooms/"));
    const version = own.reduce((sum, [, bytes]) => sum + bytes, 0);
    for (const [path] of own) loaders.roomVersions.set(path, version);
  }
  // The lighter copies for Low quality are made as the rooms are put together (DressedRooms.batch).
  await MeshoptSimplifier.ready;
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
  return result;
}
