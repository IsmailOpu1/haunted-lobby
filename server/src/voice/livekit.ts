import { AudioStream, Room, RoomEvent, TrackKind, type RemoteParticipant, type RemoteTrack } from "@livekit/rtc-node";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { config, rmsDbfs } from "@haunted/shared";
import type { VoiceBackend, VoiceJoin } from "./backend.ts";

const EARS_IDENTITY = "server-ears";
// The server only needs loudness, so it listens at a low sample rate in mono.
const LISTEN_SAMPLE_RATE = 16000;

interface Loudness {
  /** Recent audio frames: arrival time (ms) and mean power. */
  frames: { at: number; power: number }[];
}

/**
 * LiveKit voice for one game room (PRD Section 10.5).
 * - Gives each player a token that can only publish a microphone.
 * - Joins the voice room itself as a hidden listener ("ears") and measures each player's
 *   loudness from the real audio, so nobody can fake being quiet to the ghost.
 * - Decides who receives whose voice, by distance, with server-side subscriptions.
 */
export class LiveKitVoice implements VoiceBackend {
  readonly enabled = true;
  private ears = new Room();
  private service: RoomServiceClient;
  private loudness = new Map<string, Loudness>();
  /** Track ids each listener is currently subscribed to (as requested by us). */
  private routes = new Map<string, Set<string>>();
  private pending = new Map<string, Promise<void>>();

  constructor(
    private roomName: string,
    private url: string,
    private apiKey: string,
    private apiSecret: string,
  ) {
    this.service = new RoomServiceClient(url.replace(/^ws/, "http"), apiKey, apiSecret);
  }

  async start() {
    this.ears.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind === TrackKind.KIND_AUDIO) void this.measure(track, participant);
    });
    const token = new AccessToken(this.apiKey, this.apiSecret, { identity: EARS_IDENTITY, ttl: "12h" });
    token.addGrant({ roomJoin: true, room: this.roomName, canPublish: false, canSubscribe: true, canPublishData: false, hidden: true });
    await this.ears.connect(this.url, await token.toJwt(), { autoSubscribe: true, dynacast: false });
  }

  async join(identity: string, name: string): Promise<VoiceJoin> {
    const token = new AccessToken(this.apiKey, this.apiSecret, { identity, name, ttl: "6h" });
    token.addGrant({
      roomJoin: true,
      room: this.roomName,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
    });
    return { url: this.url, token: await token.toJwt() };
  }

  /** Reads a player's audio and keeps its recent loudness. */
  private async measure(track: RemoteTrack, participant: RemoteParticipant) {
    const state: Loudness = { frames: [] };
    this.loudness.set(participant.identity, state);
    const stream = new AudioStream(track, LISTEN_SAMPLE_RATE, 1);
    try {
      for await (const frame of stream) {
        const db = rmsDbfs(frame.data);
        const power = Number.isFinite(db) ? 10 ** (db / 10) : 0;
        const now = Date.now();
        state.frames.push({ at: now, power });
        const cutoff = now - config.voice.subscriptionRefreshMs;
        while (state.frames.length > 0 && state.frames[0]!.at < cutoff) state.frames.shift();
      }
    } catch {
      // The track ended (player left or muted); loudness falls back to silence.
    }
    if (this.loudness.get(participant.identity) === state) this.loudness.delete(participant.identity);
  }

  levelDbfs(identity: string): number {
    const state = this.loudness.get(identity);
    if (!state || state.frames.length === 0) return -Infinity;
    const cutoff = Date.now() - config.voice.subscriptionRefreshMs;
    const recent = state.frames.filter((f) => f.at >= cutoff);
    if (recent.length === 0) return -Infinity;
    const mean = recent.reduce((s, f) => s + f.power, 0) / recent.length;
    return mean > 0 ? 10 * Math.log10(mean) : -Infinity;
  }

  micLive(identity: string): boolean {
    const p = this.ears.remoteParticipants.get(identity);
    if (!p) return false;
    for (const pub of p.trackPublications.values()) {
      if (pub.kind === TrackKind.KIND_AUDIO && !pub.muted) return true;
    }
    return false;
  }

  route(listener: string, speakers: ReadonlySet<string>) {
    const wanted = new Set<string>();
    for (const speaker of speakers) {
      const p = this.ears.remoteParticipants.get(speaker);
      if (!p) continue;
      for (const pub of p.trackPublications.values()) {
        if (pub.kind === TrackKind.KIND_AUDIO && pub.sid) wanted.add(pub.sid);
      }
    }
    const current = this.routes.get(listener) ?? new Set<string>();
    const add = [...wanted].filter((sid) => !current.has(sid));
    const drop = [...current].filter((sid) => !wanted.has(sid));
    if (add.length === 0 && drop.length === 0) return;
    this.routes.set(listener, wanted);

    // One request at a time per listener, in order.
    const previous = this.pending.get(listener) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        if (add.length) await this.service.updateSubscriptions(this.roomName, listener, add, true);
        if (drop.length) await this.service.updateSubscriptions(this.roomName, listener, drop, false);
      })
      .catch(() => {
        // The listener may not have joined voice yet; forget what we asked so the next refresh retries.
        this.routes.delete(listener);
      });
    this.pending.set(listener, next);
  }

  remove(identity: string) {
    this.routes.delete(identity);
    this.pending.delete(identity);
    this.loudness.delete(identity);
  }

  async dispose() {
    await this.ears.disconnect().catch(() => {});
  }
}

/** LiveKit voice if the server has keys (server/.env or the host's settings), otherwise voice is off. */
export function liveKitFromEnv(roomName: string): LiveKitVoice | null {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return new LiveKitVoice(roomName, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}
