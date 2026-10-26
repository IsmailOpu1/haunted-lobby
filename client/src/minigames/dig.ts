import { config } from "@haunted/shared";
import { dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Dig it up (GDD 10, a relic spot): hold the mouse in the soil and drag the trowel back and
// forth. Frantic strokes do not dig any faster.

const SOIL = { x: 120, y: 170, w: 400, h: 190 };
const SCRAPE_EVERY = 350;

export class Dig implements Minigame {
  readonly hint = "Hold the mouse in the soil and drag back and forth to dig. Steady strokes; frantic ones waste effort.";
  private cfg = config.relics.minigames.dig;
  private dug = 0;
  private held = false;
  private pointer: Point = { x: 0, y: 0 };
  private last: Point = { x: 0, y: 0 };
  private nextScrape = SCRAPE_EVERY;

  constructor(private play: PlaySound) {}

  get done(): boolean {
    return this.dug >= this.cfg.digUnits;
  }

  pointerDown(p: Point) {
    this.held = true;
    this.pointer = this.last = { ...p };
  }

  pointerMove(p: Point) {
    this.pointer = { ...p };
  }

  pointerUp() {
    this.held = false;
  }

  private inSoil(p: Point): boolean {
    return p.x >= SOIL.x && p.x <= SOIL.x + SOIL.w && p.y >= SOIL.y - 20 && p.y <= SOIL.y + SOIL.h;
  }

  update(dt: number) {
    const moved = dist(this.pointer, this.last);
    this.last = { ...this.pointer };
    if (!this.held || !this.inSoil(this.pointer)) return;
    this.dug = Math.min(this.cfg.digUnits, this.dug + Math.min(moved, this.cfg.maxUnitsPerSec * dt));
    if (this.dug >= this.nextScrape) {
      this.nextScrape += SCRAPE_EVERY;
      this.play("scrape");
    }
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#16110c");
    const f = this.dug / this.cfg.digUnits;
    // The planter, the hole getting deeper, and the pile of earth beside it.
    g.fillStyle = "#5a3b22";
    g.fillRect(SOIL.x - 14, SOIL.y - 14, SOIL.w + 28, SOIL.h + 28);
    g.fillStyle = "#2e2014";
    g.fillRect(SOIL.x, SOIL.y, SOIL.w, SOIL.h);
    const holeW = 120 + 120 * f;
    const holeH = (SOIL.h - 30) * f;
    g.fillStyle = "#140d07";
    g.beginPath();
    g.ellipse(320, SOIL.y + 10 + holeH / 2, holeW / 2, Math.max(4, holeH / 2), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3a2817";
    g.beginPath();
    g.ellipse(SOIL.x + SOIL.w - 50, SOIL.y, 30 + 50 * f, 8 + 40 * f, 0, Math.PI, 0);
    g.fill();
    if (f > 0.8) {
      // Something glints at the bottom.
      g.fillStyle = `rgba(230, 200, 120, ${(f - 0.8) * 5 * (0.6 + 0.4 * Math.sin(time * 6))})`;
      g.beginPath();
      g.arc(320, SOIL.y + 10 + holeH * 0.8, 8, 0, Math.PI * 2);
      g.fill();
    }
    // The trowel.
    if (this.held) {
      g.fillStyle = "#9aa0a4";
      g.beginPath();
      g.moveTo(this.pointer.x, this.pointer.y);
      g.lineTo(this.pointer.x + 14, this.pointer.y - 30);
      g.lineTo(this.pointer.x - 14, this.pointer.y - 30);
      g.fill();
      g.fillStyle = "#6a4426";
      g.fillRect(this.pointer.x - 4, this.pointer.y - 60, 8, 30);
    }
    g.fillStyle = "rgba(255, 255, 255, 0.12)";
    g.fillRect(220, 380, 200, 8);
    g.fillStyle = "#e0b24a";
    g.fillRect(220, 380, 200 * f, 8);
  }
}
