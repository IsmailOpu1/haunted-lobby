import { config } from "@haunted/shared";
import type { StepKind } from "./audio.ts";

/** Distance covered per footstep, in meters (sound only; movement rules are in shared config). */
const STRIDE_M: Record<StepKind, number> = {
  walk: 0.75,
  run: 1.0,
  crouch: 0.55,
  crawl: 0.45,
  ghost: 1.1,
};

// Jumps longer than this are teleports (hiding, reappearing), not walking.
const TELEPORT_M = 2;

/** Which kind of step a player is making, from how fast they move and their state. */
export function playerStepKind(speed: number, crouching: boolean, downed: boolean): StepKind {
  if (downed) return "crawl";
  if (crouching) return "crouch";
  return speed > (config.movement.walk + config.movement.run) / 2 ? "run" : "walk";
}

/** Turns one body's movement into footsteps: one step every stride of distance travelled. */
export class StepTracker {
  private last: { x: number; z: number } | null = null;
  private travelled = 0;
  /** Smoothed speed in m/s, used to tell walking from running. */
  speed = 0;

  /** Returns true when this movement completes a step. */
  update(x: number, z: number, dt: number, kind: StepKind): boolean {
    if (!this.last) {
      this.last = { x, z };
      return false;
    }
    const d = Math.hypot(x - this.last.x, z - this.last.z);
    this.last = { x, z };
    if (d > TELEPORT_M) {
      this.travelled = 0;
      return false;
    }
    if (dt > 0) this.speed += (d / dt - this.speed) * Math.min(1, dt * 8);
    this.travelled += d;
    const stride = STRIDE_M[kind];
    if (this.travelled < stride) return false;
    this.travelled = this.travelled % stride;
    return true;
  }

  reset() {
    this.last = null;
    this.travelled = 0;
    this.speed = 0;
  }
}
