import { config } from "@haunted/shared";
import type { TaskSoundKind } from "../minigames/types.ts";

// The rules of the hands-on tasks (GDD 26.5), kept apart from the 3D scene so they can be
// tested. Each one is updated every frame with what your hands are doing; mouse movement is
// in screen pixels.

export type Play = (kind: TaskSoundKind) => void;
export type Random = () => number;

/** How long, after a flick starts, its pixels still count toward a strike. */
const FLICK_WINDOW_SEC = 0.12;
/** A weak flick sparks at most this often. */
const SPARK_EVERY_SEC = 0.3;
/** How long a moment the digging pace is judged over. */
const PACE_SEC = 0.2;
/** Scooping makes a sound every this many pixels of soil moved. */
const SCOOP_SOUND_PX = 160;

/**
 * Light the candelabra: strike a match with a sharp downward flick while holding the button,
 * then hold its flame on each wick until it catches. Turning your view too fast blows the
 * match out, and each match only burns so long.
 */
export class CandelabraLogic {
  private cfg = config.tasks.hands.candelabra;
  readonly lit: boolean[];
  readonly heat: number[];
  /** Seconds the match in your hand still burns, or 0 when it is out. */
  burnLeft = 0;
  /** Seconds until you can strike a new match. */
  private reach = 0;
  private flicks: { age: number; px: number }[] = [];
  private sparkWait = 0;

  constructor(private play: Play) {
    this.lit = Array.from({ length: this.cfg.wicks }, () => false);
    this.heat = this.lit.map(() => 0);
  }

  get matchLit(): boolean {
    return this.burnLeft > 0;
  }

  get done(): boolean {
    return this.lit.every(Boolean);
  }

  /** wick: the wick under the flame (the crosshair), or null. dragY: pixels moved down while holding. */
  update(dt: number, input: { wick: number | null; holding: boolean; dragY: number; lookSpeed: number }) {
    const c = this.cfg;
    this.reach = Math.max(0, this.reach - dt);
    this.sparkWait = Math.max(0, this.sparkWait - dt);
    if (!this.matchLit) this.strike(dt, input.holding ? input.dragY : 0);
    else {
      this.burnLeft -= dt;
      if (this.burnLeft <= 0 || input.lookSpeed > c.outRadPerSec) this.out();
    }
    for (let i = 0; i < this.lit.length; i++) {
      if (this.lit[i]) continue;
      if (this.matchLit && input.wick === i) {
        this.heat[i]! += dt;
        if (this.heat[i]! >= c.lightSec) {
          this.lit[i] = true;
          this.play("tick");
        }
      } else {
        this.heat[i] = Math.max(0, this.heat[i]! - c.coolPerSec * dt);
      }
    }
  }

  private strike(dt: number, dragY: number) {
    const c = this.cfg;
    for (const f of this.flicks) f.age += dt;
    this.flicks = this.flicks.filter((f) => f.age < FLICK_WINDOW_SEC);
    // Frames with no mouse event between them are common: let the flick age out instead.
    // Moving back up starts over.
    if (dragY < 0) this.flicks = [];
    if (dragY <= 0) return;
    this.flicks.push({ age: 0, px: dragY });
    if (this.reach > 0) return;
    const speed = this.flicks.reduce((sum, f) => sum + f.px, 0) / FLICK_WINDOW_SEC;
    if (speed >= c.strikePxPerSec) {
      this.burnLeft = c.burnSec;
      this.flicks = [];
      this.play("strike");
    } else if (speed >= c.sparkPxPerSec && this.sparkWait === 0) {
      this.sparkWait = SPARK_EVERY_SEC;
      this.play("spark");
    }
  }

  private out() {
    this.burnLeft = 0;
    this.reach = this.cfg.newMatchSec;
    this.play("fizz");
  }
}

/**
 * Close the shutters: drag each one shut (dragging right closes it) and hold it until the
 * latch clicks. The wind pulls them open, and gusts, heard coming as a rising whistle, pull
 * harder, even on the one you hold. Let one go while it is nearly shut and it slams open.
 */
export class ShuttersLogic {
  private cfg = config.tasks.hands.shutters;
  /** 1 wide open, 0 shut. */
  readonly open: number[];
  readonly latched: boolean[];
  private held: number[];
  private wind: "calm" | "warning" | "gust" = "calm";
  private windLeft: number;
  private lastHeld: number | null = null;

  constructor(private play: Play, private noise: () => void, private random: Random = Math.random) {
    this.open = Array.from({ length: this.cfg.count }, () => 1);
    this.latched = this.open.map(() => false);
    this.held = this.open.map(() => 0);
    this.windLeft = this.calmSec();
  }

  get done(): boolean {
    return this.latched.every(Boolean);
  }

  get gusting(): boolean {
    return this.wind === "gust";
  }

  private calmSec(): number {
    const [min, max] = this.cfg.gustEverySec;
    return min + (max - min) * this.random();
  }

  /** held: the shutter in your hand, or null. dragX: pixels moved right while holding it. */
  update(dt: number, input: { held: number | null; dragX: number }) {
    const c = this.cfg;
    this.windLeft -= dt;
    if (this.windLeft <= 0) {
      if (this.wind === "calm") {
        this.wind = "warning";
        this.windLeft = c.warnSec;
        this.play("whistle");
      } else if (this.wind === "warning") {
        this.wind = "gust";
        this.windLeft = c.gustSec;
      } else {
        this.wind = "calm";
        this.windLeft = this.calmSec();
      }
    }

    const gust = this.wind === "gust" ? c.gustPerSec : 0;
    for (let i = 0; i < this.open.length; i++) {
      if (this.latched[i]) continue;
      const holding = input.held === i;
      // In your hand only a gust pulls on it, and less than on a loose one.
      const pull = holding ? gust * c.heldGustFactor : c.windPerSec + gust;
      const pushed = holding ? input.dragX / c.pxToClose : 0;
      this.open[i] = Math.min(1, Math.max(0, this.open[i]! + pull * dt - pushed));
      if (holding && this.open[i]! <= c.latchAt) {
        this.held[i]! += dt;
        if (this.held[i]! >= c.latchSec) {
          this.latched[i] = true;
          this.open[i] = 0;
          this.play("click");
        }
      } else {
        this.held[i] = 0;
      }
    }

    // Letting go of a nearly shut shutter: the wind throws it open with a bang.
    const letGo = this.lastHeld;
    if (letGo !== null && input.held !== letGo && !this.latched[letGo] && this.open[letGo]! < c.slamBelow) {
      this.open[letGo] = 1;
      this.play("bang");
      this.noise();
    }
    this.lastHeld = input.held;
  }

  /** How long the shutter has been held shut, 0 to 1, for the latch's sound and look. */
  latchProgress(i: number): number {
    return Math.min(1, this.held[i]! / this.cfg.latchSec);
  }
}

/**
 * Turn off the stove: turn each knob to its narrow "off" notch at 0 degrees. Turned slowly it
 * clicks into the notch and its flame dies; turned fast it slips past and the gas hisses on
 * the other side. A knob in the notch needs a firm push to leave it.
 */
export class StoveLogic {
  private cfg = config.tasks.hands.stove;
  /** Degrees; the notch is at 0. */
  readonly angle: number[];
  /** 1 full flame, 0 out. */
  readonly flame: number[];
  readonly inNotch: boolean[];
  private push: number[];

  constructor(private play: Play, random: Random = Math.random) {
    const c = this.cfg;
    this.angle = Array.from({ length: c.knobs }, () => c.startMinDeg + (c.startMaxDeg - c.startMinDeg) * random());
    this.flame = this.angle.map(() => 1);
    this.inNotch = this.angle.map(() => false);
    this.push = this.angle.map(() => 0);
  }

  get done(): boolean {
    return this.flame.every((f) => f === 0);
  }

  /** held: the knob in your hand, or null. dragX: pixels moved right (clockwise) while holding it. */
  update(dt: number, input: { held: number | null; dragX: number }) {
    const c = this.cfg;
    const i = input.held;
    if (i !== null && input.dragX !== 0 && dt > 0) {
      const turn = input.dragX * c.degPerPx;
      if (this.inNotch[i]) {
        this.push[i]! += turn;
        if (Math.abs(this.push[i]!) > c.detentDeg) {
          // Pushed out of the notch: the gas comes back on.
          this.inNotch[i] = false;
          this.angle[i] = Math.sign(this.push[i]!) * (c.notchDeg / 2 + 1);
          this.flame[i] = 1;
          this.play("hiss");
        }
      } else {
        const from = this.angle[i]!;
        const to = from + turn;
        const reaches = Math.abs(to) <= c.notchDeg / 2 || Math.sign(to) !== Math.sign(from);
        if (reaches && Math.abs(turn) / dt <= c.catchDegPerSec) {
          this.inNotch[i] = true;
          this.angle[i] = 0;
          this.push[i] = 0;
          this.play("click");
        } else {
          this.angle[i] = to;
          if (Math.sign(to) !== Math.sign(from)) this.play("hiss");
        }
      }
    }
    for (let k = 0; k < this.flame.length; k++) {
      this.flame[k] = this.inNotch[k] ? Math.max(0, this.flame[k]! - dt / c.settleSec) : 1;
    }
  }
}

/**
 * Dig in soil with a trowel: scoop by moving the mouse down while holding the button. A short
 * dig tells you whether the relic is there; if the server says it is, keep digging to take it.
 * Frantic scooping counts for less and throws soil about, which the ghost can hear.
 */
export class DigLogic {
  private cfg = config.relics.hands.dig;
  dug = 0;
  /** The server said this place holds the relic. */
  found = false;
  private scoopSound = 0;
  /** Steady scooping not yet used: mouse events bunch up between frames, so the pace is judged over a moment. */
  private allowance = this.cfg.maxPxPerSec * PACE_SEC;

  constructor(private play: Play, private noise: () => void) {}

  /** Pixels of scooping until this stage is done: the search, then the taking. */
  get needed(): number {
    return this.found ? this.cfg.searchPx + this.cfg.takePx : this.cfg.searchPx;
  }

  get done(): boolean {
    return this.dug >= this.needed;
  }

  /** How much of the soil is dug out, 0 to 1. */
  get depth(): number {
    return Math.min(1, this.dug / (this.cfg.searchPx + this.cfg.takePx));
  }

  /** The server says the relic is here: carry on digging. */
  setFound() {
    this.found = true;
  }

  update(dt: number, input: { onSoil: boolean; holding: boolean; dragY: number }) {
    const c = this.cfg;
    if (dt > 0) this.allowance = Math.min(c.maxPxPerSec * PACE_SEC, this.allowance + c.maxPxPerSec * dt);
    if (!input.onSoil || !input.holding || input.dragY <= 0 || dt <= 0 || this.done) return;
    let moved = input.dragY;
    if (moved > this.allowance) {
      moved = this.allowance + (moved - this.allowance) * c.fastFactor;
      this.noise();
    }
    this.allowance = Math.max(0, this.allowance - input.dragY);
    this.dug = Math.min(this.needed, this.dug + moved);
    this.scoopSound += moved;
    if (this.scoopSound >= SCOOP_SOUND_PX) {
      this.scoopSound = 0;
      this.play("scrape");
    }
  }
}
