import { AudioPresets, Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

// Proximity voice (GDD Section 13). LiveKit carries the audio; the game server decides who
// receives whose voice and how loud (the "voiceMix" message). This class plays each voice
// from where that player stands, quieter with distance and muffled through walls.

const MUFFLED_HZ = 900; // a wall between you: low-pass filter
const CLEAR_HZ = 20000;
// Changes glide instead of jumping. Abrupt changes to a playing voice sound like crackle.
const GAIN_SMOOTHING_SEC = 0.15;
const POSITION_SMOOTHING_SEC = 0.05;

export type VoiceStatus = "off" | "connecting" | "on" | "no-mic" | "failed";

export interface AudioOut {
  ctx: AudioContext;
  out: AudioNode;
}

interface Voice {
  element: HTMLAudioElement;
  stream: MediaStream;
  nodes?: { gain: GainNode; filter: BiquadFilterNode; panner: PannerNode };
}

export class VoiceChat {
  status: VoiceStatus = "off";
  private room = new Room({ adaptiveStream: false, dynacast: false });
  private voices = new Map<string, Voice>();
  private mix: Record<string, [number, number, number]> = {};
  private micAnalyser: AnalyserNode | null = null;
  private micSamples = new Float32Array(1024);

  constructor(
    private audio: () => AudioOut | null,
    private onStatus: (status: VoiceStatus) => void,
  ) {}

  private setStatus(status: VoiceStatus) {
    this.status = status;
    this.onStatus(status);
  }

  async connect(url: string, token: string) {
    this.setStatus("connecting");
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) this.addVoice(participant.identity, track);
    });
    this.room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => this.removeVoice(participant.identity));
    try {
      // The server subscribes us to nearby voices; we never pick them ourselves.
      await this.room.connect(url, token, { autoSubscribe: false });
    } catch {
      this.setStatus("failed");
      return;
    }
    try {
      // Automatic gain control is off so whispers stay quiet and shouts stay loud.
      // Noise suppression is off: it chops quiet speech and removes whispers almost entirely.
      // Echo cancellation stays on so your speakers do not feed back into your mic.
      const pub = await this.room.localParticipant.setMicrophoneEnabled(
        true,
        { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        // A steady stream at a good speech bitrate: no gaps during quiet moments (no DTX).
        { audioPreset: AudioPresets.music, dtx: false },
      );
      const mic = pub?.track?.mediaStreamTrack;
      if (!mic) throw new Error("no microphone track");
      this.watchMic(mic);
      this.setStatus("on");
    } catch {
      this.setStatus("no-mic");
    }
  }

  /** Volumes from the server: [volume, muffled, boost for a quiet mic] per speaker. */
  setMix(mix: Record<string, [number, number, number]>) {
    this.mix = mix;
  }

  /** Call every frame: places each voice where its player is and applies the server's volumes. */
  update(positionOf: (id: string) => { x: number; z: number } | null) {
    const audio = this.audio();
    if (!audio) return;
    for (const [id, voice] of this.voices) {
      if (!voice.nodes) voice.nodes = this.buildNodes(audio, voice.stream);
      const { gain, filter, panner } = voice.nodes;
      const [volume, muffled, boost] = this.mix[id] ?? [0, 0, 1];
      const t = audio.ctx.currentTime;
      gain.gain.setTargetAtTime(volume * boost, t, GAIN_SMOOTHING_SEC);
      filter.frequency.setTargetAtTime(muffled ? MUFFLED_HZ : CLEAR_HZ, t, GAIN_SMOOTHING_SEC);
      const pos = positionOf(id);
      if (pos) {
        panner.positionX.setTargetAtTime(pos.x, t, POSITION_SMOOTHING_SEC);
        panner.positionY.setTargetAtTime(1.6, t, POSITION_SMOOTHING_SEC);
        panner.positionZ.setTargetAtTime(pos.z, t, POSITION_SMOOTHING_SEC);
      }
    }
  }

  /** How loud your own microphone is right now, 0 to 1 (for the mic meter). */
  micLevel(): number {
    if (!this.micAnalyser) return 0;
    this.micAnalyser.getFloatTimeDomainData(this.micSamples);
    let sum = 0;
    for (const s of this.micSamples) sum += s * s;
    const rms = Math.sqrt(sum / this.micSamples.length);
    // Map about -60..-10 dBFS onto 0..1 so normal talking fills about half the meter.
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    return Math.max(0, Math.min(1, (db + 60) / 50));
  }

  private watchMic(track: MediaStreamTrack) {
    const audio = this.audio();
    if (!audio) return;
    const source = audio.ctx.createMediaStreamSource(new MediaStream([track]));
    this.micAnalyser = audio.ctx.createAnalyser();
    this.micAnalyser.fftSize = 2048;
    source.connect(this.micAnalyser); // measured only, never played back to you
  }

  private addVoice(id: string, track: RemoteTrack) {
    this.removeVoice(id);
    const stream = new MediaStream([track.mediaStreamTrack]);
    // Chrome only delivers remote WebRTC audio to Web Audio while a media element plays it.
    const element = new Audio();
    element.muted = true;
    element.srcObject = stream;
    void element.play().catch(() => {});
    this.voices.set(id, { element, stream });
  }

  private buildNodes(audio: AudioOut, stream: MediaStream) {
    const { ctx } = audio;
    const source = ctx.createMediaStreamSource(stream);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = CLEAR_HZ;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createPanner();
    // Simple left/right panning keeps voices clean; the fuller "HRTF" 3D effect can add
    // a robotic, crackly sound to speech while people move.
    panner.panningModel = "equalpower";
    // Distance volume comes from the server's mix; the panner only gives direction.
    panner.distanceModel = "linear";
    panner.rolloffFactor = 0;
    source.connect(filter).connect(gain).connect(panner).connect(audio.out);
    return { gain, filter, panner };
  }

  private removeVoice(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    voice.element.srcObject = null;
    voice.nodes?.panner.disconnect();
    this.voices.delete(id);
  }

  async disconnect() {
    for (const id of [...this.voices.keys()]) this.removeVoice(id);
    await this.room.disconnect();
  }
}
