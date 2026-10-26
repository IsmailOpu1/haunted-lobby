import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { config, isValidRoomCode, ROOM_NAME, type ServerMessages } from "@haunted/shared";
import { createGameServer } from "./app.ts";
import { marrowHotelGreybox } from "@haunted/maps";

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

function collectMsgs<K extends keyof ServerMessages>(room: Room, type: K): ServerMessages[K][] {
  const out: ServerMessages[K][] = [];
  room.onMessage(type, (m: ServerMessages[K]) => out.push(m));
  return out;
}

/** Walks a player to a point by sending real movement inputs. Returns the last input seq used. */
async function walkTo(room: Room, target: { x: number; z: number }, startSeq = 0): Promise<number> {
  let seq = startSeq;
  const me = () => room.state.players.get(room.sessionId);
  for (let i = 0; i < 400; i++) {
    const dx = target.x - me().x;
    const dz = target.z - me().z;
    if (Math.hypot(dx, dz) < 0.15) break;
    room.send("input", { seq: ++seq, forward: 1, right: 0, run: false, crouch: false, yaw: Math.atan2(-dx, -dz), pitch: 0 });
    await new Promise((r) => setTimeout(r, 1000 / config.net.tickRate));
  }
  // Let the server apply the last inputs.
  await new Promise((r) => setTimeout(r, 200));
  return seq;
}

async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Creates rooms until the player is given a task matching `want` (tasks are random). */
async function createWithTask(want: (stationId: string) => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Worker" });
    room.onMessage("*", () => {});
    const tasks = collectMsgs(room, "tasks");
    room.send("tasksRequest");
    await waitFor(() => tasks.length > 0);
    if (tasks[0]!.list.some((t) => want(t.stationId))) return { room, tasks };
    await room.leave();
  }
  throw new Error("The wanted task was never assigned");
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
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => door().open === true);
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => door().open === false);
    await room.leave();
  });

  it("downs a player, who bleeds out and dies unless revived", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Victim" });
    room.onMessage("*", () => {});
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);

    room.send("debug", { down: true });
    await waitFor(() => me().health === "downed");
    expect(me().flashlightOn).toBe(false);
    expect(me().bleedLeft).toBeGreaterThan(config.health.bleedOutSec - 1);
    room.send("flashlight"); // items cannot be used while downed
    room.send("debug", { bleedLeft: 0.2 });
    await waitFor(() => me().health === "dead");
    expect(me().flashlightOn).toBe(false);
    await room.leave();
  });

  it("lets a teammate revive a downed player by holding E for 5 seconds", async () => {
    const helper = await new Client(endpoint).create(ROOM_NAME, { name: "Helper" });
    helper.onMessage("*", () => {});
    const victim = await new Client(endpoint).joinById(helper.roomId, { name: "Hurt" });
    victim.onMessage("*", () => {});
    await waitFor(() => helper.state.players?.size === 2);
    const hurt = () => helper.state.players.get(victim.sessionId);

    // Spawns are at (-3, 6) and (3, 6). The helper walks east until next to the victim.
    await walkTo(helper, { x: 2, z: 6 });
    victim.send("debug", { down: true });
    await waitFor(() => hurt().health === "downed");

    helper.send("use", { down: true });
    await waitFor(() => helper.state.players.get(helper.sessionId).action === "revive");
    await new Promise((r) => setTimeout(r, (config.health.reviveSec - 1) * 1000));
    expect(hurt().health).toBe("downed");
    await waitFor(() => hurt().health === "alive", 3000);
    expect(hurt().flashlightOn).toBe(true);
    await Promise.all([helper.leave(), victim.leave()]);
  }, 20000);

  it("hides in a wardrobe, holds breath, and steps out again", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Hider" });
    room.onMessage("*", () => {});
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);

    // The west wardrobe in the Main Hall: exit point (-6.7, 3).
    const seq = await walkTo(room, { x: -6.7, z: 3 });
    room.send("use", { down: true });
    await waitFor(() => me().hidingSpot === "hall-wardrobe-west", 3000);
    room.send("use", { down: false });
    expect(me().x).toBeCloseTo(-7.6, 1);

    // Moving does nothing while hidden; Shift holds breath.
    let s = seq;
    for (let i = 0; i < 10; i++) room.send("input", { seq: ++s, forward: 1, right: 0, run: true, crouch: false, yaw: 0, pitch: 0 });
    await waitFor(() => me().holdingBreath === true);
    expect(me().x).toBeCloseTo(-7.6, 1);

    room.send("use", { down: true });
    await waitFor(() => me().hidingSpot === "", 3000);
    expect(me().x).toBeCloseTo(-6.7, 1);
    expect(me().holdingBreath).toBe(false);
    await room.leave();
  }, 20000);

  it("starts the night, wakes the ghost after the quiet part, and tells only nearby players where it is", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Watcher" });
    const ghostMsgs: unknown[] = [];
    room.onMessage("*", () => {});
    room.onMessage("ghost", (m: unknown) => ghostMsgs.push(m));
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);

    await new Promise((r) => setTimeout(r, 300));
    expect(room.state.part).toBe("quiet");
    expect(ghostMsgs).toEqual([]); // asleep

    room.send("debug", { nightTime: config.match.quietSec + 1 });
    await waitFor(() => room.state.part === "calm");
    // The ghost wakes in the Kitchen, within interest range of the Main Hall spawn.
    await waitFor(() => ghostMsgs.length > 0);
    expect(ghostMsgs.at(-1)).toMatchObject({ visible: false });
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

  it("pours salt in front of you (1 s, uses a handful) and refills from a jar", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Salter" });
    room.onMessage("*", () => {});
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);
    expect(me().salt).toBe(config.salt.perPlayer);

    room.send("pourSalt");
    await waitFor(() => me().action === "salt");
    await waitFor(() => room.state.saltLines.size === 1, 3000);
    expect(me().salt).toBe(config.salt.perPlayer - 1);
    let line: { x: number; z: number } | undefined;
    room.state.saltLines.forEach((l: { x: number; z: number }) => (line = l));
    // Spawn 0 is (-3, 6) facing north: the line lands 1 m ahead.
    expect(line!.x).toBeCloseTo(-3, 1);
    expect(line!.z).toBeCloseTo(6 - config.salt.placeAheadM, 1);

    // The jar at (-6.5, 11) gives one handful back, once.
    await walkTo(room, { x: -6.5, z: 10.2 });
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => me().salt === config.salt.perPlayer);
    expect(room.state.saltJars.get("jar-hall-1").taken).toBe(true);
    await room.leave();
  }, 20000);

  it("uses a camera shot, flashes for players nearby, and has no shots after the last one", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Snap" });
    a.onMessage("*", () => {});
    const taken = collectMsgs(a, "photoTaken");
    const b = await new Client(endpoint).joinById(a.roomId, { name: "Model" });
    b.onMessage("*", () => {});
    const flashes = collectMsgs(b, "flash");
    await waitFor(() => a.state.players?.size === 2);

    a.send("photo");
    await waitFor(() => taken.length === 1);
    expect(taken[0]).toEqual({ shotsLeft: config.camera.shotsPerPlayer - 1 });
    await waitFor(() => flashes.length === 1); // 6 m away, within 15 m
    await waitFor(() => a.state.players.get(a.sessionId).cameraShots === 0);

    a.send("photo"); // no film left: nothing happens
    await new Promise((r) => setTimeout(r, 300));
    expect(taken).toHaveLength(1);
    await Promise.all([a.leave(), b.leave()]);
  });

  it("gives 3 tasks in different rooms, refuses a too-fast finish, and counts a real one", async () => {
    // Use the clock, in the Main Hall where players start (no doors to open).
    const { room, tasks } = await createWithTask((id) => id === "task-clock");
    const list = tasks[0]!.list;
    expect(list).toHaveLength(config.tasks.perPlayer);
    expect(new Set(list.map((t) => t.room)).size).toBe(list.length);
    await waitFor(() => room.state.tasksTotal === config.tasks.perPlayer);

    const opened = collectMsgs(room, "taskOpen");
    const closed = collectMsgs(room, "taskClosed");
    let seq = await walkTo(room, { x: 0, z: 10.4 });
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 1);
    expect(opened[0]).toEqual({ stationId: "task-clock", minigame: "clock" });

    // Claiming it done straight away is refused: the minigame takes longer than that.
    room.send("taskDone", { stationId: "task-clock" });
    await waitFor(() => closed.length === 1);
    expect(closed[0]!.reason).toBe("cancelled");
    expect(room.state.tasksDone).toBe(0);

    // Walking away from the station closes it.
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 2);
    seq = await walkTo(room, { x: 0, z: 8.5 }, seq);
    await waitFor(() => closed.length === 2);
    expect(closed[1]!.reason).toBe("cancelled");
    await walkTo(room, { x: 0, z: 10.4 }, seq);

    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 3);
    await new Promise((r) => setTimeout(r, (config.tasks.serverMinSec + 0.5) * 1000));
    room.send("taskDone", { stationId: "task-clock" });
    await waitFor(() => closed.length === 3);
    expect(closed[2]!.reason).toBe("done");
    await waitFor(() => room.state.tasksDone === 1);
    expect(room.state.stations.get("task-clock").done).toBe(true); // visible task: the clock swings
    await waitFor(() => tasks.at(-1)!.list.find((t) => t.stationId === "task-clock")!.done);
    await room.leave();
  }, 40000);

  it("lets players nearby hear a botched noisy task, at most once a second", async () => {
    const { room, tasks } = await createWithTask((id) => id === "task-piano" || id === "task-cradle");
    const id = tasks[0]!.list.find((t) => t.stationId === "task-piano" || t.stationId === "task-cradle")!.stationId;
    const station = marrowHotelGreybox.tasks.find((t) => t.id === id)!;
    const friend = await new Client(endpoint).joinById(room.roomId, { name: "Listener" });
    friend.onMessage("*", () => {});
    const heard = collectMsgs(friend, "taskNoise");
    await waitFor(() => room.state.players.size === 2);
    // The friend stands a few metres away, well inside the 10 m the noise carries.
    await walkTo(friend, { x: station.x / 2, z: 7 });

    const opened = collectMsgs(room, "taskOpen");
    await walkTo(room, { x: station.x - Math.sign(station.x), z: station.z });
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 1);

    room.send("taskNoise");
    room.send("taskNoise"); // too soon after the first: ignored
    await waitFor(() => heard.length === 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toEqual({ x: station.x, z: station.z, minigame: station.minigame });
    await Promise.all([room.leave(), friend.leave()]);
  }, 40000);

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
