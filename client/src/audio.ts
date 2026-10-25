// Placeholder sounds made with Web Audio until the Phase 8 audio pass (GDD Section 23).
// There is no music: footsteps are the background. You hear your own steps, your friends'
// steps from where they are, the ghost's heavy steps during hunts, and now and then a few
// distant steps that belong to no one. Plus a heartbeat that speeds up as the ghost gets
// close, 2 seconds of total silence before a hunt, and a hunt sting with a soft low pulse.

// The heartbeat is deep, soft and muffled (felt more than heard); footsteps are crisp
// wooden taps. Keeping them in different pitch ranges stops them blurring together.
const HEARTBEAT_RANGE_M = 12;
const HEARTBEAT_LOWPASS_HZ = 110;
const MASTER_LEVEL = 0.8;
const LISTENER_SMOOTHING_SEC = 0.03;

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
  private listener = { x: 0, z: 0 };
  private nextPhantomAt = 0;

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
    this.listener = { x, z };
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
  step(kind: StepKind, at?: { x: number; z: number }, when?: number) {
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
      panner.positionY.value = kind === "crawl" ? 0.2 : 0;
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
      this.step("walk", { x, z }, now + i * 0.55);
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
