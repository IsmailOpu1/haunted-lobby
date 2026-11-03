// Plays whole matches on the full map with bot players, over the network like real clients.
// They do real tasks, find and carry real relics, place them, and run the ritual. The only
// shortcut is the debug teleport (walking the hotel would take minutes), so the server must
// run with HAUNTED_DEBUG=1.
//
//   npx tsx tools/playtest.ts win-asleep   ghost held asleep: proves the whole flow can be won
//   npx tsx tools/playtest.ts win          the ghost is active: two bots try to win anyway
//   npx tsx tools/playtest.ts win-late     as win, but the ritual starts in the Restless part, ghost already roaming
//   npx tsx tools/playtest.ts lose-dawn    the night runs out
//   npx tsx tools/playtest.ts lose-dead    every player dies
//   add a room code to join a room a browser player made, e.g. ... win-asleep ABCDE
import { Client, type Room } from "@colyseus/sdk";
import { config, furnitureBox, hidingSpotBox, ROOM_NAME, roomAt, type ServerMessages } from "@haunted/shared";
import { marrowHotelGreybox as map } from "@haunted/maps";

type Point = { x: number; z: number };
const endpoint = process.env.ENDPOINT ?? "ws://localhost:2567";
const mode = process.argv[2] ?? "win-asleep";
const joinCode = process.argv[3];
const t0 = Date.now();
const log = (who: string, text: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${who.padEnd(6)} ${text}`);
const sleep = (sec: number) => new Promise((r) => setTimeout(r, sec * 1000));

async function until(check: () => boolean, timeoutSec: number, what: string) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutSec * 1000) throw new Error(`Timed out: ${what}`);
    await sleep(0.05);
  }
}

/** A free place to stand within reach of a point: same room, clear of furniture and walls. */
function standNear(p: Point, reach: number): Point {
  const room = roomAt(map, p.x, p.z)?.name;
  const boxes = [...map.furniture.map(furnitureBox), ...map.hidingSpots.map(hidingSpotBox)];
  const clear = (q: Point) =>
    boxes.every((b) => Math.abs(q.x - b.x) > b.sizeX / 2 + 0.4 || Math.abs(q.z - b.z) > b.sizeZ / 2 + 0.4) &&
    [0.4, -0.4].every((d) => roomAt(map, q.x + d, q.z)?.name === room && roomAt(map, q.x, q.z + d)?.name === room);
  for (let r = 0.6; r <= reach; r += 0.2) {
    for (let a = 0; a < 16; a++) {
      const q = { x: p.x + Math.cos((a / 16) * Math.PI * 2) * r, z: p.z + Math.sin((a / 16) * Math.PI * 2) * r };
      if (clear(q)) return q;
    }
  }
  throw new Error(`No place to stand near ${p.x}, ${p.z}`);
}

class Bot {
  room!: Room;
  tasks: ServerMessages["tasks"]["list"] = [];
  opened: ServerMessages["taskOpen"][] = [];
  closed: ServerMessages["taskClosed"][] = [];
  near: ServerMessages["relicsNear"]["list"] = [];
  end: ServerMessages["matchEnd"] | null = null;
  busy = false;
  seq = 0;

  constructor(readonly name: string) {}

  async connect(roomId?: string) {
    const client = new Client(endpoint);
    this.room = roomId ? await client.joinById(roomId, { name: this.name }) : await client.create(ROOM_NAME, { name: this.name });
    this.room.onMessage("*", () => {});
    this.room.onMessage("tasks", (m: ServerMessages["tasks"]) => (this.tasks = m.list));
    this.room.onMessage("taskOpen", (m: ServerMessages["taskOpen"]) => this.opened.push(m));
    this.room.onMessage("taskClosed", (m: ServerMessages["taskClosed"]) => this.closed.push(m));
    this.room.onMessage("relicsNear", (m: ServerMessages["relicsNear"]) => (this.near = m.list));
    this.room.onMessage("matchEnd", (m: ServerMessages["matchEnd"]) => (this.end = m));
    await until(() => !!this.me, 5, `${this.name} joined`);
    this.room.send("tasksRequest");
    await until(() => this.tasks.length > 0, 5, `${this.name} got tasks`);
  }

  get state(): any {
    return this.room.state;
  }
  get me(): any {
    return this.state.players?.get(this.room.sessionId);
  }
  get alive() {
    return this.me.health === "alive";
  }

  async teleport(p: Point) {
    this.room.send("debug", { teleport: p });
    await until(() => Math.hypot(this.me.x - p.x, this.me.z - p.z) < 0.05, 3, `${this.name} teleport`);
    await sleep(0.1);
  }

  /** Stands still for a moment, so the server's movement does not cancel the next action. */
  async still(sec: number) {
    const end = Date.now() + sec * 1000;
    while (Date.now() < end) {
      this.room.send("input", { seq: ++this.seq, forward: 0, right: 0, run: false, crouch: false, yaw: 0, pitch: 0 });
      await sleep(1 / config.net.tickRate);
    }
  }

  async tap() {
    this.room.send("use", { down: true });
    this.room.send("use", { down: false });
  }

  async hold(sec: number) {
    this.room.send("use", { down: true });
    await this.still(sec);
    this.room.send("use", { down: false });
  }

  /** Opens the minigame at a station, waits as long as a real player would, and finishes it. */
  async minigame(stationId: string, at: Point, minSec: number): Promise<boolean> {
    await this.teleport(standNear(at, config.tasks.useRangeM - 0.2));
    const opened = this.opened.length;
    const closed = this.closed.length;
    await this.tap();
    await until(() => this.opened.length > opened || !this.alive, 3, `${this.name} opens ${stationId}`).catch(() => {});
    if (this.opened.length === opened) return false;
    await this.still(minSec + 0.5);
    this.room.send("taskDone", { stationId });
    await until(() => this.closed.length > closed, 3, `${this.name} finishes ${stationId}`);
    return this.closed.at(-1)!.reason === "done";
  }

  async doTasks() {
    for (const t of this.tasks.filter((t) => !t.done)) {
      if (this.end) return;
      await this.waitUntilAlive();
      const def = map.tasks.find((d) => d.id === t.stationId)!;
      this.busy = true;
      const ok = await this.minigame(def.id, def, config.tasks.serverMinSec);
      this.busy = false;
      log(this.name, `${ok ? "did" : "FAILED"} task ${def.name} (${def.room})  team ${this.state.tasksDone}/${this.state.tasksTotal}`);
    }
  }

  /** Searches the relic spots it is given; takes each relic it hears and places it in the door. */
  async findRelics(spots: string[]) {
    for (const spotId of spots) {
      if (this.end) return;
      if ([...this.state.relics.values()].every((r: any) => r.status === "placed")) return;
      await this.waitUntilAlive();
      const spot = map.relicSpots.find((s) => s.id === spotId)!;
      await this.teleport(standNear(spot, config.relics.useRangeM - 0.2));
      await sleep(2 / config.relics.nearUpdateHz);
      const relic = this.near.find((r) => r.hidden && r.spotId === spotId);
      if (!relic) continue;
      this.busy = true;
      const ok = await this.minigame(spotId, spot, config.relics.serverMinSec);
      this.busy = false;
      if (ok) await until(() => this.me.relic === relic.id, 2, "carrying").catch(() => {});
      if (!ok || this.me.relic !== relic.id) {
        log(this.name, `FAILED to take the relic at ${spot.label} (${spot.room}): ${ok ? `server says carrying "${this.me.relic}"` : `closed as ${this.closed.at(-1)?.reason}`}`);
        continue;
      }
      const name = this.state.relics.get(relic.id).name;
      log(this.name, `took ${name} from ${spot.room}; carrying it to the basement door`);
      await this.placeRelic(relic.id, name);
    }
  }

  async placeRelic(id: string, name: string) {
    const door = map.doors.find((d) => d.id === map.relicDoor)!;
    await this.teleport({ x: door.x, z: door.z + 1.5 });
    this.busy = true;
    await this.hold(config.relics.placeSec + 0.4);
    this.busy = false;
    const placed = this.state.relics.get(id).status === "placed";
    const count = [...this.state.relics.values()].filter((r: any) => r.status === "placed").length;
    log(this.name, `${placed ? "placed" : "FAILED to place"} ${name}  (${count}/${this.state.relics.size}); door ${this.state.doors.get(door.id).open ? "OPEN" : "locked"}`);
  }

  async waitUntilAlive() {
    if (this.alive) return;
    log(this.name, `is ${this.me.health}; waiting`);
    await until(() => this.alive || this.me.health === "dead" || !!this.end, 120, `${this.name} revived`);
    if (this.me.health === "dead") throw new Error(`${this.name} died`);
  }

  /** Keeps a teammate alive: walks over (teleports) and holds E on them when they go down. */
  async guard(friend: Bot) {
    while (!this.end) {
      await sleep(0.2);
      if (this.busy || !this.alive || friend.me?.health !== "downed") continue;
      const was = { x: this.me.x, z: this.me.z };
      log(this.name, `reviving ${friend.name}`);
      this.busy = true;
      await this.teleport(standNear(friend.me, config.interact.reviveRangeM - 0.3)).catch(() => {});
      await this.hold(config.health.reviveSec + 0.4);
      this.busy = false;
      log(this.name, `${friend.me.health === "alive" ? "revived" : "could not revive"} ${friend.name}`);
      await this.teleport(was).catch(() => {});
    }
  }
}

async function main() {
  const a = new Bot("Rafi");
  const b = new Bot("Mim");
  await a.connect(joinCode);
  await b.connect(joinCode ?? a.room.roomId);
  log("room", `code ${a.room.roomId}; mode ${mode}; ${a.state.players.size} players, ${a.state.tasksTotal} tasks`);
  const bots = [a, b];
  // In their own room the bots skip the host's countdown and the intro (in a joined room, the host starts).
  if (!joinCode) a.room.send("debug", { startNow: true });
  await until(() => a.state.stage === "night", 30, "night start");

  let hunts = 0;
  a.room.onMessage("hunt", (m: ServerMessages["hunt"]) => {
    if (m.phase === "start") hunts++;
    log("ghost", `hunt ${m.phase}`);
  });
  a.room.onMessage("bellRing", (m: ServerMessages["bellRing"]) => log("ghost", `bell rings in the ${roomAt(map, m.x, m.z)?.name}`));
  // Where the ghost is, when it is within range of a bot (the server tells nobody else).
  let ghostSeen: { x: number; z: number; at: number } | null = null;
  for (const bot of bots) bot.room.onMessage("ghost", (m: ServerMessages["ghost"]) => {
    if (m) ghostSeen = { x: m.x, z: m.z, at: Date.now() };
  });
  const ghostWatch = setInterval(() => {
    const g = ghostSeen && Date.now() - ghostSeen.at < 1000 ? ghostSeen : null;
    if (a.state.ritualStarted) log("ghost", g ? `in the ${roomAt(map, g.x, g.z)?.name ?? "doorway"}, ${Math.hypot(g.x - map.altar!.x, g.z - map.altar!.z).toFixed(1)} m from the altar` : "not near anyone");
  }, 3000);
  let lastPart = "";
  const watch = setInterval(() => {
    const s = a.state;
    if (s.part !== lastPart) log("night", `${s.part} (${s.nightTime.toFixed(0)} s)`);
    lastPart = s.part;
    if (mode === "win-asleep" && s.nightTime > config.match.quietSec - 5) a.room.send("debug", { nightTime: 0 });
  }, 250);

  if (mode === "lose-dawn") {
    a.room.send("debug", { nightTime: a.state.nightLength - 2 });
  } else if (mode === "lose-dead") {
    for (const bot of bots) {
      bot.room.send("debug", { down: true });
      bot.room.send("debug", { bleedLeft: 0.5 });
    }
  } else {
    if (mode === "win" || mode === "win-late") for (const [me, friend] of [[a, b], [b, a]] as const) void me.guard(friend);
    // Split the work like a team would: each does their own tasks and searches half the spots.
    const spots = map.relicSpots.map((s) => s.id);
    await Promise.all([
      a.doTasks().then(() => a.findRelics(spots.filter((_, i) => i % 2 === 0))),
      b.doTasks().then(() => b.findRelics(spots.filter((_, i) => i % 2 === 1))),
    ]);
    const others = a.state.tasksTotal - a.state.tasksDone;
    if (others > 0) log("room", `waiting for the other players' ${others} tasks`);
    await until(() => a.state.ritualReady || !!a.end, 600, "ritual ready");
    log("room", `ritual ready: basement open, task bar full`);
    if (mode === "win-late") {
      a.room.send("debug", { nightTime: a.state.nightLength * 0.5 });
      log("room", "jumped to the middle of the night; waiting 20 s before going down");
      await sleep(20);
    }
    const altar = map.altar!;
    await Promise.all(bots.map((bot, i) => bot.teleport({ x: altar.x + (i === 0 ? 2.5 : -2.5), z: altar.z + 1 })));
    await until(() => a.state.ritualStarted || !!a.end, 10, "ritual started");
    log("room", `ritual started with ${a.state.circleCount}/${a.state.circleNeeded} in the circle`);
    let shown = -10;
    while (!a.end) {
      await sleep(0.25);
      const p = a.state.ritualProgress;
      if (Math.abs(p - shown) >= 10) {
        log("room", `ritual ${p.toFixed(0)}%  circle ${a.state.circleCount}/${a.state.circleNeeded}  ${a.state.overtime ? "OVERTIME" : ""}`);
        shown = p;
      }
      for (const bot of bots) if (bot.alive && bot !== a && Math.hypot(bot.me.x - altar.x, bot.me.z - altar.z) > config.ritual.circleRadiusM) await bot.teleport({ x: altar.x - 2.5, z: altar.z + 1 });
    }
  }

  await until(() => bots.every((bot) => !!bot.end), 120, "match end");
  clearInterval(watch);
  clearInterval(ghostWatch);
  const end = a.end!;
  log("END", `${end.winner} win (${end.reason}). Roles: ${end.roles.map((r) => `${r.name} ${r.role}`).join(", ")}. Hunts: ${hunts}. Night ${a.state.nightTime.toFixed(0)} s, ritual ${a.state.ritualProgress.toFixed(0)}%`);
  await sleep(1);
  const frozen = { t: a.state.nightTime, z: a.me.z };
  a.room.send("input", { seq: ++a.seq, forward: 1, right: 0, run: true, crouch: false, yaw: 0, pitch: 0 });
  await sleep(1);
  log("END", `after the end: clock ${a.state.nightTime === frozen.t ? "stopped" : "STILL RUNNING"}, players ${a.me.z === frozen.z ? "frozen" : "STILL MOVING"}`);
  if (!joinCode) for (const bot of bots) await bot.room.leave();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
