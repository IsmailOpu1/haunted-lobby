import { config } from "@haunted/shared";
import { dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Close the shutters (GDD 9): grab each shutter's handle and drag it shut against the wind,
// then hold it there until the latch catches. Let go early and the wind throws it open.

const WIN_W = 130;
const WIN_TOP = 90;
const WIN_H = 220;
const HANDLE_Y = WIN_TOP + WIN_H / 2;
const GRAB = 30;
/** Closed enough for the latch to start catching. */
const SHUT = 0.03;

interface Shutter {
  left: number;
  /** 0 is shut, 1 is flung wide open. */
  open: number;
  latch: number;
  latched: boolean;
}

export class Shutters implements Minigame {
  readonly hint = "Drag each shutter's handle across to close it, and hold it shut until the latch catches.";
  private cfg = config.tasks.minigames.shutters;
  private shutters: Shutter[] = [];
  private held: Shutter | null = null;
  private pointer: Point = { x: 0, y: 0 };
  private time = 0;

  constructor(private play: PlaySound) {
    const n: number = this.cfg.count;
    for (let i = 0; i < n; i++) {
      const left = 320 + (i - (n - 1) / 2) * 170 - WIN_W / 2;
      this.shutters.push({ left, open: 0.7 + Math.random() * 0.3, latch: 0, latched: false });
    }
  }

  get done(): boolean {
    return this.shutters.every((s) => s.latched);
  }

  handle(s: Shutter): Point {
    return { x: s.left + WIN_W * (1 - s.open), y: HANDLE_Y };
  }

  pointerDown(p: Point) {
    this.pointer = p;
    this.held = this.shutters.find((s) => !s.latched && dist(p, this.handle(s)) <= GRAB) ?? null;
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    this.held = null;
  }

  update(dt: number) {
    this.time += dt;
    const c = this.cfg;
    // Gusts: the wind rises and falls, but never beats a firm hand.
    const wind = c.windPerSec * (1 + 0.4 * Math.sin(this.time * 1.7));
    for (const s of this.shutters) {
      if (s.latched) continue;
      if (s === this.held) {
        const wanted = Math.max(0, Math.min(1, 1 - (this.pointer.x - s.left) / WIN_W));
        const step = c.dragPerSec * dt;
        s.open += Math.max(-step, Math.min(step, wanted - s.open));
      }
      s.open = Math.min(1, s.open + wind * dt);
      if (s === this.held && s.open <= SHUT) {
        s.latch += dt;
        if (s.latch >= c.latchSec) {
          s.latched = true;
          s.open = 0;
          this.held = null;
          this.play("thud");
        }
      } else {
        s.latch = 0;
      }
    }
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#141210");
    for (const s of this.shutters) {
      // The night outside, with rain streaks.
      g.fillStyle = "#0b1018";
      g.fillRect(s.left, WIN_TOP, WIN_W, WIN_H);
      g.strokeStyle = "rgba(150, 170, 200, 0.25)";
      g.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = s.left + ((i * 37 + time * 120) % WIN_W);
        const y = WIN_TOP + ((i * 53 + time * 400) % WIN_H);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 4, y + 14);
        g.stroke();
      }
      // The shutter, hinged on the left: it folds back toward the hinge as the wind opens it.
      const w = WIN_W * (1 - s.open);
      g.fillStyle = s.latched ? "#4e3a26" : "#5e4630";
      g.fillRect(s.left, WIN_TOP, w, WIN_H);
      g.strokeStyle = "#2c2016";
      g.lineWidth = 2;
      for (let y = WIN_TOP + 12; y < WIN_TOP + WIN_H; y += 16) {
        g.beginPath();
        g.moveTo(s.left + 4, y);
        g.lineTo(s.left + w - 4, y);
        g.stroke();
      }
      g.strokeStyle = "#7d5a32";
      g.lineWidth = 6;
      g.strokeRect(s.left - 3, WIN_TOP - 3, WIN_W + 6, WIN_H + 6);
      if (!s.latched) {
        const h = this.handle(s);
        g.fillStyle = s === this.held ? "#e0b24a" : "#a07a34";
        g.beginPath();
        g.arc(h.x, h.y, 10, 0, Math.PI * 2);
        g.fill();
        if (s.latch > 0) {
          g.strokeStyle = "#6fae6a";
          g.lineWidth = 3;
          g.beginPath();
          g.arc(h.x, h.y, 17, -Math.PI / 2, -Math.PI / 2 + (s.latch / this.cfg.latchSec) * Math.PI * 2);
          g.stroke();
        }
      }
    }
  }
}
