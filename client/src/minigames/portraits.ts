import { config } from "@haunted/shared";
import { dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Straighten the portraits (the Corridor's task, chosen in Phase 4, GDD 26.5): grab a crooked
// portrait and drag sideways to tilt it level, then let go. Heavy frames turn slowly. One of
// them does not want to hang straight and swings back once.

const NAIL_Y = 80;
const FRAME_W = 110;
const FRAME_H = 140;
/** Degrees of tilt per board unit of sideways drag. */
const DEG_PER_UNIT = 0.25;
const SWING_DEG_PER_SEC = 90;
const HAUNT_DELAY_SEC = 0.6;

interface Portrait {
  x: number;
  tilt: number;
  steady: number;
  level: boolean;
}

export class Portraits implements Minigame {
  readonly hint = "Grab a crooked portrait and drag sideways to level it, then let go and let it settle.";
  private cfg = config.tasks.minigames.portraits;
  private portraits: Portrait[] = [];
  private held: Portrait | null = null;
  private grab = { x: 0, tilt: 0 };
  private pointer: Point = { x: 0, y: 0 };
  /** The portrait that swings back once it is level, and what it is doing. */
  private haunted: Portrait;
  private haunt: { wait: number; to: number } | null = null;
  private haunting = false;
  private hauntUsed = false;

  constructor(private play: PlaySound) {
    const n: number = this.cfg.count;
    const c = this.cfg;
    for (let i = 0; i < n; i++) {
      const tilt = (Math.random() < 0.5 ? -1 : 1) * (c.minTiltDeg + Math.random() * (c.maxTiltDeg - c.minTiltDeg));
      this.portraits.push({ x: 320 + (i - (n - 1) / 2) * 160, tilt, steady: 0, level: false });
    }
    this.haunted = this.portraits[Math.floor(Math.random() * n)]!;
  }

  get done(): boolean {
    return !this.haunting && this.portraits.every((p) => p.level);
  }

  private centre(p: Portrait): Point {
    return { x: p.x, y: NAIL_Y + 20 + FRAME_H / 2 };
  }

  pointerDown(p: Point) {
    this.pointer = p;
    const hit = this.portraits.find((q) => !q.level && q !== this.swinging() && dist(p, this.centre(q)) <= FRAME_H * 0.6);
    if (!hit) return;
    this.held = hit;
    this.grab = { x: p.x, tilt: hit.tilt };
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    this.held = null;
  }

  private swinging(): Portrait | null {
    return this.haunt && this.haunt.wait <= 0 ? this.haunted : null;
  }

  update(dt: number) {
    const c = this.cfg;
    const held = this.held;
    if (held) {
      const wanted = this.grab.tilt + (this.pointer.x - this.grab.x) * DEG_PER_UNIT;
      const step = c.turnDegPerSec * dt;
      held.tilt += Math.max(-step, Math.min(step, wanted - held.tilt));
    }
    for (const p of this.portraits) {
      if (p.level || p === held || p === this.swinging()) {
        p.steady = 0;
        continue;
      }
      p.steady = Math.abs(p.tilt) <= c.levelDeg ? p.steady + dt : 0;
      if (p.steady < c.holdSec) continue;
      p.level = true;
      this.play("click");
      if (p === this.haunted && !this.hauntUsed) {
        this.hauntUsed = true;
        this.haunting = true;
        this.haunt = { wait: HAUNT_DELAY_SEC, to: (Math.random() < 0.5 ? -1 : 1) * c.hauntedReturnDeg };
      }
    }

    // A moment after it is level, the haunted portrait swings crooked again.
    const h = this.haunt;
    if (!h) return;
    if (h.wait > 0) {
      h.wait -= dt;
      if (h.wait <= 0) {
        this.haunted.level = false;
        this.play("scare");
      }
      return;
    }
    const step = SWING_DEG_PER_SEC * dt;
    const left = h.to - this.haunted.tilt;
    this.haunted.tilt += Math.max(-step, Math.min(step, left));
    if (Math.abs(left) <= step) {
      this.haunted.tilt = h.to;
      this.haunt = null;
      this.haunting = false;
    }
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g, "#2a1e1a");
    for (const p of this.portraits) {
      g.fillStyle = "#1a1a1a";
      g.beginPath();
      g.arc(p.x, NAIL_Y, 4, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(p.x, NAIL_Y);
      g.rotate((p.tilt * Math.PI) / 180);
      // The wire, the gilt frame and a dim painted figure.
      g.strokeStyle = "#8c8478";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-FRAME_W / 2 + 10, 30);
      g.lineTo(0, 0);
      g.lineTo(FRAME_W / 2 - 10, 30);
      g.stroke();
      g.fillStyle = p === this.held ? "#c9a04a" : "#a07a34";
      g.fillRect(-FRAME_W / 2, 20, FRAME_W, FRAME_H);
      g.fillStyle = "#2e2a24";
      g.fillRect(-FRAME_W / 2 + 10, 30, FRAME_W - 20, FRAME_H - 20);
      g.fillStyle = "#5a5246";
      g.beginPath();
      g.ellipse(0, 70, 18, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-28, 95, 56, 55);
      g.restore();
      if (p.level) {
        g.fillStyle = "#6fae6a";
        g.beginPath();
        g.arc(p.x, NAIL_Y + FRAME_H + 50, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
