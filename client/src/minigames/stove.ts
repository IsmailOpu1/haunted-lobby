import { config } from "@haunted/shared";
import { BOARD_W, dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Turn off the stove (GDD 9): hold a knob and circle the mouse to turn it to the off mark
// at the top. The old knobs are stiff, so they only turn so fast.

const KNOB_R = 42;
const KNOB_Y = 280;
const BURNER_Y = 120;

/** Signed angle difference in degrees, from -180 to 180. */
function angleDiff(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export class Stove implements Minigame {
  readonly hint = "Hold a knob and move the mouse around it to turn it to the off mark at the top.";
  private cfg = config.tasks.minigames.stove;
  private knobs: { x: number; angle: number; off: boolean }[] = [];
  private held: number | null = null;
  private pointer: Point = { x: 0, y: 0 };

  constructor(private play: PlaySound) {
    const n = this.cfg.knobs;
    for (let i = 0; i < n; i++) {
      const angle = this.cfg.onMinDeg + Math.random() * (this.cfg.onMaxDeg - this.cfg.onMinDeg);
      this.knobs.push({ x: BOARD_W / 2 + (i - (n - 1) / 2) * 150, angle, off: false });
    }
  }

  get done(): boolean {
    return this.knobs.every((k) => k.off);
  }

  pointerDown(p: Point) {
    this.pointer = p;
    const i = this.knobs.findIndex((k) => !k.off && dist(p, { x: k.x, y: KNOB_Y }) <= KNOB_R + 10);
    this.held = i >= 0 ? i : null;
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    this.held = null;
  }

  update(dt: number) {
    if (this.held === null) return;
    const k = this.knobs[this.held]!;
    const dx = this.pointer.x - k.x;
    const dy = this.pointer.y - KNOB_Y;
    if (Math.hypot(dx, dy) < 8) return; // too close to the centre to tell a direction
    // 0 degrees points up, angles grow clockwise.
    const target = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const diff = angleDiff(target, k.angle);
    const step = Math.sign(diff) * Math.min(Math.abs(diff), this.cfg.turnDegPerSec * dt);
    k.angle = (k.angle + step + 360) % 360;
    if (Math.abs(angleDiff(0, k.angle)) <= this.cfg.offSnapDeg) {
      k.angle = 0;
      k.off = true;
      this.held = null;
      this.play("click");
    }
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#15171a");
    // Iron stove top.
    g.fillStyle = "#26282c";
    g.fillRect(60, 50, BOARD_W - 120, 150);
    g.fillStyle = "#1d1f22";
    g.fillRect(60, 210, BOARD_W - 120, 150);

    this.knobs.forEach((k, i) => {
      // Burner: blue gas flames while the knob is on, bigger the more it is turned.
      g.strokeStyle = "#3a3c40";
      g.lineWidth = 6;
      g.beginPath();
      g.arc(k.x, BURNER_Y, 44, 0, Math.PI * 2);
      g.stroke();
      if (!k.off) {
        const strength = Math.min(1, Math.abs(angleDiff(k.angle, 0)) / 180);
        for (let f = 0; f < 14; f++) {
          const a = (f / 14) * Math.PI * 2;
          const h = (8 + 10 * strength) * (1 + 0.25 * Math.sin(time * 20 + f * 1.7 + i));
          const x = k.x + Math.cos(a) * 34;
          const y = BURNER_Y + Math.sin(a) * 34;
          g.fillStyle = `rgba(90, 150, 255, ${0.5 + 0.4 * strength})`;
          g.beginPath();
          g.ellipse(x, y - h / 2, 3, h / 2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }

      // Knob with an off mark above it.
      g.fillStyle = "#e6e2d8";
      g.beginPath();
      g.moveTo(k.x, KNOB_Y - KNOB_R - 16);
      g.lineTo(k.x - 6, KNOB_Y - KNOB_R - 26);
      g.lineTo(k.x + 6, KNOB_Y - KNOB_R - 26);
      g.fill();
      g.font = "12px Georgia, serif";
      g.textAlign = "center";
      g.fillText("OFF", k.x, KNOB_Y - KNOB_R - 30);

      g.fillStyle = this.held === i ? "#4a4c52" : "#3a3c40";
      g.beginPath();
      g.arc(k.x, KNOB_Y, KNOB_R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#5a5c62";
      g.lineWidth = 3;
      g.stroke();
      // Pointer line on the knob.
      const a = (k.angle * Math.PI) / 180;
      g.strokeStyle = k.off ? "#8d887c" : "#c9a24b";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(k.x, KNOB_Y);
      g.lineTo(k.x + Math.sin(a) * (KNOB_R - 8), KNOB_Y - Math.cos(a) * (KNOB_R - 8));
      g.stroke();
    });
  }
}
