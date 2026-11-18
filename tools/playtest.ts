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
//   npx tsx tools/playtest.ts c4 CODE      with a Unity player (engine step C4): the first bot is possessed and
//                                          Summons the ghost on the Unity player and slams a door; the third
//                                          dies; in the meeting the dead bot pushes the Ouija planchette and the
//                                          others vote the possessed out. PLAYERS=3 is needed.
//   npx tsx tools/playtest.ts d3 CODE      with a Unity player (engine step D3, people): four bots in front of it, one
//                                          standing, one walking side to side, one crouching then creeping, one
//                                          knocked down who crawls and bleeds out. PLAYERS=4 is needed.
//   add a room code to join a room a browser player made, e.g. ... win-asleep ABCDE
//   PLAYERS=8 plays with more bots (2 to 8; default 2). For lag, run tools/lagProxy.ts and point
//   ENDPOINT at it (ws://localhost:2568).
import { Client, type Room } from "@colyseus/sdk";
import { altarStands, config, furnitureBox, hidingSpotBox, ROOM_NAME, roomAt, type ServerMessages } from "@haunted/shared";
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
  found = 0;
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
    this.room.onMessage("searchFound", () => this.found++);
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
    // A spot with several places (plant pots) opens the one searched: finish that one.
    const id = this.opened.at(-1)!.stationId;
    const found = this.found;
    await this.still(minSec + 0.5);
    this.room.send("taskDone", { stationId: id });
    await until(() => this.closed.length > closed || this.found > found, 3, `${this.name} finishes ${id}`);
    // The relic is in this place: keep going to take it (the time counts from the search's start).
    if (this.closed.length === closed) {
      this.room.send("taskDone", { stationId: id });
      await until(() => this.closed.length > closed, 3, `${this.name} takes the relic at ${id}`);
    }
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
      // The relic's own place (one of a spot's plant pots), not just the spot.
      const ok = await this.minigame(spotId, { x: relic.x, z: relic.z }, config.relics.serverMinSec);
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

  /**
   * Who was the ghost? (GDD 26.13): reads the clue pictures the team's clue tasks left, takes the
   * suspect most of them point at, and offers that suspect's belonging on the altar.
   */
  async solveMystery() {
    await until(() => [...this.state.relics.values()].every((r: any) => r.status === "placed" || r.status === "crumbled") || !!this.end, 120, "relics placed");
    const altar = map.altar!;
    const keys = [...this.state.relics.keys()] as string[];
    const stands = altarStands(altar, keys.length);
    while (!this.state.ghostNamed && !this.end) {
      await until(() => this.state.altarWait <= 0, 40, "altar ready");
      const votes = new Map<string, number>();
      this.state.stations.forEach((st: any) => st.clue && votes.set(st.clue, (votes.get(st.clue) ?? 0) + 1));
      const tried = new Set(keys.filter((k) => this.state.relics.get(k).status === "crumbled").map((k) => this.state.relics.get(k).name));
      const ranked = (map.suspects ?? []).filter((s) => !tried.has(s.belonging)).sort((x, y) => (votes.get(y.id) ?? 0) - (votes.get(x.id) ?? 0));
      const pick = ranked[0];
      const i = keys.findIndex((k) => this.state.relics.get(k).name === pick?.belonging && this.state.relics.get(k).status === "placed");
      if (!pick || i < 0) throw new Error("no relic left to offer");
      log(this.name, `clues: ${[...votes].map(([id, n]) => `${id} ${n}`).join(", ") || "none"}; offering ${pick.belonging} (${pick.name})`);
      await this.waitUntilAlive();
      await this.teleport({ x: stands[i]!.x, z: stands[i]!.z + 0.6 });
      await this.hold(config.mystery.offerHoldSec + 0.5);
      await until(() => !!this.state.ghostNamed || this.state.relics.get(keys[i]!).status === "crumbled" || !!this.end, 5, "offering answered").catch(() => {});
      log(this.name, this.state.ghostNamed ? `right: the ghost was ${this.state.ghostNamed}` : `wrong: ${pick.belonging} crumbled`);
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
  const names = ["Rafi", "Mim", "Tanvir", "Nadia", "Arif", "Sumi", "Rakib", "Lina"];
  const count = Math.max(2, Math.min(names.length, Number(process.env.PLAYERS ?? 2)));
  const a = new Bot(names[0]!);
  const b = new Bot(names[1]!);
  await a.connect(joinCode);
  // c4: the first bot asks to be possessed before the others join (the Unity host starts once all are in).
  if (mode === "c4" || process.env.POSSESSED_BOT === "1") a.room.send("debug", { possessed: true });
  await b.connect(joinCode ?? a.room.roomId);
  const more = names.slice(2, count).map((n) => new Bot(n));
  for (const bot of more) await bot.connect(joinCode ?? a.room.roomId);
  log("room", `code ${a.room.roomId}; mode ${mode}; ${a.state.players.size} players, ${a.state.tasksTotal} tasks`);
  const bots = [a, b, ...more];
  if (mode === "c4") return c4(bots);
  if (mode === "c4u") return c4u(bots);
  if (mode === "d3") return d3(bots);
  // In their own room the bots skip the host's countdown and the intro (in a joined room, the host starts).
  // MYSTERY=0 plays without "Who was the ghost?" (GDD 26.13); otherwise the bots solve it.
  if (!joinCode && process.env.MYSTERY === "0") a.room.send("debug", { mystery: false });
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
    // DIE=N: only the first N bots die (leaves the possessed outnumbering the rest).
    for (const bot of bots.slice(0, Number(process.env.DIE ?? bots.length))) {
      bot.room.send("debug", { down: true });
      bot.room.send("debug", { bleedLeft: 0.5 });
    }
  } else {
    if (mode === "win" || mode === "win-late") bots.forEach((me, i) => void me.guard(bots[(i + 1) % bots.length]!));
    // Split the work like a team would: each does their own tasks and searches a share of the spots.
    const spots = map.relicSpots.map((s) => s.id);
    await Promise.all(bots.map((bot, k) => bot.doTasks().then(() => bot.findRelics(spots.filter((_, i) => i % bots.length === k)))));
    if (map.suspects?.length && JSON.parse(a.state.settings || "{}").mystery !== false) await a.solveMystery();
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
    // Around the altar, inside the circle.
    const seat = (i: number) => ({ x: altar.x + Math.cos((i / bots.length) * Math.PI * 2) * 2.5, z: altar.z + Math.sin((i / bots.length) * Math.PI * 2) * 2.5 });
    await Promise.all(bots.map((bot, i) => (bot.alive ? bot.teleport(seat(i)) : Promise.resolve())));
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
      for (const [i, bot] of bots.entries()) if (bot.alive && bot !== a && Math.hypot(bot.me.x - altar.x, bot.me.z - altar.z) > config.ritual.circleRadiusM) await bot.teleport(seat(i));
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

/** The engine port's step C4 test, against a Unity player in the room (see the top of this file). */
async function c4(bots: Bot[]) {
  const [rafi, mim, tanvir] = bots as [Bot, Bot, Bot];
  for (const bot of bots) bot.room.onMessage("powerRefused", (m: ServerMessages["powerRefused"]) => log(bot.name, `power ${m.kind} refused: ${m.reason}`));
  rafi.room.onMessage("role", (m: ServerMessages["role"]) => log("Rafi", `role ${m.role}`));
  await until(() => rafi.state.stage === "night", 120, "night start (the Unity host starts it)");
  const t0 = Date.now();
  const at = (sec: number) => until(() => Date.now() - t0 >= sec * 1000, sec + 5, `${sec} s`);
  const unity = () => [...rafi.state.players.entries()].find(([, p]: [string, any]) => p.name === "Unity") as [string, any];
  // In front of the Unity player, where its flashlight shines (facing yaw looks along -sin, -cos).
  const inFront = (dist: number, side: number) => {
    const [, u] = unity();
    const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
    return standNear({ x: u.x + fx * dist - fz * side, z: u.z + fz * dist + fx * side }, 2);
  };
  await at(6);
  await rafi.teleport(inFront(4, 0));
  await mim.teleport(inFront(3.5, 1.2));
  await tanvir.teleport(inFront(3.5, -1.2));
  // Turn to face the Unity player, so it sees the possessed's eyes glow.
  for (const bot of [rafi, mim, tanvir]) {
    const [, u] = unity();
    const yaw = Math.atan2(-(u.x - bot.me.x), -(u.z - bot.me.z));
    bot.room.send("input", { seq: ++bot.seq, forward: 0, right: 0, run: false, crouch: false, yaw, pitch: 0 });
  }
  log("room", "bots stand in front of the Unity player");
  // Powers unlock later in the night: jump ahead, then Summon the ghost on the Unity player.
  rafi.room.send("debug", { nightTime: 200 });
  await at(10);
  rafi.room.send("power", { kind: "summon", target: unity()[0] });
  log("Rafi", "Summon on Unity");
  await at(16);
  const door = map.doors.filter((d) => d.id !== map.relicDoor).sort((p, q) => Math.hypot(p.x - unity()[1].x, p.z - unity()[1].z) - Math.hypot(q.x - unity()[1].x, q.z - unity()[1].z))[0]!;
  rafi.room.send("power", { kind: "slamDoor", target: door.id });
  log("Rafi", `Slam Door on ${door.id}`);
  await at(20);
  tanvir.room.send("debug", { down: true });
  tanvir.room.send("debug", { bleedLeft: 0.5 });
  await until(() => tanvir.me.health === "dead", 10, "Tanvir dead");
  log("Tanvir", "dead");
  // The Unity player calls the meeting (-debugAtNight). Evidence: the dead push the planchette.
  await until(() => !!rafi.state.meeting, 60, "meeting");
  log("room", `meeting called by ${rafi.state.meetingCaller}`);
  await sleep(3);
  tanvir.room.send("ouija", { target: unity()[0] });
  log("Tanvir", "Ouija: Unity");
  await until(() => rafi.state.meeting === "vote", 120, "vote step");
  await sleep(2);
  rafi.room.send("vote", { target: "skip" });
  mim.room.send("vote", { target: rafi.room.sessionId });
  log("room", "Rafi skips, Mim votes Rafi");
  await until(() => rafi.state.meeting === "result" || !rafi.state.meeting, 120, "result");
  log("room", `result step; Rafi is ${rafi.me?.health ?? "gone"}`);
  await until(() => !rafi.state.meeting || bots.every((b) => !!b.end), 60, "meeting over");
  await sleep(5);
  log("room", rafi.end ? `ended: ${rafi.end.winner} (${rafi.end.reason})` : "night goes on");
  for (const bot of bots) await bot.room.leave();
  process.exit(0);
}

/**
 * Step C4, the Unity player's side: it is the possessed (-possessed) and uses its powers on the bots
 * standing in front of it, then dies and sees Tanvir's Wisp and pushes the Ouija planchette.
 */
/**
 * Step D3: the people as Unity draws them. The bots line up in front of the Unity player and each
 * shows clips of its own: Rafi stands (idle), Mim walks side to side (walk, now and then run), Tanvir
 * crouches then creeps (crouch-idle, crouch-walk), Nadia is knocked down, crawls, and bleeds out
 * (knocked-down, crawl, downed-idle, dying).
 */
async function d3(bots: Bot[]) {
  const [rafi, mim, tanvir, nadia] = bots as [Bot, Bot, Bot, Bot];
  if (!nadia) throw new Error("d3 needs PLAYERS=4");
  await until(() => rafi.state.stage === "night", 120, "night start (the Unity host starts it)");
  rafi.room.send("debug", { toggleGhost: true });
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const at = (sec: number) => until(() => now() >= sec, sec + 5, `${sec} s`);
  const unity = () => [...rafi.state.players.entries()].find(([, p]: [string, any]) => p.name === "Unity") as [string, any];
  const inFront = (dist: number, side: number) => {
    const [, u] = unity();
    const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
    return standNear({ x: u.x + fx * dist - fz * side, z: u.z + fz * dist + fx * side }, 2);
  };
  const facing = (bot: Bot) => {
    const [, u] = unity();
    return Math.atan2(-(u.x - bot.me.x), -(u.z - bot.me.z));
  };
  await at(4);
  await rafi.teleport(inFront(4, 0));
  await mim.teleport(inFront(3.5, 1.3));
  await tanvir.teleport(inFront(3.5, -1.3));
  // In front of Rafi and a little to the side, where her body lies in the light once she is down.
  await nadia.teleport(inFront(3.2, 0.6));
  log("room", "bots stand in front of the Unity player");
  const yaws = new Map(bots.map((b) => [b, facing(b)]));
  let downed = false;
  while (now() < 60) {
    const t = now();
    for (const bot of bots) {
      let forward = 0, right = 0, run = false, crouch = false;
      if (bot === mim) {
        right = Math.floor(t / 2) % 2 === 0 ? 1 : -1;
        run = t > 20 && t < 26;
      }
      if (bot === tanvir) {
        crouch = true;
        if (t > 12) right = Math.floor(t / 2) % 2 === 0 ? 1 : -1;
      }
      // Downed, Nadia crawls toward the Unity player for a while, then lies still.
      if (bot === nadia && downed && t > 14 && t < 22) forward = Math.floor(t / 3) % 2 === 0 ? 1 : -1;
      bot.room.send("input", { seq: ++bot.seq, forward, right, run, crouch, yaw: yaws.get(bot)!, pitch: 0 });
    }
    if (!downed && t > 9) {
      downed = true;
      nadia.room.send("debug", { down: true });
      log("Nadia", "knocked down");
    }
    await sleep(1 / config.net.tickRate);
  }
  log("room", `Nadia is ${nadia.me.health}`);
  for (const bot of bots) await bot.room.leave();
  process.exit(0);
}

async function c4u(bots: Bot[]) {
  const [rafi, mim, tanvir] = bots as [Bot, Bot, Bot];
  await until(() => rafi.state.stage === "night", 120, "night start (the Unity host starts it)");
  const t0 = Date.now();
  const at = (sec: number) => until(() => Date.now() - t0 >= sec * 1000, sec + 5, `${sec} s`);
  const unity = () => [...rafi.state.players.entries()].find(([, p]: [string, any]) => p.name === "Unity") as [string, any];
  const inFront = (dist: number, side: number) => {
    const [, u] = unity();
    const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
    return standNear({ x: u.x + fx * dist - fz * side, z: u.z + fz * dist + fx * side }, 2);
  };
  await at(6);
  await mim.teleport(inFront(4, 0));
  await rafi.teleport(inFront(3.5, 1.4));
  await tanvir.teleport(inFront(3.5, -1.4));
  for (const bot of bots) {
    const [, u] = unity();
    bot.room.send("input", { seq: ++bot.seq, forward: 0, right: 0, run: false, crouch: false, yaw: Math.atan2(-(u.x - bot.me.x), -(u.z - bot.me.z)), pitch: 0 });
  }
  log("room", "bots stand in front of the Unity player");
  await at(24);
  tanvir.room.send("debug", { down: true });
  tanvir.room.send("debug", { bleedLeft: 0.5 });
  await until(() => tanvir.me.health === "dead", 10, "Tanvir dead");
  log("Tanvir", "dead");
  await until(() => !!rafi.state.meeting, 60, "meeting");
  log("room", `meeting called by ${rafi.state.meetingCaller}`);
  await until(() => rafi.state.meeting === "vote", 120, "vote step");
  await sleep(1);
  rafi.room.send("vote", { target: "skip" });
  mim.room.send("vote", { target: "skip" });
  await until(() => !rafi.state.meeting || bots.every((b) => !!b.end), 120, "meeting over");
  await sleep(4);
  log("room", rafi.end ? `ended: ${rafi.end.winner} (${rafi.end.reason})` : "night goes on");
  for (const bot of bots) await bot.room.leave();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
