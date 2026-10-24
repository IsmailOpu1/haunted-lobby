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
