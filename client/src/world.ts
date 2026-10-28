import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { config, doorBox, furnitureBox, HIDING_SPOT_HEIGHT_M, hidingSpotBox, levelOf, roomAt, toWorld, wallBox, wallFaces, type DoorDef, type MapData, type StairDef } from "@haunted/shared";
import { liftToFloor } from "./place.ts";

const WALL_COLOR = 0x8a8a8a;
const FLOOR_COLOR = 0x6f6f6f;
const CEILING_COLOR = 0x4a4a4a;
// A room's colour (MapData.roomColors) is its walls; its floor and ceiling are darker shades of it.
const ROOM_FLOOR_SHADE = 0.75;
const ROOM_CEILING_SHADE = 0.5;
// Room colours sit just off the wall's face, so they never flicker against the grey wall box.
const FACE_GAP_M = 0.005;
const DOOR_COLOR = 0x6b5a45;
const CURTAIN_COLOR = 0x4a1f24;
const DOOR_THICKNESS = 0.08;
/** A door panel is this much of the wall's height; the wall closes the gap above it. */
const DOOR_HEIGHT_FRACTION = 0.9;
const DOOR_SWING_PER_SEC = 4; // radians per second for the open/close animation
const STAIR_COLOR = 0x5e5850;
const STEP_RISE_M = 0.2;
// Ceilings sit a little under the floor above, so the bottoms of things upstairs never show through.
const SLAB_M = 0.05;
const RELIC_DOOR_COLOR = 0x5a1f1f;
const SLOT_EMPTY_COLOR = 0x140c0c;
const SLOT_FULL_COLOR = 0xc9a640;
const SLOT_SIZE_M = 0.2;
const SLOT_HEIGHT_M = 1.3;

// Signs over doorways (GDD 26.11): a brass plaque on each side naming the room beyond, like a
// hotel's. Lit like everything else, so you read them by flashlight.
const SIGN_WIDTH_M = 1.3;
const SIGN_HEIGHT_M = 0.2;
/** The sign's middle, on the wall between the top of the door and the ceiling. */
const SIGN_Y_FRACTION = 0.948;
/** Half the thickness of a sign that sticks out from a corridor wall. */
const BLADE_GAP_M = 0.004;
const CORRIDOR = /Corridor|Passage/;
const SIGN_CANVAS_PX = [512, 80] as const;
const SIGN_PLATE = "#2a2118";
const SIGN_TEXT = "#d8b766";

// Placeholder furniture colors by kind until the Phase 8 art pass.
const FURNITURE_COLORS: Record<string, number> = {
  table: 0x5a4632,
  counter: 0x4f4a44,
  shelf: 0x4a3a2a,
  bed: 0x6b6157,
  fountain: 0x6d7470,
  stage: 0x3e3128,
  crates: 0x6a5a3c,
  altar: 0x2a2626,
};

/** A door mesh that swings around its hinge. */
export class DoorView {
  private pivot = new THREE.Group();
  private mesh: THREE.Mesh;
  private targetAngle = 0;
  private slots: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, map: MapData, private def: DoorDef, height: number) {
    const box = doorBox(def, DOOR_THICKNESS);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.sizeX, height * DOOR_HEIGHT_FRACTION, box.sizeZ),
      new THREE.MeshLambertMaterial({ color: DOOR_COLOR }),
    );
    this.mesh = mesh;
    // Hinge at one end of the doorway; the panel extends from it.
    const half = def.width / 2;
    if (def.axis === "x") {
      this.pivot.position.set(def.x - half, 0, def.z);
      mesh.position.set(half, (height * DOOR_HEIGHT_FRACTION) / 2, 0);
    } else {
      this.pivot.position.set(def.x, 0, def.z - half);
      mesh.position.set(0, (height * DOOR_HEIGHT_FRACTION) / 2, half);
    }
    if (def.id === map.relicDoor) (mesh.material as THREE.MeshLambertMaterial).color.setHex(RELIC_DOOR_COLOR);
    this.pivot.add(mesh);
    liftToFloor(map, this.pivot, def.x, def.z);
    scene.add(this.pivot);
  }

  /** The relic door's slots, one per relic, lit gold once filled (GDD 10). They show on both faces. */
  setSlots(placed: number, total: number) {
    if (this.slots.length !== total) {
      for (const slot of this.slots) this.mesh.remove(slot);
      const spacing = this.def.width / (total + 1);
      const along = this.def.axis === "x";
      this.slots = Array.from({ length: total }, (_, i) => {
        const depth = DOOR_THICKNESS + 0.04;
        const slot = new THREE.Mesh(
          new THREE.BoxGeometry(along ? SLOT_SIZE_M : depth, SLOT_SIZE_M, along ? depth : SLOT_SIZE_M),
          new THREE.MeshLambertMaterial({ color: SLOT_EMPTY_COLOR }),
        );
        const offset = -this.def.width / 2 + spacing * (i + 1);
        const y = SLOT_HEIGHT_M - this.mesh.position.y;
        slot.position.set(along ? offset : 0, y, along ? 0 : offset);
        this.mesh.add(slot);
        return slot;
      });
    }
    this.slots.forEach((slot, i) => {
      const material = slot.material as THREE.MeshLambertMaterial;
      material.color.setHex(i < placed ? SLOT_FULL_COLOR : SLOT_EMPTY_COLOR);
      material.emissive.setHex(i < placed ? SLOT_FULL_COLOR : 0x000000);
      material.emissiveIntensity = 0.4;
    });
  }

  setOpen(open: boolean) {
    this.targetAngle = open ? (this.def.axis === "x" ? Math.PI / 2 : -Math.PI / 2) : 0;
  }

  update(dt: number) {
    const diff = this.targetAngle - this.pivot.rotation.y;
    const step = DOOR_SWING_PER_SEC * dt;
    this.pivot.rotation.y += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
  }
}

/** Builds the grey-box rooms: floors, ceilings, walls, stairs and doors, each on its own floor. */
export function buildWorld(scene: THREE.Scene, map: MapData): { doors: Map<string, DoorView>; ritualCircle: RitualCircleView | null } {
  const h = map.wallHeightM;
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  for (const segment of map.walls) {
    const box = wallBox(segment, map.wallThicknessM);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(box.sizeX, h, box.sizeZ), wallMat);
    wall.position.set(box.x, h / 2, box.z);
    scene.add(liftToFloor(map, wall));
  }

  const floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLOR });
  const ceilingMat = new THREE.MeshLambertMaterial({ color: CEILING_COLOR });
  const roomMats = roomMaterials(map);
  buildWallFaces(scene, map, roomMats);
  for (const room of map.rooms) {
    const mats = roomMats.get(room.name);
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats?.floor ?? floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    scene.add(liftToFloor(map, floor));

    if (room.outdoor) continue; // open to the night sky
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats?.ceiling ?? ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, h - SLAB_M, cz);
    scene.add(liftToFloor(map, ceiling));
  }

  // Furniture: each piece is its own object, named by its id, so interactions can find it later.
  for (const f of map.furniture) {
    const box = furnitureBox(f);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.sizeX, f.heightM, box.sizeZ), new THREE.MeshLambertMaterial({ color: FURNITURE_COLORS[f.kind] ?? 0x5a5048 }));
    mesh.name = f.id;
    mesh.position.set(box.x, f.heightM / 2, box.z);
    scene.add(liftToFloor(map, mesh));
  }
  const placeAt = (obj: THREE.Object3D, at: { x: number; z: number }) => {
    obj.position.x = at.x;
    obj.position.z = at.z;
    scene.add(liftToFloor(map, obj));
  };
  if (map.bell) placeAt(bellModel(), map.bell);
  if (map.fuseBox) placeAt(fuseBoxModel(), map.fuseBox);
  const circle = map.altar ? new RitualCircleView() : null;
  if (circle && map.altar) placeAt(circle.mesh, map.altar);

  // Hiding furniture: wardrobes and cupboards are wood boxes, curtains are dark cloth.
  for (const spot of map.hidingSpots) {
    const box = hidingSpotBox(spot);
    const color = spot.kind === "curtain" ? CURTAIN_COLOR : DOOR_COLOR;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.sizeX, HIDING_SPOT_HEIGHT_M, box.sizeZ), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(box.x, HIDING_SPOT_HEIGHT_M / 2, box.z);
    scene.add(liftToFloor(map, mesh));
  }

  for (const stair of map.stairs) buildStairs(scene, map, stair, wallMat, ceilingMat);

  const doors = new Map<string, DoorView>();
  for (const def of map.doors) doors.set(def.id, new DoorView(scene, map, def, h));
  buildDoorSigns(scene, map, h);
  return { doors, ritualCircle: circle };
}

/** Over every doorway: the wall above the door, and on each side a plaque naming the room you walk into. */
function buildDoorSigns(scene: THREE.Scene, map: MapData, wallHeight: number) {
  const lintelMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  const doorTop = wallHeight * DOOR_HEIGHT_FRACTION;
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const material = (name: string) => {
    let mat = materials.get(name);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ map: signTexture(name) });
      materials.set(name, mat);
    }
    return mat;
  };
  const geometry = new THREE.PlaneGeometry(SIGN_WIDTH_M, SIGN_HEIGHT_M);
  const off = map.wallThicknessM / 2 + FACE_GAP_M * 2;
  for (const def of map.doors) {
    const box = doorBox(def, map.wallThicknessM);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(box.sizeX, wallHeight - doorTop, box.sizeZ), lintelMat);
    lintel.position.set(def.x, (wallHeight + doorTop) / 2, def.z);
    scene.add(liftToFloor(map, lintel));
    // The two sides of the doorway: -1 is north (or west), +1 south (or east).
    for (const side of [-1, 1]) {
      const [nx, nz] = def.axis === "x" ? [0, side] : [side, 0];
      const here = roomAt(map, def.x + nx * 0.3, def.z + nz * 0.3)?.name;
      const beyond = roomAt(map, def.x - nx * 0.3, def.z - nz * 0.3)?.name;
      if (!here || !beyond || here === beyond) continue;
      const sign = new THREE.Mesh(geometry, material(beyond));
      sign.position.set(def.x + nx * off, wallHeight * SIGN_Y_FRACTION, def.z + nz * off);
      // A plane faces +z; turn it to face into the room it hangs in.
      sign.rotation.y = Math.atan2(nx, nz);
      scene.add(liftToFloor(map, sign, def.x, def.z));
      // In a corridor a flat sign is seen edge-on, so a second one sticks out from the wall, read
      // from both ends of the corridor (two faces back to back, so neither reads mirrored).
      if (!CORRIDOR.test(here) || CORRIDOR.test(beyond)) continue;
      for (const face of [-1, 1]) {
        const blade = new THREE.Mesh(geometry, material(beyond));
        const [tx, tz] = [nz * face, -nx * face];
        const out = off + SIGN_WIDTH_M / 2;
        blade.position.set(def.x + nx * out + tx * BLADE_GAP_M, wallHeight * SIGN_Y_FRACTION, def.z + nz * out + tz * BLADE_GAP_M);
        blade.rotation.y = Math.atan2(tx, tz);
        scene.add(liftToFloor(map, blade, def.x, def.z));
      }
    }
  }
}

function signTexture(text: string): THREE.CanvasTexture {
  const [w, hPx] = SIGN_CANVAS_PX;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = SIGN_PLATE;
  ctx.fillRect(0, 0, w, hPx);
  ctx.strokeStyle = SIGN_TEXT;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, hPx - 12);
  ctx.fillStyle = SIGN_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(hPx * 0.5)}px Georgia, serif`;
  ctx.fillText(text.toUpperCase(), w / 2, hPx / 2 + 2, w - 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface RoomMaterials {
  wall: THREE.Material;
  floor: THREE.Material;
  ceiling: THREE.Material;
}

/** Materials for each room that has a colour in the map data. */
function roomMaterials(map: MapData): Map<string, RoomMaterials> {
  const mats = new Map<string, RoomMaterials>();
  for (const [name, hex] of Object.entries(map.roomColors ?? {})) {
    const color = new THREE.Color(hex);
    mats.set(name, {
      wall: new THREE.MeshLambertMaterial({ color }),
      floor: new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(ROOM_FLOOR_SHADE) }),
      ceiling: new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(ROOM_CEILING_SHADE) }),
    });
  }
  return mats;
}

/** Each room's side of its walls in the room's colour, merged into one mesh per room. */
function buildWallFaces(scene: THREE.Scene, map: MapData, mats: Map<string, RoomMaterials>) {
  const h = map.wallHeightM;
  const byRoom = new Map<string, THREE.BufferGeometry[]>();
  for (const face of wallFaces(map)) {
    if (!mats.has(face.room)) continue;
    const level = levelOf(map, face.x, face.z);
    const offset = map.wallThicknessM / 2 + FACE_GAP_M;
    const geometry = new THREE.PlaneGeometry(face.length, h);
    // A plane faces +z; turn it to look into its room.
    const yaw = face.axis === "x" ? (face.facing === 1 ? 0 : Math.PI) : face.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
    geometry.rotateY(yaw);
    const x = face.axis === "z" ? face.x + face.facing * offset : face.x;
    const z = face.axis === "x" ? face.z + face.facing * offset : face.z;
    geometry.translate(x + level.shiftX, level.y + h / 2, z + level.shiftZ);
    const list = byRoom.get(face.room) ?? [];
    list.push(geometry);
    byRoom.set(face.room, list);
  }
  for (const [room, geometries] of byRoom) {
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (merged) scene.add(new THREE.Mesh(merged, mats.get(room)!.wall));
  }
}

/**
 * A flight of steps between its two side walls, which rise from the lower floor to the top of
 * the upper one. The walls the simulation adds across the flight's ends (levels.ts stairWalls)
 * are not drawn: they only stop walkers in the half of the flight that belongs to the other floor.
 */
function buildStairs(scene: THREE.Scene, map: MapData, stair: StairDef, wallMat: THREE.Material, ceilingMat: THREE.Material) {
  const bottom = toWorld(map, stair.x, stair.z);
  const along = stair.dir === "+x" ? { x: 1, z: 0 } : stair.dir === "-x" ? { x: -1, z: 0 } : stair.dir === "+z" ? { x: 0, z: 1 } : { x: 0, z: -1 };
  const top = toWorld(map, stair.x + along.x * stair.lengthM, stair.z + along.z * stair.lengthM);
  const rise = top.y - bottom.y;
  const group = new THREE.Group();
  group.position.set(bottom.x, bottom.y, bottom.z);
  // Built going toward -z, then turned to face the flight's direction.
  group.rotation.y = Math.atan2(-along.x, -along.z);
  scene.add(group);

  const count = Math.max(1, Math.round(rise / STEP_RISE_M));
  const depth = stair.lengthM / count;
  const stepMat = new THREE.MeshLambertMaterial({ color: STAIR_COLOR });
  for (let i = 0; i < count; i++) {
    const height = (rise * (i + 1)) / count;
    const step = new THREE.Mesh(new THREE.BoxGeometry(stair.widthM, height, depth), stepMat);
    step.position.set(0, height / 2, -(i + 0.5) * depth);
    group.add(step);
  }

  const wallHeight = rise + map.wallHeightM;
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(map.wallThicknessM, wallHeight, stair.lengthM), wallMat);
    wall.position.set((side * stair.widthM) / 2, wallHeight / 2, -stair.lengthM / 2);
    group.add(wall);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(stair.widthM, stair.lengthM), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, wallHeight, -stair.lengthM / 2);
  group.add(ceiling);
  // Above the bottom step, the upper floor's wall closes the stairwell off from the floor above.
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(stair.widthM + map.wallThicknessM, map.wallHeightM, map.wallThicknessM), wallMat);
  lintel.position.set(0, rise + map.wallHeightM / 2, 0);
  group.add(lintel);
}

/** The meeting bell on its stand (GDD 16). Placeholder look. */
function bellModel(): THREE.Group {
  const group = new THREE.Group();
  const brass = new THREE.MeshLambertMaterial({ color: 0xb08d3c, emissive: 0x2a1e08 });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 1, 10), new THREE.MeshLambertMaterial({ color: 0x3b2d20 }));
  stand.position.y = 0.5;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  bell.position.y = 1.0;
  group.add(stand, bell);
  return group;
}

/** The fuse box on its post (GDD 14). Placeholder look. */
function fuseBoxModel(): THREE.Group {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.2), new THREE.MeshLambertMaterial({ color: 0x4d5a4f }));
  box.position.y = 1.4;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  post.position.y = 0.525;
  group.add(box, post);
  return group;
}

/** The chalk circle around the altar (GDD 11): stand inside it to do the ritual. */
const CIRCLE_COLORS = { waiting: 0x8a1c1c, ready: 0xd04a2a, running: 0xe0b25a, tainted: 0x3a1048 };
// Black flames on the altar while the ritual is Tainted (GDD 11). Visual tuning only.
const FLAME_COUNT = 5;
const FLAME_RING_M = 0.35;
const FLAME_HEIGHT_M = 0.7;
const ALTAR_TOP_M = 1;
const FLAME_COLOR = 0x0b0410;

/**
 * The circle on the floor around the altar: dull red, brighter once the ritual is ready, gold while
 * it runs, and dark purple with black flames on the altar while it is Tainted.
 */
export class RitualCircleView {
  readonly mesh = new THREE.Group();
  private material = new THREE.MeshBasicMaterial({ color: CIRCLE_COLORS.waiting });
  private flames: THREE.Mesh[] = [];

  constructor() {
    const r = config.ritual.circleRadiusM;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r, 64), this.material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.mesh.add(ring);
    const flameMat = new THREE.MeshBasicMaterial({ color: FLAME_COLOR, transparent: true, opacity: 0.92 });
    for (let i = 0; i < FLAME_COUNT; i++) {
      const a = (i / FLAME_COUNT) * Math.PI * 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, FLAME_HEIGHT_M, 7), flameMat);
      flame.position.set(Math.sin(a) * FLAME_RING_M, ALTAR_TOP_M + FLAME_HEIGHT_M / 2, Math.cos(a) * FLAME_RING_M);
      flame.visible = false;
      this.flames.push(flame);
      this.mesh.add(flame);
    }
  }

  setState(state: keyof typeof CIRCLE_COLORS) {
    this.material.color.setHex(CIRCLE_COLORS[state]);
    for (const f of this.flames) f.visible = state === "tainted";
  }

  /** The flames lick up and down. */
  render(time: number) {
    this.flames.forEach((f, i) => {
      if (!f.visible) return;
      const s = 0.75 + 0.35 * Math.abs(Math.sin(time * 6 + i * 1.7));
      f.scale.set(1, s, 1);
      f.position.y = ALTAR_TOP_M + (FLAME_HEIGHT_M * s) / 2;
    });
  }
}
