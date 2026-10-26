import { config } from "@haunted/shared";
import { drawBackdrop, type Minigame, type PlaySound } from "./types.ts";

// Open the lock (GDD 10, a relic spot): hold the mouse to lift the pin, and let go while it is
// in the gold band. A tick tells you it has entered the band. Too low or too high and the pin
// drops back.

const SHAFT_TOP = 110;
const SHAFT_H = 190;
const PIN_GAP = 64;

export class Lockbox implements Minigame {
  readonly hint = "Hold the mouse to lift the pin. Let go in the gold band (listen for the tick).";
  private cfg = config.relics.minigames.lockbox;
  private set = 0;
  private lift = 0;
  private lifting = false;
  private inBand = false;

  constructor(private play: PlaySound) {}

  get done(): boolean {
    return this.set >= this.cfg.pins;
  }

  pointerDown() {
    if (!this.done) this.lifting = true;
  }

  pointerUp() {
    if (!this.lifting) return;
    this.lifting = false;
    if (this.band(this.lift)) {
      this.set++;
      this.play("click");
    } else {
      this.play("wrong");
    }
    this.lift = 0;
    this.inBand = false;
  }

  private band(h: number): boolean {
    return h >= this.cfg.bandMin && h <= this.cfg.bandMax;
  }

  update(dt: number) {
    if (!this.lifting) return;
    this.lift += dt / this.cfg.riseSec;
    const inBand = this.band(this.lift);
    if (inBand && !this.inBand) this.play("tick");
    this.inBand = inBand;
    if (this.lift >= 1) {
      // Pushed too far: it slips back down.
      this.lift = 0;
      this.lifting = false;
      this.inBand = false;
      this.play("wrong");
    }
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g, "#18120c");
    const n: number = this.cfg.pins;
    const x0 = 320 - ((n - 1) * PIN_GAP) / 2;
    // The brass lock body.
    g.fillStyle = "#8a6a2e";
    g.fillRect(x0 - 50, SHAFT_TOP - 30, (n - 1) * PIN_GAP + 100, SHAFT_H + 60);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * PIN_GAP;
      g.fillStyle = "#1a140c";
      g.fillRect(x - 14, SHAFT_TOP, 28, SHAFT_H);
      const current = i === this.set;
      if (current) {
        // A faint gold band where the pin will hold.
        const top = SHAFT_TOP + SHAFT_H * (1 - this.cfg.bandMax);
        g.fillStyle = "rgba(224, 178, 74, 0.25)";
        g.fillRect(x - 14, top, 28, SHAFT_H * (this.cfg.bandMax - this.cfg.bandMin));
      }
      const h = i < this.set ? (this.cfg.bandMin + this.cfg.bandMax) / 2 : current ? this.lift : 0;
      const pinTop = SHAFT_TOP + SHAFT_H * (1 - h) - 40;
      g.fillStyle = i < this.set ? "#6fae6a" : current && this.inBand ? "#e0b24a" : "#b8a27a";
      g.fillRect(x - 10, Math.max(SHAFT_TOP, pinTop), 20, SHAFT_TOP + SHAFT_H - Math.max(SHAFT_TOP, pinTop));
    }
  }
}
