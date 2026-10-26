import { config } from "@haunted/shared";
import { BOARD_W, drawBackdrop, type Minigame, type PlaySound } from "./types.ts";

// Wind the grandfather clock (GDD 9): click (or press Space) on each tick to turn the key.
// Off the beat, the spring slips back one turn.

const FACE_Y = 140;
const FACE_R = 90;
const PENDULUM_TOP = 240;
const PENDULUM_LEN = 120;

export class Clock implements Minigame {
  readonly hint = "Click or press Space on each tick to turn the key. Off the beat, it slips back.";
  private cfg = config.tasks.minigames.clock;
  private time = 0;
  private lastTick = -1;
  private usedTick = -1;
  private turns = 0;
  private pulse = 0;
  private slip = 0;

  constructor(private play: PlaySound) {}

  get done(): boolean {
    return this.turns >= this.cfg.turnsNeeded;
  }

  pointerDown() {
    this.turn();
  }

  key(code: string) {
    if (code === "Space") this.turn();
  }

  private turn() {
    if (this.done) return;
    const tick = Math.round(this.time / this.cfg.tickSec);
    const offBy = Math.abs(this.time - tick * this.cfg.tickSec);
    if (offBy <= this.cfg.onBeatSec && tick !== this.usedTick && tick > 0) {
      this.usedTick = tick;
      this.turns += 1;
      this.pulse = 1;
      this.play("click");
    } else {
      this.turns = Math.max(0, this.turns - 1);
      this.slip = 1;
      this.play("wrong");
    }
  }

  update(dt: number) {
    this.time += dt;
    const tick = Math.floor(this.time / this.cfg.tickSec);
    if (tick !== this.lastTick) {
      this.lastTick = tick;
      if (tick > 0) this.play("tick");
    }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.slip = Math.max(0, this.slip - dt * 3);
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g, "#1a120c");
    const cx = BOARD_W / 2;
    // Clock case.
    g.fillStyle = "#3b2416";
    g.fillRect(cx - 120, 30, 240, 360);
    g.fillStyle = "#24160d";
    g.fillRect(cx - 60, PENDULUM_TOP - 10, 120, 150);

    // Pendulum: one swing per tick, at its far side exactly on the tick.
    const phase = (this.time / this.cfg.tickSec) * Math.PI;
    const swing = Math.cos(phase) * 0.32;
    const bx = cx + Math.sin(swing) * PENDULUM_LEN;
    const by = PENDULUM_TOP + Math.cos(swing) * PENDULUM_LEN;
    g.strokeStyle = "#a07a34";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, PENDULUM_TOP);
    g.lineTo(bx, by);
    g.stroke();
    g.fillStyle = "#c9a24b";
    g.beginPath();
    g.arc(bx, by, 14, 0, Math.PI * 2);
    g.fill();

    // Face with hour marks.
    g.fillStyle = "#e9dfc6";
    g.beginPath();
    g.arc(cx, FACE_Y, FACE_R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2a2018";
    g.lineWidth = 3;
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.sin(a) * (FACE_R - 6), FACE_Y - Math.cos(a) * (FACE_R - 6));
      g.lineTo(cx + Math.sin(a) * (FACE_R - 16), FACE_Y - Math.cos(a) * (FACE_R - 16));
      g.stroke();
    }

    // Winding progress around the face.
    const progress = this.turns / this.cfg.turnsNeeded;
    g.strokeStyle = this.slip > 0 ? `rgba(224, 112, 90, ${0.5 + this.slip / 2})` : "#c9a24b";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(cx, FACE_Y, FACE_R + 10, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    g.stroke();

    // The key in the winding hole turns a quarter for every good turn.
    g.save();
    g.translate(cx + 36, FACE_Y + 26);
    g.rotate((this.turns * Math.PI) / 2);
    g.fillStyle = "#a07a34";
    g.fillRect(-4, -22, 8, 44);
    g.fillRect(-14, -26, 28, 10);
    g.restore();

    // A ring flashes on every tick so the beat can be seen as well as heard.
    const sinceTick = this.time - Math.floor(this.time / this.cfg.tickSec) * this.cfg.tickSec;
    const beat = Math.max(0, 1 - sinceTick / 0.25);
    if (beat > 0) {
      g.strokeStyle = `rgba(230, 226, 216, ${beat * 0.5})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, FACE_Y, FACE_R + 22 + (1 - beat) * 10, 0, Math.PI * 2);
      g.stroke();
    }
    if (this.pulse > 0) {
      g.fillStyle = `rgba(201, 162, 75, ${this.pulse * 0.4})`;
      g.beginPath();
      g.arc(cx + 36, FACE_Y + 26, 30, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = "#e6e2d8";
    g.font = "14px Georgia, serif";
    g.textAlign = "center";
    g.fillText(`${this.turns} / ${this.cfg.turnsNeeded}`, cx, 385);
  }
}
