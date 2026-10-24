import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { config, isValidRoomCode, ROOM_NAME, type ServerMessages } from "@haunted/shared";
import { createGameServer } from "./app.ts";

const PORT = 2599;
const server = createGameServer();
const endpoint = `ws://localhost:${PORT}`;

beforeAll(async () => {
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** Collects every message of one type a room receives. */
function collect<K extends keyof ServerMessages>(room: Room, type: K): ServerMessages[K][] {
  const received: ServerMessages[K][] = [];
  room.onMessage(type, (payload: ServerMessages[K]) => received.push(payload));
  return received;
}

async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("HauntedRoom", () => {
  it("lets a second player join by room code and both see the join message", async () => {
    const host = await new Client(endpoint).create(ROOM_NAME, { name: "Rafi" });
    const hostSystem = collect(host, "system");
    const hostRoster = collect(host, "roster");

    expect(isValidRoomCode(host.roomId)).toBe(true);

    const friend = await new Client(endpoint).joinById(host.roomId, { name: "Mim" });
    const friendRoster = collect(friend, "roster");

    await waitFor(() => hostSystem.some((m) => m.text === "Mim joined the room"));
    await waitFor(() => friendRoster.length > 0);

    expect(friend.roomId).toBe(host.roomId);
    const names = hostRoster.at(-1)!.players.map((p) => p.name).sort();
    expect(names).toEqual(["Mim", "Rafi"]);
    expect(friendRoster.at(-1)!.players).toHaveLength(2);

    await friend.leave();
    await waitFor(() => hostSystem.some((m) => m.text === "Mim left the room"));
    await host.leave();
  });

  it("rejects a join with an empty name", async () => {
    const host = await new Client(endpoint).create(ROOM_NAME, { name: "Sam" });
    await expect(new Client(endpoint).joinById(host.roomId, { name: "   " })).rejects.toThrow();
    await host.leave();
  });

  it("refuses an unknown room code", async () => {
    await expect(new Client(endpoint).joinById("ZZZZZ", { name: "Nila" })).rejects.toThrow();
  });

  it("moves a player with server-applied input and confirms the last input", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Walker" });
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);
    const startZ = me().z;

    // One second of walking north (yaw 0 faces -z). Spawn is in the open Main Hall.
    for (let seq = 1; seq <= config.net.tickRate; seq++) {
      room.send("input", { seq, forward: 1, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
    }
    await waitFor(() => me().lastSeq === config.net.tickRate);
    expect(startZ - me().z).toBeCloseTo(config.movement.walk, 1);
    await room.leave();
  });

  it("does not let a client move faster by flooding inputs", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Cheater" });
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);
    const startZ = me().z;

    // 30 inputs (1.5 s of movement) sent at once. After 2 server ticks the server
    // may have applied at most maxInputAheadSec plus those 2 ticks of movement.
    for (let seq = 1; seq <= 30; seq++) {
      room.send("input", { seq, forward: 1, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
    }
    await waitFor(() => me().lastSeq > 0);
    await new Promise((r) => setTimeout(r, 2 * (1000 / config.net.tickRate)));
    const maxSec = config.net.maxInputAheadSec + 4 / config.net.tickRate;
    expect(startZ - me().z).toBeLessThanOrEqual(config.movement.walk * maxSec + 0.01);
    await room.leave();
  });

  it("keeps up with a client sending 20 inputs per second (no growing backlog)", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Steady" });
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);

    // Pace inputs by wall-clock time, like the browser's fixed-step loop, for 4 seconds.
    const total = config.net.tickRate * 4;
    const stepMs = 1000 / config.net.tickRate;
    let seq = 0;
    let worstLag = 0;
    const start = performance.now();
    while (seq < total) {
      const due = Math.min(total, Math.floor((performance.now() - start) / stepMs));
      while (seq < due) room.send("input", { seq: ++seq, forward: 0, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
      if (performance.now() - start > 1000) worstLag = Math.max(worstLag, seq - me().lastSeq);
      await new Promise((r) => setTimeout(r, 16));
    }
    // Network and tick timing allow a few steps of delay, but it must not keep growing.
    expect(worstLag).toBeLessThanOrEqual(5);
    await room.leave();
  }, 15000);

  it("opens and closes a door when a player in range interacts", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Doorman" });
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);

    // Walk north from the spawn (z 6) toward the hall door at z 0 until within reach.
    let seq = 0;
    while (me().z > 1.2) {
      room.send("input", { seq: ++seq, forward: 1, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
      await new Promise((r) => setTimeout(r, 1000 / config.net.tickRate));
    }
    // Spawn 0 is at x -3; step sideways so the door at x 0 is within 2 m.
    while (me().x < -0.5) {
      room.send("input", { seq: ++seq, forward: 0, right: 1, run: false, crouch: false, yaw: 0, pitch: 0 });
      await new Promise((r) => setTimeout(r, 1000 / config.net.tickRate));
    }
    const door = () => room.state.doors.get("hall-corridor");
    expect(door().open).toBe(false);
    room.send("interact");
    await waitFor(() => door().open === true);
    room.send("interact");
    await waitFor(() => door().open === false);
    await room.leave();
  });

  it("toggles a player's flashlight", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Torch" });
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);
    expect(me().flashlightOn).toBe(true);
    room.send("flashlight");
    await waitFor(() => me().flashlightOn === false);
    await room.leave();
  });

  it("refuses players beyond the room limit", async () => {
    const rooms: Room[] = [await new Client(endpoint).create(ROOM_NAME, { name: "P1" })];
    const code = rooms[0]!.roomId;
    for (let i = 2; i <= config.players.max; i++) {
      rooms.push(await new Client(endpoint).joinById(code, { name: `P${i}` }));
    }
    await expect(new Client(endpoint).joinById(code, { name: "Extra" })).rejects.toThrow();
    await Promise.all(rooms.map((r) => r.leave()));
  });
});
