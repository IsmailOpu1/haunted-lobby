import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { config, ROOM_NAME, type ServerMessages } from "@haunted/shared";
import { createGameServer } from "../app.ts";
import { HauntedRoom } from "../HauntedRoom.ts";
import type { VoiceBackend } from "./backend.ts";

/** A voice service the test controls: set each player's loudness and whether their mic works. */
class FakeVoice implements VoiceBackend {
  readonly enabled = true;
  levels = new Map<string, number>();
  deadMics = new Set<string>();
  routes = new Map<string, Set<string>>();
  async start() {}
  async join(identity: string) {
    return { url: "wss://fake.livekit", token: `token-for-${identity}` };
  }
  levelDbfs(identity: string) {
    return this.levels.get(identity) ?? -Infinity;
  }
  micLive(identity: string) {
    return !this.deadMics.has(identity);
  }
  route(listener: string, speakers: ReadonlySet<string>) {
    this.routes.set(listener, new Set(speakers));
  }
  remove() {}
  async dispose() {}
}

const PORT = 2597;
const endpoint = `ws://localhost:${PORT}`;
const server = createGameServer();
let fake: FakeVoice;
const originalFactory = HauntedRoom.voiceFactory;

beforeAll(async () => {
  HauntedRoom.voiceFactory = () => (fake = new FakeVoice());
  await server.listen(PORT);
});

afterAll(async () => {
  HauntedRoom.voiceFactory = originalFactory;
  await server.gracefullyShutdown(false);
});

function collect<K extends keyof ServerMessages>(room: Room, type: K): ServerMessages[K][] {
  const out: ServerMessages[K][] = [];
  room.onMessage(type, (m: ServerMessages[K]) => out.push(m));
  return out;
}

async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function joinPair() {
  const a = await new Client(endpoint).create(ROOM_NAME, { name: "Ana" });
  a.onMessage("*", () => {});
  const aMix = collect(a, "voiceMix");
  const b = await new Client(endpoint).joinById(a.roomId, { name: "Ben" });
  b.onMessage("*", () => {});
  await waitFor(() => a.state.players?.size === 2);
  return { a, b, aMix };
}

describe("voice in a room", () => {
  it("gives each player a voice pass", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Ana" });
    const passes = collect(a, "voice");
    a.onMessage("*", () => {});
    await waitFor(() => passes.length > 0);
    expect(passes[0]).toEqual({ url: "wss://fake.livekit", token: `token-for-${a.sessionId}` });
    await a.leave();
  });

  it("routes nearby living players to each other, with volume by loudness", async () => {
    const { a, b, aMix } = await joinPair();
    // Spawns are 6 m apart in the open Main Hall. Ben talks at the default normal level.
    fake.levels.set(b.sessionId, config.voice.defaultNormalDbfs);
    await waitFor(() => (aMix.at(-1)?.[b.sessionId]?.[0] ?? 0) > 0);
    expect(fake.routes.get(a.sessionId)?.has(b.sessionId)).toBe(true);
    const [volume, muffled] = aMix.at(-1)![b.sessionId]!;
    expect(volume).toBeGreaterThan(0.5);
    expect(muffled).toBe(0);

    // A whisper does not carry 6 m (whisper range is 3 m).
    fake.levels.set(b.sessionId, config.voice.defaultNormalDbfs - config.voice.whisperBelowNormalDb - 2);
    await waitFor(() => aMix.at(-1)?.[b.sessionId]?.[0] === 0);
    await Promise.all([a.leave(), b.leave()]);
  });

  it("keeps the dead out of the living's ears", async () => {
    const { a, b } = await joinPair();
    b.send("debug", { down: true });
    b.send("debug", { bleedLeft: 0.1 });
    await waitFor(() => a.state.players.get(b.sessionId)?.health === "dead");
    await waitFor(() => fake.routes.get(a.sessionId)?.has(b.sessionId) === false);
    expect(fake.routes.get(b.sessionId)?.has(a.sessionId)).toBe(false);
    await Promise.all([a.leave(), b.leave()]);
  });

  it("learns a player's normal volume from the mic check", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Ana" });
    a.onMessage("*", () => {});
    const results = collect(a, "micCheck");
    await waitFor(() => a.state.players?.get(a.sessionId) !== undefined);
    fake.levels.set(a.sessionId, -24);
    a.send("micCheck");
    await waitFor(() => results.length > 0, (config.voice.micCheckSec + 2) * 1000);
    expect(results[0]).toEqual({ ok: true, normalDbfs: -24 });
    await a.leave();
  }, 15000);

  it("fails the mic check when nothing is heard", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Quiet" });
    a.onMessage("*", () => {});
    const results = collect(a, "micCheck");
    await waitFor(() => a.state.players?.get(a.sessionId) !== undefined);
    a.send("micCheck");
    await waitFor(() => results.length > 0, (config.voice.micCheckSec + 2) * 1000);
    expect(results[0]?.ok).toBe(false);
    await a.leave();
  }, 15000);

  it("warns a player whose mic stops sending", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Muted" });
    a.onMessage("*", () => {});
    const lost = collect(a, "micLost");
    await waitFor(() => a.state.players?.get(a.sessionId) !== undefined);
    fake.deadMics.add(a.sessionId);
    await waitFor(() => lost.at(-1)?.lost === true, (config.voice.micLostAfterSec + 2) * 1000);
    fake.deadMics.delete(a.sessionId);
    await waitFor(() => lost.at(-1)?.lost === false);
    await a.leave();
  }, (config.voice.micLostAfterSec + 8) * 1000);
});
