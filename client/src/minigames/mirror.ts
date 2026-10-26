import { config } from "@haunted/shared";
import { dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Clean the mirror (GDD 9): hold the mouse and wipe the fog off. Wiping too fast only smears it.
// Sometimes, halfway through, a face looks back for a moment (a scare, nothing more).

const GLASS = { x: 140, y: 40, w: 360, h: 320 };
const CELL = 20;

export class Mirror implements Minigame {
  readonly hint = "Hold the mouse and wipe the fog off the glass. Slow, steady strokes; fast ones only smear.";
  private cfg = config.tasks.minigames.mirror;
  private cols = GLASS.w / CELL;
  private rows = GLASS.h / CELL;
  private fog: boolean[];
  private left: number;
  private held = false;
  private pointer: Point = { x: 0, y: 0 };
  private last: Point = { x: 0, y: 0 };
  private smearing = false;
  private face: boolean;
  private faceLeft = 0;

  constructor(private play: PlaySound) {
    this.fog = new Array(this.cols * this.rows).fill(true);
    this.left = this.fog.length;
    this.face = Math.random() < this.cfg.faceChance;
  }

  get done(): boolean {
    return this.clearPct() >= this.cfg.clearPct;
  }

  private clearPct(): number {
    return 100 * (1 - this.left / this.fog.length);
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

  update(dt: number) {
    this.faceLeft = Math.max(0, this.faceLeft - dt);
    const moved = dist(this.pointer, this.last);
    this.last = { ...this.pointer };
    this.smearing = this.held && moved > this.cfg.maxUnitsPerSec * dt;
    if (!this.held || this.smearing || moved === 0) return;
    const before = this.clearPct();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (!this.fog[i]) continue;
        const centre = { x: GLASS.x + (c + 0.5) * CELL, y: GLASS.y + (r + 0.5) * CELL };
        if (dist(centre, this.pointer) > this.cfg.brushUnits) continue;
        this.fog[i] = false;
        this.left--;
      }
    }
    if (this.face && before < 50 && this.clearPct() >= 50) {
      this.face = false;
      this.faceLeft = this.cfg.faceSec;
      this.play("scare");
    }
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g);
    // Gilt frame and dark glass with a faint reflection.
    g.fillStyle = "#a07a34";
    g.fillRect(GLASS.x - 16, GLASS.y - 16, GLASS.w + 32, GLASS.h + 32);
    const glass = g.createLinearGradient(GLASS.x, GLASS.y, GLASS.x + GLASS.w, GLASS.y + GLASS.h);
    glass.addColorStop(0, "#3a4650");
    glass.addColorStop(0.5, "#1b2228");
    glass.addColorStop(1, "#2c363e");
    g.fillStyle = glass;
    g.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);

    if (this.faceLeft > 0) {
      // A pale face, there and gone.
      const a = Math.min(1, this.faceLeft / this.cfg.faceSec + 0.2);
      const cx = GLASS.x + GLASS.w / 2;
      const cy = GLASS.y + GLASS.h * 0.42;
      g.fillStyle = `rgba(220, 225, 230, ${0.75 * a})`;
      g.beginPath();
      g.ellipse(cx, cy, 60, 80, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(0, 0, 0, ${a})`;
      for (const dx of [-22, 22]) {
        g.beginPath();
        g.ellipse(cx + dx, cy - 10, 10, 14, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.ellipse(cx, cy + 40, 12, 18, 0, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = "rgba(200, 205, 210, 0.82)";
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.fog[r * this.cols + c]) g.fillRect(GLASS.x + c * CELL, GLASS.y + r * CELL, CELL, CELL);
      }
    }

    // The cloth under the mouse.
    if (this.held) {
      g.fillStyle = this.smearing ? "rgba(200, 120, 90, 0.6)" : "rgba(240, 230, 210, 0.6)";
      g.beginPath();
      g.arc(this.pointer.x, this.pointer.y, this.cfg.brushUnits, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#e6e2d8";
    g.font = "14px Georgia, serif";
    g.textAlign = "center";
    g.fillText(this.smearing ? "Too fast: it only smears" : `${Math.floor(this.clearPct())}% clean`, 320, 390);
  }
}
