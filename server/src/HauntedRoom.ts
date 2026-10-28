import { Room, type Client } from "colyseus";
import {
  assignTasks,
  takenTasks,
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
  searchPlaces,
  ritualRatePct,
  nearestRoom,
  matchResult,
  pickPossessed,
  possessedCount,
  inPhotoFrame,
  countVotes,
  meetingBlocked,
  meetingStepSec,
  nextMeetingStep,
  SKIP,
  type MeetingStep,
  type DevelopedPhoto,
  POWER_KINDS,
  powerCooldownSec,
  powerUnlocked,
  summonSpots,
  type PowerKind,
  type PowerStatus,
  type Role,
  type Stage,
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
import { createTrick, type GhostTrick } from "./sim/tricks.ts";
import { Door, GameState, Player, Relic, SaltJar, SaltLine, SearchPlace, TaskStation } from "./state.ts";
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

/** Line of sight for a Summon and for a light on the possessed's eyes: eye height. */
const SUMMON_SIGHT_HEIGHT_M = 1.5;

/** Test-only shortcuts (skip time, get downed). Enabled only when the server is started with HAUNTED_DEBUG=1. */
const DEBUG = process.env.HAUNTED_DEBUG === "1";

/** A timed action a player is holding E for (GDD Sections 6 and 7). */
type Action =
  | { kind: "revive"; targetId: string; elapsed: number }
  | { kind: "hide"; spotId: string; elapsed: number }
  | { kind: "unhide"; elapsed: number }
  | { kind: "salt"; elapsed: number }
  | { kind: "breakDoor"; doorId: string; elapsed: number }
  | { kind: "fixFuse"; elapsed: number }
  | { kind: "cleanse"; elapsed: number }
  | { kind: "ringBell"; elapsed: number }
  | { kind: "report"; targetId: string; elapsed: number }
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
  /** Private (PRD 10.3): never put in the shared state. Everyone is an investigator until the countdown ends. */
  role: Role;
  /** Debug servers only: possessed whatever the count, to test alone. */
  wantsPossessed: boolean;
  // The possessed's powers (GDD 14). Private, like the role.
  /** Seconds of cooldown left for each power. */
  cooldowns: Record<PowerKind, number>;
  /** Seconds of curse glow left: a photo now would show the demon face (GDD 15.2). */
  curseLeft: number;
  /** Night time this player was last hit by the ghost, and last trapped by a slammed door (GDD 14.3). */
  hitAt: number;
  trappedAt: number;
  /** Where this player was when a meeting pulled them to the table, to go back after (GDD 16.3). */
  beforeMeeting: { x: number; z: number; hidingSpot: string } | null;
  /** The minigame open right now (a task, or taking a relic from a spot), and for how long. */
  /**
   * The task or search open in the player's hands. stationId is the task station, or the place
   * being searched. `found` is set once a search reaches the place that hides the relic.
   */
  task: { kind: "task" | "relic"; stationId: string; elapsed: number; noiseAt: number; found?: boolean } | null;
}

/** Where a relic really is. Only the server knows (PRD 10.3); clients learn it only up close. */
interface RelicSim {
  id: string;
  /** The hiding spot it is in, or the spot it was taken from. */
  spotId: string;
  /** The place in the spot's group it hides in (GDD 26.5); the spot's own id for a spot with one place. */
  placeId: string;
  x: number;
  z: number;
  status: RelicStatus;
}

/** Ear height for walls between two players' voices (also used for camera line of sight). */
const VOICE_SIGHT_HEIGHT_M = 1.6;

/** A Spirit Camera photo: who was in the frame and whether each shows as cursed. */
/** A photo as taken: names are kept, so it still develops if someone leaves or dies (GDD 15.2). */
interface PhotoRecord {
  photo: DevelopedPhoto;
  developed: boolean;
}

const ACTION_SECONDS: Record<Action["kind"], number> = {
  revive: config.health.reviveSec,
  hide: config.movement.hideEnterExitSec,
  unhide: config.movement.hideEnterExitSec,
  salt: config.salt.placeSec,
  placeRelic: config.relics.placeSec,
  breakDoor: config.powers.slamDoor.breakSec,
  fixFuse: config.powers.blackout.fuseFixSec,
  cleanse: config.taint.cleanseSec,
  ringBell: config.meetings.bellHoldSec,
  report: config.meetings.reportHoldSec,
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
  /** This map's ghost trick, or null (GDD 12.5). */
  private trick: GhostTrick | null = null;
  private relicTimer = 0;
  /** Test shortcut (debug servers only): the ghost is sent away. */
  private ghostPaused = false;
  /** How often each player has been possessed this session, for fair rotation (GDD 19). */
  private timesPossessed = new Map<string, number>();
  /** Debug servers only: everyone is possessed, so counting the living cannot end the match. */
  private noInvestigators = false;
  // Powers shared by the possessed team (GDD 14.2, 11).
  private blackoutUsed = false;
  private blackoutLeft = 0;
  private taintsUsed = 0;
  /** Night time of the last Taint, or -Infinity. */
  private lastTaintAt = -Infinity;
  /** Seconds each slammed door stays locked. */
  private doorLocks = new Map<string, number>();
  private powerStatusTimer = 0;
  // Meetings (GDD 16).
  /** Night time the last meeting ended, or null before the first. */
  private lastMeetingEnd: number | null = null;
  /** The reported body's session id, which disappears after the meeting. */
  private meetingBodyId: string | null = null;
  /** This meeting's votes: voter -> player voted for, or SKIP. */
  private votes = new Map<string, string>();
  /** Who the vote removed, out at the end of the meeting. */
  private removedId: string | null = null;

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
    for (const door of this.map.doors) this.state.doors.set(door.id, new Door({ open: false, locked: false }));
    this.state.blackout = false;
    this.state.taintLeft = 0;
    this.state.meeting = "" satisfies MeetingStep;
    this.state.meetingLeft = 0;
    this.state.meetingCaller = "";
    this.state.meetingBody = "";
    // Every jar spot is stocked until the lobby decides the player count (Phase 7).
    for (const jar of this.map.saltJars) this.state.saltJars.set(jar.id, new SaltJar({ taken: false }));
    for (const station of this.map.tasks) this.state.stations.set(station.id, new TaskStation({ done: false }));
    // Relics hide in random spots each match (GDD 10). The count becomes a lobby setting in Phase 7.
    for (const spot of this.map.relicSpots) {
      for (const place of spot.places ?? []) this.state.searchPlaces.set(place.id, new SearchPlace({ searched: false }));
    }
    pickRelicSpots(this.map.relicSpots, config.relics.count, config.relics.minSpacingM, Math.random, (a, b) => this.hearingDistance(a, b)).forEach((spot, i) => {
      const id = `R${i + 1}`;
      // In a group, the relic hides in one of its places, picked at random (GDD 26.5).
      const places = searchPlaces(spot);
      const place = places[Math.floor(Math.random() * places.length)]!;
      this.relics.push({ id, spotId: spot.id, placeId: place.id, x: place.x, z: place.z, status: "hidden" });
      this.state.relics.set(id, new Relic({ name: this.map.relicNames[i] ?? `Relic ${i + 1}`, status: "hidden", carrier: "" }));
    });
    this.state.stage = "waiting" satisfies Stage;
    this.state.stageLeft = 0;
    this.state.host = "";
    this.state.tasksDone = 0;
    this.state.tasksTotal = 0;
    this.state.nightLength = config.match.lengthMin * 60;
    this.state.nightTime = 0;
    this.state.part = "quiet";
    this.state.overtime = false;
    this.state.ritualReady = false;
    this.state.ritualStarted = false;
    this.state.ritualProgress = 0;
    this.state.winner = "";
    this.state.endReason = "";

    // While the relic door is locked the ghost cannot get past it either (GDD 10).
    const relicDoor = this.map.relicDoor;
    this.openNav = await NavMap.create(this.map);
    const nav = relicDoor ? await NavMap.create(this.map, [relicDoor]) : this.openNav;
    // The ghost starts asleep where the map says (far from the spawn), else in the last room listed.
    const lastRoom = this.map.rooms[this.map.rooms.length - 1]!;
    const start = this.map.ghostStart ?? { x: (lastRoom.minX + lastRoom.maxX) / 2, z: (lastRoom.minZ + lastRoom.maxZ) / 2 };
    this.ghost = new Ghost(nav, this.ghostWorld(), start);
    this.trick = createTrick(this.map.ghostTrick, {
      ghost: () => this.ghost,
      // The relic door opens only by its relics.
      doors: this.map.doors.filter((d) => d.id !== this.map.relicDoor),
      isDoorOpen: (id) => this.state.doors.get(id)?.open ?? true,
      swingDoor: (id) => this.setDoor(id, true),
      ring: (at) => {
        // The bell is in the middle of the room the ghost is in, so it tells the room, not the spot.
        const room = nearestRoom(this.map, at.x, at.z);
        const msg: ServerMessages["bellRing"] = { x: (room.minX + room.maxX) / 2, z: (room.minZ + room.maxZ) / 2 };
        this.broadcast("bellRing", msg);
      },
      distance: (a, b) => this.hearingDistance(a, b),
      random: Math.random,
    });

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
      if (!sim || !player || sim.action || !this.playing) return;
      if (player.health !== "alive" || player.hidingSpot || player.salt <= 0) return;
      this.setAction(sim, player, { kind: "salt", elapsed: 0 });
    });

    this.onMessage("photo", (client) => this.takePhoto(client.sessionId));
    this.onMessage("start", (client) => this.startCountdown(client));
    this.onMessage("vote", (client, msg: unknown) => {
      const target = typeof msg === "object" && msg !== null ? (msg as { target?: unknown }).target : undefined;
      if (typeof target === "string") this.castVote(client.sessionId, target);
    });
    this.onMessage("power", (client, msg: unknown) => {
      const m = typeof msg === "object" && msg !== null ? (msg as { kind?: unknown; target?: unknown }) : {};
      if (typeof m.kind === "string" && (POWER_KINDS as readonly string[]).includes(m.kind)) {
        this.usePower(client, m.kind as PowerKind, typeof m.target === "string" ? m.target : undefined);
      }
    });

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
      this.onMessage("debug", (client, msg: { nightTime?: number; down?: boolean; bleedLeft?: number; huntIn?: number; teleport?: { x: number; z: number }; giveTask?: string; hideRelicAt?: string; toggleGhost?: boolean; possessed?: boolean; startNow?: boolean; developPhotos?: boolean; curse?: boolean; meeting?: boolean; skipStep?: boolean }) => {
        if (typeof msg?.nightTime === "number") this.state.nightTime = msg.nightTime;
        // Swap your first task for this station's (to try a particular task).
        const mine = this.sims.get(client.sessionId);
        if (mine && typeof msg?.giveTask === "string" && this.map.tasks.some((t) => t.id === msg.giveTask)) {
          mine.tasks[0] = { stationId: msg.giveTask, done: false };
          this.sendTasks(client.sessionId);
        }
        // Move the first hidden relic to this place to search (to try finding one).
        const at = typeof msg?.hideRelicAt === "string" ? this.searchPlace(msg.hideRelicAt) : null;
        const hidden = this.relics.find((r) => r.status === "hidden");
        if (at && hidden) Object.assign(hidden, { spotId: at.spot.id, placeId: at.place.id, x: at.place.x, z: at.place.z });
        if (typeof msg?.huntIn === "number") this.ghost.debugHuntIn(msg.huntIn);
        // Send the ghost away for everyone in the room, or bring it back (to test in peace).
        if (msg?.toggleGhost) {
          this.ghostPaused = !this.ghostPaused;
          this.ghost.debugPause(this.ghostPaused);
          const paused: ServerMessages["debugGhost"] = { paused: this.ghostPaused };
          this.broadcast("debugGhost", paused);
        }
        // Be possessed whatever the player count (set before the night starts).
        const me = this.sims.get(client.sessionId);
        if (me && msg?.possessed && this.state.stage === "waiting") me.wantsPossessed = true;
        // Skip the countdown and intro: roles are dealt and the night starts now.
        if (msg?.startNow && (this.state.stage === "waiting" || this.state.stage === "countdown")) {
          this.dealRoles();
          this.startNight();
        }
        if (msg?.developPhotos) this.developPhotos();
        // Call a meeting whatever the rules say, and skip to the end of a meeting's step.
        if (msg?.meeting && this.playing) this.startMeeting(client.sessionId, null);
        if (msg?.skipStep && this.state.meeting) this.state.meetingLeft = 0;
        // Start your curse glow without using a power (to try the camera).
        if (mine && msg?.curse) mine.curseLeft = config.camera.curseGlowSec;
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
    // Nobody can join after the countdown starts (GDD 5).
    if (this.state.stage !== "waiting") throw new Error("This night has already started");

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
      tasks: assignTasks(this.map.tasks, config.tasks.perPlayer, Math.random, takenTasks([...this.sims.values()].map((s) => s.tasks))).map((t) => ({
        stationId: t.id,
        done: false,
      })),
      task: null,
      normalDbfs: null,
      voiceLevel: "silent",
      recentLevels: [],
      voiceNoiseM: 0,
      micDeadSec: 0,
      micLost: false,
      micCheck: null,
      role: "investigator",
      wantsPossessed: false,
      cooldowns: { slamDoor: 0, summon: 0, blackout: 0, taint: 0 },
      curseLeft: 0,
      hitAt: -Infinity,
      trappedAt: -Infinity,
      beforeMeeting: null,
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
        voted: false,
        bodyGone: false,
        bellUses: config.meetings.bellUsesPerPlayer,
      }),
    );
    this.state.tasksTotal += this.sims.get(client.sessionId)!.tasks.length;
    if (!this.state.host) this.state.host = client.sessionId;
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
    this.votes.delete(client.sessionId);
    if (this.removedId === client.sessionId) this.removedId = null;
    this.seesGhost.delete(client.sessionId);
    this.voice.remove(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.state.players.delete(client.sessionId);
    // The host's rights pass to whoever has waited longest (GDD 5).
    if (this.state.host === client.sessionId) this.state.host = this.state.players.keys().next().value ?? "";
    this.announce("leave", player.name, `${player.name} left the room`);
  }

  async onDispose() {
    activeCodes.delete(this.roomId);
    await this.voice.dispose();
  }

  private tick(elapsedSec: number) {
    this.voiceTimer += elapsedSec;
    if (this.voiceTimer * 1000 >= config.voice.subscriptionRefreshMs) {
      this.tickVoice(this.voiceTimer);
      this.voiceTimer = 0;
    }
    // The match is over: everything stops but voice, so everyone can talk it over.
    if (this.state.winner) return;
    this.tickStage(elapsedSec);

    for (const [sessionId, sim] of this.sims) {
      const player = this.state.players.get(sessionId);
      if (player) this.tickPlayer(sim, player, elapsedSec);
    }

    if (this.nightStarted && this.state.meeting) {
      // The clock, the ghost, the ritual and every cooldown wait for the meeting (GDD 16.2).
      this.tickMeeting(elapsedSec);
    } else if (this.nightStarted) {
      this.tickPowers(elapsedSec);
      this.tickRitual(elapsedSec);
      this.state.nightTime = Math.min(this.state.nightTime + elapsedSec, this.state.nightLength);
      let part = nightPart(this.state.nightTime, this.state.nightLength);
      if (part === "dawn" && this.overtimeHolds()) {
        // Overtime: the night waits while the ritual can still finish (GDD 4). The ghost stays furious.
        this.overtimeUsed += elapsedSec;
        this.state.overtime = true;
        part = "furious";
      } else {
        this.state.overtime = false;
      }
      this.state.part = this.state.overtime ? "overtime" : part;
      if (!this.ghostPaused) this.ghost.update(elapsedSec, part, this.state.players.size);
      this.trick?.update(elapsedSec);
      this.checkResult(part === "dawn");
    }
    this.noises.length = 0;
    this.sendGhostPositions();
    this.relicTimer += elapsedSec;
    if (this.relicTimer >= 1 / config.relics.nearUpdateHz) {
      this.relicTimer = 0;
      this.sendRelicsNear();
    }
  }

  // ---------- Starting the night (GDD 4.1 and 5) ----------

  private startCountdown(client: Client) {
    if (client.sessionId !== this.state.host || this.state.stage !== "waiting") return;
    // Debug servers may start with fewer players, to test alone.
    if (this.state.players.size < config.players.min && !DEBUG) {
      const msg: ServerMessages["startRefused"] = { reason: `At least ${config.players.min} players are needed to start.` };
      client.send("startRefused", msg);
      return;
    }
    this.state.stage = "countdown" satisfies Stage;
    this.state.stageLeft = config.match.countdownSec;
  }

  /** The countdown, then roles and the intro, then the night. */
  private tickStage(dt: number) {
    if (this.state.stage !== "countdown" && this.state.stage !== "intro") return;
    this.state.stageLeft = Math.max(0, this.state.stageLeft - dt);
    if (this.state.stageLeft > 0) return;
    if (this.state.stage === "countdown") {
      this.dealRoles();
      this.state.stage = "intro" satisfies Stage;
      this.state.stageLeft = config.match.introSec;
    } else {
      this.startNight();
    }
  }

  /** Picks the possessed (GDD 3, 19) and tells each player their role, privately. */
  private dealRoles() {
    const ids = [...this.sims.keys()];
    const forced = ids.filter((id) => this.sims.get(id)!.wantsPossessed);
    const count = Math.max(0, possessedCount(ids.length) - forced.length);
    const picked = [...forced, ...pickPossessed(ids.filter((id) => !forced.includes(id)), this.timesPossessed, count)];
    for (const id of picked) {
      const sim = this.sims.get(id)!;
      sim.role = "possessed";
      this.timesPossessed.set(id, (this.timesPossessed.get(id) ?? 0) + 1);
      // The possessed's tasks are fake: they leave the team bar (GDD 9).
      this.state.tasksTotal -= sim.tasks.filter((t) => !t.done).length;
    }
    this.noInvestigators = picked.length === ids.length;
    const names = (list: string[]) => list.map((id) => this.state.players.get(id)?.name ?? "");
    for (const client of this.clients) {
      const sim = this.sims.get(client.sessionId);
      if (!sim) continue;
      const partners = sim.role === "possessed" && config.possessed.knowEachOther ? names(picked.filter((id) => id !== client.sessionId)) : [];
      const msg: ServerMessages["role"] = { role: sim.role, partners };
      client.send("role", msg);
    }
  }

  private startNight() {
    this.state.stage = "night" satisfies Stage;
    this.state.stageLeft = 0;
    this.nightStarted = true;
  }

  /** Tasks, relics, items and hiding wait for the night; before it you can only walk about and use doors. */
  private get playing(): boolean {
    return this.state.stage === "night" && !this.state.winner && !this.state.meeting;
  }

  // ---------- The possessed's powers (GDD 14) ----------

  private usePower(client: Client, kind: PowerKind, target: string | undefined) {
    const sim = this.sims.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!sim || !player || sim.role !== "possessed") return;
    const refuse = (reason: string) => {
      const msg: ServerMessages["powerRefused"] = { kind, reason };
      client.send("powerRefused", msg);
    };
    // No powers before the night, while downed, or in Quiet (GDD 14.3). Meetings will stop them too.
    if (!this.playing || player.health !== "alive") return refuse("Not now.");
    const status = this.powerStatus(sim, kind);
    if (status.state === "locked") return refuse(kind === "taint" ? "Only during the ritual." : "Not yet.");
    if (status.state === "used") return refuse("Already used.");
    if (status.state === "cooldown") return refuse(`Ready in ${Math.ceil(status.cooldownLeft)} s.`);
    const result =
      kind === "slamDoor" ? this.slamDoor(sim, target) : kind === "summon" ? this.summon(client.sessionId, sim, target) : kind === "blackout" ? this.startBlackout() : this.taint(sim);
    if (result) return refuse(result);
    sim.cooldowns[kind] = powerCooldownSec(kind);
    // Every power leaves the curse glow (GDD 14.2, 15.2).
    sim.curseLeft = config.camera.curseGlowSec;
    this.sendPowerStatus();
  }

  private powerStatus(sim: PlayerSim, kind: PowerKind): PowerStatus {
    const clock = { nightTime: this.state.nightTime, nightLength: this.state.nightLength, ritualStarted: this.state.ritualStarted };
    const cooldownLeft = sim.cooldowns[kind];
    let state: PowerStatus["state"] = cooldownLeft > 0 ? "cooldown" : "ready";
    if (kind === "blackout" && this.blackoutUsed) state = "used";
    else if (kind === "taint" && this.taintsUsed >= config.taint.maxPerMatch) state = "used";
    else if (!powerUnlocked(kind, clock)) state = "locked";
    // The team waits taint.cooldownSec between Taints, whoever used the last one (GDD 11).
    const teamWait = kind === "taint" ? this.lastTaintAt + config.taint.cooldownSec - this.state.nightTime : 0;
    if (state === "ready" && teamWait > 0) return { kind, state: "cooldown", cooldownLeft: teamWait };
    return { kind, state, cooldownLeft };
  }

  /** Slam Door: the door slams and locks (GDD 14.2). Returns why it failed, or null. */
  private slamDoor(sim: PlayerSim, doorId: string | undefined): string | null {
    const c = config.powers.slamDoor;
    const def = this.map.doors.find((d) => d.id === doorId);
    if (!def || def.id === this.map.relicDoor) return "No door there.";
    if (this.hearingDistance(sim.move, def) > c.rangeM) return `Too far from the door (${c.rangeM} m at most).`;
    const door = this.state.doors.get(def.id)!;
    if (door.locked) return "That door is already locked.";
    // Players close to the door are the ones it traps; nobody is trapped twice in sameVictimSec (GDD 14.3).
    const trapped: PlayerSim[] = [];
    this.state.players.forEach((p, id) => {
      const other = this.sims.get(id);
      if (other && other !== sim && p.health === "alive" && this.hearingDistance(p, def) <= c.rangeM) trapped.push(other);
    });
    if (trapped.some((t) => this.state.nightTime - t.trappedAt < c.sameVictimSec)) return "Someone there was trapped too recently.";
    for (const t of trapped) t.trappedAt = this.state.nightTime;
    this.setDoor(def.id, false);
    door.locked = true;
    this.doorLocks.set(def.id, c.lockSec);
    // Loud: the ghost hears it from far away (GDD 14.2).
    this.noises.push({ x: def.x, z: def.z, radiusM: c.ghostHearM });
    const msg: ServerMessages["doorSlam"] = { x: def.x, z: def.z };
    this.broadcast("doorSlam", msg);
    return null;
  }

  private unlockDoor(id: string, open: boolean) {
    const door = this.state.doors.get(id);
    if (!door?.locked) return;
    door.locked = false;
    this.doorLocks.delete(id);
    if (open) this.setDoor(id, true);
  }

  /** How many players are pushing on this door right now. */
  private pushers(doorId: string): number {
    let n = 0;
    for (const sim of this.sims.values()) if (sim.action?.kind === "breakDoor" && sim.action.doorId === doorId) n++;
    return n;
  }

  /** Summon: the ghost appears near a player you can see and hunts them (GDD 14.2). */
  private summon(sessionId: string, sim: PlayerSim, targetId: string | undefined): string | null {
    const c = config.powers.summon;
    const victim = targetId ? this.state.players.get(targetId) : undefined;
    const victimSim = targetId ? this.sims.get(targetId) : undefined;
    if (!victim || !victimSim || targetId === sessionId || victim.health !== "alive" || victim.hidingSpot) return "Look at a player first.";
    const me = { x: sim.move.x, z: sim.move.z };
    if (this.hearingDistance(me, victim) > c.targetRangeM) return `Too far (${c.targetRangeM} m at most).`;
    if (!this.physics.lineOfSight(me, victim, SUMMON_SIGHT_HEIGHT_M)) return "You must see them.";
    if (this.state.nightTime - victimSim.hitAt < c.protectAfterHitSec) return "They were hit too recently.";
    if (!this.ghost.summonable) return "The ghost does not answer right now.";
    if (!this.ghost.summon({ id: targetId!, x: victim.x, z: victim.z }, summonSpots(victim))) return "The ghost cannot reach them.";
    // The clues: a whisper near you, and your eyes glow in anyone's light (GDD 14.2).
    const whisper: ServerMessages["powerWhisper"] = { x: me.x, z: me.z };
    const glow: ServerMessages["eyeGlow"] = { id: sessionId };
    const halfCone = (config.flashlight.coneHalfAngleDeg * Math.PI) / 180;
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (!p) continue;
      if (this.hearingDistance(p, me) <= c.whisperM) client.send("powerWhisper", whisper);
      if (client.sessionId === sessionId || !p.flashlightOn || p.health !== "alive") continue;
      const d = this.hearingDistance(p, me);
      // Facing yaw looks along (-sin, -cos).
      const toMe = Math.atan2(-(me.x - p.x), -(me.z - p.z));
      const off = Math.abs(normalizeAngle(toMe - p.yaw));
      if (d <= config.flashlight.coneM && off <= halfCone && this.physics.lineOfSight(p, me, SUMMON_SIGHT_HEIGHT_M)) client.send("eyeGlow", glow);
    }
    return null;
  }

  /** Blackout: every light on the map goes out (GDD 14.2). */
  private startBlackout(): string | null {
    this.blackoutUsed = true;
    this.blackoutLeft = config.powers.blackout.autoRestoreSec;
    this.state.blackout = true;
    return null;
  }

  private endBlackout() {
    this.state.blackout = false;
    this.blackoutLeft = 0;
  }

  /** Taint: black flames on the altar (GDD 11). */
  private taint(sim: PlayerSim): string | null {
    const altar = this.map.altar;
    if (!altar || this.hearingDistance(sim.move, altar) > config.ritual.circleRadiusM) return "Stand in the circle.";
    if (this.state.ritualProgress < config.taint.minProgressPct) return `Only once the ritual is ${config.taint.minProgressPct}% done.`;
    if (this.state.taintLeft > 0) return "The flames already burn.";
    this.taintsUsed += 1;
    this.lastTaintAt = this.state.nightTime;
    this.state.taintLeft = config.taint.windowSec;
    return null;
  }

  /** Cooldowns, curse glow, locked doors, the blackout and the flames, each tick of the night. */
  private tickPowers(dt: number) {
    for (const sim of this.sims.values()) {
      for (const kind of POWER_KINDS) sim.cooldowns[kind] = Math.max(0, sim.cooldowns[kind] - dt);
      sim.curseLeft = Math.max(0, sim.curseLeft - dt);
    }
    for (const [id, left] of this.doorLocks) {
      if (left - dt <= 0) this.unlockDoor(id, false);
      else this.doorLocks.set(id, left - dt);
    }
    if (this.state.blackout) {
      this.blackoutLeft -= dt;
      if (this.blackoutLeft <= 0) this.endBlackout();
    }
    if (this.state.taintLeft > 0) {
      this.state.taintLeft = Math.max(0, this.state.taintLeft - dt);
      // Not put out in time: the ritual loses half its progress (GDD 11).
      if (this.state.taintLeft === 0) this.state.ritualProgress *= config.taint.progressMultiplier;
    }
    this.powerStatusTimer += dt;
    if (this.powerStatusTimer >= config.powers.statusEverySec) this.sendPowerStatus();
  }

  /** Each possessed player's cooldowns and curse glow, to them only (PRD 10.3). */
  private sendPowerStatus() {
    this.powerStatusTimer = 0;
    for (const client of this.clients) {
      const sim = this.sims.get(client.sessionId);
      if (sim?.role !== "possessed") continue;
      const msg: ServerMessages["powers"] = { list: POWER_KINDS.map((k) => this.powerStatus(sim, k)), curseLeft: sim.curseLeft };
      client.send("powers", msg);
    }
  }

  // ---------- Meetings (GDD 16) ----------

  /** A dead body within reach that is still there, nearest first. */
  private bodyNear(sessionId: string, here: { x: number; z: number }): string | null {
    let best: { id: string; d: number } | null = null;
    this.state.players.forEach((p, id) => {
      if (id === sessionId || p.health !== "dead" || p.bodyGone) return;
      const d = this.hearingDistance(here, p);
      if (d <= config.meetings.reportRangeM && (!best || d < best.d)) best = { id, d };
    });
    return (best as { id: string } | null)?.id ?? null;
  }

  /** Tells this player why no meeting can start now; returns true if it cannot. */
  private refuseMeeting(sessionId: string): boolean {
    const reason = meetingBlocked({
      nightTime: this.state.nightTime,
      hunting: this.ghost.huntingOrAbout,
      overtime: this.state.overtime,
      lastMeetingEnd: this.lastMeetingEnd,
    });
    if (!reason) return false;
    const msg: ServerMessages["meetingRefused"] = { reason };
    this.clients.find((c) => c.sessionId === sessionId)?.send("meetingRefused", msg);
    return true;
  }

  /** Everyone living is pulled to the table (the map's spawns, around it) and the night waits (GDD 16.2). */
  private startMeeting(callerId: string, bodyId: string | null) {
    const s = this.state;
    s.meeting = "evidence" satisfies MeetingStep;
    s.meetingLeft = meetingStepSec("evidence");
    s.meetingCaller = s.players.get(callerId)?.name ?? "";
    s.meetingBody = bodyId ? (s.players.get(bodyId)?.name ?? "") : "";
    this.meetingBodyId = bodyId;
    this.votes.clear();
    this.removedId = null;
    let seat = 0;
    for (const [id, sim] of this.sims) {
      const p = s.players.get(id);
      if (!p) continue;
      this.closeTask(id, "cancelled");
      this.clearAction(sim, p);
      p.voted = false;
      if (p.health === "dead") continue;
      sim.beforeMeeting = { x: sim.move.x, z: sim.move.z, hidingSpot: p.hidingSpot };
      p.hidingSpot = "";
      p.holdingBreath = false;
      const at = this.map.spawns[seat++ % this.map.spawns.length]!;
      this.placePlayer(sim, p, at);
    }
    // New photos are shown as the meeting starts (GDD 15.2).
    this.developPhotos();
  }

  private placePlayer(sim: PlayerSim, player: Player, at: { x: number; z: number }) {
    sim.move = { ...sim.move, x: at.x, z: at.z };
    player.x = at.x;
    player.z = at.z;
  }

  private tickMeeting(dt: number) {
    const s = this.state;
    s.meetingLeft = Math.max(0, s.meetingLeft - dt);
    // Everyone has voted: no need to wait out the clock.
    if (s.meeting === "vote" && this.allVoted()) s.meetingLeft = 0;
    if (s.meetingLeft > 0) return;
    if (s.meeting === "vote") this.showVoteResult();
    const next = nextMeetingStep(s.meeting as MeetingStep);
    if (!next) return this.endMeeting();
    s.meeting = next;
    s.meetingLeft = meetingStepSec(next);
  }

  private castVote(sessionId: string, target: string) {
    const voter = this.state.players.get(sessionId);
    if (this.state.meeting !== "vote" || !voter || voter.health === "dead" || this.votes.has(sessionId)) return;
    const votedFor = this.state.players.get(target);
    if (target !== SKIP && (!votedFor || votedFor.health === "dead")) return;
    this.votes.set(sessionId, target);
    voter.voted = true;
  }

  private allVoted(): boolean {
    let all = true;
    this.state.players.forEach((p, id) => {
      if (p.health !== "dead" && !this.votes.has(id)) all = false;
    });
    return all;
  }

  /** The vote's result, to everyone (GDD 16.3). The removed player goes when the meeting ends. */
  private showVoteResult() {
    const { removed, tally, skip } = countVotes(this.votes);
    this.removedId = removed;
    const name = (id: string) => this.state.players.get(id)?.name ?? "?";
    const m = config.meetings;
    const msg: ServerMessages["meetingResult"] = {
      removed: removed ? name(removed) : null,
      role: removed && m.revealRole ? (this.sims.get(removed)?.role ?? "investigator") : null,
      tally: [...tally].map(([id, votes]) => ({ name: name(id), votes })),
      skip,
      votes: m.anonymousVoting ? null : [...this.votes].map(([voter, target]) => ({ voter: name(voter), target: target === SKIP ? "Skip" : name(target) })),
    };
    this.broadcast("meetingResult", msg);
  }

  /** Everyone goes back where they were; the reported body and the removed player are gone (GDD 16.3). */
  private endMeeting() {
    const s = this.state;
    for (const [id, sim] of this.sims) {
      const p = s.players.get(id);
      p && (p.voted = false);
      const back = sim.beforeMeeting;
      if (!p || !back) continue;
      sim.beforeMeeting = null;
      this.placePlayer(sim, p, back);
      // Back into the hiding spot, unless someone else took it meanwhile (they cannot: everyone was at the table).
      if (back.hidingSpot && id !== this.removedId) p.hidingSpot = back.hidingSpot;
    }
    const body = this.meetingBodyId && s.players.get(this.meetingBodyId);
    if (body) body.bodyGone = true;
    const removed = this.removedId && s.players.get(this.removedId);
    if (removed) {
      // Voted out: a Wisp now, whatever their role (GDD 16.3, 17). No body is left behind.
      this.dropRelic(this.removedId!, false);
      removed.health = "dead" satisfies Health;
      removed.bleedLeft = 0;
      removed.flashlightOn = false;
      removed.bodyGone = true;
    }
    s.meeting = "" satisfies MeetingStep;
    s.meetingLeft = 0;
    s.meetingCaller = "";
    s.meetingBody = "";
    this.meetingBodyId = null;
    this.removedId = null;
    this.votes.clear();
    this.lastMeetingEnd = s.nightTime;
    this.ghost.afterMeeting(config.ghost.postMeetingGraceSec);
    this.checkResult(false);
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

  /** Ends the match once someone has won (GDD 18). Checked after the ritual, so finishing at dawn wins. */
  private checkResult(dawn: boolean) {
    let living = 0;
    this.state.players.forEach((p) => {
      if (p.health !== "dead") living++;
    });
    let livingPossessed = 0;
    this.state.players.forEach((p, id) => {
      if (p.health !== "dead" && this.sims.get(id)?.role === "possessed") livingPossessed++;
    });
    const counted = this.noInvestigators ? { livingInvestigators: 1, livingPossessed: 0 } : { livingInvestigators: living - livingPossessed, livingPossessed };
    const result = matchResult({ ritualComplete: this.state.ritualProgress >= 100, dawn, ...counted });
    if (!result) return;
    this.state.winner = result.winner;
    this.state.endReason = result.reason;
    this.state.part = "dawn";
    this.state.overtime = false;
    this.ghost.update(0, "dawn", this.state.players.size);
    const roles: ServerMessages["matchEnd"]["roles"] = [];
    this.state.players.forEach((p, id) => roles.push({ name: p.name, role: this.sims.get(id)?.role ?? "investigator" }));
    const msg: ServerMessages["matchEnd"] = { ...result, roles, photos: this.photos.map((p) => p.photo) };
    this.broadcast("matchEnd", msg);
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
    // Everyone stays at the table through a meeting.
    if (this.state.meeting) return "frozen";
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
      // Meetings: everyone hears everyone at full volume (GDD 12.6).
      if (this.state.meeting) {
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
    // Bleeding out waits for the meeting too.
    if (this.state.meeting) return;
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
    sim.hitAt = this.state.nightTime;
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
    if (!sim || !player || player.health !== "alive" || sim.action || this.state.winner || this.state.meeting) return;
    const here = { x: sim.move.x, z: sim.move.z };
    if (!this.playing) {
      this.toggleNearestDoor(here.x, here.z);
      return;
    }

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

    // Report a body, or ring the bell: both call a meeting (GDD 16.1).
    const bodyId = this.bodyNear(sessionId, here);
    const bell = this.map.bell;
    const atBell = !!bell && player.bellUses > 0 && this.hearingDistance(here, bell) <= config.interact.rangeM;
    if (bodyId || atBell) {
      if (this.refuseMeeting(sessionId)) return;
      this.setAction(sim, player, bodyId ? { kind: "report", targetId: bodyId, elapsed: 0 } : { kind: "ringBell", elapsed: 0 });
      return;
    }

    // Put out black flames on the altar with a handful of salt (GDD 11).
    const altar = this.map.altar;
    if (this.state.taintLeft > 0 && altar && player.salt >= config.taint.cleanseSaltCost && this.hearingDistance(here, altar) <= config.ritual.circleRadiusM) {
      this.setAction(sim, player, { kind: "cleanse", elapsed: 0 });
      return;
    }
    // Fix the fuse box in a blackout (GDD 14.2).
    const fuse = this.map.fuseBox;
    if (this.state.blackout && fuse && this.hearingDistance(here, fuse) <= config.interact.rangeM) {
      this.setAction(sim, player, { kind: "fixFuse", elapsed: 0 });
      return;
    }
    // Push on a slammed door; it breaks open when enough players push together (GDD 14.2).
    const locked = this.nearestDoor(here.x, here.z);
    if (locked && this.state.doors.get(locked)?.locked) {
      this.setAction(sim, player, { kind: "breakDoor", doorId: locked, elapsed: 0 });
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

    if (action.kind === "report" && this.bodyNear(this.sessionOf(sim), sim.move) !== action.targetId) return this.clearAction(sim, player);
    if (action.kind === "breakDoor" && !this.state.doors.get(action.doorId)?.locked) return this.clearAction(sim, player);
    if (action.kind === "fixFuse" && !this.state.blackout) return this.clearAction(sim, player);
    if (action.kind === "cleanse" && this.state.taintLeft <= 0) return this.clearAction(sim, player);
    // A slammed door gives only to enough players pushing together.
    if (action.kind === "breakDoor" && this.pushers(action.doorId) < config.powers.slamDoor.breakPushers) return;

    action.elapsed += dt;
    const duration = ACTION_SECONDS[action.kind];
    player.actionProgress = Math.min(1, action.elapsed / duration);
    if (action.elapsed < duration) return;

    this.clearAction(sim, player);
    if (action.kind === "revive") this.revive(action.targetId);
    else if (action.kind === "hide") this.hide(sim, player, action.spotId);
    else if (action.kind === "salt") this.pourSalt(player);
    else if (action.kind === "placeRelic") this.placeRelic(player);
    else if (action.kind === "breakDoor") this.unlockDoor(action.doorId, true);
    else if (action.kind === "fixFuse") this.endBlackout();
    else if (action.kind === "ringBell" || action.kind === "report") {
      // A hunt may have begun while E was held.
      const id = this.sessionOf(sim);
      if (this.refuseMeeting(id)) return;
      if (action.kind === "ringBell") player.bellUses -= 1;
      this.startMeeting(id, action.kind === "report" ? action.targetId : null);
    }
    else if (action.kind === "cleanse") {
      player.salt -= config.taint.cleanseSaltCost;
      this.state.taintLeft = 0;
    } else this.unhide(sim, player);
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
    const tooFast = sim.task.elapsed < this.taskMinSec(sim.task);
    const tooFar = !at || Math.hypot(at.x - player.x, at.z - player.z) > at.rangeM;
    if (tooFast || tooFar || player.health !== "alive") return this.closeTask(sessionId, "cancelled");
    if (sim.task.kind === "relic") return this.finishSearch(sessionId, sim, player, stationId);

    const def = this.map.tasks.find((d) => d.id === stationId)!;

    const task = sim.tasks.find((t) => t.stationId === stationId);
    if (task && !task.done) {
      task.done = true;
      // A possessed player's task is fake: it looks done to them, but the bar does not move (GDD 9).
      if (sim.role === "investigator") this.state.tasksDone += 1;
      if (def.visible) this.state.stations.get(stationId)!.done = true;
    }
    this.closeTask(sessionId, "done");
    this.sendTasks(sessionId);
  }

  /**
   * The shortest time the server accepts for finishing. Searching a place in a group is short;
   * taking the relic is the full time, counted from when the search started.
   */
  private taskMinSec(task: NonNullable<PlayerSim["task"]>): number {
    if (task.kind === "task") return config.tasks.serverMinSec;
    const grouped = this.state.searchPlaces.has(task.stationId);
    return grouped && !task.found ? config.relics.search.serverMinSec : config.relics.serverMinSec;
  }

  /** A noisy minigame went wrong (GDD 9): the ghost may hear it, and so do players nearby. */
  private taskNoise(sessionId: string) {
    const sim = this.sims.get(sessionId);
    if (sim?.task?.kind === "relic") {
      // Digging too hard throws soil about (GDD 26.5).
      if (sim.task.elapsed - sim.task.noiseAt < config.tasks.noiseCooldownSec) return;
      sim.task.noiseAt = sim.task.elapsed;
      return this.searchNoise(sessionId, sim.task.stationId);
    }
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
      const at = this.searchPlace(task.stationId);
      return at ? { x: at.place.x, z: at.place.z, rangeM: config.relics.useRangeM } : null;
    }
    const def = this.map.tasks.find((d) => d.id === task.stationId);
    return def ? { x: def.x, z: def.z, rangeM: config.tasks.useRangeM } : null;
  }

  // ---------- Relics (GDD Section 10) ----------

  /**
   * E at a place to search, with empty hands. Every unsearched place in a group can be searched,
   * whether or not the relic is there (GDD 26.5). A spot with one place opens only while it
   * still hides a relic.
   */
  private openRelicSpot(sessionId: string, sim: PlayerSim, player: Player, x: number, z: number): boolean {
    if (sim.task || player.relic) return false;
    for (const spot of this.map.relicSpots) {
      for (const place of spot.places ?? []) {
        if (this.state.searchPlaces.get(place.id)?.searched || Math.hypot(place.x - x, place.z - z) > config.relics.useRangeM) continue;
        sim.task = { kind: "relic", stationId: place.id, elapsed: 0, noiseAt: -Infinity, found: false };
        player.action = "task";
        player.actionProgress = 0;
        const msg: ServerMessages["taskOpen"] = { stationId: place.id, minigame: spot.minigame, title: spot.label };
        this.clients.find((c) => c.sessionId === sessionId)?.send("taskOpen", msg);
        return true;
      }
    }
    for (const relic of this.relics) {
      if (relic.status !== "hidden" || Math.hypot(relic.x - x, relic.z - z) > config.relics.useRangeM) continue;
      const spot = this.map.relicSpots.find((s) => s.id === relic.spotId)!;
      if (spot.places) continue;
      sim.task = { kind: "relic", stationId: spot.id, elapsed: 0, noiseAt: -Infinity };
      player.action = "task";
      player.actionProgress = 0;
      const msg: ServerMessages["taskOpen"] = { stationId: spot.id, minigame: spot.minigame, title: spot.label };
      this.clients.find((c) => c.sessionId === sessionId)?.send("taskOpen", msg);
      return true;
    }
    return false;
  }

  /**
   * A search or taking minigame is finished. An empty place is marked searched and makes a
   * small noise. At the relic's place the first finish only finds it (the client keeps going),
   * and the second takes it, unless someone was quicker (GDD 26.5).
   */
  private finishSearch(sessionId: string, sim: PlayerSim, player: Player, placeId: string) {
    const relic = this.relics.find((r) => r.placeId === placeId && r.status === "hidden");
    const grouped = this.state.searchPlaces.has(placeId);
    if (grouped && !relic) {
      this.state.searchPlaces.get(placeId)!.searched = true;
      this.searchNoise(sessionId, placeId);
      return this.closeTask(sessionId, "empty");
    }
    if (!relic || player.relic) return this.closeTask(sessionId, "cancelled");
    if (grouped && !sim.task!.found) {
      sim.task!.found = true;
      const msg: ServerMessages["searchFound"] = { stationId: placeId };
      this.clients.find((c) => c.sessionId === sessionId)?.send("searchFound", msg);
      return;
    }
    if (grouped) this.state.searchPlaces.get(placeId)!.searched = true;
    this.carry(player, relic);
    this.closeTask(sessionId, "done");
  }

  /** Searching makes a small noise the ghost and nearby players hear (GDD 26.5). */
  private searchNoise(sessionId: string, placeId: string) {
    const at = this.searchPlace(placeId);
    if (!at) return;
    const radiusM = config.relics.search.noiseM;
    this.noises.push({ x: at.place.x, z: at.place.z, radiusM });
    const msg: ServerMessages["taskNoise"] = { x: at.place.x, z: at.place.z, minigame: at.spot.minigame };
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (client.sessionId !== sessionId && p && this.hearingDistance(p, at.place) <= radiusM) client.send("taskNoise", msg);
    }
  }

  /** A place to search by id, with its spot: a place in a group, or a spot with one place. */
  private searchPlace(id: string) {
    for (const spot of this.map.relicSpots) {
      const place = searchPlaces(spot).find((p) => p.id === id);
      if (place) return { spot, place };
    }
    return null;
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

  private closeTask(sessionId: string, reason: ServerMessages["taskClosed"]["reason"]) {
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
    if (!player || player.health !== "alive" || player.cameraShots <= 0 || !this.playing) return;
    player.cameraShots -= 1;
    const c = config.camera;
    // In the frame, within captureRangeM, and not behind a wall.
    const inFrame = (at: { x: number; z: number }) => {
      const spot = inPhotoFrame(player, at);
      return spot && this.physics.lineOfSight(player, at, VOICE_SIGHT_HEIGHT_M) ? spot : null;
    };

    const subjects: DevelopedPhoto["subjects"] = [];
    this.state.players.forEach((p, id) => {
      const spot = id !== sessionId && !p.hidingSpot ? inFrame(p) : null;
      if (!spot) return;
      // The demon face: a possessed player within their curse glow (GDD 15.2). Decided now, shown later.
      const sim = this.sims.get(id);
      subjects.push({ name: p.name, ...spot, demon: sim?.role === "possessed" && sim.curseLeft > 0 });
    });
    subjects.sort((a, b) => a.frameX - b.frameX);
    const ghostPresent = this.ghost.state !== "asleep" && this.ghost.state !== "gone" && this.ghost.state !== "retreat";
    const ghost = ghostPresent && this.ghost.visible ? inFrame(this.ghost) : null;
    this.photos.push({ photo: { by: player.name, nightTime: this.state.nightTime, subjects, ghost }, developed: false });

    const flash: ServerMessages["flash"] = { x: player.x, z: player.z, by: sessionId };
    for (const client of this.clients) {
      const other = this.state.players.get(client.sessionId);
      if (other && this.hearingDistance(other, player) <= c.flashVisibleM) client.send("flash", flash);
    }
    this.noises.push({ x: player.x, z: player.z, radiusM: c.flashGhostHearM });
    const taken: ServerMessages["photoTaken"] = { shotsLeft: player.cameraShots };
    this.clients.find((cl) => cl.sessionId === sessionId)?.send("photoTaken", taken);
  }

  /**
   * The photos taken since the last meeting develop and are shown to everyone (GDD 15.2). The
   * meeting calls this as it starts; until meetings are built, a debug message does.
   */
  private developPhotos() {
    const fresh = this.photos.filter((p) => !p.developed);
    for (const p of fresh) p.developed = true;
    const msg: ServerMessages["photosDeveloped"] = { photos: fresh.map((p) => p.photo) };
    this.broadcast("photosDeveloped", msg);
  }

  /** The door within reach of a player, nearest first. Never the relic door, which cannot be worked by hand. */
  private nearestDoor(x: number, z: number): string | null {
    let nearest: { id: string; dist: number } | undefined;
    for (const door of this.map.doors) {
      if (door.id === this.map.relicDoor) continue;
      const dist = Math.hypot(door.x - x, door.z - z);
      if (dist <= config.interact.rangeM && (!nearest || dist < nearest.dist)) nearest = { id: door.id, dist };
    }
    return nearest?.id ?? null;
  }

  private toggleNearestDoor(x: number, z: number) {
    const id = this.nearestDoor(x, z);
    if (!id || this.state.doors.get(id)!.locked) return;
    const door = this.map.doors.find((d) => d.id === id)!;
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
        if (id === this.map.relicDoor && this.relicDoorLocked()) return;
        // A slammed door locks players in, not the ghost (GDD 26.13).
        this.unlockDoor(id, false);
        this.setDoor(id, true);
      },
      speedMult: () => (this.state.blackout ? config.ghost.blackoutSpeedMult : 1),
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
