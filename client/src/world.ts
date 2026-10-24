import * as THREE from "three";
import { doorBox, HIDING_SPOT_HEIGHT_M, hidingSpotBox, wallBox, type DoorDef, type MapData } from "@haunted/shared";

const WALL_COLOR = 0x8a8a8a;
const FLOOR_COLOR = 0x6f6f6f;
const CEILING_COLOR = 0x4a4a4a;
const DOOR_COLOR = 0x6b5a45;
const CURTAIN_COLOR = 0x4a1f24;
const DOOR_THICKNESS = 0.08;
const DOOR_SWING_PER_SEC = 4; // radians per second for the open/close animation

/** A door mesh that swings around its hinge. */
export class DoorView {
  private pivot = new THREE.Group();
  private targetAngle = 0;

  constructor(scene: THREE.Scene, private def: DoorDef, height: number) {
    const box = doorBox(def, DOOR_THICKNESS);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.sizeX, height * 0.9, box.sizeZ),
      new THREE.MeshLambertMaterial({ color: DOOR_COLOR }),
    );
    // Hinge at one end of the doorway; the panel extends from it.
    const half = def.width / 2;
    if (def.axis === "x") {
      this.pivot.position.set(def.x - half, 0, def.z);
      mesh.position.set(half, (height * 0.9) / 2, 0);
    } else {
      this.pivot.position.set(def.x, 0, def.z - half);
      mesh.position.set(0, (height * 0.9) / 2, half);
    }
    this.pivot.add(mesh);
    scene.add(this.pivot);
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

/** Builds the grey-box rooms: floors, ceilings, walls and doors. */
export function buildWorld(scene: THREE.Scene, map: MapData): Map<string, DoorView> {
  const h = map.wallHeightM;
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  for (const segment of map.walls) {
    const box = wallBox(segment, map.wallThicknessM);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(box.sizeX, h, box.sizeZ), wallMat);
    wall.position.set(box.x, h / 2, box.z);
    scene.add(wall);
  }

  const floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLOR });
  const ceilingMat = new THREE.MeshLambertMaterial({ color: CEILING_COLOR });
  for (const room of map.rooms) {
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, h, cz);
    scene.add(ceiling);
  }

  // Hiding furniture: wardrobes and cupboards are wood boxes, curtains are dark cloth.
  for (const spot of map.hidingSpots) {
    const box = hidingSpotBox(spot);
    const color = spot.kind === "curtain" ? CURTAIN_COLOR : DOOR_COLOR;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.sizeX, HIDING_SPOT_HEIGHT_M, box.sizeZ), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(box.x, HIDING_SPOT_HEIGHT_M / 2, box.z);
    scene.add(mesh);
  }

  const doors = new Map<string, DoorView>();
  for (const def of map.doors) doors.set(def.id, new DoorView(scene, def, h));
  return doors;
}
