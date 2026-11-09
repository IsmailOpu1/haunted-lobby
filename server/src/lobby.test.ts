import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker } from "colyseus";
import { CHARACTERS, config, presetSettings, ROOM_NAME, type MatchSettings, type ServerMessages } from "@haunted/shared";
import { createGameServer } from "./app.ts";

// The lobby, settings and rematch (Phase 7: GDD 5, 19, 20; FR-L3 to FR-L10).

const PORT = 2601;
const server = createGameServer();
const endpoint = `ws://localhost:${PORT}`;

beforeAll(async () => {
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function collect<K extends keyof ServerMessages>(room: Room, type: K): ServerMessages[K][] {
  const out: ServerMessages[K][] = [];
  room.onMessage(type, (m: ServerMessages[K]) => out.push(m));
  return out;
}

async function lobby(players: number) {
  const host = await new Client(endpoint).create(ROOM_NAME, { name: "P1" });
  const rooms: Room[] = [host];
  for (let i = 2; i <= players; i++) rooms.push(await new Client(endpoint).joinById(host.roomId, { name: `P${i}` }));
  for (const r of rooms) r.onMessage("*", () => {});
  const server = matchMaker.getLocalRoomById(host.roomId) as any;
  return { host, rooms, server };
}

/** Everyone picks a different character and presses Ready. */
async function allReady(rooms: Room[]) {
  rooms.forEach((r, i) => r.send("character", { id: CHARACTERS[i]!.id }));
  await pause(100);
  for (const r of rooms) r.send("ready", { ready: true });
  await waitFor(() => rooms.every((r) => r.state.players.get(r.sessionId)?.ready === true));
}

const settingsOf = (room: Room): MatchSettings => JSON.parse(room.state.settings);

describe("the lobby (GDD 5)", () => {
  it("one character per player, Ready needs a character, and Start needs everyone Ready", async () => {
    const { host, rooms } = await lobby(4);
    const refused = collect(rooms[1]!, "lobbyRefused");
    const startRefused = collect(host, "startRefused");
    // Ready without a character is refused.
    rooms[1]!.send("ready", { ready: true });
    await waitFor(() => refused.length === 1);
    expect(refused[0]!.reason).toMatch(/character/);
    // Two players cannot hold the same character.
    host.send("character", { id: "nurse" });
    await waitFor(() => host.state.players.get(host.sessionId).character === "nurse");
    rooms[1]!.send("character", { id: "nurse" });
    await waitFor(() => refused.length === 2);
    expect(rooms[1]!.state.players.get(rooms[1]!.sessionId).character).toBe("");
    // Start with someone not Ready is refused and names who.
    host.send("start");
    await waitFor(() => startRefused.length === 1);
    expect(startRefused[0]!.reason).toMatch(/Waiting for/);
    expect(host.state.stage).toBe("waiting");
    await allReady(rooms);
    host.send("start");
    await waitFor(() => host.state.stage === "countdown");
    // Un-readying during the countdown stops it.
    rooms[2]!.send("ready", { ready: false });
    await waitFor(() => host.state.stage === "waiting");
    await Promise.all(rooms.map((r) => r.leave()));
  });

  it("only the host changes settings; everyone sees them at once, and they lock at the countdown (FR-L5, FR-L7)", async () => {
    const { host, rooms } = await lobby(2);
    expect(host.state.settingsCode).toBe(`STD-${config.match.lengthMin}-PA`);
    // A guest's change does nothing.
    rooms[1]!.send("settings", { change: { lengthMin: 10 } });
    await pause(200);
    expect(settingsOf(host).lengthMin).toBe(config.match.lengthMin);
    // The host's change reaches the others within a second.
    const sent = Date.now();
    host.send("settings", { change: { lengthMin: 12, possessed: 1 } });
    await waitFor(() => rooms[1]!.state.settingsCode === "CUS-12-P1", 1000);
    expect(Date.now() - sent).toBeLessThan(1000);
    expect(rooms[1]!.state.nightLength).toBe(12 * 60);
    // A value that is not listed is refused.
    const refused = collect(host, "lobbyRefused");
    host.send("settings", { change: { lengthMin: 13 } });
    await waitFor(() => refused.length === 1);
    // A preset.
    host.send("settings", { preset: "hardcore" });
    await waitFor(() => host.state.settingsCode === "HRD-10-PA");
    expect(settingsOf(rooms[1]!)).toEqual(presetSettings("hardcore", settingsOf(host).map));
    // Locked from the countdown.
    await allReady(rooms);
    host.send("start");
    await waitFor(() => host.state.stage === "countdown");
    host.send("settings", { preset: "standard" });
    await waitFor(() => refused.length === 2);
    expect(host.state.settingsCode).toBe("HRD-10-PA");
    await Promise.all(rooms.map((r) => r.leave()));
  });

  it("the night plays by the settings (GDD 20)", async () => {
    const { host, rooms, server } = await lobby(2);
    host.send("settings", { change: { relics: 2, tasksPerPlayer: 4, cameraShots: 3, saltPerPlayer: 4, bellUses: 0, blackout: false, difficulty: "hard", ritualSec: 30, circle: 3, mystery: false } });
    await waitFor(() => host.state.relics.size === 2);
    const me = host.state.players.get(host.sessionId);
    expect([me.cameraShots, me.salt, me.bellUses]).toEqual([3, 4, 0]);
    expect(host.state.tasksTotal).toBe(2 * 4);
    expect(server.ghostSuspect).toBeNull();
    expect(server.ghost.difficulty).toBe("hard");
    host.send("debug", { possessed: true });
    await pause(100);
    host.send("debug", { startNow: true });
    await waitFor(() => host.state.stage === "night");
    // Blackout off counts as used.
    expect(server.powerStatus(server.sims.get(host.sessionId), "blackout").state).toBe("used");
    await waitFor(() => host.state.circleNeeded === 3);
    await Promise.all(rooms.map((r) => r.leave()));
  });

  it("the host can remove a player in the lobby, freeing their character (FR-L8)", async () => {
    const { host, rooms } = await lobby(3);
    const kicked = collect(rooms[2]!, "kicked");
    rooms[2]!.send("character", { id: "priest" });
    await waitFor(() => host.state.players.get(rooms[2]!.sessionId)?.character === "priest");
    // A guest cannot kick.
    rooms[1]!.send("kick", { target: rooms[2]!.sessionId });
    await pause(200);
    expect(host.state.players.size).toBe(3);
    host.send("kick", { target: rooms[2]!.sessionId });
    await waitFor(() => host.state.players.size === 2);
    expect(kicked[0]!.reason).toMatch(/removed you/);
    host.send("character", { id: "priest" });
    await waitFor(() => host.state.players.get(host.sessionId).character === "priest");
    // A kicked player can join again (GDD 26.14).
    const back = await new Client(endpoint).joinById(host.roomId, { name: "P3" });
    await waitFor(() => host.state.players.size === 3);
    await Promise.all([host, rooms[1]!, back].map((r) => r.leave()));
  });

  it("refuses a ninth player (FR-L9)", async () => {
    const { host, rooms } = await lobby(config.players.max);
    await expect(new Client(endpoint).joinById(host.roomId, { name: "Ninth" })).rejects.toThrow();
    await Promise.all(rooms.map((r) => r.leave()));
  });
});

describe("rematch (GDD 19, FR-L10)", () => {
  it("only the host takes everyone back to a fresh lobby, keeping characters and settings", async () => {
    const { host, rooms, server } = await lobby(4);
    host.send("settings", { change: { lengthMin: 10 } });
    await allReady(rooms);
    host.send("debug", { startNow: true });
    await waitFor(() => host.state.stage === "night");
    // End the night: dawn.
    host.send("debug", { nightTime: 1e6 });
    await waitFor(() => host.state.winner !== "");
    // A guest's rematch does nothing.
    rooms[1]!.send("rematch");
    await pause(200);
    expect(host.state.winner).not.toBe("");
    host.send("rematch");
    await waitFor(() => host.state.stage === "waiting" && host.state.winner === "");
    expect(host.state.nightLength).toBe(10 * 60);
    expect(host.state.ritualProgress).toBe(0);
    rooms.forEach((r, i) => {
      const p = host.state.players.get(r.sessionId);
      expect(p.character).toBe(CHARACTERS[i]!.id);
      expect(p.ready).toBe(false);
      expect(p.health).toBe("alive");
    });
    expect(host.state.tasksTotal).toBe(4 * config.tasks.perPlayer);
    // A second night starts in the same room.
    await allReady(rooms);
    host.send("start");
    await waitFor(() => host.state.stage === "countdown");
    await Promise.all(rooms.map((r) => r.leave()));
  });

  it("over 10 rematches with one possessed, nobody is possessed twice before everyone has been once", async () => {
    const { host, rooms, server } = await lobby(5);
    const roles = rooms.map((r) => collect(r, "role"));
    const order: number[] = [];
    for (let round = 0; round < 10; round++) {
      host.send("debug", { startNow: true });
      await waitFor(() => roles.every((r) => r.length === round + 1));
      order.push(roles.findIndex((r) => r[round]!.role === "possessed"));
      host.send("debug", { nightTime: 1e6 });
      await waitFor(() => host.state.winner !== "");
      host.send("rematch");
      await waitFor(() => host.state.stage === "waiting" && host.state.winner === "");
    }
    // Rounds 1-5 and 6-10 each possess all five players once.
    expect(new Set(order.slice(0, 5)).size).toBe(5);
    expect(new Set(order.slice(5, 10)).size).toBe(5);
    await Promise.all(rooms.map((r) => r.leave()));
  }, 30000);
});
