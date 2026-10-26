import { config } from "@haunted/shared";
import { BOARD_W, drawBackdrop, drawSymbol, shuffle, SYMBOLS, type Minigame, type PlaySound, type Point, type SymbolKind } from "./types.ts";

// Tune the piano (GDD 9): press the keys marked with the symbols shown, in order. A wrong
// note rings out through the hotel (the ghost can hear it) and the line starts again.

const KEYS_TOP = 200;
const KEYS_H = 170;
const KEYS_LEFT = 80;
const SHEET_Y = 110;

export class Piano implements Minigame {
  readonly hint = "Click the piano keys marked with the symbols on the sheet, from left to right.";
  private cfg = config.tasks.minigames.piano;
  private keys: SymbolKind[];
  private sequence: number[] = [];
  private step = 0;
  private round = 0;
  private flash: { key: number; good: boolean; left: number } | null = null;

  constructor(private play: PlaySound) {
    this.keys = shuffle(SYMBOLS).slice(0, this.cfg.keys);
    this.newRound();
  }

  get done(): boolean {
    return this.round >= this.cfg.rounds;
  }

  private newRound() {
    this.step = 0;
    this.sequence = [];
    for (let i = 0; i < this.cfg.notesPerRound; i++) {
      // No key twice in a row, so every press is a new search.
      let k: number;
      do k = Math.floor(Math.random() * this.keys.length);
      while (k === this.sequence.at(-1));
      this.sequence.push(k);
    }
  }

  private keyWidth(): number {
    return (BOARD_W - KEYS_LEFT * 2) / this.keys.length;
  }

  pointerDown(p: Point) {
    if (this.done || p.y < KEYS_TOP || p.y > KEYS_TOP + KEYS_H) return;
    const key = Math.floor((p.x - KEYS_LEFT) / this.keyWidth());
    if (key < 0 || key >= this.keys.length) return;
    if (key === this.sequence[this.step]) {
      this.play("note", key);
      this.flash = { key, good: true, left: 0.2 };
      this.step += 1;
      if (this.step >= this.sequence.length) {
        this.round += 1;
        if (!this.done) this.newRound();
      }
    } else {
      this.play("badNote");
      this.flash = { key, good: false, left: 0.4 };
      this.step = 0;
    }
  }

  update(dt: number) {
    if (this.flash && (this.flash.left -= dt) <= 0) this.flash = null;
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g, "#120d0a");
    // Piano body.
    g.fillStyle = "#1e1410";
    g.fillRect(50, 40, BOARD_W - 100, 340);

    // Music sheet with the line of symbols to play.
    g.fillStyle = "#d9ccaa";
    g.fillRect(150, 60, BOARD_W - 300, 100);
    const gap = (BOARD_W - 340) / Math.max(1, this.sequence.length - 1);
    this.sequence.forEach((key, i) => {
      g.fillStyle = i < this.step ? "rgba(60, 40, 30, 0.3)" : i === this.step ? "#8a1a14" : "#2a2018";
      g.strokeStyle = g.fillStyle;
      drawSymbol(g, this.keys[key]!, 170 + i * gap, SHEET_Y, 16);
    });
    g.fillStyle = "#5a4a3a";
    g.font = "12px Georgia, serif";
    g.textAlign = "center";
    g.fillText(`Line ${Math.min(this.round + 1, this.cfg.rounds)} of ${this.cfg.rounds}`, BOARD_W / 2, 152);

    // Keys, each with its symbol painted on.
    const w = this.keyWidth();
    this.keys.forEach((symbol, i) => {
      const x = KEYS_LEFT + i * w;
      const lit = this.flash?.key === i;
      g.fillStyle = lit ? (this.flash!.good ? "#f4ead0" : "#e0705a") : "#e6decb";
      g.fillRect(x + 2, KEYS_TOP, w - 4, KEYS_H);
      g.fillStyle = "#2a2018";
      g.strokeStyle = "#2a2018";
      drawSymbol(g, symbol, x + w / 2, KEYS_TOP + KEYS_H - 34, 13);
    });
  }
}
