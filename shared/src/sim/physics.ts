import RAPIER from "@dimforge/rapier3d-compat";
import { config } from "../config.ts";
import { doorBox, wallBox, type FloorBox, type MapData } from "../map.ts";
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
 * Walls, doors and player bodies for one map. Movement is flat for now (ground floor only);
 * stairs and levels come with the full map in Phase 5.
 */
export class PhysicsWorld {
  private world: RAPIER.World;
  private controller: RAPIER.KinematicCharacterController;
  private doors = new Map<string, RAPIER.Collider>();
  private bodyHandles = new Set<number>();

  constructor(map: MapData) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const h = map.wallHeightM;
    for (const segment of map.walls) this.addBox(wallBox(segment, map.wallThicknessM), h);
    for (const door of map.doors) this.doors.set(door.id, this.addBox(doorBox(door, map.wallThicknessM), h));

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
      return { x: from.x + moved.x, z: from.z + moved.z };
    };
    const remove = () => {
      this.bodyHandles.delete(collider.handle);
      this.world.removeCollider(collider, false);
    };
    return { collide, remove };
  }

  /** An open door stops blocking movement. */
  setDoorOpen(id: string, open: boolean) {
    const door = this.doors.get(id);
    if (!door || door.isEnabled() === !open) return;
    door.setEnabled(!open);
    this.refreshQueries();
  }
}
