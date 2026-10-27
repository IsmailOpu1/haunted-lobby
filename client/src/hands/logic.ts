import { config } from "@haunted/shared";
import type { TaskSoundKind } from "./sounds.ts";

// The rules of the hands-on tasks (GDD 26.5), kept apart from the 3D scene so they can be
// tested. Each one is updated every frame with what your hands are doing; mouse movement is
// in screen pixels.

/** Plays a task sound. pitch is a note number for the piano (0 is the lowest key). */
export type Play = (kind: TaskSoundKind, pitch?: number) => void;
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
/** A smearing cloth squeaks at most this often. */
const SMEAR_SOUND_SEC = 0.35;
/** How long a moment a push (cradle) or a hand in water (drain) is judged over. */
const PUSH_PACE_SEC = 0.15;
/** The drain's water laps this often far from the relic, and this often right on it. */
const LAP_SLOWEST_SEC = 0.9;
const LAP_FASTEST_SEC = 0.25;

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

/** A point on a flat face of a station (a switchboard, a mirror, a drain), in meters: u right, v up. */
export interface FacePoint {
  u: number;
  v: number;
}

function faceDistance(a: FacePoint, b: FacePoint): number {
  return Math.hypot(a.u - b.u, a.v - b.v);
}

/** Moves a point by mouse pixels (right, down), no further than maxM. */
function dragPoint(p: FacePoint, dragX: number, dragY: number, mPerPx: number, maxM: number): number {
  let du = dragX * mPerPx;
  let dv = -dragY * mPerPx;
  const d = Math.hypot(du, dv);
  if (d > maxM && d > 0) {
    du *= maxM / d;
    dv *= maxM / d;
  }
  p.u += du;
  p.v += dv;
  return Math.min(d, maxM);
}

/**
 * A speed limit judged over a short moment (PACE_SEC) rather than frame by frame, so mouse
 * movement that arrives unevenly between frames is not thrown away.
 */
class Pace {
  private left: number;

  constructor(private perSec: number) {
    this.left = perSec * PACE_SEC;
  }

  /** How much may move this frame. */
  room(dt: number): number {
    this.left = Math.min(this.perSec * PACE_SEC, this.left + this.perSec * Math.max(0, dt));
    return this.left;
  }

  /** Moves `want` (either way), no further than the room left; returns how far it moved. */
  take(dt: number, want: number): number {
    const room = this.room(dt);
    const got = Math.sign(want) * Math.min(Math.abs(want), room);
    this.left -= Math.abs(got);
    return got;
  }

  use(amount: number) {
    this.left = Math.max(0, this.left - amount);
  }
}

function shuffled(n: number, random: Random): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Repair the switchboard: take each plug off its hook and drag it onto the socket of the same
 * colour, then hold it there while it seats. The wrong socket sparks and throws the plug back.
 */
export class SwitchboardLogic {
  private cfg = config.tasks.hands.switchboard;
  /** Where each plug is now. */
  readonly plug: FacePoint[];
  readonly plugged: boolean[];
  /** The socket each cable belongs in (sockets are coloured in a shuffled order). */
  readonly socketOf: number[];
  /** How long the plug in hand has been held in its socket. */
  seat = 0;
  private holding: number | null = null;
  private pace = new Pace(this.cfg.maxMPerSec);
  /** After a spark or a seated plug, the button must be let go before grabbing again. */
  private waitForRelease = false;

  constructor(private play: Play, private hooks: readonly FacePoint[], private sockets: readonly FacePoint[], random: Random = Math.random) {
    this.plug = hooks.map((h) => ({ ...h }));
    this.plugged = hooks.map(() => false);
    this.socketOf = shuffled(sockets.length, random);
  }

  get done(): boolean {
    return this.plugged.every(Boolean);
  }

  /** held: the plug you grabbed, or null. dragX/dragY: pixels moved right and down while holding it. */
  update(dt: number, input: { held: number | null; dragX: number; dragY: number }) {
    const c = this.cfg;
    if (input.held === null) this.waitForRelease = false;
    const held = this.waitForRelease || (input.held !== null && this.plugged[input.held]) ? null : input.held;
    if (held !== this.holding) {
      // Let go before it seated: the cable pulls it back to its hook.
      if (this.holding !== null && !this.plugged[this.holding]) this.toHook(this.holding);
      this.holding = held;
      this.seat = 0;
    }
    const h = this.holding;
    if (h === null || dt <= 0) return;
    const p = this.plug[h]!;
    this.pace.use(dragPoint(p, input.dragX, input.dragY, c.mPerPx, this.pace.room(dt)));
    const near = this.sockets.findIndex((s) => faceDistance(s, p) < c.snapM);
    if (near === -1) {
      this.seat = 0;
      return;
    }
    if (near !== this.socketOf[h] || this.plugged.some((done, k) => done && this.socketOf[k] === near)) {
      this.play("spark");
      this.release(h);
      this.toHook(h);
      return;
    }
    Object.assign(p, this.sockets[near]);
    this.seat += dt;
    if (this.seat >= c.seatSec) {
      this.plugged[h] = true;
      this.play("click");
      this.release(h);
    }
  }

  private release(h: number) {
    if (this.holding === h) this.holding = null;
    this.waitForRelease = true;
    this.seat = 0;
  }

  private toHook(h: number) {
    Object.assign(this.plug[h]!, this.hooks[h]);
  }
}

/**
 * Clean the mirror: a cloth in your hand. Hold the button on the glass and move the mouse to
 * wipe the fog off. Wiping too fast only smears. Sometimes a face shows in the glass.
 */
export class MirrorLogic {
  private cfg = config.tasks.hands.mirror;
  /** Fog on each patch of glass, row by row from the bottom left: 1 fogged, 0 clean. */
  readonly fog: number[];
  /** Where the cloth is on the glass while you wipe, or null. */
  cloth: FacePoint | null = null;
  /** Seconds the face still shows, or 0. */
  faceLeft = 0;
  /** How fast the cloth moves, smoothed, in m/s. */
  speed = 0;
  private faceComing: boolean;
  private smearWait = 0;

  constructor(private play: Play, random: Random = Math.random) {
    const c = this.cfg;
    this.fog = Array.from({ length: c.cols * c.rows }, () => 1);
    this.faceComing = random() < c.faceChance;
  }

  get clearPct(): number {
    return (100 * this.fog.filter((f) => f === 0).length) / this.fog.length;
  }

  get done(): boolean {
    return this.clearPct >= this.cfg.clearPct;
  }

  /** The middle of a patch of glass, from the mirror's middle. */
  cell(i: number): FacePoint {
    const c = this.cfg;
    const col = i % c.cols;
    const row = Math.floor(i / c.cols);
    return { u: ((col + 0.5) / c.cols - 0.5) * c.widthM, v: ((row + 0.5) / c.rows - 0.5) * c.heightM };
  }

  /** grab: where the crosshair is on the glass (null when off it). holding: the button is down. */
  update(dt: number, input: { grab: FacePoint | null; holding: boolean; dragX: number; dragY: number }) {
    const c = this.cfg;
    if (dt <= 0) return;
    this.faceLeft = Math.max(0, this.faceLeft - dt);
    this.smearWait = Math.max(0, this.smearWait - dt);
    if (!input.holding) {
      this.cloth = null;
      this.speed = 0;
      return;
    }
    if (!this.cloth) {
      if (!input.grab) return;
      this.cloth = { ...input.grab };
    }
    const moved = dragPoint(this.cloth, input.dragX, input.dragY, c.mPerPx, Infinity);
    this.cloth.u = Math.max(-c.widthM / 2, Math.min(c.widthM / 2, this.cloth.u));
    this.cloth.v = Math.max(-c.heightM / 2, Math.min(c.heightM / 2, this.cloth.v));
    this.speed += (moved / dt - this.speed) * Math.min(1, dt / c.paceSec);
    if (this.speed > c.maxMPerSec) {
      if (this.smearWait === 0) {
        this.smearWait = SMEAR_SOUND_SEC;
        this.play("scrape");
      }
      return;
    }
    if (moved === 0) return;
    for (let i = 0; i < this.fog.length; i++) {
      if (this.fog[i] !== 0 && faceDistance(this.cell(i), this.cloth) <= c.brushM) this.fog[i] = 0;
    }
    if (this.faceComing && this.clearPct >= c.faceAtPct) {
      this.faceComing = false;
      this.faceLeft = c.faceSec;
      this.play("scare");
    }
  }
}

/**
 * Seal the old trunk: press the sprung lid down and hold it until it clicks shut, then turn each
 * latch a quarter. Dawdle between latches and the lid bursts open again.
 */
export class TrunkLogic {
  private cfg = config.tasks.hands.trunk;
  /** How far the lid is open: 1 sprung up, 0 shut. */
  lid = 1;
  /** Seconds the lid has been held shut. */
  pressed = 0;
  shut = false;
  /** Each latch's turn, 0 to 90 degrees. */
  readonly latch: number[];
  /** Seconds left to turn the next latch before the lid bursts open. */
  popLeft = 0;
  private pace = new Pace(this.cfg.maxDegPerSec);

  constructor(private play: Play) {
    this.latch = Array.from({ length: this.cfg.latches }, () => 0);
  }

  get done(): boolean {
    return this.latch.every((l) => l >= 90);
  }

  /** onLid: holding the lid. latch: the latch in your hand, or null. dragX/dragY: pixels right and down. */
  update(dt: number, input: { onLid: boolean; latch: number | null; dragX: number; dragY: number }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    if (!this.shut) {
      if (input.onLid) this.lid = Math.max(0, Math.min(1, this.lid - input.dragY / c.pressPx));
      else this.lid = Math.min(1, this.lid + c.springPerSec * dt);
      this.pressed = input.onLid && this.lid === 0 ? this.pressed + dt : 0;
      if (this.pressed >= c.pressSec) {
        this.shut = true;
        this.popLeft = c.popSec;
        this.play("click");
      }
      return;
    }
    this.popLeft -= dt;
    if (this.popLeft <= 0) {
      // It bursts open: start again.
      this.shut = false;
      this.lid = 1;
      this.pressed = 0;
      this.latch.fill(0);
      this.play("thud");
      return;
    }
    const i = input.latch;
    if (i === null || this.latch[i]! >= 90) return;
    this.latch[i] = Math.max(0, Math.min(90, this.latch[i]! + this.pace.take(dt, input.dragX * c.degPerPx)));
    if (this.latch[i]! >= 90) {
      this.popLeft = c.popSec;
      this.play("click");
    }
  }
}

/**
 * Fold the bedsheets: fold the sheet in half three times. Grab it and pull: toward you for the
 * first and last folds, from right to left for the middle one. Let go early and it slides back.
 */
export class SheetsLogic {
  private cfg = config.tasks.hands.sheets;
  folds = 0;
  /** How far through the current fold, 0 to 1. */
  progress = 0;
  private pace = new Pace(this.cfg.maxPerSec);

  constructor(private play: Play) {}

  get done(): boolean {
    return this.folds >= this.cfg.folds;
  }

  /** Whether the current fold pulls toward you (down the screen) rather than right to left. */
  get towardYou(): boolean {
    return this.folds % 2 === 0;
  }

  /** held: holding the sheet. dragX/dragY: pixels moved right and down while holding it. */
  update(dt: number, input: { held: boolean; dragX: number; dragY: number }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    if (!input.held) {
      this.progress = Math.max(0, this.progress - c.dropPerSec * dt);
      return;
    }
    const pull = (this.towardYou ? input.dragY : -input.dragX) / c.pxPerFold;
    this.progress = Math.max(0, Math.min(1, this.progress + this.pace.take(dt, pull)));
    if (this.progress >= c.snapAt) {
      this.folds += 1;
      this.progress = 0;
      this.play("thud");
    }
  }
}

/**
 * Rock the cradle: it swings on its own; push it gently in time with its swing to keep the
 * baby calm. Too big a swing, or a hard shove, and the baby cries, which the ghost can hear.
 */
export class CradleLogic {
  private cfg = config.tasks.hands.cradle;
  /** The swing, in radians, and how fast it is moving. */
  angle = 0;
  speed = 0;
  /** Seconds of calm so far. */
  calm = 0;
  /** Seconds the baby still cries. */
  crying = 0;
  private pushSpeed = 0;

  constructor(private play: Play, private noise: () => void) {}

  get done(): boolean {
    return this.calm >= this.cfg.fillSec;
  }

  /** How far the cradle swings each way now, in radians. */
  get amplitude(): number {
    const w = (2 * Math.PI) / this.cfg.periodSec;
    return Math.hypot(this.angle, this.speed / w);
  }

  /** held: your hand is on the cradle. dragX: pixels pushed right. */
  update(dt: number, input: { held: boolean; dragX: number }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    const w = (2 * Math.PI) / c.periodSec;
    const push = input.held ? input.dragX : 0;
    this.pushSpeed += (Math.abs(push) / dt - this.pushSpeed) * Math.min(1, dt / PUSH_PACE_SEC);
    this.speed += (-w * w * this.angle - c.dampPerSec * this.speed) * dt + push * c.pushRadPerPx;
    this.angle += this.speed * dt;
    this.crying = Math.max(0, this.crying - dt);
    const amp = this.amplitude;
    if (amp > c.cryAmpRad || this.pushSpeed > c.cryPxPerSec) {
      if (this.crying === 0) {
        this.play("cry");
        this.noise();
        this.calm = Math.max(0, this.calm - c.cryLoseSec);
      }
      this.crying = c.cryPauseSec;
      return;
    }
    if (this.crying === 0 && amp >= c.minAmpRad && amp <= c.maxAmpRad) this.calm += dt;
  }
}

/**
 * Open the jewellery box (a relic spot): a dial lock. Turn the dial right until the first pin
 * clicks, then left to the next, and so on. A pin only clicks if the dial passes it slowly; the
 * dial's soft ticks tell you how fast you turn.
 */
export class LockboxLogic {
  private cfg = config.relics.hands.lockbox;
  /** The dial, in degrees turned right from where it started. */
  dial = 0;
  /** Where each pin is, in the same degrees. */
  readonly pins: number[];
  /** Pins set so far. */
  set = 0;
  /** How fast the dial turns, smoothed, in degrees a second. */
  private speed = 0;

  constructor(private play: Play, random: Random = Math.random) {
    const c = this.cfg;
    this.pins = [];
    let at = 0;
    for (let i = 0; i < c.pins; i++) {
      // Right to the first pin, left to the second, and so on.
      const gap = c.minGapDeg + (c.maxGapDeg - c.minGapDeg) * random();
      at += (i % 2 === 0 ? 1 : -1) * gap;
      this.pins.push(at);
    }
  }

  get done(): boolean {
    return this.set >= this.cfg.pins;
  }

  /** held: the dial is in your hand. dragX: pixels moved right (turning it right). */
  update(dt: number, input: { held: boolean; dragX: number }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    const turn = input.held ? input.dragX * c.degPerPx : 0;
    this.speed += (Math.abs(turn) / dt - this.speed) * Math.min(1, dt / PUSH_PACE_SEC);
    if (turn === 0) return;
    const from = this.dial;
    const to = from + turn;
    this.dial = to;
    if (Math.floor(from / c.tickDeg) !== Math.floor(to / c.tickDeg)) this.play("tick");
    const pin = this.pins[this.set]!;
    const rightward = this.set % 2 === 0;
    const passes = rightward ? from < pin && to >= pin : from > pin && to <= pin;
    if (passes && this.speed <= c.clickDegPerSec) {
      this.set += 1;
      this.play("click");
    }
  }
}

/**
 * Reach into the drain (a relic spot): feel about in the dark water for the relic. Near it the
 * water ripples and laps louder. Hold still on it to grip it, then pull it up; let go while
 * pulling and it slips back.
 */
export class DrainLogic {
  private cfg = config.relics.hands.drain;
  /** Your hand in the water, from the drain's middle: u to the right, v away from you. */
  readonly hand: FacePoint = { u: 0, v: 0 };
  readonly relic: FacePoint;
  /** Seconds you have held still on the relic. */
  grip = 0;
  gripped = false;
  /** Pixels pulled up so far. */
  pulled = 0;
  /** How fast the hand moves, smoothed, in m/s. */
  private speed = 0;
  private lapWait = 0;
  private reach = new Pace(this.cfg.maxMPerSec);
  private pull = new Pace(this.cfg.pullPxPerSec);

  constructor(private play: Play, random: Random = Math.random) {
    const c = this.cfg;
    const angle = random() * Math.PI * 2;
    const r = c.relicMinM + (c.sizeM / 2 - 0.04 - c.relicMinM) * random();
    this.relic = { u: Math.cos(angle) * r, v: Math.sin(angle) * r };
  }

  get done(): boolean {
    return this.pulled >= this.cfg.pullPx;
  }

  /** How near the hand is to the relic, 0 (far) to 1 (on it): the ripple you see and hear. */
  get closeness(): number {
    return Math.max(0, 1 - faceDistance(this.hand, this.relic) / (this.cfg.feelM * 3));
  }

  /** holding: your hand is in the water. dragX/dragY: pixels moved right and down. */
  update(dt: number, input: { holding: boolean; dragX: number; dragY: number }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    this.lapWait = Math.max(0, this.lapWait - dt);
    if (this.gripped) {
      if (!input.holding) {
        // It slips back into the water.
        this.gripped = false;
        this.grip = 0;
        this.pulled = 0;
        this.play("splash");
        return;
      }
      this.pulled += Math.max(0, this.pull.take(dt, Math.max(0, -input.dragY)));
      if (this.done) this.play("click");
      return;
    }
    if (!input.holding) {
      this.grip = 0;
      this.speed = 0;
      return;
    }
    const moved = dragPoint(this.hand, input.dragX, input.dragY, c.mPerPx, this.reach.room(dt));
    this.reach.use(moved);
    const half = c.sizeM / 2;
    this.hand.u = Math.max(-half, Math.min(half, this.hand.u));
    this.hand.v = Math.max(-half, Math.min(half, this.hand.v));
    this.speed += (moved / dt - this.speed) * Math.min(1, dt / PUSH_PACE_SEC);
    // The water laps against your hand, quicker the nearer the relic.
    if (this.closeness > 0 && this.lapWait === 0) {
      this.lapWait = LAP_SLOWEST_SEC - (LAP_SLOWEST_SEC - LAP_FASTEST_SEC) * this.closeness;
      this.play("splash");
    }
    const on = faceDistance(this.hand, this.relic) <= c.feelM;
    this.grip = on && this.speed <= c.stillMPerSec ? this.grip + dt : 0;
    if (this.grip >= c.grabSec) {
      this.gripped = true;
      this.play("thud");
    }
  }
}

// ---------- Puzzle tasks (the pilot of GDD 26.5's brain-game tasks) ----------

/**
 * The time a station's clue gives (the clock's guest book), the same on every screen in a match:
 * a five-minute mark, never twelve o'clock exactly. In minutes past twelve (0 to 715).
 */
export function clueTime(seed: string, stationId: string): number {
  // FNV-1a.
  let h = 0x811c9dc5;
  for (const ch of `${seed}/${stationId}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const minutes = (h % 144) * 5;
  return minutes === 0 ? 15 : minutes;
}

/** A time in minutes past twelve as a clock shows it: "7:05", "12:30". */
export function clockText(minutes: number): string {
  return `${Math.floor(minutes / 60) || 12}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The short way between two times on a clock face, in minutes. */
function clockGap(a: number, b: number): number {
  const d = (((a - b) % 720) + 720) % 720;
  return Math.min(d, 720 - d);
}

/**
 * Set the grandfather clock: it has stopped, and the guest book in the hall says when the house
 * must be woken. Grab the clock face and drag to turn the minute hand (the hour hand follows,
 * as on a real clock). Let go with the hands at that time and the clock starts again.
 */
export class ClockLogic {
  private cfg = config.tasks.hands.clock;
  /** The time the hands show, in minutes past twelve (0 to 719). */
  minutes: number;
  /** Seconds the hands have rested on the right time. */
  settled = 0;
  private pace = new Pace(this.cfg.maxDegPerSec);

  /** target: the time in the guest book, in minutes past twelve. */
  constructor(private play: Play, readonly target: number) {
    // Stopped half a day round from it, so either way round is the same long turn.
    this.minutes = (target + 360) % 720;
  }

  get done(): boolean {
    return this.settled >= this.cfg.settleSec;
  }

  /** The hands, in degrees clockwise from twelve. */
  get minuteDeg(): number {
    return (this.minutes % 60) * 6;
  }

  get hourDeg(): number {
    return (this.minutes / 720) * 360;
  }

  /** Whether the hands show the time in the book. */
  get right(): boolean {
    return clockGap(this.minutes, this.target) <= this.cfg.toleranceMin;
  }

  /** held: the clock face is in your hand. dragX: pixels moved right (clockwise). */
  update(dt: number, input: { held: boolean; dragX: number }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    if (!input.held) {
      this.settled = this.right ? this.settled + dt : 0;
      if (this.done) this.play("click");
      return;
    }
    this.settled = 0;
    const turn = this.pace.take(dt, input.dragX * c.degPerPx) / 6;
    if (turn === 0) return;
    const before = Math.floor(this.minutes / c.tickMin);
    this.minutes = (((this.minutes + turn) % 720) + 720) % 720;
    if (Math.floor(this.minutes / c.tickMin) !== before) this.play("tick");
  }
}

/**
 * Tune the piano by ear: it plays a short tune, its keys going down as it plays. Play it back.
 * Each round the tune gets one note longer. A wrong key is a sour note the ghost can hear, and
 * the piano plays the tune again.
 */
export class PianoLogic {
  private cfg = config.tasks.hands.piano;
  round = 0;
  /** The whole tune; each round plays the first firstNotes + round notes of it. */
  readonly tune: number[];
  /** "listen" while the piano plays the tune, "play" while it waits for you. */
  mode: "listen" | "play" = "listen";
  /** The next note to sound (listening) or to press (playing). */
  step = 0;
  /** The key the piano is sounding now, for the keys to move. */
  showing: number | null = null;
  /** Seconds a pressed key still rings, before the next can go down. */
  ring = 0;
  /** True after a wrong note, until you play the tune through. */
  again = false;
  private wait: number;

  constructor(private play: Play, private noise: () => void, random: Random = Math.random) {
    const c = this.cfg;
    this.tune = [];
    for (let i = 0; i < c.firstNotes + c.rounds - 1; i++) {
      let key = Math.floor(random() * c.keys);
      // Never the same key twice running, so every note is a new key to find.
      if (key === this.tune[i - 1]) key = (key + 1) % c.keys;
      this.tune.push(key);
    }
    this.wait = c.listenPauseSec;
  }

  get done(): boolean {
    return this.round >= this.cfg.rounds;
  }

  /** How many notes this round's tune has. */
  get length(): number {
    return this.cfg.firstNotes + Math.min(this.round, this.cfg.rounds - 1);
  }

  /** Plays the tune again from the start, after a pause. */
  private listen(pauseSec: number) {
    this.mode = "listen";
    this.step = 0;
    this.wait = pauseSec;
  }

  /** pressed: the key pressed this frame, or null. replay: you asked to hear the tune again. */
  update(dt: number, input: { pressed: number | null; replay?: boolean }) {
    const c = this.cfg;
    if (dt <= 0 || this.done) return;
    this.ring = Math.max(0, this.ring - dt);
    if (this.mode === "listen") {
      this.wait -= dt;
      if (this.wait <= c.notePlaySec - c.noteShowSec) this.showing = null;
      if (this.wait > 0) return;
      if (this.step < this.length) {
        const key = this.tune[this.step]!;
        this.play("note", key);
        this.showing = key;
        this.step += 1;
        this.wait = c.notePlaySec;
        return;
      }
      this.mode = "play";
      this.step = 0;
      this.showing = null;
      return;
    }
    if (input.replay) return this.listen(c.listenPauseSec);
    if (input.pressed === null || this.ring > 0) return;
    this.ring = c.ringSec;
    if (input.pressed !== this.tune[this.step]) {
      this.play("badNote");
      this.noise();
      this.again = true;
      return this.listen(c.wrongPauseSec);
    }
    this.play("note", input.pressed);
    this.step += 1;
    if (this.step < this.length) return;
    this.round += 1;
    this.again = false;
    if (!this.done) this.listen(c.listenPauseSec);
  }
}

/** A water-jug puzzle: jugs of these sizes, and how much the vase must hold. */
export interface JugPuzzle {
  jugs: readonly number[];
  target: number;
}

/** What a click does in the roses puzzle. */
export type JugAction =
  | { kind: "pick"; jug: number }
  | { kind: "putDown" }
  | { kind: "fill" }
  | { kind: "pour"; jug: number }
  | { kind: "pourVase" }
  | { kind: "empty" }
  | { kind: "tipVase" };

/**
 * Water the dead roses: a puzzle with two jugs that hold different amounts, a pump to fill them,
 * a bucket to empty them, and a vase marked with a line. Pouring always pours all you can, so
 * get exactly the right amount into the vase by pouring between the jugs. Past the line, tip the
 * vase out and try again.
 */
export class RosesLogic {
  private cfg = config.tasks.hands.roses;
  readonly puzzle: JugPuzzle;
  /** Water in each jug, and in the vase. */
  readonly water: number[];
  vase = 0;
  /** The jug in your hand, or null. */
  inHand: number | null = null;
  /** Seconds left of the pour in progress (nothing else can be done meanwhile). */
  busy = 0;

  constructor(private play: Play, random: Random = Math.random) {
    const list = this.cfg.puzzles;
    this.puzzle = list[Math.floor(random() * list.length)]!;
    this.water = this.puzzle.jugs.map(() => 0);
  }

  get done(): boolean {
    return this.vase === this.puzzle.target && this.busy === 0;
  }

  /** Whether this would do anything now. */
  can(a: JugAction): boolean {
    if (this.busy > 0 || this.done) return false;
    const h = this.inHand;
    const caps = this.puzzle.jugs;
    switch (a.kind) {
      case "pick":
        return h === null;
      case "putDown":
        return h !== null;
      case "fill":
        return h !== null && this.water[h]! < caps[h]!;
      case "pour":
        return h !== null && a.jug !== h && this.water[h]! > 0 && this.water[a.jug]! < caps[a.jug]!;
      case "pourVase":
      case "empty":
        return h !== null && this.water[h]! > 0;
      case "tipVase":
        return h === null && this.vase > 0;
    }
  }

  /** Does it, if it can. Returns whether it did. */
  act(a: JugAction): boolean {
    if (!this.can(a)) return false;
    const c = this.cfg;
    const h = this.inHand!;
    const caps = this.puzzle.jugs;
    switch (a.kind) {
      case "pick":
        this.inHand = a.jug;
        return true;
      case "putDown":
        this.inHand = null;
        return true;
      case "fill":
        this.water[h] = caps[h]!;
        break;
      case "pour": {
        const amount = Math.min(this.water[h]!, caps[a.jug]! - this.water[a.jug]!);
        this.water[h]! -= amount;
        this.water[a.jug]! += amount;
        break;
      }
      case "pourVase":
        // Past the brim it runs over.
        this.vase = Math.min(this.cfg.vaseCap, this.vase + this.water[h]!);
        this.water[h] = 0;
        break;
      case "empty":
        this.water[h] = 0;
        break;
      case "tipVase":
        this.vase = 0;
        break;
    }
    this.busy = c.pourSec;
    this.play("splash");
    return true;
  }

  update(dt: number) {
    if (dt > 0) this.busy = Math.max(0, this.busy - dt);
  }
}
