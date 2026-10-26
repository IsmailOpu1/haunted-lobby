import { config } from "@haunted/shared";
import { BOARD_W, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Rock the cradle (GDD 9): move the mouse left and right to rock the cradle along with the
// pale guide. Rock too fast and the baby cries, which the ghost can hear (a noisy task).

const CRADLE_Y = 230;
const SPEED_SMOOTHING_PER_SEC = 10;
const TILT_RAD = 0.35;

export class Cradle implements Minigame {
  readonly hint = "Move the mouse left and right, gently, to rock the cradle along with the pale outline.";
  private cfg = config.tasks.minigames.cradle;
  private time = 0;
  private rock = 0;
  private lastX: number | null = null;
  private moved = 0;
  private speed = 0;
  private progress = 0;
  private crying = 0;

  constructor(private play: PlaySound) {}

  get done(): boolean {
    return this.progress >= this.cfg.fillSec;
  }

  pointerMove(p: Point) {
    if (this.lastX !== null) this.moved += Math.abs(p.x - this.lastX);
    this.lastX = p.x;
    const limit = this.cfg.swingUnits * 1.2;
    this.rock = Math.max(-limit, Math.min(limit, p.x - BOARD_W / 2));
  }

  private guide(): number {
    return Math.sin((this.time / this.cfg.periodSec) * Math.PI * 2) * this.cfg.swingUnits;
  }

  update(dt: number) {
    this.time += dt;
    if (dt > 0) this.speed += (this.moved / dt - this.speed) * Math.min(1, SPEED_SMOOTHING_PER_SEC * dt);
    this.moved = 0;
    if (this.crying > 0) {
      this.crying -= dt;
      return;
    }
    if (this.speed > this.cfg.cryUnitsPerSec) {
      this.crying = this.cfg.cryPauseSec;
      this.progress = Math.max(0, this.progress - this.cfg.cryLoseSec);
      this.play("cry");
      return;
    }
    if (this.speed >= this.cfg.minUnitsPerSec && Math.abs(this.rock - this.guide()) <= this.cfg.matchUnits) this.progress += dt;
  }

  private drawCradle(g: CanvasRenderingContext2D, offset: number, ghost: boolean, time: number) {
    g.save();
    g.translate(BOARD_W / 2 + offset * 0.5, CRADLE_Y);
    g.rotate((offset / this.cfg.swingUnits) * TILT_RAD);
    if (ghost) {
      g.strokeStyle = "rgba(200, 220, 255, 0.35)";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, 110, 50, 0, 0, Math.PI);
      g.stroke();
      g.restore();
      return;
    }
    // Rockers.
    g.strokeStyle = "#5a3a22";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(0, -90, 190, Math.PI * 0.32, Math.PI * 0.68);
    g.stroke();
    // Basket.
    g.fillStyle = "#6b4a2e";
    g.beginPath();
    g.ellipse(0, 0, 110, 50, 0, 0, Math.PI);
    g.fill();
    g.fillRect(-110, -18, 220, 18);
    // Baby bundle; it shakes while crying.
    const shake = this.crying > 0 ? Math.sin(time * 60) * 3 : 0;
    g.fillStyle = "#d9ccaa";
    g.beginPath();
    g.ellipse(shake, -24, 60, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8c9a8";
    g.beginPath();
    g.arc(-55 + shake, -28, 14, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#141016");
    this.drawCradle(g, this.guide(), true, time);
    this.drawCradle(g, this.rock, false, time);

    if (this.crying > 0) {
      g.fillStyle = "#e0705a";
      g.font = "bold 28px Georgia, serif";
      g.textAlign = "center";
      g.fillText("The baby is crying!", BOARD_W / 2, 90);
    }

    // Progress: a lullaby bar along the bottom.
    g.fillStyle = "rgba(255, 255, 255, 0.12)";
    g.fillRect(120, 360, BOARD_W - 240, 8);
    g.fillStyle = "#9db4e0";
    g.fillRect(120, 360, (BOARD_W - 240) * Math.min(1, this.progress / this.cfg.fillSec), 8);
  }
}
