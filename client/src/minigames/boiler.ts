import { config } from "@haunted/shared";
import { BOARD_W, dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Turn the boiler valve (GDD 9): hold the valve wheel and circle the mouse clockwise to open it,
// back to close it, until the needle stays in the green for 3 s. The old wheel only turns so
// fast, and draughts in the pipes keep nudging the needle.

const GAUGE = { x: 200, y: 170, r: 110 };
const WHEEL = { x: 470, y: 230, r: 90 };
// The gauge needle sweeps 240 degrees, from bottom left (0) to bottom right (1).
const SWEEP_START = (-120 * Math.PI) / 180;
const SWEEP = (240 * Math.PI) / 180;

function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
}

function angleDiff(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export class Boiler implements Minigame {
  readonly hint = "Hold the valve wheel and turn it (circle the mouse) until the needle stays in the green.";
  private cfg = config.tasks.minigames.boiler;
  private pressure: number;
  private openDeg = 0;
  private held = false;
  private grabAngle = 0;
  private pointer: Point = { x: 0, y: 0 };
  private inZone = 0;
  private time = 0;

  constructor(private play: PlaySound) {
    this.pressure = this.cfg.startPressure;
  }

  get done(): boolean {
    return this.inZone >= this.cfg.holdSec;
  }

  pointerDown(p: Point) {
    this.pointer = p;
    if (dist(p, WHEEL) > WHEEL.r + 10) return;
    this.held = true;
    this.grabAngle = angleDeg(WHEEL, p);
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    this.held = false;
  }

  update(dt: number) {
    this.time += dt;
    const c = this.cfg;
    if (this.held && dist(this.pointer, WHEEL) > 10) {
      const now = angleDeg(WHEEL, this.pointer);
      const wanted = angleDiff(now, this.grabAngle);
      // Turning faster than the wheel allows just slips.
      const step = Math.sign(wanted) * Math.min(Math.abs(wanted), c.turnDegPerSec * dt);
      this.openDeg = Math.max(0, Math.min(c.maxOpenDeg, this.openDeg + step));
      this.grabAngle = now;
    }
    const open = this.openDeg / c.maxOpenDeg;
    const wobble = c.wobble * (Math.sin(this.time * 0.9) + 0.5 * Math.sin(this.time * 2.3)) / 1.5;
    const target = Math.max(0, Math.min(1, c.startPressure - c.dropFullOpen * open + wobble));
    this.pressure += (target - this.pressure) * Math.min(1, c.followPerSec * dt);

    const safe = this.pressure >= c.safeMin && this.pressure <= c.safeMax;
    if (safe) {
      const before = this.inZone;
      this.inZone += dt;
      if (Math.floor(before) !== Math.floor(this.inZone)) this.play("tick");
    } else {
      this.inZone = 0;
    }
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g, "#16130f");
    const c = this.cfg;
    // Boiler pipe joining the gauge and the valve.
    g.fillStyle = "#4a3a2a";
    g.fillRect(GAUGE.x, GAUGE.y + 90, WHEEL.x - GAUGE.x, 34);

    // Gauge face with the safe zone in green and danger in red.
    g.fillStyle = "#e9dfc6";
    g.beginPath();
    g.arc(GAUGE.x, GAUGE.y, GAUGE.r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#a07a34";
    g.lineWidth = 8;
    g.stroke();
    const arc = (from: number, to: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 14;
      g.beginPath();
      g.arc(GAUGE.x, GAUGE.y, GAUGE.r - 22, SWEEP_START + from * SWEEP - Math.PI / 2, SWEEP_START + to * SWEEP - Math.PI / 2);
      g.stroke();
    };
    arc(c.safeMin, c.safeMax, "#6fae6a");
    arc(0.8, 1, "#c0503a");
    const a = SWEEP_START + this.pressure * SWEEP;
    g.strokeStyle = "#1a1a1a";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(GAUGE.x, GAUGE.y);
    g.lineTo(GAUGE.x + Math.sin(a) * (GAUGE.r - 18), GAUGE.y - Math.cos(a) * (GAUGE.r - 18));
    g.stroke();
    g.fillStyle = "#1a1a1a";
    g.beginPath();
    g.arc(GAUGE.x, GAUGE.y, 7, 0, Math.PI * 2);
    g.fill();
    g.font = "12px Georgia, serif";
    g.textAlign = "center";
    g.fillText("PRESSURE", GAUGE.x, GAUGE.y + 50);

    // Time held in the safe zone.
    g.fillStyle = "rgba(255, 255, 255, 0.12)";
    g.fillRect(GAUGE.x - 80, 350, 160, 8);
    g.fillStyle = "#6fae6a";
    g.fillRect(GAUGE.x - 80, 350, 160 * Math.min(1, this.inZone / c.holdSec), 8);

    // Valve wheel: it turns as the valve opens.
    g.save();
    g.translate(WHEEL.x, WHEEL.y);
    g.rotate((this.openDeg * Math.PI) / 180);
    g.strokeStyle = this.held ? "#d04a36" : "#a8392a";
    g.lineWidth = 12;
    g.beginPath();
    g.arc(0, 0, WHEEL.r - 6, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 8;
    for (let i = 0; i < 4; i++) {
      const s = (i / 4) * Math.PI * 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(s) * (WHEEL.r - 6), Math.sin(s) * (WHEEL.r - 6));
      g.stroke();
    }
    g.restore();
    g.fillStyle = "#e6e2d8";
    g.fillText("open ↻   close ↺", WHEEL.x, WHEEL.y + WHEEL.r + 28);
  }
}
