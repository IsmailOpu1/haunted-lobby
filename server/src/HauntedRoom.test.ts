import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker } from "colyseus";
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

/** Skips the host's countdown and the intro (debug servers only): roles are dealt and the night starts. */
async function night(host: Room) {
  host.send("debug", { startNow: true });
  await waitFor(() => host.state.stage === "night");
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

    // Walk north from spawn 0 toward the Main Hall's door until within reach.
    const def = marrowHotelGreybox.doors.find((d) => d.id === "hall-front")!;
    await walkTo(room, { x: def.x, z: def.z + 1.5 });
    expect(Math.hypot(me().x - def.x, me().z - def.z)).toBeLessThan(config.interact.rangeM);
    const door = () => room.state.doors.get(def.id);
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
    await night(room);
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
    // The only investigator is dead: the possessed win (GDD 18).
    await waitFor(() => room.state.winner === "possessed");
    expect(room.state.endReason).toBe("allDead");
    await room.leave();
  });

  it("lets a teammate revive a downed player by holding E for 5 seconds", async () => {
    const helper = await new Client(endpoint).create(ROOM_NAME, { name: "Helper" });
    helper.onMessage("*", () => {});
    const victim = await new Client(endpoint).joinById(helper.roomId, { name: "Hurt" });
    victim.onMessage("*", () => {});
    await night(helper);
    await waitFor(() => helper.state.players?.size === 2);
    const hurt = () => helper.state.players.get(victim.sessionId);

    // The helper walks from spawn 0 until next to the victim at spawn 1.
    const [, at] = marrowHotelGreybox.spawns;
    await walkTo(helper, { x: at!.x - 1, z: at!.z });
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
    await night(room);
    room.onMessage("*", () => {});
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    const me = () => room.state.players.get(room.sessionId);

    // The west wardrobe in the Main Hall.
    const spot = marrowHotelGreybox.hidingSpots.find((h) => h.id === "hall-wardrobe-west")!;
    const seq = await walkTo(room, spot.exit);
    room.send("use", { down: true });
    await waitFor(() => me().hidingSpot === spot.id, 3000);
    room.send("use", { down: false });
    expect(me().z).toBeCloseTo(spot.z, 1);

    // Moving does nothing while hidden; Shift holds breath.
    let s = seq;
    for (let i = 0; i < 10; i++) room.send("input", { seq: ++s, forward: 1, right: 0, run: true, crouch: false, yaw: 0, pitch: 0 });
    await waitFor(() => me().holdingBreath === true);
    expect(me().z).toBeCloseTo(spot.z, 1);

    room.send("use", { down: true });
    await waitFor(() => me().hidingSpot === "", 3000);
    expect(me().z).toBeCloseTo(spot.exit.z, 1);
    expect(me().holdingBreath).toBe(false);
    await room.leave();
  }, 20000);

  it("starts the night, wakes the ghost after the quiet part, and tells only nearby players where it is", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Watcher" });
    await night(room);
    const ghostMsgs: unknown[] = [];
    room.onMessage("*", () => {});
    room.onMessage("ghost", (m: unknown) => ghostMsgs.push(m));
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);

    await new Promise((r) => setTimeout(r, 300));
    expect(room.state.part).toBe("quiet");
    expect(ghostMsgs).toEqual([]); // asleep

    // Far from the ghost's room, nothing is said about it; next to it, its position is sent.
    room.send("debug", { nightTime: config.match.quietSec + 1 });
    await waitFor(() => room.state.part === "calm");
    await new Promise((r) => setTimeout(r, 300));
    expect(ghostMsgs).toEqual([]);
    room.send("debug", { teleport: marrowHotelGreybox.ghostStart! });
    await waitFor(() => ghostMsgs.length > 0);
    expect(ghostMsgs.at(-1)).toMatchObject({ visible: false });
    await room.leave();
  });

  it("sends the ghost away and brings it back with the debug key (debug servers only)", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Tester" });
    await night(room);
    const ghostMsgs: unknown[] = [];
    const pauses: boolean[] = [];
    room.onMessage("*", () => {});
    room.onMessage("ghost", (m: unknown) => ghostMsgs.push(m));
    room.onMessage("debugGhost", (m: { paused: boolean }) => pauses.push(m.paused));
    await waitFor(() => room.state.players?.get(room.sessionId) !== undefined);
    room.send("debug", { nightTime: config.match.quietSec + 1 });
    room.send("debug", { teleport: marrowHotelGreybox.ghostStart! });
    await waitFor(() => ghostMsgs.length > 0);

    room.send("debug", { toggleGhost: true });
    await waitFor(() => pauses.length === 1);
    expect(pauses).toEqual([true]);
    // Gone: nothing more is said about where it is.
    await new Promise((r) => setTimeout(r, 300));
    ghostMsgs.length = 0;
    await new Promise((r) => setTimeout(r, 500));
    expect(ghostMsgs).toEqual([]);

    room.send("debug", { toggleGhost: true });
    await waitFor(() => pauses.length === 2);
    expect(pauses).toEqual([true, false]);
    await waitFor(() => ghostMsgs.length > 0);
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
    await night(room);
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
    // Spawn 0 faces north: the line lands 1 m ahead.
    const spawn = marrowHotelGreybox.spawns[0]!;
    expect(line!.x).toBeCloseTo(spawn.x, 1);
    expect(line!.z).toBeCloseTo(spawn.z - config.salt.placeAheadM, 1);

    // The Main Hall's jar gives one handful back, once.
    const jar = marrowHotelGreybox.saltJars.find((j) => j.id === "jar-hall")!;
    await walkTo(room, { x: jar.x + 0.8, z: jar.z });
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => me().salt === config.salt.perPlayer);
    expect(room.state.saltJars.get(jar.id).taken).toBe(true);
    await room.leave();
  }, 20000);

  it("uses a camera shot, flashes for players nearby, and has no shots after the last one", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Snap" });
    a.onMessage("*", () => {});
    const taken = collectMsgs(a, "photoTaken");
    const b = await new Client(endpoint).joinById(a.roomId, { name: "Model" });
    b.onMessage("*", () => {});
    await night(a);
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
    await night(room);
    const list = tasks[0]!.list;
    expect(list).toHaveLength(config.tasks.perPlayer);
    expect(new Set(list.map((t) => t.room)).size).toBe(list.length);
    await waitFor(() => room.state.tasksTotal === config.tasks.perPlayer);

    const opened = collectMsgs(room, "taskOpen");
    const closed = collectMsgs(room, "taskClosed");
    const clock = marrowHotelGreybox.tasks.find((t) => t.id === "task-clock")!;
    const atClock = { x: clock.x, z: clock.z - 1.2 };
    let seq = await walkTo(room, atClock);
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 1);
    expect(opened[0]).toEqual({ stationId: "task-clock", minigame: "clock", title: marrowHotelGreybox.tasks.find((t) => t.id === "task-clock")!.name });

    // Claiming it done straight away is refused: the minigame takes longer than that.
    room.send("taskDone", { stationId: "task-clock" });
    await waitFor(() => closed.length === 1);
    expect(closed[0]!.reason).toBe("cancelled");
    expect(room.state.tasksDone).toBe(0);

    // Walking away from the station closes it.
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 2);
    seq = await walkTo(room, { x: clock.x, z: clock.z - 2.5 }, seq);
    await waitFor(() => closed.length === 2);
    expect(closed[1]!.reason).toBe("cancelled");
    await walkTo(room, atClock, seq);

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
    await night(room);
    const heard = collectMsgs(friend, "taskNoise");
    await waitFor(() => room.state.players.size === 2);
    // Both jump to the station's room: the friend a few metres away, well inside the 10 m the
    // noise carries, and the worker beside the station.
    const beside = { x: station.x + Math.sign(-station.x), z: station.z };
    friend.send("debug", { teleport: { x: station.x, z: station.z + 3 } });
    room.send("debug", { teleport: beside });
    await waitFor(() => Math.abs(room.state.players.get(room.sessionId).x - beside.x) < 0.01);

    const opened = collectMsgs(room, "taskOpen");
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

  it("hides relics, and lets a player take, carry, drop and pick one up (GDD 10)", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Seeker" });
    await night(room);
    room.onMessage("*", () => {});
    const near = collectMsgs(room, "relicsNear");
    const opened = collectMsgs(room, "taskOpen");
    const closed = collectMsgs(room, "taskClosed");
    const drops = collectMsgs(room, "relicDrop");
    await waitFor(() => room.state.relics?.size === config.relics.count);
    const me = () => room.state.players.get(room.sessionId);
    const relic = (id: string) => room.state.relics.get(id);

    // Everyone sees each relic's name and status, never where it is.
    room.state.relics.forEach((r: any) => {
      expect(r.status).toBe("hidden");
      expect(marrowHotelGreybox.relicNames).toContain(r.name);
      expect(Object.keys(r.toJSON()).sort()).toEqual(["carrier", "name", "status"]);
    });

    // The test reaches into the server to stand the player at the first relic's spot
    // (spots are random each match, and the grey box has no straight path to all of them).
    const server = matchMaker.getLocalRoomById(room.roomId) as any;
    const teleport = (x: number, z: number) => {
      const sim = server.sims.get(room.sessionId);
      sim.move = { ...sim.move, x, z };
      Object.assign(server.state.players.get(room.sessionId), { x, z });
    };
    // This test is about a spot with one place; groups of places have their own test below.
    const spot = marrowHotelGreybox.relicSpots.find((s) => !s.places && !server.relics.some((r: any) => r.spotId === s.id))!;
    const target = server.relics[0] as { id: string; spotId: string };
    Object.assign(target, { spotId: spot.id, placeId: spot.id, x: spot.x, z: spot.z });
    expect(spot.room).not.toBe("Main Hall");
    const start = { x: me().x, z: me().z };
    teleport(spot.x, spot.z);

    // Up close you hear it whisper: the server tells you where it is, and only you.
    await waitFor(() => near.at(-1)?.list.some((r) => r.id === target.id && r.hidden) ?? false);

    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 1);
    expect(opened[0]).toEqual({ stationId: spot.id, minigame: spot.minigame, title: spot.label });

    // Claiming it straight away is refused.
    room.send("taskDone", { stationId: spot.id });
    await waitFor(() => closed.length === 1);
    expect(closed[0]!.reason).toBe("cancelled");
    expect(me().relic).toBe("");

    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => opened.length === 2);
    await new Promise((r) => setTimeout(r, (config.relics.serverMinSec + 0.5) * 1000));
    room.send("taskDone", { stationId: spot.id });
    await waitFor(() => closed.length === 2);
    expect(closed[1]!.reason).toBe("done");
    await waitFor(() => me().relic === target.id);
    expect(relic(target.id).status).toBe("carried");
    expect(relic(target.id).carrier).toBe("Seeker");

    // Carrying is 15% slower (back in the open Main Hall).
    teleport(start.x, start.z);
    await new Promise((r) => setTimeout(r, 200));
    const z0 = me().z;
    for (let seq = 1; seq <= config.net.tickRate; seq++) {
      room.send("input", { seq, forward: 1, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
    }
    await waitFor(() => me().lastSeq === config.net.tickRate);
    expect(z0 - me().z).toBeCloseTo(config.movement.walk * (1 - config.movement.relicSlowPct / 100), 1);

    // G drops it where you stand, with a noise; it now shows as dropped and you can see it.
    room.send("dropRelic");
    await waitFor(() => relic(target.id).status === "dropped");
    expect(me().relic).toBe("");
    expect(relic(target.id).carrier).toBe("Seeker");
    await waitFor(() => drops.length === 1);
    await waitFor(() => near.at(-1)?.list.some((r) => r.id === target.id && !r.hidden) ?? false);

    // E picks it straight back up.
    room.send("use", { down: true });
    room.send("use", { down: false });
    await waitFor(() => me().relic === target.id);
    expect(relic(target.id).status).toBe("carried");

    // Downed while carrying: it falls, and makes no drop noise.
    server.downPlayer(room.sessionId);
    await waitFor(() => relic(target.id).status === "dropped");
    expect(me().relic).toBe("");
    await new Promise((r) => setTimeout(r, 200));
    expect(drops).toHaveLength(1);
    await room.leave();
  }, 40000);

  it("searches a group of places: empty ones are quick and stay searched, the relic's place is found, then taken (GDD 26.5)", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Digger" });
    await night(room);
    room.onMessage("*", () => {});
    const opened = collectMsgs(room, "taskOpen");
    const closed = collectMsgs(room, "taskClosed");
    const found = collectMsgs(room, "searchFound");
    await waitFor(() => room.state.relics?.size === config.relics.count);
    const me = () => room.state.players.get(room.sessionId);
    const server = matchMaker.getLocalRoomById(room.roomId) as any;
    const teleport = (x: number, z: number) => {
      const sim = server.sims.get(room.sessionId);
      sim.move = { ...sim.move, x, z };
      Object.assign(server.state.players.get(room.sessionId), { x, z });
    };
    const use = () => {
      room.send("use", { down: true });
      room.send("use", { down: false });
    };

    // Hide the first relic in the second place of the flower bed, and no other relic there.
    const group = marrowHotelGreybox.relicSpots.find((s) => s.id === "relic-courtyard")!;
    const [empty, full] = group.places!;
    server.relics.forEach((r: any, i: number) => {
      if (i > 0 && r.spotId === group.id) Object.assign(r, { spotId: "elsewhere", placeId: "elsewhere" });
    });
    const target = server.relics[0];
    Object.assign(target, { spotId: group.id, placeId: full!.id, x: full!.x, z: full!.z });

    // Every place can be searched, so E never gives the relic away.
    teleport(empty!.x, empty!.z);
    use();
    await waitFor(() => opened.length === 1);
    expect(opened[0]).toEqual({ stationId: empty!.id, minigame: group.minigame, title: group.label });
    room.send("taskDone", { stationId: empty!.id });
    await waitFor(() => closed.length === 1);
    expect(closed[0]!.reason).toBe("cancelled");

    use();
    await waitFor(() => opened.length === 2);
    await new Promise((r) => setTimeout(r, (config.relics.search.serverMinSec + 0.3) * 1000));
    room.send("taskDone", { stationId: empty!.id });
    await waitFor(() => closed.length === 2);
    expect(closed[1]!.reason).toBe("empty");
    await waitFor(() => room.state.searchPlaces.get(empty!.id)?.searched === true);
    // A searched place cannot be searched again.
    use();
    await new Promise((r) => setTimeout(r, 300));
    expect(opened).toHaveLength(2);

    // At the relic's place the short search finds it, and the full time takes it.
    teleport(full!.x, full!.z);
    use();
    await waitFor(() => opened.length === 3);
    await new Promise((r) => setTimeout(r, (config.relics.search.serverMinSec + 0.3) * 1000));
    room.send("taskDone", { stationId: full!.id });
    await waitFor(() => found.length === 1);
    expect(found[0]).toEqual({ stationId: full!.id });
    expect(closed).toHaveLength(2);
    expect(me().relic).toBe("");
    await new Promise((r) => setTimeout(r, (config.relics.serverMinSec - config.relics.search.serverMinSec) * 1000));
    room.send("taskDone", { stationId: full!.id });
    await waitFor(() => closed.length === 3);
    expect(closed[2]!.reason).toBe("done");
    await waitFor(() => me().relic === target.id);
    expect(room.state.searchPlaces.get(full!.id)?.searched).toBe(true);
    await room.leave();
  }, 40000);

  it("places relics in the locked relic door, which opens for good when every slot is full (GDD 10)", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Keeper" });
    await night(room);
    room.onMessage("*", () => {});
    await waitFor(() => room.state.relics?.size === config.relics.count);
    const me = () => room.state.players.get(room.sessionId);
    const server = matchMaker.getLocalRoomById(room.roomId) as any;
    const def = marrowHotelGreybox.doors.find((d) => d.id === marrowHotelGreybox.relicDoor)!;
    const door = () => room.state.doors.get(def.id);
    const press = async (holdMs: number) => {
      room.send("use", { down: true });
      await new Promise((r) => setTimeout(r, holdMs));
      room.send("use", { down: false });
    };
    // One second of walking north (into the door).
    let seq = 0;
    const walkNorth = async () => {
      for (let i = 0; i < config.net.tickRate; i++) {
        room.send("input", { seq: ++seq, forward: 1, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
        await new Promise((r) => setTimeout(r, 1000 / config.net.tickRate));
      }
      await new Promise((r) => setTimeout(r, 200));
    };

    // Stand in the Stairwell in front of the door. E does not open it, and it blocks the way.
    room.send("debug", { teleport: { x: def.x, z: def.z + 1.5 } });
    await waitFor(() => Math.abs(me().z - (def.z + 1.5)) < 0.01);
    await press(100);
    await new Promise((r) => setTimeout(r, 300));
    expect(door().open).toBe(false);
    await walkNorth();
    expect(me().z).toBeGreaterThan(def.z);
    const lockedNav = server.ghost.nav;
    room.send("debug", { teleport: { x: def.x, z: def.z + 1.5 } });
    await new Promise((r) => setTimeout(r, 200));

    const relics = server.relics as { id: string }[];
    for (const [i, r] of relics.entries()) {
      // The test hands the player each relic (finding them is covered above).
      server.carry(server.state.players.get(room.sessionId), r);
      await waitFor(() => me().relic === r.id);
      if (i === 0) {
        // Letting go early places nothing.
        await press(1000);
        await new Promise((r) => setTimeout(r, 200));
        expect(room.state.relics.get(r.id).status).toBe("carried");
      }
      await press((config.relics.placeSec + 0.4) * 1000);
      await waitFor(() => room.state.relics.get(r.id).status === "placed");
      expect(me().relic).toBe("");
      expect(door().open).toBe(i === relics.length - 1);
    }

    // Open for good: E cannot close it, and the ghost now walks a navmesh through it.
    await press(100);
    await new Promise((r) => setTimeout(r, 300));
    expect(door().open).toBe(true);
    expect(server.ghost.nav).not.toBe(lockedNav);
    await walkNorth();
    expect(me().z).toBeLessThan(def.z);
    await room.leave();
  }, 40000);

  it("runs the ritual: starts with enough players in the circle, fills, drains, and gets overtime at dawn (GDD 4, 11)", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Rafi" });
    const b = await new Client(endpoint).joinById(a.roomId, { name: "Mim" });
    for (const r of [a, b]) r.onMessage("*", () => {});
    await night(a);
    const server = matchMaker.getLocalRoomById(a.roomId) as any;
    const s = () => a.state;
    const altar = marrowHotelGreybox.altar!;
    const inCircle = { x: altar.x + 2.5, z: altar.z };
    const outside = { x: altar.x + config.ritual.circleRadiusM + 2, z: altar.z };
    const place = async (room: Room, at: { x: number; z: number }) => {
      room.send("debug", { teleport: at });
      await new Promise((r) => setTimeout(r, 250));
    };
    await waitFor(() => s().circleNeeded === 2);

    // Not ready until the basement is open and the task bar is full. The test reaches in for both.
    await place(a, inCircle);
    await place(b, inCircle);
    expect(s().circleCount).toBe(2);
    expect(s().ritualReady).toBe(false);
    expect(s().ritualStarted).toBe(false);
    for (const r of server.relics) r.status = "placed";
    await new Promise((r) => setTimeout(r, 250));
    expect(s().ritualReady).toBe(false);
    server.state.tasksDone = server.state.tasksTotal;
    // Ready, and two players are already standing in the circle: it starts.
    await waitFor(() => s().ritualStarted);
    expect(s().ritualReady).toBe(true);

    // 45 s at the minimum.
    const p0 = s().ritualProgress;
    await new Promise((r) => setTimeout(r, 1000));
    expect(s().ritualProgress - p0).toBeGreaterThan(1.5);
    expect(s().ritualProgress - p0).toBeLessThan(3.2);

    // One steps out: it drains slowly, and does not reset.
    await place(b, outside);
    expect(s().circleCount).toBe(1);
    const p1 = s().ritualProgress;
    await new Promise((r) => setTimeout(r, 1000));
    expect(s().ritualProgress).toBeLessThan(p1);
    expect(s().ritualProgress).toBeGreaterThan(p1 - 1.6);

    // With both in the circle at dawn, the night waits up to 30 s for the ritual.
    await place(b, inCircle);
    server.state.ritualProgress = 50;
    a.send("debug", { nightTime: s().nightLength - 0.3 });
    await waitFor(() => s().overtime === true);
    expect(s().part).toBe("overtime");
    await new Promise((r) => setTimeout(r, 500));
    expect(s().ritualProgress).toBeGreaterThan(50);
    // The circle breaks: overtime ends and dawn comes.
    await place(b, outside);
    await waitFor(() => s().part === "dawn");
    expect(s().overtime).toBe(false);
    // The ritual was not finished: the possessed win at dawn (GDD 18).
    expect(s().winner).toBe("possessed");
    expect(s().endReason).toBe("dawn");
    await a.leave();
    await b.leave();
  }, 20000);

  it("ends the match when the ritual completes: the investigators win, everything stops, and every role is shown (GDD 18, 19)", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Sam" });
    const b = await new Client(endpoint).joinById(a.roomId, { name: "Mim" });
    for (const r of [a, b]) r.onMessage("*", () => {});
    await night(a);
    const ends = collectMsgs(b, "matchEnd");
    const server = matchMaker.getLocalRoomById(a.roomId) as any;
    const altar = marrowHotelGreybox.altar!;
    for (const r of [a, b]) r.send("debug", { teleport: { x: altar.x + 2.5, z: altar.z } });
    for (const r of server.relics) r.status = "placed";
    server.state.tasksDone = server.state.tasksTotal;
    await waitFor(() => a.state.ritualStarted);
    server.state.ritualProgress = 99;

    await waitFor(() => ends.length === 1);
    expect(ends[0]).toEqual({ winner: "investigators", reason: "ritual", roles: [{ name: "Sam", role: "investigator" }, { name: "Mim", role: "investigator" }] });
    await waitFor(() => a.state.winner === "investigators");
    expect(a.state.part).toBe("dawn");

    // Nothing moves any more: not the clock, not the players.
    const time = a.state.nightTime;
    const me = () => a.state.players.get(a.sessionId);
    const z0 = me().z;
    for (let seq = 1; seq <= 10; seq++) a.send("input", { seq, forward: 1, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
    await new Promise((r) => setTimeout(r, 500));
    expect(a.state.nightTime).toBe(time);
    expect(me().z).toBe(z0);
    await a.leave();
    await b.leave();
  }, 20000);

  it("lets everyone hear the Bellboy's bell from the middle of the ghost's room (GDD 12.5)", async () => {
    const a = await new Client(endpoint).create(ROOM_NAME, { name: "Rafi" });
    const b = await new Client(endpoint).joinById(a.roomId, { name: "Mim" });
    for (const r of [a, b]) r.onMessage("*", () => {});
    await night(a);
    const rings = [collectMsgs(a, "bellRing"), collectMsgs(b, "bellRing")];
    a.send("debug", { nightTime: config.match.quietSec + 1 });
    await waitFor(() => a.state.part === "calm");
    // The test makes the next ring due now.
    const server = matchMaker.getLocalRoomById(a.roomId) as any;
    server.trick.ringIn = 0;
    await waitFor(() => rings.every((list) => list.length === 1));
    const room = marrowHotelGreybox.rooms.find((r) => r.minX < server.ghost.x && server.ghost.x < r.maxX && r.minZ < server.ghost.z && server.ghost.z < r.maxZ)!;
    expect(rings[0]![0]).toEqual({ x: (room.minX + room.maxX) / 2, z: (room.minZ + room.maxZ) / 2 });
    expect(rings[1]![0]).toEqual(rings[0]![0]);
    await a.leave();
    await b.leave();
  });

  it("only tells each player about relics near them", async () => {
    const room = await new Client(endpoint).create(ROOM_NAME, { name: "Far" });
    room.onMessage("*", () => {});
    const near = collectMsgs(room, "relicsNear");
    await waitFor(() => near.length > 2);
    const server = matchMaker.getLocalRoomById(room.roomId) as any;
    const me = room.state.players.get(room.sessionId);
    for (const r of server.relics as { id: string; x: number; z: number }[]) {
      const heard = near.at(-1)!.list.some((n) => n.id === r.id);
      expect(heard).toBe(Math.hypot(r.x - me.x, r.z - me.z) <= config.relics.whisperM);
    }
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

  /** A room of this many players, each listening for its role. */
  async function fullRoom(players: number) {
    const host = await new Client(endpoint).create(ROOM_NAME, { name: "P1" });
    const rooms: Room[] = [host];
    for (let i = 2; i <= players; i++) rooms.push(await new Client(endpoint).joinById(host.roomId, { name: `P${i}` }));
    const roles = rooms.map((r) => {
      r.onMessage("*", () => {});
      return collectMsgs(r, "role");
    });
    return { host, rooms, roles };
  }

  it("starts only for the host: a countdown, then each player privately learns their role (GDD 4.1, 5)", async () => {
    const { host, rooms, roles } = await fullRoom(5);
    await waitFor(() => host.state.host === host.sessionId);
    expect(host.state.stage).toBe("waiting");
    // Someone else pressing Start does nothing.
    rooms[1]!.send("start");
    await new Promise((r) => setTimeout(r, 300));
    expect(host.state.stage).toBe("waiting");
    host.send("start");
    await waitFor(() => host.state.stage === "countdown");
    // Nobody can join once the countdown starts.
    await expect(new Client(endpoint).joinById(host.roomId, { name: "Late" })).rejects.toThrow();
    await waitFor(() => host.state.stage === "intro", (config.match.countdownSec + 2) * 1000);
    await waitFor(() => roles.every((r) => r.length === 1));
    const dealt = roles.map((r) => r[0]!.role);
    expect(dealt.filter((r) => r === "possessed")).toHaveLength(1);
    // One possessed has no partner, and nobody else learns anything.
    for (const r of roles) expect(r[0]!.partners).toEqual([]);
    // Roles are never in the shared state (PRD 10.3).
    expect(JSON.stringify(host.state.toJSON())).not.toContain("possessed");
    // The possessed's tasks are fake and leave the team bar (GDD 9).
    expect(host.state.tasksTotal).toBe(4 * config.tasks.perPlayer);
    await Promise.all(rooms.map((r) => r.leave()));
   }, (config.match.countdownSec + 10) * 1000);

  it("possesses two of seven, who know each other (GDD 3, 14.1)", async () => {
    const { host, rooms, roles } = await fullRoom(7);
    host.send("debug", { startNow: true });
    await waitFor(() => roles.every((r) => r.length === 1));
    const names = rooms.map((r) => r.state.players.get(r.sessionId).name as string);
    const possessed = names.filter((_, i) => roles[i]![0]!.role === "possessed");
    expect(possessed).toHaveLength(2);
    roles.forEach((r, i) => {
      const expected = r[0]!.role === "possessed" ? possessed.filter((n) => n !== names[i]) : [];
      expect(r[0]!.partners).toEqual(expected);
    });
    await Promise.all(rooms.map((r) => r.leave()));
  });

  it("passes the host to whoever has waited longest when the host leaves (GDD 5)", async () => {
    const { host, rooms } = await fullRoom(3);
    await host.leave();
    await waitFor(() => rooms[1]!.state.host === rooms[1]!.sessionId);
    await Promise.all(rooms.slice(1).map((r) => r.leave()));
  });

  it("ends the match when the possessed equal the living investigators (GDD 18)", async () => {
    const { host, rooms, roles } = await fullRoom(4);
    const ends = collectMsgs(host, "matchEnd");
    host.send("debug", { startNow: true });
    await waitFor(() => roles.every((r) => r.length === 1));
    // Two investigators die: one possessed against one investigator.
    const investigators = rooms.filter((_, i) => roles[i]![0]!.role === "investigator");
    for (const r of investigators.slice(0, 2)) {
      r.send("debug", { down: true, bleedLeft: 0.05 });
    }
    await waitFor(() => ends.length > 0, 3000);
    expect(ends[0]).toMatchObject({ winner: "possessed", reason: "outnumbered" });
    expect(ends[0]!.roles.filter((r) => r.role === "possessed")).toHaveLength(1);
    await Promise.all(rooms.map((r) => r.leave()));
  });
});
