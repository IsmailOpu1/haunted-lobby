import { config } from "@haunted/shared";
import { BOARD_H, BOARD_W, dist, drawFlame, type PlaySound, type Point } from "./types.ts";

// The match used by fire tasks (candelabra, cursed letter): click the matchbox to strike it,
// then it follows the mouse. Move it too fast and it goes out.

const SPEED_SMOOTHING_PER_SEC = 12;

export class Match {
  state: "none" | "striking" | "lit" = "none";
  /** The match head, where the flame is. */
  tip: Point = { x: BOARD_W / 2, y: BOARD_H / 2 };
  private cfg = config.tasks.minigames.match;
  private strikeLeft = 0;
  private moved = 0;
  private speed = 0;

  constructor(private play: PlaySound, private box = { x: 40, y: 320, w: 100, h: 52 }) {}

  get lit(): boolean {
    return this.state === "lit";
  }

  pointerDown(p: Point) {
    this.tip = p;
    const b = this.box;
    if (this.state === "none" && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      this.state = "striking";
      this.strikeLeft = this.cfg.strikeSec;
      this.play("strike");
    }
  }

  pointerMove(p: Point) {
    this.moved += dist(p, this.tip);
    this.tip = p;
  }

  update(dt: number) {
    if (dt > 0) this.speed += (this.moved / dt - this.speed) * Math.min(1, SPEED_SMOOTHING_PER_SEC * dt);
    this.moved = 0;
    if (this.state === "striking") {
      this.strikeLeft -= dt;
      if (this.strikeLeft <= 0) this.state = "lit";
    } else if (this.state === "lit" && this.speed > this.cfg.outSpeed) {
      this.state = "none";
      this.play("fizz");
    }
  }

  /** Puts the match out (for example when its job is done). */
  dropOut() {
    this.state = "none";
  }

  drawBox(g: CanvasRenderingContext2D) {
    const b = this.box;
    g.fillStyle = "#6b2a1e";
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = "#3a2a20";
    g.fillRect(b.x, b.y + b.h - 10, b.w, 10);
    g.fillStyle = "#e6e2d8";
    g.font = "13px Georgia, serif";
    g.textAlign = "center";
    g.fillText("MATCHES", b.x + b.w / 2, b.y + 26);
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    if (this.state === "none") return;
    const p = this.tip;
    g.strokeStyle = "#d8b98a";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(p.x, p.y + 4);
    g.lineTo(p.x + 14, p.y + 60);
    g.stroke();
    g.fillStyle = "#7a1d14";
    g.beginPath();
    g.arc(p.x, p.y + 3, 4, 0, Math.PI * 2);
    g.fill();
    if (this.state === "lit") drawFlame(g, p.x, p.y, 6, time, 9);
    else {
      g.fillStyle = "rgba(255, 220, 140, 0.8)";
      for (let i = 0; i < 4; i++) g.fillRect(p.x + Math.sin(time * 40 + i) * 8, p.y + Math.cos(time * 33 + i) * 8, 2, 2);
    }
  }
}
