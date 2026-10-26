import { config } from "@haunted/shared";
import { Match } from "./match.ts";
import { BOARD_W, dist, drawBackdrop, drawFlame, type Minigame, type PlaySound, type Point } from "./types.ts";

// Light the candelabra (GDD 9): strike a match, then hold it to each wick.
// Move the match too fast and it goes out.

const WICK_REACH = 20;

export class Candelabra implements Minigame {
  readonly hint = "Click the matchbox to strike a match, then hold the flame to each wick. Move slowly.";
  private cfg = config.tasks.minigames.candelabra;
  private wicks: { x: number; y: number; lit: number }[] = [];
  private match: Match;

  constructor(private play: PlaySound) {
    this.match = new Match(play);
    const n: number = this.cfg.wicks;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      // Candles rise toward the middle, like a real candelabra.
      this.wicks.push({ x: 170 + t * 300, y: 150 - Math.sin(t * Math.PI) * 50, lit: 0 });
    }
  }

  get done(): boolean {
    return this.wicks.every((w) => w.lit >= this.cfg.lightSec);
  }

  pointerDown(p: Point) {
    this.match.pointerDown(p);
  }

  pointerMove(p: Point) {
    this.match.pointerMove(p);
  }

  update(dt: number) {
    this.match.update(dt);
    if (!this.match.lit) return;
    for (const w of this.wicks) {
      if (w.lit >= this.cfg.lightSec || dist(this.match.tip, w) > WICK_REACH) continue;
      w.lit += dt;
      if (w.lit >= this.cfg.lightSec) this.play("click");
    }
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g);

    // Brass candelabra: base, stem and an arm under the candles.
    g.strokeStyle = "#a07a34";
    g.fillStyle = "#a07a34";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(this.wicks[0]!.x, 270);
    g.quadraticCurveTo(BOARD_W / 2, 330, this.wicks.at(-1)!.x, 270);
    g.stroke();
    g.fillRect(BOARD_W / 2 - 6, 270, 12, 90);
    g.beginPath();
    g.ellipse(BOARD_W / 2, 365, 60, 12, 0, 0, Math.PI * 2);
    g.fill();

    this.wicks.forEach((w, i) => {
      const cupY = 270 - (150 - w.y) * 0.2;
      g.strokeStyle = "#a07a34";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(w.x, cupY + 25);
      g.lineTo(w.x, cupY);
      g.stroke();
      // Wax candle.
      g.fillStyle = "#e9dfc6";
      g.fillRect(w.x - 11, w.y + 6, 22, cupY - w.y - 6);
      g.fillStyle = "#2a2018";
      g.fillRect(w.x - 1.5, w.y - 2, 3, 9);
      if (w.lit >= this.cfg.lightSec) drawFlame(g, w.x, w.y, 7, time, i);
      else if (w.lit > 0) {
        // A glowing ring shows how close the wick is to catching.
        g.strokeStyle = "rgba(255, 190, 90, 0.8)";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(w.x, w.y, 14, -Math.PI / 2, -Math.PI / 2 + (w.lit / this.cfg.lightSec) * Math.PI * 2);
        g.stroke();
      }
    });

    this.match.drawBox(g);
    this.match.draw(g, time);
  }
}
