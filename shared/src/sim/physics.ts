import RAPIER from "@dimforge/rapier3d-compat";
import { config } from "../config.ts";
import { crossStairs, levelOf, stairWalls } from "../levels.ts";
import { doorBox, HIDING_SPOT_HEIGHT_M, hidingSpotBox, wallBox, type FloorBox, type MapData } from "../map.ts";
import type { CollideFn } from "./movement.ts";

let ready: Promise<void> | undefined;

/** Loads the physics engine. Call once and await before creating a PhysicsWorld. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

const { radiusM, heightM } = config.body;
const CAPSULE_HALF_HEIGHT = heightM / 2 - radiusM;
const BODY_CENTER_Y = heightM / 2;

/**
 * Walls, doors and player bodies for one map. Movement is flat: each floor has its own area of
 * the plane, and walking past the middle of a flight of stairs moves you to the next floor's
 * area (see levels.ts).
 */
export class PhysicsWorld {
  private world: RAPIER.World;
  private controller: RAPIER.KinematicCharacterController;
  private doors = new Map<string, RAPIER.Collider>();
  private bodyHandles = new Set<number>();

  constructor(private map: MapData) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const h = map.wallHeightM;
    for (const segment of [...map.walls, ...stairWalls(map)]) this.addBox(wallBox(segment, map.wallThicknessM), h);
    for (const door of map.doors) this.doors.set(door.id, this.addBox(doorBox(door, map.wallThicknessM), h));
    for (const spot of map.hidingSpots) this.addBox(hidingSpotBox(spot), HIDING_SPOT_HEIGHT_M);

    this.controller = this.world.createCharacterController(0.01);
    this.controller.setSlideEnabled(true);
    this.refreshQueries();
  }

  /**
   * Makes collision queries see the latest walls and doors. The world has no dynamic bodies,
   * so stepping it only rebuilds the query structures. (Rapier 0.21.0 declares
   * updateSceneQueries() in its types but does not ship it at runtime.)
   */
  private refreshQueries() {
    this.world.step();
  }

  private addBox(box: FloorBox, height: number): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(box.sizeX / 2, height / 2, box.sizeZ / 2).setTranslation(box.x, height / 2, box.z);
    return this.world.createCollider(desc);
  }

  /** Creates a player body and returns a function that moves it with collision. */
  addBody(): { collide: CollideFn; remove: () => void } {
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, radiusM));
    this.bodyHandles.add(collider.handle);
    // Players pass through each other; only walls and closed doors block them.
    const ignoreBodies = (c: RAPIER.Collider) => !this.bodyHandles.has(c.handle);

    const collide: CollideFn = (from, delta) => {
      collider.setTranslation({ x: from.x, y: BODY_CENTER_Y, z: from.z });
      this.controller.computeColliderMovement(collider, { x: delta.x, y: 0, z: delta.z }, undefined, undefined, ignoreBodies);
      const moved = this.controller.computedMovement();
      return crossStairs(this.map, from, { x: from.x + moved.x, z: from.z + moved.z });
    };
    const remove = () => {
      this.bodyHandles.delete(collider.handle);
      this.world.removeCollider(collider, false);
    };
    return { collide, remove };
  }

  /**
   * True if nothing solid (walls, closed doors, furniture) is between two points at the given
   * height. Player bodies never block sight.
   */
  lineOfSight(from: { x: number; z: number }, to: { x: number; z: number }, height: number): boolean {
    // Floors block sight between floors.
    if (levelOf(this.map, from.x, from.z) !== levelOf(this.map, to.x, to.z)) return false;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return true;
    const ray = new RAPIER.Ray({ x: from.x, y: height, z: from.z }, { x: dx / dist, y: 0, z: dz / dist });
    const hit = this.world.castRay(ray, dist, true, undefined, undefined, undefined, undefined, (c) => !this.bodyHandles.has(c.handle));
    return hit === null;
  }

  /** An open door stops blocking movement. */
  setDoorOpen(id: string, open: boolean) {
    const door = this.doors.get(id);
    if (!door || door.isEnabled() === !open) return;
    door.setEnabled(!open);
    this.refreshQueries();
  }
}
