// Placeholder sounds made with Web Audio, so hunts are tense before the Phase 8 audio pass
// (GDD Section 23): a low drone, a heartbeat that speeds up as the ghost gets close,
// 2 seconds of total silence before a hunt, and a hunt sting with a pulsing drone.

const HEARTBEAT_RANGE_M = 15;

export class SoundScape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private droneGain!: GainNode;
  private huntGain!: GainNode;
  private nextBeatAt = 0;
  private silentUntil = 0;
  private hunting = false;

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
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Ambient drone: two detuned low oscillators.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    this.droneGain.connect(this.master);
    for (const freq of [55, 55.7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180;
      osc.connect(filter).connect(this.droneGain);
      osc.start();
    }

    // Hunt drone: a pulsing low rumble, silent until a hunt starts.
    this.huntGain = ctx.createGain();
    this.huntGain.gain.value = 0;
    this.huntGain.connect(this.master);
    const rumble = ctx.createOscillator();
    rumble.type = "square";
    rumble.frequency.value = 38;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 220;
    const pulse = ctx.createOscillator();
    pulse.frequency.value = 2.2;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.5;
    pulse.connect(pulseDepth).connect(pulseGain.gain);
    rumble.connect(rumbleFilter).connect(pulseGain).connect(this.huntGain);
    rumble.start();
    pulse.start();
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
    this.master.gain.setTargetAtTime(0.8, now, 0.02);
    this.huntGain.gain.setTargetAtTime(0.18, now, 0.1);
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
      this.master.gain.setTargetAtTime(0.8, now, 0.05);
    }
    if (this.silentUntil || ghostDistance > HEARTBEAT_RANGE_M) return;
    // Heartbeat: about 60 bpm at the edge of range, about 150 bpm right next to the ghost.
    const closeness = 1 - ghostDistance / HEARTBEAT_RANGE_M;
    const interval = 1 / (1 + closeness * 1.5) + (this.hunting ? -0.1 : 0);
    if (now >= this.nextBeatAt) {
      this.beat(now, 0.35 + closeness * 0.5);
      this.beat(now + 0.18, 0.25 + closeness * 0.4);
      this.nextBeatAt = now + interval;
    }
  }

  private beat(at: number, volume: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(70, at);
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  private sting() {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    for (const freq of [233, 247, 277]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 1.2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 1.5);
    }
  }
}
