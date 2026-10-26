import { config } from "@haunted/shared";
import { dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Reach into the drain (GDD 10, a relic spot): hold the mouse and feel through the murky water.
// The hand is slow in the water; bubbles rise thicker the closer it gets. Hold still on the
// relic to grip it, then pull it up. Let go while pulling and it slips back.

const WATER = { x: 80, y: 100, w: 480, h: 270 };
const HAND_START: Point = { x: 320, y: 60 };

export class Drain implements Minigame {
  readonly hint = "Hold the mouse and feel through the water. Bubbles mean you are close. Hold still to grip, then pull up.";
  private cfg = config.relics.minigames.drain;
  private relic: Point;
  private hand: Point = { ...HAND_START };
  private pointer: Point = { ...HAND_START };
  private held = false;
  private grip = 0;
  /** Where the pull started, once the relic is gripped. */
  private pullFrom: number | null = null;
  private pulled = 0;

  constructor(private play: PlaySound) {
    this.relic = { x: 130 + Math.random() * 380, y: 250 + Math.random() * 90 };
  }

  get done(): boolean {
    return this.pulled >= this.cfg.pullUnits;
  }

  pointerDown(p: Point) {
    this.held = true;
    this.pointer = { ...p };
  }

  pointerMove(p: Point) {
    this.pointer = { ...p };
  }

  pointerUp() {
    this.held = false;
    if (this.pullFrom !== null && !this.done) {
      // It slips out of your fingers and sinks back.
      this.pullFrom = null;
      this.pulled = 0;
      this.grip = 0;
      this.hand = { ...this.relic };
      this.play("splash");
    }
  }

  update(dt: number) {
    const c = this.cfg;
    if (!this.held) return;
    const before = { ...this.hand };
    if (this.pullFrom === null) {
      // Through the water, the hand only goes so fast.
      const d = dist(this.hand, this.pointer);
      const step = c.handUnitsPerSec * dt;
      this.hand = d <= step ? { ...this.pointer } : { x: this.hand.x + ((this.pointer.x - this.hand.x) / d) * step, y: this.hand.y + ((this.pointer.y - this.hand.y) / d) * step };
      const still = dist(before, this.hand) <= c.holdStillUnitsPerSec * dt;
      if (still && dist(this.hand, this.relic) <= c.feelUnits) this.grip += dt;
      else this.grip = 0;
      if (this.grip >= c.grabSec) {
        this.pullFrom = this.hand.y;
        this.play("splash");
      }
      return;
    }
    // Pulling: only upward counts, and the weight keeps it slow.
    const up = Math.max(0, Math.min(this.hand.y - this.pointer.y, c.pullUnitsPerSec * dt));
    this.hand.y -= up;
    this.pulled = this.pullFrom - this.hand.y;
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#0f0e0c");
    const c = this.cfg;
    // The murky water and the grate above it.
    const water = g.createLinearGradient(0, WATER.y, 0, WATER.y + WATER.h);
    water.addColorStop(0, "#2b3324");
    water.addColorStop(1, "#141810");
    g.fillStyle = water;
    g.fillRect(WATER.x, WATER.y, WATER.w, WATER.h);
    g.strokeStyle = "#555048";
    g.lineWidth = 6;
    for (let x = WATER.x; x <= WATER.x + WATER.w; x += 40) {
      g.beginPath();
      g.moveTo(x, WATER.y - 30);
      g.lineTo(x, WATER.y - 6);
      g.stroke();
    }

    // Bubbles: more of them the closer the hand is (while it is still searching).
    if (this.pullFrom === null) {
      const near = Math.max(0, 1 - dist(this.hand, this.relic) / (c.feelUnits * 4));
      const count = Math.round(near * 10);
      g.fillStyle = "rgba(200, 210, 180, 0.5)";
      for (let i = 0; i < count; i++) {
        const rise = (time * 60 + i * 37) % 120;
        g.beginPath();
        g.arc(this.hand.x + Math.sin(i * 2.3 + time) * 25, this.hand.y - rise, 2 + (i % 3), 0, Math.PI * 2);
        g.fill();
      }
    }

    // The arm reaching down from the grate, and the hand.
    g.strokeStyle = "#b89c84";
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(HAND_START.x, 0);
    g.lineTo(this.hand.x, this.hand.y);
    g.stroke();
    g.fillStyle = this.grip > 0 ? "#d9b89a" : "#c4a68c";
    g.beginPath();
    g.arc(this.hand.x, this.hand.y, 14, 0, Math.PI * 2);
    g.fill();
    if (this.pullFrom !== null) {
      g.fillStyle = "#e0b24a";
      g.beginPath();
      g.arc(this.hand.x, this.hand.y + 14, 9, 0, Math.PI * 2);
      g.fill();
    }
    // The murk hides the hand a little.
    g.fillStyle = "rgba(20, 24, 16, 0.45)";
    g.fillRect(WATER.x, WATER.y, WATER.w, WATER.h);

    if (this.grip > 0) {
      g.strokeStyle = "#e0b24a";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(this.hand.x, this.hand.y, 22, -Math.PI / 2, -Math.PI / 2 + (this.grip / c.grabSec) * Math.PI * 2);
      g.stroke();
    }
    if (this.pullFrom !== null) {
      g.fillStyle = "rgba(255, 255, 255, 0.12)";
      g.fillRect(220, 384, 200, 8);
      g.fillStyle = "#e0b24a";
      g.fillRect(220, 384, (200 * this.pulled) / c.pullUnits, 8);
    }
  }
}
