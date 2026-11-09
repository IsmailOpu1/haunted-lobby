import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker } from "colyseus";
import { CHARACTERS, config, presetSettings, ROOM_NAME, type MatchSettings, type ServerMessages } from "@haunted/shared";
import { createGameServer } from "./app.ts";
import { HauntedRoom } from "./HauntedRoom.ts";

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

/** Everyone presses Ready. */
async function allReady(rooms: Room[]) {
  for (const r of rooms) r.send("ready", { ready: true });
  await waitFor(() => rooms.every((r) => r.state.players.get(r.sessionId)?.ready === true));
}

const settingsOf = (room: Room): MatchSettings => JSON.parse(room.state.settings);

describe("the lobby (GDD 5)", () => {
  it("nobody picks a character, and Start needs everyone Ready", async () => {
    const { host, rooms } = await lobby(4);
    const startRefused = collect(host, "startRefused");
    // Nobody has a character in the lobby: they are dealt when the night starts (GDD 26.14).
    await waitFor(() => host.state.players?.size === 4);
    expect(rooms.every((r) => host.state.players.get(r.sessionId)?.character === "")).toBe(true);
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

  it("the host can remove a player in the lobby (FR-L8)", async () => {
    const { host, rooms } = await lobby(3);
    const kicked = collect(rooms[2]!, "kicked");
    // A guest cannot kick.
    rooms[1]!.send("kick", { target: rooms[2]!.sessionId });
    await pause(200);
    expect(host.state.players.size).toBe(3);
    host.send("kick", { target: rooms[2]!.sessionId });
    await waitFor(() => host.state.players.size === 2);
    expect(kicked[0]!.reason).toMatch(/removed you/);
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
  it("only the host takes everyone back to a fresh lobby, keeping settings; characters are dealt anew", async () => {
    const { host, rooms, server } = await lobby(4);
    host.send("settings", { change: { lengthMin: 10 } });
    await allReady(rooms);
    host.send("debug", { startNow: true });
    await waitFor(() => host.state.stage === "night");
    // Everyone was dealt a different character (GDD 26.14).
    await waitFor(() => rooms.every((r) => host.state.players.get(r.sessionId)?.character !== ""));
    const dealt = rooms.map((r) => host.state.players.get(r.sessionId).character as string);
    expect(new Set(dealt).size).toBe(4);
    expect(dealt.every((id) => CHARACTERS.some((c) => c.id === id))).toBe(true);
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
    rooms.forEach((r) => {
      const p = host.state.players.get(r.sessionId);
      // Back in the deck until the next night deals again.
      expect(p.character).toBe("");
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

  it("the end screen has a timeline and awards, and Rematch writes the match log with rematch: true (PRD 10.6)", async () => {
    const logs: any[] = [];
    const sink = HauntedRoom.matchLogSink;
    HauntedRoom.matchLogSink = (r) => logs.push(r);
    try {
      const { host, rooms } = await lobby(4);
      const ends = collect(host, "matchEnd");
      rooms[1]!.send("debug", { possessed: true });
      await pause(100);
      host.send("debug", { startNow: true });
      await waitFor(() => host.state.stage === "night");
      // An investigator is downed and bleeds out: a death on the timeline, and Ghost Bait.
      rooms[2]!.send("debug", { down: true, bleedLeft: 0.05 });
      await waitFor(() => host.state.players.get(rooms[2]!.sessionId).health === "dead");
      host.send("debug", { nightTime: 1e6 });
      await waitFor(() => ends.length === 1);
      expect(ends[0]!.timeline.map((l) => l.text)).toContain("P3 died");
      expect(ends[0]!.awards.find((a) => a.title === "Ghost Bait")?.names).toEqual(["P3"]);
      expect(logs).toHaveLength(0);
      host.send("rematch");
      await waitFor(() => logs.length === 1);
      expect(logs[0]).toMatchObject({ players: 4, possessed: 1, winner: "possessed", rematch: true });
      expect(logs[0].deaths).toEqual([expect.objectContaining({ cause: "bled out", role: "investigator" })]);
      expect(JSON.stringify(logs[0])).not.toMatch(/P[1-4]"/);
      await Promise.all(rooms.map((r) => r.leave()));
    } finally {
      HauntedRoom.matchLogSink = sink;
    }
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

describe("disconnect and reconnect (GDD 18, FR-E7)", () => {
  /** Drops a client's connection without leaving, as a lost Wi-Fi would. */
  function drop(room: Room) {
    room.reconnection.enabled = false;
    room.connection.close(4010, "test drop");
  }

  it("a dropped player freezes in place, and returns within the hold with the same role and tasks", async () => {
    const { host, rooms, server } = await lobby(4);
    const ghoul = rooms[1]!;
    ghoul.send("debug", { possessed: true });
    await pause(100);
    host.send("debug", { startNow: true });
    await waitFor(() => host.state.stage === "night");
    const id = ghoul.sessionId;
    const tasksBefore = JSON.stringify(server.sims.get(id).tasks);
    const token = ghoul.reconnectionToken;
    drop(ghoul);
    await waitFor(() => host.state.players.get(id)?.connected === false);
    // Still in the night: the ghost can still reach the frozen character.
    expect(host.state.players.has(id)).toBe(true);
    const back = await new Client(endpoint).reconnect(token);
    const roles = collect(back, "role");
    back.onMessage("*", () => {});
    await waitFor(() => roles.length === 1);
    expect(back.sessionId).toBe(id);
    expect(roles[0]!.role).toBe("possessed");
    expect(JSON.stringify(server.sims.get(id).tasks)).toBe(tasksBefore);
    await waitFor(() => host.state.players.get(id)?.connected === true);
    await Promise.all([host, rooms[2]!, rooms[3]!, back].map((r) => r.leave()));
  });

  it("a player who never returns is out: their relic drops and the end screen still shows their role", async () => {
    const { host, rooms, server } = await lobby(5);
    const roleMsgs = collect(rooms[4]!, "role");
    const ends = collect(host, "matchEnd");
    host.send("debug", { startNow: true });
    await waitFor(() => roleMsgs.length === 1);
    const gone = rooms[4]!;
    const id = gone.sessionId;
    // They carry a relic.
    server.state.relics.get("R1").status = "carried";
    server.state.relics.get("R1").carrier = id;
    server.state.players.get(id).relic = "R1";
    drop(gone);
    await waitFor(() => server.held.has(id));
    // The 60 s run out (ended early here).
    server.held.get(id).reject(new Error("timed out"));
    await waitFor(() => !host.state.players.has(id));
    expect(host.state.relics.get("R1").status).toBe("dropped");
    host.send("debug", { nightTime: 1e6 });
    await waitFor(() => ends.length === 1);
    expect(ends[0]!.roles.find((r) => r.name === "P5")?.role).toBe(roleMsgs[0]!.role);
    await Promise.all(rooms.slice(0, 4).map((r) => r.leave()));
  });

  it("the host's rights pass on while the host is away (GDD 18)", async () => {
    const { host, rooms } = await lobby(3);
    drop(host);
    await waitFor(() => rooms[1]!.state.host === rooms[1]!.sessionId);
    await Promise.all(rooms.slice(1).map((r) => r.leave()));
  });
});

describe("Phase 7 Done when (PRD 11)", () => {
  it("8 players can start, finish, rematch and change settings without restarting anything", async () => {
    const { host, rooms, server } = await lobby(config.players.max);
    const ends = collect(host, "matchEnd");
    const roles = rooms.map((r) => collect(r, "role"));
    const stageWait = (stage: string) => waitFor(() => host.state.stage === stage, (config.match.countdownSec + config.match.introSec + 3) * 1000);

    // Night 1 on Standard: everyone Ready, the host starts, countdown, intro, night.
    await allReady(rooms);
    host.send("start");
    await stageWait("night");
    expect(roles.every((r) => r.length === 1)).toBe(true);
    expect(roles.filter((r) => r[0]!.role === "possessed")).toHaveLength(2);
    expect(host.state.nightLength).toBe(config.match.lengthMin * 60);
    // It finishes (dawn).
    host.send("debug", { nightTime: 1e6 });
    await waitFor(() => ends.length === 1);
    expect(ends[0]!.roles).toHaveLength(8);

    // Rematch, then the host switches to Hardcore.
    host.send("rematch");
    await waitFor(() => host.state.stage === "waiting" && host.state.winner === "");
    host.send("settings", { preset: "hardcore" });
    await waitFor(() => host.state.settingsCode === "HRD-10-PA");
    // Ready again, start again.
    for (const r of rooms) r.send("ready", { ready: true });
    await waitFor(() => rooms.every((r) => host.state.players.get(r.sessionId)?.ready === true));
    host.send("start");
    await stageWait("night");

    // Night 2 plays by Hardcore: 10 minutes, 4 tasks each (the 2 possessed's are fake), 1 salt.
    expect(roles.every((r) => r.length === 2)).toBe(true);
    expect(host.state.nightLength).toBe(10 * 60);
    expect(host.state.tasksTotal).toBe(6 * 4);
    expect(host.state.players.get(host.sessionId).salt).toBe(1);
    expect(server.ghost.difficulty).toBe("hard");
    host.send("debug", { nightTime: 1e6 });
    await waitFor(() => ends.length === 2);
    await Promise.all(rooms.map((r) => r.leave()));
  }, 60000);
});
