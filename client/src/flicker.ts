import { config } from "@haunted/shared";

/**
 * Flashlight flicker near the ghost (GDD Section 8.1): random flicker within flickerGhostM,
 * and the light dies for deadSec at a time within deadGhostM. One instance per flashlight.
 */
export class Flicker {
  private deadLeft = 0;
  private flickerLeft = 0;
  private wasClose = false;

  /** Returns how bright the light should be right now, 0 to 1. */
  update(dt: number, ghostDistance: number): number {
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
