// What the game room needs from a voice service (PRD Section 10.5). The real one is LiveKit;
// tests use a fake, and when no LiveKit keys are set, voice is simply off.

export interface VoiceJoin {
  url: string;
  token: string;
}

export interface VoiceBackend {
  readonly enabled: boolean;
  /** Connects the server's listener. Call once after creating. */
  start(): Promise<void>;
  /** Join details for one player's game, or null when voice is off. */
  join(identity: string, name: string): Promise<VoiceJoin | null>;
  /** This player's loudness over the last moment in dBFS, measured by the server from the real audio. */
  levelDbfs(identity: string): number;
  /** True while this player has a working, unmuted microphone in the voice room. */
  micLive(identity: string): boolean;
  /** Which speakers this listener should receive. The server decides; clients never do. */
  route(listener: string, speakers: ReadonlySet<string>): void;
  remove(identity: string): void;
  dispose(): Promise<void>;
}

/** Voice is off (no LiveKit keys): nobody talks, the game still works. */
export class NoVoice implements VoiceBackend {
  readonly enabled = false;
  async start() {}
  async join() {
    return null;
  }
  levelDbfs() {
    return -Infinity;
  }
  micLive() {
    return true; // never report a lost mic when voice is off
  }
  route() {}
  remove() {}
  async dispose() {}
}
