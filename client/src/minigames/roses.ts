import { config } from "@haunted/shared";
import { drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Water the roses (GDD 9): hold the mouse over a vase to pour. Fill each vase to the line.
// Water keeps running for a moment after you stop, and a vase that overflows has to be emptied.

const VASE_TOP = 170;
const VASE_H = 180;
const VASE_HALF_W = 45;

interface Vase {
  x: number;
  level: number;
}

export class Roses implements Minigame {
  readonly hint = "Hold the mouse over a vase to pour. Stop at the line: water keeps running a moment after.";
  private cfg = config.tasks.minigames.roses;
  private vases: Vase[] = [];
  private held = false;
  private pointer: Point = { x: 0, y: 0 };
  /** The vase being poured into, and how long the water keeps running after you stop. */
  private stream: Vase | null = null;
  private runOn = 0;

  constructor(private play: PlaySound) {
    const n: number = this.cfg.vases;
    for (let i = 0; i < n; i++) this.vases.push({ x: 320 + (i - (n - 1) / 2) * 140, level: 0 });
  }

  get done(): boolean {
    return !this.held && this.runOn <= 0 && this.vases.every((v) => v.level >= this.cfg.line && v.level <= this.cfg.rim);
  }

  private vaseAt(p: Point): Vase | null {
    return this.vases.find((v) => Math.abs(p.x - v.x) <= VASE_HALF_W && p.y <= VASE_TOP + VASE_H) ?? null;
  }

  pointerDown(p: Point) {
    this.pointer = p;
    this.held = true;
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    this.held = false;
  }

  update(dt: number) {
    if (this.held) {
      this.stream = this.vaseAt(this.pointer);
      this.runOn = this.cfg.lagSec;
    } else {
      this.runOn = Math.max(0, this.runOn - dt);
      if (this.runOn <= 0) this.stream = null;
    }
    const v = this.stream;
    if (!v || (!this.held && this.runOn <= 0)) return;
    v.level += dt / this.cfg.fillSec;
    if (v.level > this.cfg.rim) {
      // Over the rim: tip it out and start again.
      v.level = 0;
      this.play("splash");
      this.play("wrong");
    }
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g);
    for (const v of this.vases) {
      const bottom = VASE_TOP + VASE_H;
      // Water.
      g.fillStyle = "rgba(90, 130, 170, 0.85)";
      const h = Math.min(1, v.level) * VASE_H;
      g.fillRect(v.x - VASE_HALF_W + 4, bottom - h, VASE_HALF_W * 2 - 8, h);
      // Glass.
      g.strokeStyle = "rgba(220, 230, 235, 0.7)";
      g.lineWidth = 3;
      g.strokeRect(v.x - VASE_HALF_W, VASE_TOP, VASE_HALF_W * 2, VASE_H);
      // The fill line.
      const lineY = bottom - this.cfg.line * VASE_H;
      g.strokeStyle = "#e0b24a";
      g.setLineDash([6, 4]);
      g.beginPath();
      g.moveTo(v.x - VASE_HALF_W - 8, lineY);
      g.lineTo(v.x + VASE_HALF_W + 8, lineY);
      g.stroke();
      g.setLineDash([]);
      // Drooping roses that perk up as the water rises.
      const perk = Math.min(1, v.level / this.cfg.line);
      for (let i = -1; i <= 1; i++) {
        const tipX = v.x + i * 22 + (1 - perk) * 30 * (i || 1);
        const tipY = VASE_TOP - 60 - perk * 40 + (1 - perk) * 30;
        g.strokeStyle = "#3d6a33";
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(v.x + i * 10, VASE_TOP + 10);
        g.quadraticCurveTo(v.x + i * 16, VASE_TOP - 30, tipX, tipY);
        g.stroke();
        g.fillStyle = perk >= 1 ? "#b0283a" : "#6e2a32";
        g.beginPath();
        g.arc(tipX, tipY, 11, 0, Math.PI * 2);
        g.fill();
      }
    }
    // The watering can and its stream.
    const p = this.pointer;
    if (this.stream || this.held) {
      g.strokeStyle = "rgba(120, 160, 200, 0.8)";
      g.lineWidth = 4 + Math.sin(time * 30);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x, this.stream ? VASE_TOP + VASE_H - this.stream.level * VASE_H : 380);
      g.stroke();
    }
    g.fillStyle = "#6a6f72";
    g.beginPath();
    g.ellipse(p.x + 26, p.y - 18, 24, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#6a6f72";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(p.x + 8, p.y - 14);
    g.lineTo(p.x, p.y);
    g.stroke();
  }
}
