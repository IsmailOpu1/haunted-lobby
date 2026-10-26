import type * as THREE from "three";
import { levelOf, type MapData } from "@haunted/shared";

// The simulation is flat: each floor lives in its own area of the plane (shared/levels.ts).
// Things built at their simulation spot are moved here to where that floor really is.

/** Moves an object built at simulation spot (x, z) onto its floor: up to its height, over to its real place. */
export function liftToFloor<T extends THREE.Object3D>(map: MapData, obj: T, x = obj.position.x, z = obj.position.z): T {
  const level = levelOf(map, x, z);
  obj.position.x += level.shiftX;
  obj.position.y += level.y;
  obj.position.z += level.shiftZ;
  return obj;
}
