import { Room, type Client } from "colyseus";
import {
  assignTasks,
  calibrateNormal,
  ghostOnSalt,
  normalizeAngle,
  saltLineInFront,
  circleNeeded,
  classifyVoice,
  cleanPlayerName,
  config,
  generateRoomCode,
  ghostHearRangeM,
  playbackBoost,
  speakingLevel,
  voiceVolume,
  type VoiceLevel,
  initialMoveState,
  initPhysics,
  nightPart,
  pickRelicSpots,
  ritualRatePct,
  worldDistance,
  PhysicsWorld,
  sanitizeInput,
  SIM_DT,
  stepMovement,
  type CollideFn,
  type GhostView,
  type Health,
  type JoinOptions,
  type MapData,
  type MoveInput,
  type MoveMode,
  type MoveState,
  type PlayerAction,
  type RelicNear,
  type RelicStatus,
  type RosterEntry,
  type ServerMessages,
  type TaskEntry,
} from "@haunted/shared";
import { defaultMap } from "@haunted/maps";
import { Ghost, type GhostTarget, type GhostWorld } from "./sim/ghost.ts";
import { NavMap } from "./sim/navmap.ts";
import { Door, GameState, Player, Relic, SaltJar, SaltLine, TaskStation } from "./state.ts";
import { NoVoice, type VoiceBackend } from "./voice/backend.ts";
import { liveKitFromEnv } from "./voice/livekit.ts";
import { recordVoiceStart } from "./voice/status.ts";

// Codes in use by rooms on this server process. One process is enough for v1
// (PRD Section 9: one 2 vCPU server holds 5 rooms).
const activeCodes = new Set<string>();

function uniqueRoomCode(): string {
  let code = generateRoomCode();
  while (activeCodes.has(code)) code = generateRoomCode();
  activeCodes.add(code);
  return code;
}

/** Test-only shortcuts (skip time, get downed). Enabled only when the server is started with HAUNTED_DEBUG=1. */
const DEBUG = process.env.HAUNTED_DEBUG === "1";

/** A timed action a player is holding E for (GDD Sections 6 and 7). */
type Action =
  | { kind: "revive"; targetId: string; elapsed: number }
  | { kind: "hide"; spotId: string; elapsed: number }
  | { kind: "unhide"; elapsed: number }
  | { kind: "salt"; elapsed: number }
  | { kind: "placeRelic"; elapsed: number };

/** Server-only data for one connected player. */
interface PlayerSim {
  move: MoveState;
  collide: CollideFn;
  removeBody: () => void;
  inputs: MoveInput[];
  /** Seconds of input this player may still apply (anti speed-hack, see tick()). */
  budget: number;
  /** How far this player's noise carried this tick (GDD Section 12.2). */
  noiseM: number;
  /** Seconds the ghost cannot hit this player after a revive. */
  immuneLeft: number;
  action: Action | null;
  breathLeft: number;
  flashlightBeforeDowned: boolean;
  // Voice (GDD Section 13).
  /** This player's normal speaking level from the mic check, or null before it. */
  normalDbfs: number | null;
  voiceLevel: VoiceLevel;
  /** Levels from the last levelHoldSec, so pauses between words do not cut the voice. */
  recentLevels: VoiceLevel[];
  /** How far the ghost hears this player's voice, refreshed with each voice update. */
  voiceNoiseM: number;
  micDeadSec: number;
  micLost: boolean;
  micCheck: { samples: number[]; elapsed: number } | null;
  // Tasks (GDD Section 9).
  tasks: { stationId: string; done: boolean }[];
  /** The minigame open right now (a task, or taking a relic from a spot), and for how long. */
  task: { kind: "task" | "relic"; stationId: string; elapsed: number; noiseAt: number } | null;
}

/** Where a relic really is. Only the server knows (PRD 10.3); clients learn it only up close. */
interface RelicSim {
  id: string;
  /** The hiding spot it is in, or the spot it was taken from. */
  spotId: string;
  x: number;
  z: number;
  status: RelicStatus;
}

/** Ear height for walls between two players' voices (also used for camera line of sight). */
const VOICE_SIGHT_HEIGHT_M = 1.6;

/** A Spirit Camera photo: who was in the frame and whether each shows as cursed. */
interface PhotoRecord {
  by: string;
  nightTime: number;
  subjects: { id: string; cursed: boolean }[];
  ghostInFrame: boolean;
}

const ACTION_SECONDS: Record<Action["kind"], number> = {
  revive: config.health.reviveSec,
  hide: config.movement.hideEnterExitSec,
  unhide: config.movement.hideEnterExitSec,
  salt: config.salt.placeSec,
  placeRelic: config.relics.placeSec,
};

export class HauntedRoom extends Room<{ state: GameState }> {
  /** Creates the voice service for a room. Tests replace this with a fake. */
  static voiceFactory: (voiceRoomName: string) => VoiceBackend = (name) => liveKitFromEnv(name) ?? new NoVoice();

  maxClients = config.players.max;
  state = new GameState();
  patchRate = 1000 / config.net.tickRate;

  private map: MapData = defaultMap;
  private physics!: PhysicsWorld;
  private ghost!: Ghost;
  private sims = new Map<string, PlayerSim>();
  private spawnIndex = 0;
  private nightStarted = false;
  private dawnSent = false;
  private overtimeUsed = 0;
  private noises: { x: number; z: number; radiusM: number }[] = [];
  /** Clients that currently know where the ghost is (so they get one "gone" message). */
  private seesGhost = new Set<string>();
  private voice: VoiceBackend = new NoVoice();
  private voiceTimer = 0;
  private saltCounter = 0;
  /** Spirit Camera photos, kept on the server until the next meeting shows them (Phase 6). */
  private photos: PhotoRecord[] = [];
  private relics: RelicSim[] = [];
  /** The ghost's navmesh once the relic door is open (until then it walks one with the door as a wall). */
  private openNav: NavMap | null = null;
  private relicTimer = 0;

  async onCreate() {
    // The 5-letter room code is the Colyseus room id, so friends join with joinById(code).
    this.roomId = uniqueRoomCode();

    // Voice room names are unique even if a room code is reused after a restart.
    const voice = HauntedRoom.voiceFactory(`${this.roomId}-${Date.now()}`);
    try {
      await voice.start();
      this.voice = voice;
      if (voice.enabled) recordVoiceStart();
    } catch (err) {
      console.error("Voice could not start; this room runs without voice.", err);
      recordVoiceStart(err);
    }

    await initPhysics();
    this.physics = new PhysicsWorld(this.map);
    for (const door of this.map.doors) this.state.doors.set(door.id, new Door({ open: false }));
    // Every jar spot is stocked until the lobby decides the player count (Phase 7).
    for (const jar of this.map.saltJars) this.state.saltJars.set(jar.id, new SaltJar({ taken: false }));
    for (const station of this.map.tasks) this.state.stations.set(station.id, new TaskStation({ done: false }));
    // Relics hide in random spots each match (GDD 10). The count becomes a lobby setting in Phase 7.
    pickRelicSpots(this.map.relicSpots, config.relics.count, config.relics.minSpacingM, Math.random, (a, b) => this.hearingDistance(a, b)).forEach((spot, i) => {
      const id = `R${i + 1}`;
      this.relics.push({ id, spotId: spot.id, x: spot.x, z: spot.z, status: "hidden" });
      this.state.relics.set(id, new Relic({ name: this.map.relicNames[i] ?? `Relic ${i + 1}`, status: "hidden", carrier: "" }));
    });
    this.state.tasksDone = 0;
    this.state.tasksTotal = 0;
    this.state.nightLength = config.match.lengthMin * 60;
    this.state.nightTime = 0;
    this.state.part = "quiet";
    this.state.overtime = false;
    this.state.ritualReady = false;
    this.state.ritualStarted = false;
    this.state.ritualProgress = 0;

    // While the relic door is locked the ghost cannot get past it either (GDD 10).
    const relicDoor = this.map.relicDoor;
    this.openNav = await NavMap.create(this.map);
    const nav = relicDoor ? await NavMap.create(this.map, [relicDoor]) : this.openNav;
    // The ghost starts asleep where the map says (far from the spawn), else in the last room listed.
    const lastRoom = this.map.rooms[this.map.rooms.length - 1]!;
    const start = this.map.ghostStart ?? { x: (lastRoom.minX + lastRoom.maxX) / 2, z: (lastRoom.minZ + lastRoom.maxZ) / 2 };
    this.ghost = new Ghost(nav, this.ghostWorld(), start);

    this.onMessage("input", (client, raw: unknown) => {
      const sim = this.sims.get(client.sessionId);
      const input = sanitizeInput(raw);
      if (!sim || !input) return;
      sim.inputs.push(input);
      // A client that floods inputs only loses its oldest ones.
      if (sim.inputs.length > config.net.maxQueuedInputs) sim.inputs.shift();
    });

    this.onMessage("flashlight", (client) => {
      const player = this.state.players.get(client.sessionId);
      // Downed and dead players cannot use items (GDD Section 7).
      if (player && player.health === "alive") player.flashlightOn = !player.flashlightOn;
    });

    this.onMessage("use", (client, msg: unknown) => {
      const down = typeof msg === "object" && msg !== null && (msg as { down?: unknown }).down === true;
      if (down) this.startUse(client.sessionId);
      else this.cancelAction(client.sessionId);
    });

    this.onMessage("pourSalt", (client) => {
      const sim = this.sims.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!sim || !player || sim.action) return;
      if (player.health !== "alive" || player.hidingSpot || player.salt <= 0) return;
      this.setAction(sim, player, { kind: "salt", elapsed: 0 });
    });

    this.onMessage("photo", (client) => this.takePhoto(client.sessionId));

    this.onMessage("tasksRequest", (client) => this.sendTasks(client.sessionId));
    this.onMessage("taskDone", (client, msg: unknown) => {
      const id = typeof msg === "object" && msg !== null ? (msg as { stationId?: unknown }).stationId : undefined;
      if (typeof id === "string") this.finishTask(client.sessionId, id);
    });
    this.onMessage("taskCancel", (client) => this.closeTask(client.sessionId, "cancelled"));
    this.onMessage("taskNoise", (client) => this.taskNoise(client.sessionId));
    this.onMessage("dropRelic", (client) => this.dropRelic(client.sessionId, true));

    this.onMessage("voiceRequest", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) void this.sendVoiceJoin(client, player.name);
    });

    this.onMessage("micCheck", (client) => {
      const sim = this.sims.get(client.sessionId);
      if (sim) sim.micCheck = { samples: [], elapsed: 0 };
    });

    if (DEBUG) {
      this.onMessage("debug", (client, msg: { nightTime?: number; down?: boolean; bleedLeft?: number; huntIn?: number; teleport?: { x: number; z: number } }) => {
        if (typeof msg?.nightTime === "number") this.state.nightTime = msg.nightTime;
        if (typeof msg?.huntIn === "number") this.ghost.debugHuntIn(msg.huntIn);
        if (msg?.down) this.downPlayer(client.sessionId);
        const player = this.state.players.get(client.sessionId);
        if (player && typeof msg?.bleedLeft === "number") player.bleedLeft = msg.bleedLeft;
        // Jump straight to a spot (tests on the full map, where walking would take a minute).
        const sim = this.sims.get(client.sessionId);
        if (player && sim && typeof msg?.teleport?.x === "number" && typeof msg.teleport.z === "number") {
          sim.move = { ...sim.move, x: msg.teleport.x, z: msg.teleport.z };
          player.x = msg.teleport.x;
          player.z = msg.teleport.z;
        }
      });
    }

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), 1000 / config.net.tickRate);
  }

  onJoin(client: Client, options?: JoinOptions) {
    const name = cleanPlayerName(options?.name);
    if (!name) throw new Error(`Name must be 1 to ${config.room.nameMaxLength} characters`);

    const spawn = this.map.spawns[this.spawnIndex++ % this.map.spawns.length]!;
    const body = this.physics.addBody();
    const move = initialMoveState(spawn.x, spawn.z);
    this.sims.set(client.sessionId, {
      move,
      collide: body.collide,
      removeBody: body.remove,
      inputs: [],
      budget: 0,
      noiseM: 0,
      immuneLeft: 0,
      action: null,
      breathLeft: 0,
      flashlightBeforeDowned: true,
      tasks: assignTasks(this.map.tasks, config.tasks.perPlayer).map((t) => ({ stationId: t.id, done: false })),
      task: null,
      normalDbfs: null,
      voiceLevel: "silent",
      recentLevels: [],
      voiceNoiseM: 0,
      micDeadSec: 0,
      micLost: false,
      micCheck: null,
    });

    this.state.players.set(
      client.sessionId,
      new Player({
        name,
        x: move.x,
        z: move.z,
        yaw: 0,
        pitch: 0,
        crouching: false,
        flashlightOn: true,
        stamina: move.stamina,
        regenWait: 0,
        lastSeq: 0,
        health: "alive",
        bleedLeft: 0,
        hidingSpot: "",
        holdingBreath: false,
        breathCooldown: 0,
        action: "",
        actionProgress: 0,
        salt: config.salt.perPlayer,
        cameraShots: config.camera.shotsPerPlayer,
        relic: "",
      }),
    );
    this.state.tasksTotal += this.sims.get(client.sessionId)!.tasks.length;
    // The night starts when the first player arrives. The lobby and Start button come in Phase 7.
    this.nightStarted = true;
    this.announce("join", name, `${name} joined the room`);
    // The voice pass is sent when the client asks ("voiceRequest"), not here: a message sent
    // during the join can reach the client before it has started listening, and be lost.
  }

  /** Gives the player their voice pass, or tells them voice is off on this server. */
  private async sendVoiceJoin(client: Client, name: string) {
    let msg: ServerMessages["voice"] = { disabled: true };
    try {
      msg = (await this.voice.join(client.sessionId, name)) ?? { disabled: true };
    } catch (err) {
      console.error("Voice token failed", err);
    }
    client.send("voice", msg);
  }

  onLeave(client: Client) {
    const leaving = this.sims.get(client.sessionId);
    // A player who leaves takes their unfinished tasks off the bar; finished ones still count.
    if (leaving) this.state.tasksTotal -= leaving.tasks.filter((t) => !t.done).length;
    // A relic they carried falls where they stood (GDD 18).
    this.dropRelic(client.sessionId, false);
    leaving?.removeBody();
    this.sims.delete(client.sessionId);
    this.seesGhost.delete(client.sessionId);
    this.voice.remove(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.state.players.delete(client.sessionId);
    this.announce("leave", player.name, `${player.name} left the room`);
  }

  async onDispose() {
    activeCodes.delete(this.roomId);
    await this.voice.dispose();
  }

  private tick(elapsedSec: number) {
    for (const [sessionId, sim] of this.sims) {
      const player = this.state.players.get(sessionId);
      if (player) this.tickPlayer(sim, player, elapsedSec);
    }

    this.voiceTimer += elapsedSec;
    if (this.voiceTimer * 1000 >= config.voice.subscriptionRefreshMs) {
      this.tickVoice(this.voiceTimer);
      this.voiceTimer = 0;
    }

    if (this.nightStarted) {
      if (!this.dawnSent) this.tickRitual(elapsedSec);
      this.state.nightTime = Math.min(this.state.nightTime + elapsedSec, this.state.nightLength);
      let part = nightPart(this.state.nightTime, this.state.nightLength);
      if (part === "dawn" && !this.dawnSent && this.overtimeHolds()) {
        // Overtime: the night waits while the ritual can still finish (GDD 4). The ghost stays furious.
        this.overtimeUsed += elapsedSec;
        this.state.overtime = true;
        part = "furious";
      } else {
        this.state.overtime = false;
      }
      this.state.part = this.state.overtime ? "overtime" : part;
      this.ghost.update(elapsedSec, part, this.state.players.size);
      if (part === "dawn" && !this.dawnSent) {
        this.dawnSent = true;
        const dawn: ServerMessages["dawn"] = {};
        this.broadcast("dawn", dawn);
      }
    }
    this.noises.length = 0;
    this.sendGhostPositions();
    this.relicTimer += elapsedSec;
    if (this.relicTimer >= 1 / config.relics.nearUpdateHz) {
      this.relicTimer = 0;
      this.sendRelicsNear();
    }
  }

  // ---------- The ritual (GDD Section 11) ----------

  /** Starts the ritual once it is ready and the circle is full, then fills or drains it. */
  private tickRitual(dt: number) {
    const s = this.state;
    s.ritualReady = !this.relicDoorLocked() && s.tasksTotal > 0 && s.tasksDone >= s.tasksTotal;
    s.circleNeeded = circleNeeded(s.players.size);
    s.circleCount = this.playersInCircle();
    if (!s.ritualStarted && s.ritualReady && s.circleCount >= s.circleNeeded) s.ritualStarted = true;
    if (!s.ritualStarted || s.ritualProgress >= 100) return;
    // A meeting will freeze it here instead (Phase 6). The ritual length becomes a lobby setting in Phase 7.
    const rate = ritualRatePct(s.circleCount, s.circleNeeded, config.ritual.baseSec);
    s.ritualProgress = Math.max(0, Math.min(100, s.ritualProgress + rate * dt));
  }

  /** Living, standing players inside the circle around the altar. Downed, dead and hidden players do not count. */
  private playersInCircle(): number {
    const altar = this.map.altar;
    if (!altar) return 0;
    let count = 0;
    this.state.players.forEach((p) => {
      if (p.health === "alive" && !p.hidingSpot && this.hearingDistance(p, altar) <= config.ritual.circleRadiusM) count++;
    });
    return count;
  }

  /** At dawn, a running ritual with enough players in the circle gets up to overtimeSec more. */
  private overtimeHolds(): boolean {
    const s = this.state;
    return s.ritualStarted && s.ritualProgress < 100 && s.circleCount >= s.circleNeeded && this.overtimeUsed < config.match.overtimeSec;
  }

  /**
   * Applies queued movement inputs. Each player earns input time equal to the real time that
   * passed (server timers often fire late, so counting ticks would fall behind the client),
   * and may bank at most maxInputAheadSec, so a hacked client sending extra inputs
   * cannot move faster than the rules allow. Then runs health, breath and actions.
   */
  private tickPlayer(sim: PlayerSim, player: Player, elapsedSec: number) {
    sim.budget = Math.min(sim.budget + elapsedSec, config.net.maxInputAheadSec);
    sim.noiseM = 0;
    const startX = sim.move.x;
    const startZ = sim.move.z;
    const mode = this.moveMode(player);
    let lastInput: MoveInput | null = null;

    while (sim.inputs.length > 0 && sim.budget >= SIM_DT - 1e-9) {
      const input = sim.inputs.shift()!;
      if (input.seq <= player.lastSeq) continue; // duplicate or old
      const before = sim.move;
      sim.move = stepMovement(sim.move, input, SIM_DT, sim.collide, mode);
      sim.budget -= SIM_DT;
      player.lastSeq = input.seq;
      player.yaw = input.yaw;
      player.pitch = input.pitch;
      lastInput = input;
      if (sim.move.x !== before.x || sim.move.z !== before.z) {
        sim.noiseM = Math.max(sim.noiseM, this.movementNoise(input, mode, before, sim.move));
      }
    }

    player.x = sim.move.x;
    player.z = sim.move.z;
    player.crouching = sim.move.crouching;
    player.stamina = sim.move.stamina;
    player.regenWait = sim.move.regenWait;

    const moved = Math.hypot(sim.move.x - startX, sim.move.z - startZ) > 1e-3;
    this.tickHealth(sim, player, elapsedSec);
    this.tickBreath(sim, player, lastInput, elapsedSec);
    this.tickAction(sim, player, moved, elapsedSec);
    if (sim.task) {
      sim.task.elapsed += elapsedSec;
      // Walking away or being downed closes the minigame; the task must be restarted (GDD 9).
      // A small drift (steps still on the way when E was pressed) does not count.
      const at = this.activityAt(sim.task);
      const away = !at || Math.hypot(at.x - sim.move.x, at.z - sim.move.z) > at.rangeM;
      if (away || player.health !== "alive") this.closeTask(this.sessionOf(sim), "cancelled");
    }
  }

  private moveMode(player: Player): MoveMode {
    if (player.health === "downed") return "crawl";
    if (player.health === "dead" || player.hidingSpot) return "frozen";
    return player.relic ? "carry" : "normal";
  }

  /** How far a step of movement can be heard (GDD Section 12.2). */
  private movementNoise(input: MoveInput, mode: MoveMode, before: MoveState, after: MoveState): number {
    const h = config.ghost.hearingM;
    if (mode === "crawl" || after.crouching) return h.crouch;
    // Same rule as stepMovement: running needs stamina left at the start of the step.
    return input.run && before.stamina > 0 ? h.run : h.walk;
  }

  // ---------- Voice (GDD Section 13, PRD Section 10.5) ----------

  /**
   * Every subscriptionRefreshMs: read each player's real loudness, run mic checks, track lost
   * mics, let the ghost hear voices, and decide who hears whom and how loud.
   */
  private tickVoice(dt: number) {
    if (!this.voice.enabled) return;
    const v = config.voice;

    for (const [id, sim] of this.sims) {
      const player = this.state.players.get(id);
      if (!player) continue;
      const db = this.voice.levelDbfs(id);
      sim.voiceLevel = classifyVoice(db, sim.normalDbfs ?? v.defaultNormalDbfs);
      sim.recentLevels.push(sim.voiceLevel);
      const keep = Math.max(1, Math.round((v.levelHoldSec * 1000) / v.subscriptionRefreshMs));
      while (sim.recentLevels.length > keep) sim.recentLevels.shift();

      if (sim.micCheck) {
        sim.micCheck.samples.push(db);
        sim.micCheck.elapsed += dt;
        if (sim.micCheck.elapsed >= v.micCheckSec) this.finishMicCheck(id, sim);
      }

      if (this.voice.micLive(id)) {
        sim.micDeadSec = 0;
        if (sim.micLost) this.setMicLost(id, sim, false);
      } else {
        sim.micDeadSec += dt;
        if (!sim.micLost && sim.micDeadSec >= v.micLostAfterSec) this.setMicLost(id, sim, true);
      }

      // A lost mic counts as talking normally, so turning it off never hides you (GDD 13).
      const level: VoiceLevel = sim.micLost ? (v.micLostCountsAs as VoiceLevel) : sim.voiceLevel;
      sim.voiceNoiseM = player.health === "dead" ? 0 : ghostHearRangeM(level);
    }

    for (const client of this.clients) this.routeVoices(client);
  }

  private finishMicCheck(id: string, sim: PlayerSim) {
    const samples = sim.micCheck!.samples;
    sim.micCheck = null;
    const normal = calibrateNormal(samples, config.voice.subscriptionRefreshMs / 1000);
    const client = this.clients.find((c) => c.sessionId === id);
    let result: ServerMessages["micCheck"];
    if (normal === null) {
      result = { ok: false, reason: "We could not hear you. Check your microphone and read the sentence out loud." };
    } else {
      sim.normalDbfs = normal;
      result = { ok: true, normalDbfs: normal };
    }
    client?.send("micCheck", result);
  }

  private setMicLost(id: string, sim: PlayerSim, lost: boolean) {
    sim.micLost = lost;
    const msg: ServerMessages["micLost"] = { lost };
    this.clients.find((c) => c.sessionId === id)?.send("micLost", msg);
  }

  /**
   * Who this listener hears and how loud. The living hear the living within routeRangeM
   * (the volume curve does the rest); the dead hear only the dead, at full volume.
   */
  private routeVoices(client: Client) {
    const listener = this.state.players.get(client.sessionId);
    if (!listener) return;
    const listenerDead = listener.health === "dead";
    const speakers = new Set<string>();
    const mix: ServerMessages["voiceMix"] = {};

    for (const [id, sim] of this.sims) {
      if (id === client.sessionId) continue;
      const speaker = this.state.players.get(id);
      if (!speaker) continue;
      const speakerDead = speaker.health === "dead";
      if (speakerDead !== listenerDead) continue;
      const boost = playbackBoost(sim.normalDbfs);
      if (listenerDead) {
        speakers.add(id);
        mix[id] = [1, 0, boost];
        continue;
      }
      const dist = this.hearingDistance(speaker, listener);
      if (dist > config.voice.routeRangeM) continue;
      speakers.add(id);
      const wall = !this.physics.lineOfSight(listener, speaker, VOICE_SIGHT_HEIGHT_M);
      mix[id] = [voiceVolume(dist, speakingLevel(sim.recentLevels), wall), wall ? 1 : 0, boost];
    }

    this.voice.route(client.sessionId, speakers);
    client.send("voiceMix", mix);
  }

  // ---------- Health (GDD Section 7) ----------

  private tickHealth(sim: PlayerSim, player: Player, dt: number) {
    if (sim.immuneLeft > 0) sim.immuneLeft = Math.max(0, sim.immuneLeft - dt);
    if (player.health !== "downed") return;
    player.bleedLeft = Math.max(0, player.bleedLeft - dt);
    if (player.bleedLeft <= 0) {
      player.health = "dead";
      player.flashlightOn = false;
    }
  }

  /** The ghost caught this player. */
  private downPlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const sim = this.sims.get(sessionId);
    if (!player || !sim || player.health !== "alive") return;
    if (player.hidingSpot) {
      // Pulled out of the hiding spot.
      const spot = this.map.hidingSpots.find((s) => s.id === player.hidingSpot);
      if (spot) sim.move = { ...sim.move, x: spot.exit.x, z: spot.exit.z };
      player.hidingSpot = "";
    }
    player.health = "downed" satisfies Health;
    player.bleedLeft = config.health.bleedOutSec;
    sim.flashlightBeforeDowned = player.flashlightOn;
    player.flashlightOn = false;
    player.holdingBreath = false;
    this.clearAction(sim, player);
    // A downed player drops what they carry (GDD 10).
    this.dropRelic(sessionId, false);
  }

  // ---------- Hold breath while hiding (GDD Section 6) ----------

  private tickBreath(sim: PlayerSim, player: Player, input: MoveInput | null, dt: number) {
    const wantsHold = !!player.hidingSpot && player.health === "alive" && (input?.run ?? player.holdingBreath);
    if (player.holdingBreath) {
      sim.breathLeft -= dt;
      if (!wantsHold || sim.breathLeft <= 0) {
        player.holdingBreath = false;
        player.breathCooldown = config.movement.breathCooldownSec;
      }
    } else {
      player.breathCooldown = Math.max(0, player.breathCooldown - dt);
      if (wantsHold && player.breathCooldown <= 0) {
        player.holdingBreath = true;
        sim.breathLeft = config.movement.breathHoldSec;
      }
    }
    if (player.hidingSpot) sim.noiseM = player.holdingBreath ? 0 : config.ghost.hearingM.hiddenBreath;
  }

  // ---------- Holding E (GDD Sections 6 and 7) ----------

  /** E pressed: pick the action for where this player is standing. */
  private startUse(sessionId: string) {
    const sim = this.sims.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!sim || !player || player.health !== "alive" || sim.action) return;
    const here = { x: sim.move.x, z: sim.move.z };

    if (player.hidingSpot) {
      this.setAction(sim, player, { kind: "unhide", elapsed: 0 });
      return;
    }

    let reviveId: string | null = null;
    let best: number = config.interact.reviveRangeM;
    this.state.players.forEach((p, id) => {
      const d = Math.hypot(p.x - here.x, p.z - here.z);
      if (id !== sessionId && p.health === "downed" && d <= best) {
        best = d;
        reviveId = id;
      }
    });
    if (reviveId) {
      this.setAction(sim, player, { kind: "revive", targetId: reviveId, elapsed: 0 });
      return;
    }

    if (this.pickUpRelic(player, here.x, here.z)) return;
    if (player.relic && this.nearRelicDoor(here.x, here.z)) {
      this.setAction(sim, player, { kind: "placeRelic", elapsed: 0 });
      return;
    }
    if (this.pickUpSalt(player, here.x, here.z)) return;
    if (this.openTask(sessionId, sim, player, here.x, here.z)) return;
    if (this.openRelicSpot(sessionId, sim, player, here.x, here.z)) return;

    const spot = this.nearestFreeHidingSpot(here.x, here.z);
    if (spot) {
      this.setAction(sim, player, { kind: "hide", spotId: spot.id, elapsed: 0 });
      return;
    }

    this.toggleNearestDoor(here.x, here.z);
  }

  private nearestFreeHidingSpot(x: number, z: number) {
    let found: (typeof this.map.hidingSpots)[number] | undefined;
    let best: number = config.interact.hideRangeM;
    for (const spot of this.map.hidingSpots) {
      const d = Math.hypot(spot.exit.x - x, spot.exit.z - z);
      if (d > best) continue;
      let taken = false;
      this.state.players.forEach((p) => {
        if (p.hidingSpot === spot.id) taken = true;
      });
      if (!taken) {
        best = d;
        found = spot;
      }
    }
    return found;
  }

  private setAction(sim: PlayerSim, player: Player, action: Action) {
    sim.action = action;
    player.action = action.kind satisfies PlayerAction;
    player.actionProgress = 0;
  }

  private clearAction(sim: PlayerSim, player: Player) {
    sim.action = null;
    player.action = "";
    player.actionProgress = 0;
  }

  /** E released. */
  private cancelAction(sessionId: string) {
    const sim = this.sims.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (sim && player && sim.action) this.clearAction(sim, player);
  }

  private tickAction(sim: PlayerSim, player: Player, moved: boolean, dt: number) {
    const action = sim.action;
    if (!action) return;
    // Moving or being downed cancels any timed action (GDD Section 7).
    if (moved || player.health !== "alive") return this.clearAction(sim, player);

    if (action.kind === "revive") {
      const target = this.state.players.get(action.targetId);
      const near = target && Math.hypot(target.x - sim.move.x, target.z - sim.move.z) <= config.interact.reviveRangeM;
      if (!target || target.health !== "downed" || !near) return this.clearAction(sim, player);
    }

    action.elapsed += dt;
    const duration = ACTION_SECONDS[action.kind];
    player.actionProgress = Math.min(1, action.elapsed / duration);
    if (action.elapsed < duration) return;

    this.clearAction(sim, player);
    if (action.kind === "revive") this.revive(action.targetId);
    else if (action.kind === "hide") this.hide(sim, player, action.spotId);
    else if (action.kind === "salt") this.pourSalt(player);
    else if (action.kind === "placeRelic") this.placeRelic(player);
    else this.unhide(sim, player);
  }

  private revive(targetId: string) {
    const target = this.state.players.get(targetId);
    const sim = this.sims.get(targetId);
    if (!target || !sim || target.health !== "downed") return;
    target.health = "alive";
    target.bleedLeft = 0;
    target.flashlightOn = sim.flashlightBeforeDowned;
    sim.immuneLeft = config.health.postReviveImmunitySec;
  }

  private hide(sim: PlayerSim, player: Player, spotId: string) {
    const spot = this.map.hidingSpots.find((s) => s.id === spotId);
    if (!spot) return;
    let taken = false;
    this.state.players.forEach((p) => {
      if (p.hidingSpot === spotId) taken = true;
    });
    if (taken) return;
    player.hidingSpot = spotId;
    sim.move = { ...sim.move, x: spot.x, z: spot.z };
    player.x = spot.x;
    player.z = spot.z;
  }

  private unhide(sim: PlayerSim, player: Player) {
    const spot = this.map.hidingSpots.find((s) => s.id === player.hidingSpot);
    player.hidingSpot = "";
    player.holdingBreath = false;
    if (!spot) return;
    sim.move = { ...sim.move, x: spot.exit.x, z: spot.exit.z };
    player.x = spot.exit.x;
    player.z = spot.exit.z;
  }

  // ---------- Tasks (GDD Section 9) ----------

  private sessionOf(sim: PlayerSim): string {
    for (const [id, s] of this.sims) if (s === sim) return id;
    return "";
  }

  private sendTasks(sessionId: string) {
    const sim = this.sims.get(sessionId);
    if (!sim) return;
    const list: TaskEntry[] = sim.tasks.map((t) => {
      const def = this.map.tasks.find((d) => d.id === t.stationId)!;
      return { stationId: t.stationId, name: def.name, room: def.room, done: t.done };
    });
    const msg: ServerMessages["tasks"] = { list };
    this.clients.find((c) => c.sessionId === sessionId)?.send("tasks", msg);
  }

  /** E at a station where you have an unfinished task: open its minigame. */
  private openTask(sessionId: string, sim: PlayerSim, player: Player, x: number, z: number): boolean {
    if (sim.task) return false;
    for (const task of sim.tasks) {
      if (task.done) continue;
      const def = this.map.tasks.find((d) => d.id === task.stationId);
      if (!def || Math.hypot(def.x - x, def.z - z) > config.tasks.useRangeM) continue;
      sim.task = { kind: "task", stationId: def.id, elapsed: 0, noiseAt: -Infinity };
      player.action = "task";
      player.actionProgress = 0;
      const msg: ServerMessages["taskOpen"] = { stationId: def.id, minigame: def.minigame, title: def.name };
      this.clients.find((c) => c.sessionId === sessionId)?.send("taskOpen", msg);
      return true;
    }
    return false;
  }

  /**
   * The client says the minigame is finished. The server only accepts it if that task is open,
   * enough time has passed for the minigame, and the player is still at the station.
   */
  private finishTask(sessionId: string, stationId: string) {
    const sim = this.sims.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!sim || !player || sim.task?.stationId !== stationId) return;
    const at = this.activityAt(sim.task);
    const minSec = sim.task.kind === "relic" ? config.relics.serverMinSec : config.tasks.serverMinSec;
    const tooFast = sim.task.elapsed < minSec;
    const tooFar = !at || Math.hypot(at.x - player.x, at.z - player.z) > at.rangeM;
    if (tooFast || tooFar || player.health !== "alive") return this.closeTask(sessionId, "cancelled");
    if (sim.task.kind === "relic") return this.takeRelic(sessionId, player, stationId);

    const def = this.map.tasks.find((d) => d.id === stationId)!;

    const task = sim.tasks.find((t) => t.stationId === stationId);
    if (task && !task.done) {
      task.done = true;
      this.state.tasksDone += 1;
      if (def.visible) this.state.stations.get(stationId)!.done = true;
    }
    this.closeTask(sessionId, "done");
    this.sendTasks(sessionId);
  }

  /** A noisy minigame went wrong (GDD 9): the ghost may hear it, and so do players nearby. */
  private taskNoise(sessionId: string) {
    const sim = this.sims.get(sessionId);
    const def = sim?.task?.kind === "task" ? this.map.tasks.find((d) => d.id === sim.task!.stationId) : undefined;
    if (!sim?.task || !def?.noisy) return;
    if (sim.task.elapsed - sim.task.noiseAt < config.tasks.noiseCooldownSec) return;
    sim.task.noiseAt = sim.task.elapsed;
    const radiusM = config.tasks.noisyFailGhostHearM;
    this.noises.push({ x: def.x, z: def.z, radiusM });
    const msg: ServerMessages["taskNoise"] = { x: def.x, z: def.z, minigame: def.minigame };
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (client.sessionId !== sessionId && p && this.hearingDistance(p, def) <= radiusM) client.send("taskNoise", msg);
    }
  }

  /** Where a minigame is done, and how far you may stand from it. */
  private activityAt(task: NonNullable<PlayerSim["task"]>): { x: number; z: number; rangeM: number } | null {
    if (task.kind === "relic") {
      const spot = this.map.relicSpots.find((s) => s.id === task.stationId);
      return spot ? { x: spot.x, z: spot.z, rangeM: config.relics.useRangeM } : null;
    }
    const def = this.map.tasks.find((d) => d.id === task.stationId);
    return def ? { x: def.x, z: def.z, rangeM: config.tasks.useRangeM } : null;
  }

  // ---------- Relics (GDD Section 10) ----------

  /** E at a spot that still hides a relic, with empty hands: open its taking minigame. */
  private openRelicSpot(sessionId: string, sim: PlayerSim, player: Player, x: number, z: number): boolean {
    if (sim.task || player.relic) return false;
    for (const relic of this.relics) {
      if (relic.status !== "hidden" || Math.hypot(relic.x - x, relic.z - z) > config.relics.useRangeM) continue;
      const spot = this.map.relicSpots.find((s) => s.id === relic.spotId)!;
      sim.task = { kind: "relic", stationId: spot.id, elapsed: 0, noiseAt: -Infinity };
      player.action = "task";
      player.actionProgress = 0;
      const msg: ServerMessages["taskOpen"] = { stationId: spot.id, minigame: spot.minigame, title: spot.label };
      this.clients.find((c) => c.sessionId === sessionId)?.send("taskOpen", msg);
      return true;
    }
    return false;
  }

  /** The taking minigame is finished: the relic is yours, unless someone was quicker. */
  private takeRelic(sessionId: string, player: Player, spotId: string) {
    const relic = this.relics.find((r) => r.spotId === spotId && r.status === "hidden");
    if (!relic || player.relic) return this.closeTask(sessionId, "cancelled");
    this.carry(player, relic);
    this.closeTask(sessionId, "done");
  }

  private carry(player: Player, relic: RelicSim) {
    relic.status = "carried";
    player.relic = relic.id;
    const shown = this.state.relics.get(relic.id)!;
    shown.status = relic.status;
    shown.carrier = player.name;
  }

  /** E next to a dropped relic, with empty hands: pick it up straight away. */
  private pickUpRelic(player: Player, x: number, z: number): boolean {
    if (player.relic) return false;
    const relic = this.relics.find((r) => r.status === "dropped" && Math.hypot(r.x - x, r.z - z) <= config.relics.useRangeM);
    if (!relic) return false;
    this.carry(player, relic);
    return true;
  }

  private nearRelicDoor(x: number, z: number): boolean {
    const door = this.map.doors.find((d) => d.id === this.map.relicDoor);
    return !!door && Math.hypot(door.x - x, door.z - z) <= config.interact.rangeM;
  }

  /** The held relic goes into a slot of the relic door for good. The last one opens the basement (GDD 10). */
  private placeRelic(player: Player) {
    const relic = this.relics.find((r) => r.id === player.relic);
    const door = this.map.doors.find((d) => d.id === this.map.relicDoor);
    if (!relic || !door || !this.nearRelicDoor(player.x, player.z)) return;
    player.relic = "";
    relic.status = "placed";
    relic.x = door.x;
    relic.z = door.z;
    this.state.relics.get(relic.id)!.status = relic.status;
    if (this.relicDoorLocked()) return;
    this.setDoor(door.id, true);
    if (this.openNav) this.ghost.setNav(this.openNav);
  }

  /** The relic door stays shut until every relic is placed. */
  private relicDoorLocked(): boolean {
    return !!this.map.relicDoor && this.relics.some((r) => r.status !== "placed");
  }

  /**
   * The relic falls where the player stands: on purpose with G (which makes a noise, GDD 10),
   * or because they were downed or left. Tab then shows "Dropped, last carried by" them.
   */
  private dropRelic(sessionId: string, onPurpose: boolean) {
    const player = this.state.players.get(sessionId);
    const relic = player && this.relics.find((r) => r.id === player.relic);
    if (!player || !relic) return;
    if (onPurpose && player.health !== "alive") return;
    player.relic = "";
    relic.status = "dropped";
    relic.x = player.x;
    relic.z = player.z;
    this.state.relics.get(relic.id)!.status = relic.status;
    if (!onPurpose) return;
    const radiusM = config.relics.dropGhostHearM;
    this.noises.push({ x: relic.x, z: relic.z, radiusM });
    const msg: ServerMessages["relicDrop"] = { x: relic.x, z: relic.z };
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (p && this.hearingDistance(p, relic) <= radiusM) client.send("relicDrop", msg);
    }
  }

  /** Each player hears hidden relics within whisper range and sees dropped ones within sight. */
  private sendRelicsNear() {
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (!p) continue;
      const list: RelicNear[] = [];
      for (const r of this.relics) {
        const d = this.hearingDistance(r, p);
        if (r.status === "hidden" && d <= config.relics.whisperM) list.push({ id: r.id, x: r.x, z: r.z, hidden: true, spotId: r.spotId });
        else if (r.status === "dropped" && d <= config.relics.seeDroppedM) list.push({ id: r.id, x: r.x, z: r.z, hidden: false, spotId: "" });
      }
      const msg: ServerMessages["relicsNear"] = { list };
      client.send("relicsNear", msg);
    }
  }

  private closeTask(sessionId: string, reason: "done" | "cancelled") {
    const sim = this.sims.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!sim?.task) return;
    const msg: ServerMessages["taskClosed"] = { stationId: sim.task.stationId, reason };
    sim.task = null;
    if (player && player.action === "task") {
      player.action = "";
      player.actionProgress = 0;
    }
    this.clients.find((c) => c.sessionId === sessionId)?.send("taskClosed", msg);
  }

  // ---------- Items (GDD Section 8) ----------

  /** E near an untouched jar: +1 salt, up to carryMax. Returns true if a jar was taken. */
  private pickUpSalt(player: Player, x: number, z: number): boolean {
    if (player.salt >= config.salt.carryMax) return false;
    for (const jar of this.map.saltJars) {
      const state = this.state.saltJars.get(jar.id);
      if (!state || state.taken || Math.hypot(jar.x - x, jar.z - z) > config.salt.jarRangeM) continue;
      state.taken = true;
      player.salt += 1;
      return true;
    }
    return false;
  }

  /** The 1 s pour finished: the line lands in front of the player, across where they face. */
  private pourSalt(player: Player) {
    if (player.salt <= 0) return;
    player.salt -= 1;
    const def = saltLineInFront(player.x, player.z, player.yaw);
    this.state.saltLines.set(`salt-${++this.saltCounter}`, new SaltLine(def));
  }

  /**
   * Spirit Camera (GDD 8.2 / 15.2): uses a shot, flashes (seen within 15 m, heard by the ghost
   * within 10 m), and records who was in the frame. Photos are shown at the next meeting
   * (Phase 6), which is also when the curse glow decides whether a face shows as a demon.
   */
  private takePhoto(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.health !== "alive" || player.cameraShots <= 0) return;
    player.cameraShots -= 1;
    const c = config.camera;
    const halfFov = ((c.photoFovDeg / 2) * Math.PI) / 180;
    const inFrame = (x: number, z: number) => {
      const dist = Math.hypot(x - player.x, z - player.z);
      if (dist > c.captureRangeM || dist < 1e-6) return false;
      const angleTo = Math.atan2(-(x - player.x), -(z - player.z));
      if (Math.abs(normalizeAngle(angleTo - player.yaw)) > halfFov) return false;
      return this.physics.lineOfSight(player, { x, z }, VOICE_SIGHT_HEIGHT_M);
    };

    const subjects: PhotoRecord["subjects"] = [];
    this.state.players.forEach((p, id) => {
      if (id !== sessionId && !p.hidingSpot && inFrame(p.x, p.z)) subjects.push({ id, cursed: false });
    });
    const ghostPresent = this.ghost.state !== "asleep" && this.ghost.state !== "gone" && this.ghost.state !== "retreat";
    this.photos.push({
      by: sessionId,
      nightTime: this.state.nightTime,
      subjects,
      ghostInFrame: ghostPresent && this.ghost.visible && inFrame(this.ghost.x, this.ghost.z),
    });

    const flash: ServerMessages["flash"] = { x: player.x, z: player.z, by: sessionId };
    for (const client of this.clients) {
      const other = this.state.players.get(client.sessionId);
      if (other && this.hearingDistance(other, player) <= c.flashVisibleM) client.send("flash", flash);
    }
    this.noises.push({ x: player.x, z: player.z, radiusM: c.flashGhostHearM });
    const taken: ServerMessages["photoTaken"] = { shotsLeft: player.cameraShots };
    this.clients.find((cl) => cl.sessionId === sessionId)?.send("photoTaken", taken);
  }

  private toggleNearestDoor(x: number, z: number) {
    let nearest: { id: string; dist: number } | undefined;
    for (const door of this.map.doors) {
      // The relic door cannot be worked by hand: it is locked, then open for good.
      if (door.id === this.map.relicDoor) continue;
      const dist = Math.hypot(door.x - x, door.z - z);
      if (dist <= config.interact.rangeM && (!nearest || dist < nearest.dist)) nearest = { id: door.id, dist };
    }
    if (!nearest) return;
    const door = this.map.doors.find((d) => d.id === nearest!.id)!;
    this.setDoor(door.id, !this.state.doors.get(door.id)!.open);
    // Opening or closing a door can be heard (GDD Section 12.2).
    this.noises.push({ x: door.x, z: door.z, radiusM: config.ghost.hearingM.door });
  }

  private setDoor(id: string, open: boolean) {
    const state = this.state.doors.get(id);
    if (!state || state.open === open) return;
    state.open = open;
    this.physics.setDoorOpen(id, open);
  }

  // ---------- Ghost ----------

  /** Real distance between two places, for sound and sight: through floors when they are on different ones (levels.ts). */
  private hearingDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return worldDistance(this.map, a, b);
  }

  private ghostWorld(): GhostWorld {
    return {
      distance: (a, b) => this.hearingDistance(a, b),
      players: () => {
        const list: GhostTarget[] = [];
        this.state.players.forEach((p, id) => {
          const sim = this.sims.get(id);
          if (!sim) return;
          list.push({
            id,
            x: p.x,
            z: p.z,
            health: p.health as Health,
            hidingSpot: p.hidingSpot || null,
            flashlightOn: p.flashlightOn,
            // Footsteps and breathing this tick, or the voice, whichever carries farther.
            // Carrying a relic makes every sound carry farther (GDD 12.2).
            noiseM: Math.max(sim.noiseM, sim.voiceNoiseM) * (p.relic ? 1 + config.relics.carryHearingBonusPct / 100 : 1),
            immune: sim.immuneLeft > 0,
          });
        });
        return list;
      },
      lineOfSight: (a, b, h) => this.physics.lineOfSight(a, b, h),
      doors: this.map.doors,
      ritualAt: () => (this.state.ritualStarted && this.map.altar ? this.map.altar : null),
      isDoorOpen: (id) => this.state.doors.get(id)?.open ?? true,
      openDoor: (id) => {
        if (id !== this.map.relicDoor || !this.relicDoorLocked()) this.setDoor(id, true);
      },
      hidingSpots: this.map.hidingSpots,
      takeNoises: () => this.noises.slice(),
      takeSaltAt: (x, z) => {
        let hit: string | null = null;
        this.state.saltLines.forEach((line, id) => {
          if (!hit && ghostOnSalt(x, z, line)) hit = id;
        });
        if (hit) this.state.saltLines.delete(hit);
        return hit !== null;
      },
      hit: (id) => this.downPlayer(id),
      huntEvent: (phase) => {
        const msg: ServerMessages["hunt"] = { phase };
        this.broadcast("hunt", msg);
      },
    };
  }

  /** Each client learns where the ghost is only while it is within interestRangeM (PRD 10.3). */
  private sendGhostPositions() {
    const g = this.ghost;
    const present = g.state !== "asleep" && g.state !== "gone" && g.state !== "retreat";
    const view: GhostView = { x: g.x, z: g.z, yaw: g.yaw, visible: g.visible };
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      const inRange = present && !!p && this.hearingDistance(p, g) <= config.ghost.interestRangeM;
      if (inRange) {
        client.send("ghost", view);
        this.seesGhost.add(client.sessionId);
      } else if (this.seesGhost.has(client.sessionId)) {
        client.send("ghost", null);
        this.seesGhost.delete(client.sessionId);
      }
    }
  }

  private announce(kind: ServerMessages["system"]["kind"], name: string, text: string) {
    const system: ServerMessages["system"] = { kind, name, text };
    this.broadcast("system", system);

    const players: RosterEntry[] = [];
    this.state.players.forEach((p, sessionId) => players.push({ sessionId, name: p.name }));
    const roster: ServerMessages["roster"] = { players };
    this.broadcast("roster", roster);
  }
}
