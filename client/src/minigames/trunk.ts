import { config } from "@haunted/shared";
import { angleDeg, angleDiff, dist, drawBackdrop, type Minigame, type PlaySound, type Point } from "./types.ts";

// Lock the trunk (GDD 9): hold the lid down until it clicks shut, then turn each latch a quarter
// turn by circling the mouse. Leave the latches untouched too long and the lid bursts open again.

const LID = { x: 140, y: 110, w: 360, h: 90 };
const LATCH_R = 30;
const LATCH_Y = 270;
const QUARTER = 90;

interface Latch {
  x: number;
  turned: number;
}

export class Trunk implements Minigame {
  readonly hint = "Hold the lid down until it clicks, then turn each latch (circle the mouse) before it bursts open.";
  private cfg = config.tasks.minigames.trunk;
  private pressed = 0;
  private shut = false;
  private latches: Latch[] = [];
  private holding: "lid" | Latch | null = null;
  private grabAngle = 0;
  private pointer: Point = { x: 0, y: 0 };
  private idle = 0;

  constructor(private play: PlaySound) {
    const n: number = this.cfg.latches;
    for (let i = 0; i < n; i++) this.latches.push({ x: 320 + (i - (n - 1) / 2) * 110, turned: 0 });
  }

  get done(): boolean {
    return this.shut && this.latches.every((l) => l.turned >= QUARTER);
  }

  pointerDown(p: Point) {
    this.pointer = p;
    if (!this.shut) {
      const onLid = p.x >= LID.x && p.x <= LID.x + LID.w && p.y >= LID.y - 30 && p.y <= LID.y + LID.h;
      if (onLid) this.holding = "lid";
      return;
    }
    const latch = this.latches.find((l) => l.turned < QUARTER && dist(p, { x: l.x, y: LATCH_Y }) <= LATCH_R + 12);
    if (!latch) return;
    this.holding = latch;
    this.grabAngle = angleDeg({ x: latch.x, y: LATCH_Y }, p);
  }

  pointerMove(p: Point) {
    this.pointer = p;
  }

  pointerUp() {
    if (this.holding === "lid") this.pressed = 0;
    this.holding = null;
  }

  update(dt: number) {
    if (!this.shut) {
      if (this.holding !== "lid") return;
      this.pressed += dt;
      if (this.pressed >= this.cfg.pressSec) {
        this.shut = true;
        this.holding = null;
        this.idle = 0;
        this.play("click");
      }
      return;
    }

    let turning = false;
    const latch = this.holding;
    if (latch && latch !== "lid") {
      const centre = { x: latch.x, y: LATCH_Y };
      if (dist(this.pointer, centre) > 6) {
        const now = angleDeg(centre, this.pointer);
        const wanted = angleDiff(now, this.grabAngle);
        // Stiff old latches: only clockwise counts, and only so fast.
        const step = Math.max(0, Math.min(wanted, this.cfg.turnDegPerSec * dt));
        if (step > 0) turning = true;
        latch.turned = Math.min(QUARTER, latch.turned + step);
        this.grabAngle = now;
        if (latch.turned >= QUARTER) {
          this.holding = null;
          this.play("click");
        }
      }
    }
    if (this.done) return;
    this.idle = turning ? 0 : this.idle + dt;
    if (this.idle >= this.cfg.popSec) {
      // Bang: the lid flies open and the latches spring back.
      this.shut = false;
      this.pressed = 0;
      this.holding = null;
      this.idle = 0;
      for (const l of this.latches) l.turned = 0;
      this.play("thud");
    }
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#15110d");
    // Trunk body.
    g.fillStyle = "#4b3420";
    g.fillRect(LID.x, LID.y + LID.h, LID.w, 170);
    g.strokeStyle = "#7d5a32";
    g.lineWidth = 6;
    g.strokeRect(LID.x, LID.y + LID.h, LID.w, 170);

    // The lid sits ajar, rattling, until it is held shut.
    const rattle = this.shut ? 0 : 3 * Math.sin(time * 23);
    const lift = this.shut ? 0 : 26 * (1 - this.pressed / this.cfg.pressSec);
    g.save();
    g.translate(LID.x, LID.y + LID.h);
    g.rotate((-(lift + rattle) * Math.PI) / 180 / 3);
    g.fillStyle = this.holding === "lid" ? "#5e4228" : "#553a22";
    g.fillRect(0, -LID.h, LID.w, LID.h);
    g.strokeStyle = "#7d5a32";
    g.strokeRect(0, -LID.h, LID.w, LID.h);
    g.restore();

    for (const l of this.latches) {
      g.save();
      g.translate(l.x, LATCH_Y);
      g.fillStyle = "#a07a34";
      g.beginPath();
      g.arc(0, 0, LATCH_R, 0, Math.PI * 2);
      g.fill();
      g.rotate((l.turned * Math.PI) / 180);
      g.fillStyle = l.turned >= QUARTER ? "#6fae6a" : "#2a2018";
      g.fillRect(-5, -LATCH_R + 4, 10, LATCH_R * 2 - 8);
      g.restore();
    }

    g.fillStyle = "#e6e2d8";
    g.font = "14px Georgia, serif";
    g.textAlign = "center";
    if (!this.shut) {
      g.fillStyle = "rgba(255, 255, 255, 0.12)";
      g.fillRect(220, 60, 200, 8);
      g.fillStyle = "#6fae6a";
      g.fillRect(220, 60, (200 * this.pressed) / this.cfg.pressSec, 8);
    } else if (this.idle > this.cfg.popSec * 0.5) {
      g.fillText("The lid is straining...", 320, 380);
    }
  }
}
