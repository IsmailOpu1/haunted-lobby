import { config } from "@haunted/shared";
import { comfort } from "./comfort.ts";

/** Photosensitivity mode (GDD 23): how fast the light eases toward its level, per second. */
const GENTLE_RATE_PER_SEC = 1.5;
/** Photosensitivity mode: how dim the light gets with the ghost right beside you (instead of flickering). */
const GENTLE_LOWEST = 0.35;

/**
 * Flashlight flicker near the ghost (GDD Section 8.1): random flicker within flickerGhostM,
 * and the light dies for deadSec at a time within deadGhostM. One instance per flashlight.
 * In photosensitivity mode the same warning comes as a slow dimming instead (GDD 23).
 */
export class Flicker {
  private deadLeft = 0;
  private flickerLeft = 0;
  private wasClose = false;
  private gentle = 1;

  /** Returns how bright the light should be right now, 0 to 1. */
  update(dt: number, ghostDistance: number): number {
    const sharp = this.sharp(dt, ghostDistance);
    if (!comfort.photosensitive) {
      this.gentle = sharp;
      return sharp;
    }
    const f = config.flashlight;
    const closeness = ghostDistance > f.flickerGhostM ? 0 : 1 - ghostDistance / f.flickerGhostM;
    const target = this.deadLeft > 0 ? 0 : 1 - (1 - GENTLE_LOWEST) * closeness;
    this.gentle += (target - this.gentle) * (1 - Math.exp(-GENTLE_RATE_PER_SEC * dt));
    return this.gentle;
  }

  private sharp(dt: number, ghostDistance: number): number {
    const f = config.flashlight;
    const veryClose = ghostDistance <= f.deadGhostM;
    if (veryClose && !this.wasClose) this.deadLeft = f.deadSec;
    this.wasClose = veryClose;

    if (this.deadLeft > 0) {
      this.deadLeft -= dt;
      return 0;
    }
    if (ghostDistance > f.flickerGhostM) return 1;

    // Closer means more frequent flicker.
    const closeness = 1 - ghostDistance / f.flickerGhostM;
    if (this.flickerLeft > 0) {
      this.flickerLeft -= dt;
      return 0.15;
    }
    if (Math.random() < closeness * dt * 6) this.flickerLeft = 0.05 + Math.random() * 0.15;
    return 1;
  }
}
