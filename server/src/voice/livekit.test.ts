import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for LiveKit's room: counts joins and leaves, never touches the network.
const rooms: { connects: number; disconnects: number }[] = [];
vi.mock("@livekit/rtc-node", () => {
  class Room {
    remoteParticipants = new Map();
    stats = { connects: 0, disconnects: 0 };
    constructor() {
      rooms.push(this.stats);
    }
    on() {}
    async connect() {
      this.stats.connects++;
    }
    async disconnect() {
      this.stats.disconnects++;
    }
  }
  return { Room, RoomEvent: { TrackSubscribed: "trackSubscribed" }, TrackKind: { KIND_AUDIO: 1 }, AudioStream: class {} };
});

const { LiveKitVoice, liveKitFromEnv } = await import("./livekit.ts");

const make = () => new LiveKitVoice("ABCDE-1", "wss://example.livekit.cloud", "key", "secret-that-is-long-enough-for-hmac");
const connects = () => rooms.reduce((n, r) => n + r.connects, 0);
const disconnects = () => rooms.reduce((n, r) => n + r.disconnects, 0);

describe("LiveKit voice minutes", () => {
  beforeEach(() => (rooms.length = 0));

  it("the server's listener joins only when the first player asks for voice", async () => {
    const voice = make();
    await voice.start();
    expect(connects()).toBe(0);
    await Promise.all([voice.join("a", "A"), voice.join("b", "B")]);
    expect(connects()).toBe(1);
  });

  it("the listener leaves when the last player in voice goes, and joins again for the next", async () => {
    const voice = make();
    await voice.join("a", "A");
    await voice.join("b", "B");
    voice.remove("a");
    expect(disconnects()).toBe(0);
    voice.remove("b");
    expect(disconnects()).toBe(1);
    await voice.join("c", "C");
    expect(connects()).toBe(2);
    await voice.dispose();
    expect(disconnects()).toBe(2);
  });

  describe("the development server", () => {
    const saved = { ...process.env };
    beforeEach(() => Object.assign(process.env, { LIVEKIT_URL: "wss://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" }));
    afterEach(() => {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    });

    it("leaves voice off, even with keys, unless LIVEKIT_IN_DEV=1", () => {
      process.env.npm_lifecycle_event = "dev";
      delete process.env.LIVEKIT_IN_DEV;
      expect(liveKitFromEnv("r")).toBeNull();
      process.env.LIVEKIT_IN_DEV = "1";
      expect(liveKitFromEnv("r")).not.toBeNull();
    });

    it("the live server (npm start) has voice", () => {
      process.env.npm_lifecycle_event = "start";
      expect(liveKitFromEnv("r")).not.toBeNull();
    });
  });
});
