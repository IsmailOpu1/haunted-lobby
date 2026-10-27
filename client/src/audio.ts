// Placeholder sounds made with Web Audio until the Phase 8 audio pass (GDD Section 23).
// There is no music: footsteps are the background. You hear your own steps, your friends'
// steps from where they are, the ghost's heavy steps during hunts, and now and then a few
// distant steps that belong to no one. Plus a heartbeat that speeds up as the ghost gets
// close, 2 seconds of total silence before a hunt, and a hunt sting with a soft low pulse.

// The heartbeat is deep, soft and muffled (felt more than heard); footsteps are crisp
// wooden taps. Keeping them in different pitch ranges stops them blurring together.
import type { WorldPoint } from "@haunted/shared";
import type { TaskSoundKind } from "./hands/sounds.ts";

const HEARTBEAT_RANGE_M = 12;
const HEARTBEAT_LOWPASS_HZ = 110;
const MASTER_LEVEL = 0.8;
const LISTENER_SMOOTHING_SEC = 0.03;
const PIANO_BASE_HZ = 220;
const PIANO_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

export type StepKind = "walk" | "run" | "crouch" | "crawl" | "ghost";

/**
 * How each kind of step sounds. thudMix is how much of the step is the low body (the rest is
 * the bright tap of a shoe on wood, set by noiseHz). Player steps are mostly tap, so they sit
 * well above the heartbeat; the ghost's steps are heavy stomps.
 */
const STEP_SOUNDS: Record<StepKind, { gain: number; thudHz: number; thudMix: number; noiseHz: number; q: number; seconds: number }> = {
  walk: { gain: 0.3, thudHz: 130, thudMix: 0.25, noiseHz: 1100, q: 1.4, seconds: 0.06 },
  run: { gain: 0.4, thudHz: 140, thudMix: 0.3, noiseHz: 1300, q: 1.2, seconds: 0.05 },
  crouch: { gain: 0.08, thudHz: 120, thudMix: 0.2, noiseHz: 1000, q: 1.4, seconds: 0.05 },
  crawl: { gain: 0.14, thudHz: 90, thudMix: 0.1, noiseHz: 600, q: 0.7, seconds: 0.28 }, // a drag, not a step
  ghost: { gain: 0.9, thudHz: 45, thudMix: 0.6, noiseHz: 260, q: 0.9, seconds: 0.22 },
};

// Phantom footsteps: a few distant steps from a random direction (GDD 23 "distant footsteps").
const PHANTOM_MIN_GAP_SEC = 30;
const PHANTOM_MAX_GAP_SEC = 60;
const PHANTOM_DISTANCE_M = [10, 16] as const;

function whiteNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A slow oscillator that moves an audio parameter around its current value. */
function wobble(ctx: AudioContext, param: AudioParam, hz: number, depth: number) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hz;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  lfo.start();
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// The Bellboy's service bell: a few bright, slightly out-of-tune partials ringing out.
const BELL_PARTIALS = [
  { hz: 1870, gain: 0.22, seconds: 2.2 },
  { hz: 2690, gain: 0.12, seconds: 1.4 },
  { hz: 4310, gain: 0.07, seconds: 0.8 },
];
const BELL_REF_DISTANCE_M = 4;
const DOOR_REF_DISTANCE_M = 2;

const WHISPER_HZ = 1400;
const WHISPER_SWELL_HZ = 0.35;
const WHISPER_LEVEL = 0.35;
const WHISPER_Q = 4;
// Up close: this much louder, a broader (clearer) band, and a quicker murmur.
const WHISPER_NEAR_GAIN = 0.8;
const WHISPER_NEAR_Q = 1.2;
const WHISPER_NEAR_SWELL_HZ = 4;

export class SoundScape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private volumeNode!: GainNode;
  private volume = 1;
  private huntGain!: GainNode;
  private noise!: AudioBuffer;
  private nextBeatAt = 0;
  private silentUntil = 0;
  private hunting = false;
  private listener = { x: 0, y: 0, z: 0 };
  private nextPhantomAt = 0;
  private whisper: { level: GainNode; panner: PannerNode; band: BiquadFilterNode; lfo: OscillatorNode } | null = null;

  /** Browsers only allow sound after a click or key press; call this from one. */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // No Web Audio: the game still works, silently.
    }
    const ctx = this.ctx;
    // master is used for the pre-hunt silence; volumeNode is the player's volume setting.
    this.volumeNode = ctx.createGain();
    this.volumeNode.gain.value = this.volume;
    this.volumeNode.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_LEVEL;
    this.master.connect(this.volumeNode);
    this.noise = whiteNoiseBuffer(ctx, 0.5);
    this.nextPhantomAt = ctx.currentTime + randomBetween(PHANTOM_MIN_GAP_SEC, PHANTOM_MAX_GAP_SEC);

    // Hunt pulse: a soft, deep sine that swells slowly, silent until a hunt starts.
    this.huntGain = ctx.createGain();
    this.huntGain.gain.value = 0;
    this.huntGain.connect(this.master);
    const rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 46;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.6;
    wobble(ctx, pulseGain.gain, 1.2, 0.4);
    rumble.connect(pulseGain).connect(this.huntGain);
    rumble.start();
  }

  /**
   * Where voices are played: after the volume slider, but not through the pre-hunt silence,
   * so friends can still talk during it. Null until sound is unlocked.
   */
  voiceOutput(): { ctx: AudioContext; out: AudioNode } | null {
    return this.ctx ? { ctx: this.ctx, out: this.volumeNode } : null;
  }

  /** Player volume from 0 (off) to 1. Works before and after sound is unlocked. */
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx) this.volumeNode.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  /** Where your ears are and which way you face (yaw 0 faces -z), for 3D footsteps. */
  setListener(x: number, y: number, z: number, yaw: number) {
    this.listener = { x, y, z };
    const l = this.ctx?.listener;
    if (!l) return;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      // Glide to the new position and direction; jumping every frame makes voices crackle.
      const t = this.ctx!.currentTime;
      l.positionX.setTargetAtTime(x, t, LISTENER_SMOOTHING_SEC);
      l.positionY.setTargetAtTime(y, t, LISTENER_SMOOTHING_SEC);
      l.positionZ.setTargetAtTime(z, t, LISTENER_SMOOTHING_SEC);
      l.forwardX.setTargetAtTime(fx, t, LISTENER_SMOOTHING_SEC);
      l.forwardY.setTargetAtTime(0, t, LISTENER_SMOOTHING_SEC);
      l.forwardZ.setTargetAtTime(fz, t, LISTENER_SMOOTHING_SEC);
      l.upY.value = 1;
    } else {
      // Older browsers (Firefox) only have the setter methods.
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * One footstep. With a position, it comes from that place in 3D and gets quieter with
   * distance; without one, it is your own step.
   */
  step(kind: StepKind, at?: WorldPoint, when?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = STEP_SOUNDS[kind];
    const t = when ?? ctx.currentTime;
    const vary = randomBetween(0.85, 1.15);

    let out: AudioNode = this.master;
    if (at) {
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.5;
      panner.maxDistance = 30;
      panner.rolloffFactor = 1.3;
      panner.positionX.value = at.x;
      panner.positionY.value = at.y + (kind === "crawl" ? 0.2 : 0);
      panner.positionZ.value = at.z;
      panner.connect(this.master);
      out = panner;
    }

    // The body: a short sine that drops in pitch.
    const thud = ctx.createOscillator();
    thud.frequency.setValueAtTime(s.thudHz * vary, t);
    thud.frequency.exponentialRampToValueAtTime(s.thudHz * 0.6, t + s.seconds);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, t);
    thudGain.gain.exponentialRampToValueAtTime(s.gain * s.thudMix * vary, t + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t + s.seconds * 1.6);
    thud.connect(thudGain).connect(out);
    thud.start(t);
    thud.stop(t + s.seconds * 2);

    // The tap: filtered noise, like a shoe on old wooden boards.
    const scuff = ctx.createBufferSource();
    scuff.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = s.noiseHz * vary;
    filter.Q.value = s.q;
    const scuffGain = ctx.createGain();
    scuffGain.gain.setValueAtTime(0.0001, t);
    // A band-pass keeps only part of the noise's energy, so the tap is driven harder.
    scuffGain.gain.exponentialRampToValueAtTime(s.gain * (1 - s.thudMix) * 1.6 * vary, t + 0.004);
    scuffGain.gain.exponentialRampToValueAtTime(0.0001, t + s.seconds);
    scuff.connect(filter).connect(scuffGain).connect(out);
    scuff.start(t, Math.random() * 0.2);
    scuff.stop(t + s.seconds + 0.05);
  }

  /**
   * Sounds for task minigames: a clock tick, a click, a match striking or going out, a wrong
   * move, a piano note (pitch = key number), a wrong chord, a crying baby. With a position the
   * sound comes from there (someone else's noisy fail); without, it is yours.
   */
  taskSound(kind: TaskSoundKind, pitch = 0, at?: WorldPoint) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    let out: AudioNode = this.master;
    if (at) {
      const panner = ctx.createPanner();
      panner.distanceModel = "inverse";
      panner.refDistance = 2;
      panner.positionX.value = at.x;
      panner.positionY.value = at.y + 1;
      panner.positionZ.value = at.z;
      panner.connect(this.master);
      out = panner;
    }
    const tone = (type: OscillatorType, freq: number, level: number, len: number, start = t) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + len + 0.02);
      return osc;
    };

    switch (kind) {
      case "strike":
      case "fizz": {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = kind === "strike" ? "bandpass" : "highpass";
        filter.frequency.value = kind === "strike" ? 3000 : 5000;
        const gain = ctx.createGain();
        const len = kind === "strike" ? 0.25 : 0.4;
        gain.gain.setValueAtTime(kind === "strike" ? 0.3 : 0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(filter).connect(gain).connect(out);
        src.start(t);
        src.stop(t + len);
        return;
      }
      case "tick":
        tone("triangle", 1800, 0.12, 0.03);
        return;
      case "click":
        tone("triangle", 900, 0.18, 0.06);
        return;
      case "wrong":
        tone("square", 140, 0.2, 0.2).frequency.exponentialRampToValueAtTime(80, t + 0.2);
        return;
      case "note": {
        // An old, slightly sad scale, so any order sounds like it belongs in the hotel.
        const steps = PIANO_SCALE[pitch % PIANO_SCALE.length]!;
        const freq = PIANO_BASE_HZ * 2 ** (steps / 12);
        tone("triangle", freq, 0.22, 1.2);
        tone("sine", freq * 2, 0.06, 0.8);
        return;
      }
      case "badNote":
        // Three neighbouring notes at once: a loud, ugly clash.
        for (const f of [233, 247, 262]) tone("sawtooth", f, 0.12, 1.4);
        return;
      case "cry": {
        // Two rising-and-falling wails.
        for (let i = 0; i < 2; i++) {
          const start = t + i * 0.7;
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(480, start);
          osc.frequency.linearRampToValueAtTime(720, start + 0.25);
          osc.frequency.linearRampToValueAtTime(430, start + 0.65);
          const filter = ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.value = 1100;
          filter.Q.value = 1.5;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.3, start + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
          osc.connect(filter).connect(gain).connect(out);
          osc.start(start);
          osc.stop(start + 0.7);
        }
        return;
      }
      case "scrape":
      case "splash":
      case "spark": {
        // Filtered noise bursts: soil under a trowel, water, a crackling socket.
        const shape = { scrape: [700, 0.18, 0.18], splash: [1200, 0.2, 0.35], spark: [6000, 0.15, 0.12] } as const;
        const [freq, level, len] = shape[kind];
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(freq, t);
        if (kind === "splash") filter.frequency.exponentialRampToValueAtTime(400, t + len);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(level, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(filter).connect(gain).connect(out);
        src.start(t);
        src.stop(t + len);
        return;
      }
      case "thud":
        tone("sine", 90, 0.4, 0.25).frequency.exponentialRampToValueAtTime(45, t + 0.25);
        return;
      case "bang": {
        // A wooden shutter slamming: a deep knock with a crack of noise on top.
        tone("sine", 110, 0.6, 0.35).frequency.exponentialRampToValueAtTime(50, t + 0.35);
        tone("square", 70, 0.15, 0.12);
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        src.connect(gain).connect(out);
        src.start(t);
        src.stop(t + 0.15);
        return;
      }
      case "whistle":
      case "hiss": {
        // Wind rising before a gust; gas escaping from a burner.
        const whistle = kind === "whistle";
        const len = whistle ? 1.1 : 0.6;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = whistle ? "bandpass" : "highpass";
        filter.Q.value = whistle ? 8 : 0.7;
        filter.frequency.setValueAtTime(whistle ? 500 : 4000, t);
        if (whistle) filter.frequency.exponentialRampToValueAtTime(1400, t + len);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(whistle ? 0.5 : 0.15, t + (whistle ? len * 0.85 : 0.05));
        gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(filter).connect(gain).connect(out);
        src.start(t);
        src.stop(t + len);
        return;
      }
      case "scare": {
        // A sudden dissonant swell.
        for (const f of [311, 330, 466]) {
          const osc = tone("sawtooth", f, 0.1, 1.1);
          osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.1);
        }
        return;
      }
    }
  }

  /**
   * A hidden relic whispering (GDD 10): breathy noise that swells and fades, from where the
   * nearest hidden relic is. null fades it out.
   */
  /** closeness: 0 at the edge of whisper range, 1 right on top of it. */
  relicWhisper(at: WorldPoint | null, closeness = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.whisper) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = WHISPER_HZ;
      band.Q.value = WHISPER_Q;
      // A slow swell, like breathing: the gain moves between 0 and 1.
      const swell = ctx.createGain();
      swell.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = WHISPER_SWELL_HZ;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(swell.gain);
      const level = ctx.createGain();
      level.gain.value = 0;
      const panner = ctx.createPanner();
      panner.distanceModel = "inverse";
      panner.refDistance = 1.5;
      src.connect(band).connect(swell).connect(level).connect(panner).connect(this.master);
      src.start();
      lfo.start();
      this.whisper = { level, panner, band, lfo };
    }
    const t = ctx.currentTime;
    // Closer, it grows louder, fuller and quicker, like words you can almost make out (GDD 26.5).
    const near = Math.max(0, Math.min(1, closeness));
    this.whisper.level.gain.setTargetAtTime(at ? WHISPER_LEVEL * (1 + WHISPER_NEAR_GAIN * near) : 0, t, 0.4);
    this.whisper.band.Q.setTargetAtTime(WHISPER_Q - (WHISPER_Q - WHISPER_NEAR_Q) * near, t, 0.2);
    this.whisper.lfo.frequency.setTargetAtTime(WHISPER_SWELL_HZ + WHISPER_NEAR_SWELL_HZ * near * near, t, 0.2);
    if (!at) return;
    this.whisper.panner.positionX.setTargetAtTime(at.x, t, 0.05);
    this.whisper.panner.positionY.setTargetAtTime(at.y + 0.8, t, 0.05);
    this.whisper.panner.positionZ.setTargetAtTime(at.z, t, 0.05);
  }

  /** A panner at a place in the world, or the plain output when there is no place. */
  private placed(at: WorldPoint | undefined, heightM: number, refDistance: number): AudioNode {
    const ctx = this.ctx!;
    if (!at) return this.master;
    const panner = ctx.createPanner();
    panner.distanceModel = "inverse";
    panner.refDistance = refDistance;
    panner.positionX.value = at.x;
    panner.positionY.value = at.y + heightM;
    panner.positionZ.value = at.z;
    panner.connect(this.master);
    return panner;
  }

  /** The Bellboy rang a service bell (GDD 12.5). Two quick dings, heard across the hotel. */
  serviceBell(at: WorldPoint) {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.placed(at, 1, BELL_REF_DISTANCE_M);
    for (const [i, start] of [0, 0.32].entries()) {
      const t = ctx.currentTime + start;
      for (const p of BELL_PARTIALS) {
        const osc = ctx.createOscillator();
        osc.frequency.value = p.hz * (i === 0 ? 1 : 0.998);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(p.gain, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + p.seconds);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + p.seconds);
      }
    }
  }

  /** A door swinging open (a creak) or shut (a thud). */
  door(at: WorldPoint, open: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.placed(at, 1, DOOR_REF_DISTANCE_M);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = open ? 9 : 1.2;
    band.frequency.setValueAtTime(open ? 520 : 140, t);
    if (open) band.frequency.exponentialRampToValueAtTime(880, t + 0.6);
    const gain = ctx.createGain();
    const seconds = open ? 0.7 : 0.18;
    gain.gain.setValueAtTime(open ? 0.5 : 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    noise.connect(band).connect(gain).connect(out);
    noise.start(t);
    noise.stop(t + seconds);
  }

  /** A camera shutter and flash whine. With a position it comes from there; without, it is yours. */
  shutter(at?: WorldPoint) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    let out: AudioNode = this.master;
    if (at) {
      const panner = ctx.createPanner();
      panner.distanceModel = "inverse";
      panner.refDistance = 2;
      panner.positionX.value = at.x;
      panner.positionY.value = at.y + 1.6;
      panner.positionZ.value = at.z;
      panner.connect(this.master);
      out = panner;
    }
    // Click: a very short burst of bright noise.
    const click = ctx.createBufferSource();
    click.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.35, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    click.connect(hp).connect(clickGain).connect(out);
    click.start(t);
    click.stop(t + 0.05);
    // Old flash bulbs whine as they recharge.
    const whine = ctx.createOscillator();
    whine.frequency.setValueAtTime(2200, t + 0.05);
    whine.frequency.exponentialRampToValueAtTime(5200, t + 0.7);
    const whineGain = ctx.createGain();
    whineGain.gain.setValueAtTime(0.0001, t + 0.05);
    whineGain.gain.exponentialRampToValueAtTime(0.03, t + 0.15);
    whineGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    whine.connect(whineGain).connect(out);
    whine.start(t + 0.05);
    whine.stop(t + 0.8);
  }

  /** The 2 seconds before a hunt: every sound drops out (GDD Section 12.1). */
  huntWarning(seconds: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.silentUntil = now + seconds;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.05);
  }

  huntStart() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.hunting = true;
    this.silentUntil = 0;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(MASTER_LEVEL, now, 0.02);
    this.huntGain.gain.setTargetAtTime(0.14, now, 0.4);
    this.sting();
  }

  huntEnd() {
    if (!this.ctx) return;
    this.hunting = false;
    this.huntGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }

  /** Call every frame with the distance to the ghost (Infinity if unknown). */
  update(ghostDistance: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.silentUntil && now >= this.silentUntil) {
      this.silentUntil = 0;
      this.master.gain.setTargetAtTime(MASTER_LEVEL, now, 0.05);
    }
    this.updatePhantomSteps(now);
    if (this.silentUntil || ghostDistance > HEARTBEAT_RANGE_M) return;
    // Heartbeat: about 60 bpm at the edge of range, about 150 bpm right next to the ghost.
    const closeness = 1 - ghostDistance / HEARTBEAT_RANGE_M;
    const interval = 1 / (1 + closeness * 1.5) + (this.hunting ? -0.1 : 0);
    if (now >= this.nextBeatAt) {
      // "Lub-dub": a stronger beat, then a softer one.
      this.beat(now, 0.25 + closeness * 0.35);
      this.beat(now + 0.2, 0.15 + closeness * 0.25);
      this.nextBeatAt = now + interval;
    }
  }

  /** Now and then, a few steps somewhere in the dark that belong to no one. */
  private updatePhantomSteps(now: number) {
    if (now < this.nextPhantomAt) return;
    this.nextPhantomAt = now + randomBetween(PHANTOM_MIN_GAP_SEC, PHANTOM_MAX_GAP_SEC);
    if (this.hunting || this.silentUntil) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = randomBetween(PHANTOM_DISTANCE_M[0], PHANTOM_DISTANCE_M[1]);
    let x = this.listener.x + Math.cos(angle) * dist;
    let z = this.listener.z + Math.sin(angle) * dist;
    const heading = Math.random() * Math.PI * 2;
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      // At about the listener's floor: the listener is at ear height.
      this.step("walk", { x, y: this.listener.y - 1.6, z }, now + i * 0.55);
      x += Math.cos(heading) * 0.7;
      z += Math.sin(heading) * 0.7;
    }
  }

  /** One heartbeat: very low, with a soft attack and muffled, unlike the crisp footsteps. */
  private beat(at: number, volume: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(52, at);
    osc.frequency.exponentialRampToValueAtTime(34, at + 0.2);
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = HEARTBEAT_LOWPASS_HZ;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(muffle).connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private sting() {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    for (const freq of [233, 247, 277]) {
      const osc = ctx.createOscillator();
      // Triangle waves are softer than sawtooth: a short shock, not a harsh buzz.
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 1.2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 1.5);
    }
  }
}
