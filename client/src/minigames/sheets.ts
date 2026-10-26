import { config } from "@haunted/shared";
import { dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Fold the bed sheets (GDD 9): drag the glowing corner onto the marked corner to fold the sheet
// in half, three times. Wet linen is heavy: the corner only follows the mouse so fast, and if you
// let go short of the mark it falls back.

const GRAB = 30;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Sheets implements Minigame {
  readonly hint = "Drag the glowing corner onto the marked corner to fold the sheet in half. Do it three times.";
  private cfg = config.tasks.minigames.sheets;
  private sheet: Rect = { x: 100, y: 60, w: 440, h: 280 };
  private folds = 0;
  private corner: Point;
  private held = false;
  private pointer: Point = { x: 0, y: 0 };

  constructor(private play: PlaySound) {
    this.corner = this.start();
  }

  get done(): boolean {
    return this.folds >= this.cfg.folds;
  }

  /** Folds alternate: across (right edge onto left), then up (bottom edge onto top). */
  private get across(): boolean {
    return this.folds % 2 === 0;
  }

  private start(): Point {
    const s = this.sheet;
    return this.across ? { x: s.x + s.w, y: s.y + s.h } : { x: s.x, y: s.y + s.h };
  }

  private target(): Point {
    const s = this.sheet;
    return this.across ? { x: s.x, y: s.y + s.h } : { x: s.x, y: s.y };
  }

  pointerDown(p: Point) {
    this.pointer = p;
    if (!this.done && dist(p, this.corner) <= GRAB) this.held = true;
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    if (!this.held) return;
    this.held = false;
    if (dist(this.corner, this.target()) > this.cfg.snapUnits) {
      this.corner = this.start();
      return;
    }
    if (this.across) this.sheet.w /= 2;
    else this.sheet.h /= 2;
    this.folds++;
    this.play("scrape");
    this.corner = this.start();
  }

  update(dt: number) {
    if (!this.held) return;
    const d = dist(this.corner, this.pointer);
    const step = this.cfg.dragUnitsPerSec * dt;
    if (d <= step) this.corner = { ...this.pointer };
    else this.corner = { x: this.corner.x + ((this.pointer.x - this.corner.x) / d) * step, y: this.corner.y + ((this.pointer.y - this.corner.y) / d) * step };
  }

  /** How far through the fold the corner is, 0 to 1. */
  private progress(): number {
    const full = dist(this.start(), this.target());
    return Math.max(0, Math.min(1, 1 - dist(this.corner, this.target()) / full));
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#191510");
    const s = this.sheet;
    const f = this.progress();
    g.fillStyle = "#d9d4c4";
    g.strokeStyle = "#a59f8c";
    g.lineWidth = 2;
    if (this.done) {
      g.fillRect(s.x, s.y, s.w, s.h);
      g.strokeRect(s.x, s.y, s.w, s.h);
      return;
    }
    // The half that stays, then the flap swinging over it.
    if (this.across) {
      const mid = s.x + s.w / 2;
      const edge = s.x + s.w - f * s.w;
      g.fillRect(s.x, s.y, s.w / 2, s.h);
      g.strokeRect(s.x, s.y, s.w / 2, s.h);
      g.fillStyle = f > 0.5 ? "#ece8da" : "#d9d4c4";
      g.fillRect(Math.min(mid, edge), s.y, Math.abs(edge - mid), s.h);
      g.strokeRect(Math.min(mid, edge), s.y, Math.abs(edge - mid), s.h);
    } else {
      const mid = s.y + s.h / 2;
      const edge = s.y + s.h - f * s.h;
      g.fillRect(s.x, s.y, s.w, s.h / 2);
      g.strokeRect(s.x, s.y, s.w, s.h / 2);
      g.fillStyle = f > 0.5 ? "#ece8da" : "#d9d4c4";
      g.fillRect(s.x, Math.min(mid, edge), s.w, Math.abs(edge - mid));
      g.strokeRect(s.x, Math.min(mid, edge), s.w, Math.abs(edge - mid));
    }

    // Where the corner must go, and the corner to grab.
    const t = this.target();
    g.strokeStyle = "#6fae6a";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(t.x, t.y, this.cfg.snapUnits, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `rgba(255, 210, 120, ${0.6 + 0.3 * Math.sin(time * 5)})`;
    g.beginPath();
    g.arc(this.corner.x, this.corner.y, 12, 0, Math.PI * 2);
    g.fill();
  }
}
