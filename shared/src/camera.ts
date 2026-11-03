// The Spirit Camera's frame (GDD 15.2).

import { config } from "./config.ts";
import { normalizeAngle } from "./sim/movement.ts";

/**
 * Where a point shows in a photo taken from `cam` (yaw 0 looks toward -z), or null when it is out
 * of the frame or beyond captureRangeM. frameX runs from -1 (left edge) to 1 (right edge).
 * Walls are the caller's job.
 */
export function inPhotoFrame(cam: { x: number; z: number; yaw: number }, at: { x: number; z: number }): { frameX: number; dist: number } | null {
  const c = config.camera;
  const dx = at.x - cam.x;
  const dz = at.z - cam.z;
  const dist = Math.hypot(dx, dz);
  if (dist > c.captureRangeM || dist < 1e-6) return null;
  const half = ((c.photoFovDeg / 2) * Math.PI) / 180;
  // Facing yaw looks along (-sin, -cos); a larger yaw turns left.
  const off = normalizeAngle(Math.atan2(-dx, -dz) - cam.yaw);
  if (Math.abs(off) > half) return null;
  return { frameX: -off / half, dist };
}

/** A night time as the clock shows it: 310 s is "5:10". */
export function clockTime(nightTime: number): string {
  const s = Math.max(0, Math.floor(nightTime));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
