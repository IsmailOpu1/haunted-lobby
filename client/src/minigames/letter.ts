import { config } from "@haunted/shared";
import { Match } from "./match.ts";
import { BOARD_W, drawBackdrop, drawFlame, type Minigame, type PlaySound, type Point } from "./types.ts";

// Burn the cursed letter (GDD 9): hold a lit match under the letter until it catches.
// The letter sways in the chimney draught, so the flame has to follow it.

const LETTER_W = 90;
const LETTER_H = 120;
const LETTER_TOP = 70;
const HEAT_BELOW = 50;

export class Letter implements Minigame {
  readonly hint = "Strike a match and hold the flame just under the letter. Follow it as it sways.";
  private cfg = config.tasks.minigames.letter;
  private match: Match;
  private heat = 0;
  private burning = 0;
  private time = 0;

  constructor(private play: PlaySound) {
    this.match = new Match(play);
  }

  get done(): boolean {
    return this.burning >= this.cfg.burnSec;
  }

  pointerDown(p: Point) {
    this.match.pointerDown(p);
  }

  pointerMove(p: Point) {
    this.match.pointerMove(p);
  }

  private letterX(): number {
    return BOARD_W / 2 + Math.sin((this.time / this.cfg.swayPeriodSec) * Math.PI * 2) * this.cfg.swayUnits;
  }

  /** The flame is under the letter's bottom edge, close enough to heat it. */
  private underLetter(): boolean {
    const t = this.match.tip;
    const bottom = LETTER_TOP + LETTER_H;
    return Math.abs(t.x - this.letterX()) <= LETTER_W / 2 && t.y >= bottom && t.y <= bottom + HEAT_BELOW;
  }

  update(dt: number) {
    this.time += dt;
    this.match.update(dt);
    if (this.burning > 0 || this.heat >= this.cfg.catchSec) {
      if (this.burning === 0) this.play("strike");
      this.burning += dt;
      return;
    }
    if (this.match.lit && this.underLetter()) this.heat += dt;
    else this.heat = Math.max(0, this.heat - this.cfg.coolPerSec * dt);
  }

  draw(g: CanvasRenderingContext2D, time: number) {
    drawBackdrop(g, "#150f0b");
    // Stone fireplace with a dark opening.
    g.fillStyle = "#4a4440";
    g.fillRect(110, 20, BOARD_W - 220, 340);
    g.fillStyle = "#0b0807";
    g.fillRect(160, 60, BOARD_W - 320, 300);
    g.fillStyle = "#2a2522";
    g.fillRect(90, 20, BOARD_W - 180, 22);
    // Grate.
    g.strokeStyle = "#333";
    g.lineWidth = 4;
    for (let x = 200; x <= BOARD_W - 200; x += 30) {
      g.beginPath();
      g.moveTo(x, 330);
      g.lineTo(x, 355);
      g.stroke();
    }

    // The letter hangs on a string from the chimney.
    const x = this.letterX();
    const burnt = Math.min(1, this.burning / this.cfg.burnSec);
    g.strokeStyle = "#8d887c";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(BOARD_W / 2, 42);
    g.lineTo(x, LETTER_TOP);
    g.stroke();
    const left = x - LETTER_W / 2;
    const visibleH = LETTER_H * (1 - burnt);
    g.fillStyle = "#d9ccaa";
    g.fillRect(left, LETTER_TOP, LETTER_W, visibleH);
    if (burnt < 1) {
      // Handwriting and a red wax seal.
      g.strokeStyle = "rgba(60, 30, 20, 0.7)";
      for (let y = LETTER_TOP + 16; y < LETTER_TOP + visibleH - 10; y += 12) {
        g.beginPath();
        g.moveTo(left + 10, y);
        g.lineTo(left + LETTER_W - 12 - ((y * 7) % 20), y);
        g.stroke();
      }
      if (visibleH > LETTER_H * 0.6) {
        g.fillStyle = "#8a1a14";
        g.beginPath();
        g.arc(x, LETTER_TOP + LETTER_H * 0.55, 9, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Heat: the bottom edge darkens and glows as it gets close to catching.
    const bottom = LETTER_TOP + visibleH;
    if (this.burning > 0 && burnt < 1) {
      for (let i = 0; i < 5; i++) drawFlame(g, left + 10 + i * ((LETTER_W - 20) / 4), bottom + 4, 9, time, i);
    } else if (this.heat > 0) {
      const f = this.heat / this.cfg.catchSec;
      g.fillStyle = `rgba(60, 30, 10, ${f * 0.8})`;
      g.fillRect(left, bottom - 14, LETTER_W, 14);
      g.fillStyle = `rgba(255, 140, 40, ${f})`;
      g.fillRect(left, bottom - 3, LETTER_W, 3);
    }

    this.match.drawBox(g);
    this.match.draw(g, time);
  }
}
