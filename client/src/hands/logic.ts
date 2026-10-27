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
/** Water spilt on the floor splashes at most this often. */
const SPLASH_EVERY_SEC = 0.5;
/** Scooping makes a sound every this many pixels of soil moved. */
const SCOOP_SOUND_PX = 160;

/**
 * A match in your hand (candelabra, letter): strike it with a sharp downward flick while holding
 * the button. Turning your view too fast blows it out, and each one only burns so long.
 */
export class MatchLogic {
  private cfg = config.tasks.hands.match;
  /** Seconds the match still burns, or 0 when it is out. */
  burnLeft = 0;
  /** Seconds until you can strike a new match. */
  private reach = 0;
  private flicks: { age: number; px: number }[] = [];
  private sparkWait = 0;

  constructor(private play: Play) {}

  get lit(): boolean {
    return this.burnLeft > 0;
  }

  /** dragY: pixels moved down while holding the button. lookSpeed: how fast the view turns, rad/s. */
  update(dt: number, input: { holding: boolean; dragY: number; lookSpeed: number }) {
    this.reach = Math.max(0, this.reach - dt);
    this.sparkWait = Math.max(0, this.sparkWait - dt);
    if (!this.lit) this.strike(dt, input.holding ? input.dragY : 0);
    else {
      this.burnLeft -= dt;
      if (this.burnLeft <= 0 || input.lookSpeed > this.cfg.outRadPerSec) this.goOut();
    }
  }

  /** Puts a lit match out (the job is done). */
  out() {
    if (this.lit) this.goOut();
  }

  private goOut() {
    this.burnLeft = 0;
    this.reach = this.cfg.newMatchSec;
    this.play("fizz");
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
}

/** Light the candelabra: strike a match, then hold its flame on each wick until it catches. */
export class CandelabraLogic {
  private cfg = config.tasks.hands.candelabra;
  readonly match: MatchLogic;
  readonly lit: boolean[];
  readonly heat: number[];

  constructor(private play: Play) {
    this.match = new MatchLogic(play);
    this.lit = Array.from({ length: this.cfg.wicks }, () => false);
    this.heat = this.lit.map(() => 0);
  }

  get matchLit(): boolean {
    return this.match.lit;
  }

  get done(): boolean {
    return this.lit.every(Boolean);
  }

  /** wick: the wick under the flame (the crosshair), or null. dragY: pixels moved down while holding. */
  update(dt: number, input: { wick: number | null; holding: boolean; dragY: number; lookSpeed: number }) {
    const c = this.cfg;
    this.match.update(dt, input);
    for (let i = 0; i < this.lit.length; i++) {
      if (this.lit[i]) continue;
      if (this.match.lit && input.wick === i) {
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
}

/**
 * Burn the cursed letter: it hangs from the mantel and sways in the draught. Keep a lit match
 * under it until it catches (it cools whenever the flame slips away), then it burns and drops.
 */
export class LetterLogic {
  private cfg = config.tasks.hands.letter;
  readonly match: MatchLogic;
  heat = 0;
  /** Seconds it has burned, once it caught. */
  burned = 0;
  private time: number;

  constructor(private play: Play, random: Random = Math.random) {
    this.match = new MatchLogic(play);
    // Each letter starts its sway somewhere different.
    this.time = random() * this.cfg.swayPeriodSec * 3;
  }

  get caught(): boolean {
    return this.heat >= this.cfg.catchSec;
  }

  get done(): boolean {
    return this.burned >= this.cfg.burnSec;
  }

  /** How far the letter has swayed sideways now, in meters: an uneven swing, like a draught. */
  get sway(): number {
    const t = (this.time / this.cfg.swayPeriodSec) * Math.PI * 2;
    return this.cfg.swayM * (0.7 * Math.sin(t) + 0.3 * Math.sin(t * 2.7 + 1));
  }

  /** under: the flame is under the letter. */
  update(dt: number, input: { under: boolean; holding: boolean; dragY: number; lookSpeed: number }) {
    const c = this.cfg;
    this.time += dt;
    if (this.caught) {
      this.burned = Math.min(c.burnSec, this.burned + dt);
      return;
    }
    this.match.update(dt, input);
    if (this.match.lit && input.under) {
      this.heat += dt;
      if (this.caught) {
        this.play("strike");
        this.match.out();
      }
    } else {
      this.heat = Math.max(0, this.heat - c.coolPerSec * dt);
    }
  }
}

/**
 * Wind the grandfather clock: hold the key and turn it a quarter at a time, in time with the
 * ticks. A quarter finished off the beat, or a second one on the same tick, slips back.
 */
export class ClockLogic {
  private cfg = config.tasks.hands.clock;
  /** Quarter turns wound so far. */
  wound = 0;
  /** How far into the current quarter the key is turned, 0 to 1. */
  turn = 0;
  private time = 0;
  /** The tick the last quarter landed on. */
  private lastBeat = -1;

  constructor(private play: Play) {}

  get done(): boolean {
    return this.wound >= this.cfg.quarters;
  }

  /** The key's angle in degrees, for drawing. */
  get keyDeg(): number {
    return (this.wound + this.turn) * 90;
  }

  /** How far into the current tick, 0 to 1 (0 is the tick). */
  get beatPhase(): number {
    return (this.time / this.cfg.tickSec) % 1;
  }

  /** holding: the key is in your hand. dragX: pixels moved right (turning it) while holding it. */
  update(dt: number, input: { holding: boolean; dragX: number }) {
    const c = this.cfg;
    const before = Math.floor(this.time / c.tickSec);
    this.time += dt;
    if (Math.floor(this.time / c.tickSec) > before) this.play("tick");
    if (this.done || !input.holding || input.dragX <= 0) return;
    this.turn += input.dragX / c.pxPerQuarter;
    if (this.turn < 1) return;
    this.turn = 0;
    // Which tick is nearest, and how far off it the quarter landed.
    const beat = Math.round(this.time / c.tickSec);
    const off = Math.abs(this.time - beat * c.tickSec);
    if (off <= c.beatSec && beat !== this.lastBeat) {
      this.lastBeat = beat;
      this.wound += 1;
      this.play("click");
    } else {
      this.wound = Math.max(0, this.wound - c.slipQuarters);
      this.play("wrong");
    }
  }
}

/**
 * Turn the boiler valve: turn the heavy wheel to bring the gauge's needle into the safe band,
 * and keep it there. The needle follows the wheel slowly and draughts push it about.
 */
export class BoilerLogic {
  private cfg = config.tasks.hands.boiler;
  /** How far the valve is open, in degrees. */
  openDeg = 0;
  /** The needle: pressure from 0 to 1. */
  pressure: number;
  /** Seconds the needle has stayed in the safe band. */
  safeFor = 0;
  private time = 0;

  constructor(private play: Play) {
    this.pressure = this.cfg.startPressure;
  }

  get done(): boolean {
    return this.safeFor >= this.cfg.holdSec;
  }

  get safe(): boolean {
    return this.pressure >= this.cfg.safeMin && this.pressure <= this.cfg.safeMax;
  }

  /** holding: the wheel is in your hand. dragX: pixels moved right (opening it) while holding it. */
  update(dt: number, input: { holding: boolean; dragX: number }) {
    const c = this.cfg;
    if (this.done || dt <= 0) return;
    this.time += dt;
    if (input.holding && input.dragX !== 0) {
      const max = c.maxDegPerSec * dt;
      const turn = Math.max(-max, Math.min(max, input.dragX * c.degPerPx));
      const to = Math.max(0, Math.min(c.maxOpenDeg, this.openDeg + turn));
      if ((to === 0 || to === c.maxOpenDeg) && to !== this.openDeg) this.play("thud");
      this.openDeg = to;
    }
    const steady = c.startPressure - c.dropFullOpen * (this.openDeg / c.maxOpenDeg);
    const wobble = c.wobble * (Math.sin(this.time * 1.7) * 0.6 + Math.sin(this.time * 4.3 + 2) * 0.4);
    this.pressure += (steady + wobble - this.pressure) * Math.min(1, c.followPerSec * dt);
    const wasSafe = this.safeFor > 0;
    this.safeFor = this.safe ? this.safeFor + dt : 0;
    if (this.safe && !wasSafe) this.play("tick");
    if (this.done) this.play("click");
  }
}

/**
 * Straighten the portraits: grab a crooked one and drag sideways to level it (they are heavy
 * and turn slowly). Let go when level and it settles. One is haunted and swings crooked once more.
 */
export class PortraitsLogic {
  private cfg = config.tasks.hands.portraits;
  /** Degrees off level, positive leaning clockwise. */
  readonly tilt: number[];
  readonly level: boolean[];
  private settle: number[];
  private haunted: number;
  private hauntUsed = false;

  constructor(private play: Play, private random: Random = Math.random) {
    const c = this.cfg;
    this.tilt = Array.from({ length: c.count }, () => this.side() * (c.minTiltDeg + (c.maxTiltDeg - c.minTiltDeg) * random()));
    this.level = this.tilt.map(() => false);
    this.settle = this.tilt.map(() => 0);
    this.haunted = Math.floor(random() * c.count);
  }

  get done(): boolean {
    return this.level.every(Boolean);
  }

  private side(): number {
    return this.random() < 0.5 ? -1 : 1;
  }

  /** held: the portrait in your hand, or null. dragX: pixels moved right (turning it clockwise). */
  update(dt: number, input: { held: number | null; dragX: number }) {
    const c = this.cfg;
    if (dt <= 0) return;
    for (let i = 0; i < this.tilt.length; i++) {
      if (this.level[i]) continue;
      if (input.held === i) {
        const max = c.maxDegPerSec * dt;
        this.tilt[i]! += Math.max(-max, Math.min(max, input.dragX * c.degPerPx));
        this.settle[i] = 0;
        continue;
      }
      if (Math.abs(this.tilt[i]!) > c.levelDeg) continue;
      this.settle[i]! += dt;
      if (this.settle[i]! < c.holdSec) continue;
      if (i === this.haunted && !this.hauntUsed) {
        // It swings crooked again, once.
        this.hauntUsed = true;
        this.tilt[i] = this.side() * c.hauntedReturnDeg;
        this.settle[i] = 0;
        this.play("thud");
        continue;
      }
      this.tilt[i] = 0;
      this.level[i] = true;
      this.play("click");
    }
  }
}

/**
 * Water the dead roses: tip the watering can into each vase and stop between the line and the
 * rim. The can tips and rights itself gradually, so water keeps coming a moment after you let
 * go. Past the rim the vase overflows and you empty it and start again.
 */
export class RosesLogic {
  private cfg = config.tasks.hands.roses;
  readonly water: number[];
  /** How far the can is tipped, 0 to 1. */
  tilt = 0;
  private splashWait = 0;

  constructor(private play: Play) {
    this.water = Array.from({ length: this.cfg.vases }, () => 0);
  }

  /** Done when every vase holds water between the line and the rim and the can is upright. */
  get done(): boolean {
    return this.tilt === 0 && this.water.every((w) => w >= this.cfg.line && w <= this.cfg.rim);
  }

  /** vase: the vase under the spout, or null. holding: the button tips the can. */
  update(dt: number, input: { vase: number | null; holding: boolean }) {
    const c = this.cfg;
    if (dt <= 0) return;
    this.tilt = Math.max(0, Math.min(1, this.tilt + ((input.holding ? 1 : -1) * dt) / c.tiltSec));
    this.splashWait = Math.max(0, this.splashWait - dt);
    if (this.tilt === 0) return;
    const i = input.vase;
    if (i === null) {
      // Water on the floor.
      if (this.splashWait === 0) {
        this.splashWait = SPLASH_EVERY_SEC;
        this.play("splash");
      }
      return;
    }
    this.water[i]! += (this.tilt * dt) / c.fillSec;
    if (this.water[i]! > c.rim) {
      // It overflows: tip it out and start that vase again.
      this.water[i] = 0;
      this.play("splash");
    }
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
