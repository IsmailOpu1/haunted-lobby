import { config } from "./config.ts";

// Item geometry shared by server (rules) and client (drawing). GDD Section 8.

export interface SaltLineDef {
  x: number;
  z: number;
  /** The line runs across the direction the player faced (yaw), like a doorway barrier. */
  yaw: number;
}

/** Where a salt line lands when a player at (x, z) facing yaw pours it. */
export function saltLineInFront(x: number, z: number, yaw: number): SaltLineDef {
  const ahead = config.salt.placeAheadM;
  return { x: x - Math.sin(yaw) * ahead, z: z - Math.cos(yaw) * ahead, yaw };
}

/** The two ends of a salt line. */
export function saltLineEnds(line: SaltLineDef): [{ x: number; z: number }, { x: number; z: number }] {
  const half = config.salt.lineWidthM / 2;
  // Perpendicular to the facing direction (-sin, -cos) is (cos, -sin).
  const dx = Math.cos(line.yaw) * half;
  const dz = -Math.sin(line.yaw) * half;
  return [
    { x: line.x - dx, z: line.z - dz },
    { x: line.x + dx, z: line.z + dz },
  ];
}

/** Shortest distance from a point to a salt line. */
export function distanceToSaltLine(px: number, pz: number, line: SaltLineDef): number {
  const [a, b] = saltLineEnds(line);
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / len2)) : 0;
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

/** True when the ghost at (x, z) is stepping on the line (GDD 8.3: frozen 3 s, line gone). */
export function ghostOnSalt(x: number, z: number, line: SaltLineDef): boolean {
  return distanceToSaltLine(x, z, line) <= config.salt.triggerRadiusM;
}
