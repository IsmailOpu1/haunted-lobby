import * as THREE from "three";
import type { Room } from "@colyseus/sdk";
import {
  config,
  initPhysics,
  levelOf,
  PhysicsWorld,
  SIM_DT,
  stepMovement,
  type CollideFn,
  type MapData,
  type MinigameKind,
  type MoveInput,
  type MoveMode,
  type MoveState,
  type RelicNear,
  type ServerMessages,
  type TaskEntry,
  roomAt,
  searchPlaces,
  toWorld,
  worldDistance,
  type WorldPoint,
} from "@haunted/shared";
import { SoundScape } from "./audio.ts";
import { directionTo, roundDirection } from "./cues.ts";
import { createFlashlight } from "./flashlight.ts";
import { Flicker } from "./flicker.ts";
import { playerStepKind, StepTracker } from "./footsteps.ts";
import { GhostView } from "./ghostView.ts";
import { createHandsTask } from "./hands/tasks.ts";
import { HandsWork } from "./hands/work.ts";
import { ItemsView } from "./items.ts";
import { PlayerInput } from "./input.ts";
import { RelicsView } from "./relicsView.ts";
import { RemotePlayers } from "./remotePlayers.ts";
import { StationsView } from "./stations.ts";
import { VoiceChat } from "./voice.ts";
import type { TaskSoundKind } from "./hands/sounds.ts";
import { buildWorld, type DoorView, type RitualCircleView } from "./world.ts";

// Near-zero ambient light (GDD Section 23). Press L while testing to light everything up.
const DARK_AMBIENT = 0.04;
const DEBUG_AMBIENT = 1.6;
const FOG_NEAR = 1;
const FOG_FAR = 18;
const CROUCH_LERP_PER_SEC = 10;
// How fast a server correction to your own position fades out, and when to jump instead.
const CORRECTION_FADE_PER_SEC = 20;
const SNAP_DISTANCE = 2;
const VOICE_ANSWER_TIMEOUT_MS = 5000;
// Sound subtitles (GDD 23, 26.10): how long the bell's stays up, and how far above or below
// you a sound must be to say "above" or "below".
const BELL_CUE_SEC = 4;
const CUE_FLOOR_DIFF_M = 1.5;
// Working with your hands (GDD 26.5): the view narrows a little toward what you work on.
const WORK_FOV = 58;
const NORMAL_FOV = 75;
const FOV_LERP_PER_SEC = 6;
/** Remembers which hands-on tasks you have seen the how-to hint for. */
const HINTS_SEEN_KEY = "handsHintsSeen";
const STOP_HINT = "E or a step to stop";
/** A hidden relic this close to the place you found one is that relic. */
const FOUND_SAME_PLACE_M = 0.5;

/** A subtitle for an important sound, with an arrow toward it (GDD 23). */
export interface SoundCue {
  text: string;
  /** Where the sound is from the way you face, in radians: 0 ahead, positive to the right. Null: no arrow. */
  angle: number | null;
  /** The sound is on another floor. */
  vertical: "above" | "below" | null;
}

/** What the HUD should show about you. */
export type PlayerStatus =
  | { kind: "alive" }
  | { kind: "downed"; bleedLeft: number }
  | { kind: "dead" }
  | { kind: "hidden"; holdingBreath: boolean; breathCooldown: number };

export interface GameHud {
  setLooking(looking: boolean): void;
  setStamina(fraction: number): void;
  setPrompt(text: string | null): void;
  /** fractionLeft: 1 at dusk, 0 at dawn. */
  setNight(part: string, fractionLeft: number): void;
  setStatus(status: PlayerStatus): void;
  setAction(label: string | null, progress: number): void;
  showBanner(text: string, seconds: number): void;
  setVoice(state: VoiceUiState): void;
  /** Your microphone's loudness, 0 to 1, for the meter. */
  setMicLevel(level: number): void;
  setMicLost(lost: boolean): void;
  setItems(salt: number, cameraShots: number): void;
  /** The Spirit Camera viewfinder is up (key 2). */
  setCameraRaised(raised: boolean): void;
  /** Your own camera flash: a brief white screen. */
  flashScreen(): void;
  /** Your private task list. */
  setTasks(list: TaskEntry[]): void;
  /** The team task bar everyone sees. */
  setTeamTasks(done: number, total: number): void;
  /** The ritual bar (GDD 11): hidden until the ritual is ready. */
  setRitual(ritual: RitualHud): void;
  /** Every relic's state, for the Tab panel (GDD 10). */
  setRelics(list: { name: string; status: string }[]): void;
  /** Holding Tab shows the status panel. */
  showStatusPanel(open: boolean): void;
  /** The line under the crosshair while you work with your hands, or null. */
  setWorkHint(text: string | null): void;
  /** The room and floor you are in (room null in a doorway or on the stairs). */
  setRoom(room: string | null, floor: string): void;
  /** Your simulation position and facing, for the floor plan. */
  setPlanPosition(x: number, z: number, yaw: number): void;
  /** Subtitles for the important sounds you can hear right now. */
  setSoundCues(cues: SoundCue[]): void;
  /** The relic you carry, or null. */
  setCarrying(name: string | null): void;
  /** The match is over (GDD 18 and 19). */
  showEndScreen(end: ServerMessages["matchEnd"]): void;
}

export interface RitualHud {
  ready: boolean;
  started: boolean;
  /** 0 to 100. */
  progress: number;
  inCircle: number;
  needed: number;
}

/** What the microphone part of the room panel shows. */
export type VoiceUiState =
  | { kind: "off" }
  | { kind: "connecting" }
  | { kind: "no-mic" }
  | { kind: "failed" }
  | { kind: "needs-check"; error?: string }
  | { kind: "checking" }
  | { kind: "ready" };

/** What a noisy task or a search sounds like to players nearby. */
const TASK_NOISES: Partial<Record<MinigameKind, TaskSoundKind>> = { cradle: "cry", piano: "badNote", shutters: "bang", dig: "scrape" };

const ACTION_LABELS: Record<string, string> = { revive: "Reviving", hide: "Hiding", unhide: "Stepping out", salt: "Pouring salt", placeRelic: "Placing relic" };

/** The parts of a player's server state this client reads. */
interface PlayerData {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  flashlightOn: boolean;
  stamina: number;
  regenWait: number;
  lastSeq: number;
  health: string;
  bleedLeft: number;
  hidingSpot: string;
  holdingBreath: boolean;
  breathCooldown: number;
  action: string;
  actionProgress: number;
  salt: number;
  cameraShots: number;
  relic: string;
}

/** A relic as the server shares it with everyone. */
interface RelicData {
  name: string;
  status: string;
  carrier: string;
}

/**
 * The 3D game: renders the map, runs your own movement with client-side prediction,
 * shows other players and the ghost 100 ms in the past so their movement is smooth
 * (PRD Section 10.4), and drives the flicker, sounds and HUD.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
  private ambient = new THREE.HemisphereLight(0xb8c0d0, 0x202020, DARK_AMBIENT);
  private flashlight = createFlashlight();
  private flashlightIntensity: number;
  private flicker = new Flicker();
  private sound = new SoundScape();
  private input: PlayerInput;
  private doors: Map<string, DoorView>;
  private ritualCircle: RitualCircleView | null;
  /** Each door's last known state, to hear it move. */
  private doorsOpen = new Map<string, boolean>();
  private remotes: RemotePlayers;
  private ghost: GhostView;
  private items: ItemsView;
  private stations: StationsView;
  private relicsView: RelicsView;
  private physics: PhysicsWorld;
  private collide: CollideFn;

  private room?: Room;
  private me?: PlayerData;
  private others = new Map<string, PlayerData>();
  private seq = 0;
  private pending: MoveInput[] = [];
  private predicted?: MoveState;
  private previous?: MoveState;
  private accumulator = 0;
  private eyeHeight: number = config.movement.eyeHeightM;
  // Server corrections, in real 3D space (so they stay small across a flight of stairs).
  private correctionX = 0;
  private correctionY = 0;
  private correctionZ = 0;
  private voice: VoiceChat;
  /** False until the mic check passes when voice is on (GDD 5: a working mic is required). */
  private micChecked = false;
  private saltJarsTaken = new Set<string>();
  private myStepTracker = new StepTracker();
  private stepTrackers = new Map<string, StepTracker>();
  private ghostStepTracker = new StepTracker();
  private myTasks: TaskEntry[] = [];
  /** Where the open task stands on this side, so taskClosed can say the right thing. */
  private taskState: "none" | "open" | "finished" | "left" = "none";
  /** The match is over: no more moving. */
  private ended = false;
  private openStation = "";
  /** Relics the server says are near you: hidden ones you can hear, dropped ones you can see. */
  private relicsNear: RelicNear[] = [];
  private relics = new Map<string, RelicData>();
  /** The hands-on task in progress (GDD 26.5). */
  private hands: HandsWork;
  /** When your hands last made a noise, so the server is told at most once a second. */
  private handsNoiseAt = -Infinity;
  /** The place you are digging a found relic out of: its whisper has done its job and falls quiet. */
  private foundAt: { x: number; z: number } | null = null;
  /** The last bell ring, for its subtitle. */
  private bellCue: { at: WorldPoint; until: number } | null = null;

  private constructor(private canvas: HTMLCanvasElement, private map: MapData, private hud: GameHud) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);
    this.scene.add(this.ambient);

    ({ doors: this.doors, ritualCircle: this.ritualCircle } = buildWorld(this.scene, map));
    const place = (x: number, z: number) => toWorld(map, x, z);
    this.remotes = new RemotePlayers(this.scene, place);
    this.ghost = new GhostView(this.scene, place);
    this.items = new ItemsView(this.scene, map);
    this.stations = new StationsView(this.scene, map);
    this.relicsView = new RelicsView(this.scene, map);
    this.physics = new PhysicsWorld(map);
    this.hands = new HandsWork(this.scene, this.camera);
    this.collide = this.physics.addBody().collide;

    // Your flashlight is held slightly to the right and below your eyes.
    this.camera.rotation.order = "YXZ";
    this.flashlight.light.position.set(0.25, -0.2, 0);
    this.flashlightIntensity = this.flashlight.light.intensity;
    this.camera.add(this.flashlight.light, this.flashlight.target);
    this.scene.add(this.camera);
    const spawn = map.spawns[0] ?? { x: 0, z: 0 };
    const start = toWorld(map, spawn.x, spawn.z);
    this.camera.position.set(start.x, start.y + config.movement.eyeHeightM, start.z);

    this.input = new PlayerInput(canvas, {
      onFlashlight: () => this.room?.send("flashlight"),
      onCameraToggle: (raised) => hud.setCameraRaised(raised && (this.me?.cameraShots ?? 0) > 0),
      onPhoto: () => {
        if ((this.me?.cameraShots ?? 0) > 0) this.room?.send("photo");
      },
      onPourSalt: () => this.room?.send("pourSalt"),
      onUse: (down) => this.room?.send("use", { down }),
      onDropRelic: () => {
        if (this.me?.relic) this.room?.send("dropRelic");
      },
      onStatusPanel: (open) => hud.showStatusPanel(open),
      onToggleDebugLights: () => {
        this.ambient.intensity = this.ambient.intensity === DARK_AMBIENT ? DEBUG_AMBIENT : DARK_AMBIENT;
      },
      onToggleGhost: () => this.room?.send("debug", { toggleGhost: true }),
      onLookChange: (looking) => hud.setLooking(looking),
      onUserGesture: () => this.sound.unlock(),
      onHand: (down) => this.hands.press(down),
      onHandMove: (dx, dy) => this.hands.move(dx, dy),
      onStopWork: () => {
        if (this.taskState === "open") this.leaveTask();
      },
    });

    this.voice = new VoiceChat(
      () => this.sound.voiceOutput(),
      (status) => {
        if (status === "on") hud.setVoice(this.micChecked ? { kind: "ready" } : { kind: "needs-check" });
        else hud.setVoice({ kind: status === "off" ? "off" : status });
      },
    );

    window.addEventListener("resize", () => this.resize());
    this.resize();

    const timer = new THREE.Timer();
    this.renderer.setAnimationLoop((time) => {
      timer.update(time);
      this.frame(Math.min(timer.getDelta(), 0.25));
    });
  }

  static async create(canvas: HTMLCanvasElement, map: MapData, hud: GameHud): Promise<Game> {
    await initPhysics();
    return new Game(canvas, map, hud);
  }

  /** You stopped working: tell the server. Your hands never let go of the mouse, so you just get your view back. */
  private leaveTask() {
    this.taskState = "left";
    this.room?.send("taskCancel");
    this.stopHands();
  }

  /** Mute or unmute another player's voice, only for you. Returns whether they are now muted. */
  toggleMute(sessionId: string): boolean {
    return this.voice.toggleMute(sessionId);
  }

  isMuted(sessionId: string): boolean {
    return this.voice.isMuted(sessionId);
  }

  /** Sound volume from 0 to 1. */
  setVolume(volume: number) {
    this.sound.setVolume(volume);
  }

  /** Sound can only start from a click or key press; the Create and Join buttons count. */
  unlockSound() {
    this.sound.unlock();
  }

  /** Ask the server to listen for a few seconds and learn your normal speaking volume. */
  startMicCheck() {
    this.room?.send("micCheck");
    this.hud.setVoice({ kind: "checking" });
  }

  /** Starts playing in a joined room. */
  attach(room: Room) {
    this.room = room;
    room.onStateChange((state) => this.onServerState(state));
    let voiceAnswered = false;
    room.onMessage("voice", (msg: ServerMessages["voice"]) => {
      if (voiceAnswered) return; // a retry was answered twice
      voiceAnswered = true;
      if ("disabled" in msg) {
        // No voice on this server: play without it.
        this.hud.setVoice({ kind: "off" });
        this.input.enable();
      } else {
        void this.voice.connect(msg.url, msg.token);
      }
    });
    room.onMessage("voiceMix", (mix: ServerMessages["voiceMix"]) => this.voice.setMix(mix));
    room.onMessage("micCheck", (result: ServerMessages["micCheck"]) => {
      if (result.ok) {
        this.micChecked = true;
        this.hud.setVoice({ kind: "ready" });
        this.input.enable();
      } else {
        this.hud.setVoice({ kind: "needs-check", error: result.reason });
      }
    });
    room.onMessage("micLost", (msg: ServerMessages["micLost"]) => this.hud.setMicLost(msg.lost));
    room.onMessage("ghost", (msg: ServerMessages["ghost"]) => this.ghost.push(msg, performance.now()));
    room.onMessage("hunt", (msg: ServerMessages["hunt"]) => {
      if (msg.phase === "warning") this.sound.huntWarning(config.ghost.preHuntSilenceSec);
      else if (msg.phase === "start") this.sound.huntStart();
      else this.sound.huntEnd();
    });
    room.onMessage("bellRing", (msg: ServerMessages["bellRing"]) => {
      const at = this.place(msg);
      this.sound.serviceBell(at);
      this.bellCue = { at, until: performance.now() + BELL_CUE_SEC * 1000 };
    });
    room.onMessage("matchEnd", (msg: ServerMessages["matchEnd"]) => {
      this.ended = true;
      if (this.hands.active) this.stopHands();
      document.exitPointerLock();
      this.hud.showEndScreen(msg);
    });
    room.onMessage("flash", (msg: ServerMessages["flash"]) => {
      if (msg.by === room.sessionId) this.hud.flashScreen();
      else this.items.flashAt(msg.x, msg.z);
      this.sound.shutter(msg.by === room.sessionId ? undefined : this.place(msg));
    });
    room.onMessage("debugGhost", (msg: ServerMessages["debugGhost"]) => {
      this.hud.showBanner(msg.paused ? "Ghost paused for testing (K to bring it back)" : "Ghost is back", 3);
    });
    room.onMessage("photoTaken", (msg: ServerMessages["photoTaken"]) => {
      this.hud.showBanner(`Photo taken. It develops by the next meeting. Shots left: ${msg.shotsLeft}`, 4);
    });
    room.onMessage("tasks", (msg: ServerMessages["tasks"]) => {
      this.myTasks = msg.list;
      this.hud.setTasks(msg.list);
    });
    room.onMessage("taskOpen", (msg: ServerMessages["taskOpen"]) => {
      this.openStation = msg.stationId;
      this.taskState = "open";
      this.startHands(msg.stationId, msg.minigame);
    });
    room.onMessage("searchFound", (msg: ServerMessages["searchFound"]) => {
      if (msg.stationId !== this.openStation || !this.hands.active) return;
      this.hands.found();
      this.foundAt = this.map.relicSpots.flatMap((s) => searchPlaces(s)).find((p) => p.id === msg.stationId) ?? null;
      this.taskState = "open";
      this.hud.showBanner("Something is down there. Keep digging.", 3);
    });
    room.onMessage("taskClosed", (msg: ServerMessages["taskClosed"]) => {
      // Places to search use the same flow as tasks.
      const relic = this.map.relicSpots.some((s) => searchPlaces(s).some((p) => p.id === msg.stationId));
      const name = this.map.tasks.find((t) => t.id === msg.stationId)?.name ?? "Task";
      const what = relic ? "Search" : "Task";
      if (this.hands.active) this.stopHands();
      if (msg.reason === "empty") this.hud.showBanner("Nothing here.", 2);
      else if (msg.reason === "done") this.hud.showBanner(relic ? "You found a relic. Take it to the basement door." : `Done: ${name}`, 3);
      else if (this.taskState === "open") this.hud.showBanner(`${what} cancelled. Start it again with E.`, 3);
      else if (this.taskState === "finished") this.hud.showBanner(`${what} not accepted. Try it again.`, 3);
      this.taskState = "none";
    });
    room.onMessage("taskNoise", (msg: ServerMessages["taskNoise"]) => {
      const kind = TASK_NOISES[msg.minigame] ?? "badNote";
      this.sound.taskSound(kind, undefined, this.place(msg));
    });
    room.onMessage("relicsNear", (msg: ServerMessages["relicsNear"]) => {
      this.relicsNear = msg.list;
      this.relicsView.setDropped(msg.list);
    });
    room.onMessage("relicDrop", (msg: ServerMessages["relicDrop"]) => this.sound.taskSound("thud", 0, this.place(msg)));
    room.send("tasksRequest");

    // Every handler is registered, so now ask for the voice pass; the answer cannot be missed.
    // Ask again once if the server is slow; if it still does not answer, say so and play.
    this.hud.setVoice({ kind: "connecting" });
    room.send("voiceRequest");
    setTimeout(() => {
      if (!voiceAnswered) room.send("voiceRequest");
    }, VOICE_ANSWER_TIMEOUT_MS);
    setTimeout(() => {
      if (voiceAnswered) return;
      this.hud.setVoice({ kind: "failed" });
      this.input.enable();
    }, VOICE_ANSWER_TIMEOUT_MS * 2);
  }

  private resize() {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Runs whenever the server sends new state (20 times per second). */
  private onServerState(state: any) {
    const now = performance.now();
    const room = this.room!;

    state.doors?.forEach((door: { open: boolean }, id: string) => {
      // Every door that moves is heard, including the ones the ghost swings open (GDD 12.5).
      const was = this.doorsOpen.get(id);
      const def = this.map.doors.find((d) => d.id === id);
      if (was !== undefined && was !== door.open && def) this.sound.door(this.place(def), door.open);
      this.doorsOpen.set(id, door.open);
      this.doors.get(id)?.setOpen(door.open);
      this.physics.setDoorOpen(id, door.open);
    });
    this.items.update(state);
    this.stations.update(state);
    this.relics.clear();
    const relicList: { name: string; status: string }[] = [];
    state.relics?.forEach((r: RelicData, id: string) => {
      this.relics.set(id, { name: r.name, status: r.status, carrier: r.carrier });
      relicList.push({ name: r.name, status: relicStatusText(r) });
    });
    this.hud.setRelics(relicList);
    const relicDoor = this.map.relicDoor && this.doors.get(this.map.relicDoor);
    if (relicDoor) relicDoor.setSlots([...this.relics.values()].filter((r) => r.status === "placed").length, this.relics.size);
    if (typeof state.tasksTotal === "number") this.hud.setTeamTasks(state.tasksDone, state.tasksTotal);
    const ritual: RitualHud = {
      ready: !!state.ritualReady,
      started: !!state.ritualStarted,
      progress: state.ritualProgress ?? 0,
      inCircle: state.circleCount ?? 0,
      needed: state.circleNeeded ?? 0,
    };
    this.hud.setRitual(ritual);
    this.ritualCircle?.setState(ritual.started ? "running" : ritual.ready ? "ready" : "waiting");
    this.saltJarsTaken = new Set();
    state.saltJars?.forEach((jar: { taken: boolean }, id: string) => {
      if (jar.taken) this.saltJarsTaken.add(id);
    });

    if (typeof state.nightLength === "number" && state.nightLength > 0) {
      this.hud.setNight(state.part ?? "", 1 - state.nightTime / state.nightLength);
    }

    this.others.clear();
    const snapshots = new Map();
    state.players?.forEach((p: PlayerData, id: string) => {
      if (id === room.sessionId) {
        this.me = p;
        this.reconcile(p);
        return;
      }
      this.others.set(id, p);
      snapshots.set(id, {
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        crouching: p.crouching,
        flashlightOn: p.flashlightOn,
        health: p.health,
        hidden: !!p.hidingSpot,
      });
    });
    this.remotes.update(snapshots, now);
    if (this.me) this.updateStatusHud(this.me);
  }

  private moveMode(): MoveMode {
    const me = this.me;
    if (!me) return "normal";
    if (me.health === "downed") return "crawl";
    if (me.health === "dead" || me.hidingSpot) return "frozen";
    return me.relic ? "carry" : "normal";
  }

  /**
   * Client-side prediction: start from where the server says you are (after your last input it
   * applied), then replay the inputs it has not applied yet. You see your movement instantly,
   * and the server still decides.
   */
  private reconcile(me: PlayerData) {
    this.flashlight.light.visible = me.flashlightOn;
    this.pending = this.pending.filter((i) => i.seq > me.lastSeq);
    const mode = this.moveMode();
    let s: MoveState = { x: me.x, z: me.z, stamina: me.stamina, regenWait: me.regenWait, crouching: me.crouching };
    for (const input of this.pending) s = stepMovement(s, input, SIM_DT, this.collide, mode);
    if (!this.predicted) {
      this.previous = s;
    } else {
      // Keep the camera where it was and glide away the difference (see updateCamera).
      const was = this.place(this.predicted);
      const now = this.place(s);
      const errX = was.x - now.x;
      const errY = was.y - now.y;
      const errZ = was.z - now.z;
      if (Math.hypot(errX, errY, errZ) > SNAP_DISTANCE) {
        this.correctionX = this.correctionY = this.correctionZ = 0;
      } else {
        this.correctionX += errX;
        this.correctionY += errY;
        this.correctionZ += errZ;
      }
    }
    this.predicted = s;
  }

  private frame(dt: number) {
    if (this.room && this.predicted) {
      this.accumulator += dt;
      while (this.accumulator >= SIM_DT) {
        this.accumulator -= SIM_DT;
        if (!this.ended) this.simulateStep();
      }
      this.updateCamera(dt);
    }
    this.updateHands(dt);
    const now = performance.now();
    for (const door of this.doors.values()) door.update(dt);
    this.stations.render(now / 1000);
    this.relicsView.render(now / 1000);
    const whisper = this.nearestHiddenRelic();
    this.sound.relicWhisper(whisper, whisper ? 1 - this.distanceFromMe(whisper) / config.relics.whisperM : 0);
    this.updateWhereabouts(whisper, now);
    this.ghost.render(now);
    this.remotes.render(now, dt, (at) => this.ghost.distanceTo(at));

    const cam = this.camera.position;
    const ghostDistance = this.ghost.distanceTo({ x: cam.x, y: cam.y - this.eyeHeight, z: cam.z });
    this.flashlight.light.intensity = this.flashlightIntensity * this.flicker.update(dt, ghostDistance);
    this.playFootsteps(dt);
    const views = this.remotes.views();
    this.voice.update((id) => views.get(id) ?? null);
    if (this.voice.status === "on") this.hud.setMicLevel(this.voice.micLevel());
    this.sound.update(ghostDistance);
    this.renderer.render(this.scene, this.camera);
  }

  /** Footsteps are the game's background sound: yours, your friends' in 3D, and the hunting ghost's. */
  private playFootsteps(dt: number) {
    const cam = this.camera.position;
    this.sound.setListener(cam.x, cam.y, cam.z, this.input.yaw);

    const me = this.me;
    if (me && this.predicted && me.health !== "dead" && !me.hidingSpot) {
      const kind = playerStepKind(this.myStepTracker.speed, this.predicted.crouching, me.health === "downed");
      if (this.myStepTracker.update(cam.x, cam.z, dt, kind)) this.sound.step(kind);
    } else {
      this.myStepTracker.reset();
    }

    const views = this.remotes.views();
    for (const [id, v] of views) {
      let tracker = this.stepTrackers.get(id);
      if (!tracker) {
        tracker = new StepTracker();
        this.stepTrackers.set(id, tracker);
      }
      if (v.hidden || v.health === "dead") {
        tracker.reset();
        continue;
      }
      const kind = playerStepKind(tracker.speed, v.crouching, v.health === "downed");
      if (tracker.update(v.x, v.z, dt, kind)) this.sound.step(kind, v);
    }
    for (const id of this.stepTrackers.keys()) if (!views.has(id)) this.stepTrackers.delete(id);

    const ghostAt = this.ghost.huntingAt();
    if (ghostAt) {
      if (this.ghostStepTracker.update(ghostAt.x, ghostAt.z, dt, "ghost")) this.sound.step("ghost", ghostAt);
    } else {
      this.ghostStepTracker.reset();
    }
  }

  /** One fixed step: read the keys, move locally, and send the same input to the server. */
  private simulateStep() {
    const keys = this.input.movement();
    const input: MoveInput = { seq: ++this.seq, ...keys, yaw: this.input.yaw, pitch: this.input.pitch };
    this.previous = this.predicted;
    this.predicted = stepMovement(this.predicted!, input, SIM_DT, this.collide, this.moveMode());
    this.pending.push(input);
    this.room!.send("input", input);
  }

  private updateCamera(dt: number) {
    const prev = this.previous ?? this.predicted!;
    const curr = this.predicted!;
    // Blend between the last two steps so movement looks smooth at any frame rate.
    const alpha = this.accumulator / SIM_DT;
    // Server corrections fade out over ~0.1 s instead of making the view jump.
    const fade = Math.exp(-CORRECTION_FADE_PER_SEC * dt);
    this.correctionX *= fade;
    this.correctionY *= fade;
    this.correctionZ *= fade;
    // Blend in real 3D space: on the stairs' middle step the simulation jumps between floor areas.
    const a = this.place(prev);
    const b = this.place(curr);
    const x = a.x + (b.x - a.x) * alpha + this.correctionX;
    const y = a.y + (b.y - a.y) * alpha + this.correctionY;
    const z = a.z + (b.z - a.z) * alpha + this.correctionZ;

    const m = config.movement;
    const downed = this.me?.health === "downed" || this.me?.health === "dead";
    const targetEye = downed ? m.downedEyeHeightM : curr.crouching ? m.crouchEyeHeightM : m.eyeHeightM;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, CROUCH_LERP_PER_SEC * dt);

    this.camera.position.set(x, y + this.eyeHeight, z);
    this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);

    this.hud.setStamina(curr.stamina / m.staminaSec);
    this.hud.setPrompt(this.promptAt(curr.x, curr.z));
  }

  /** The E prompt for where you stand. Mirrors the server's choice in HauntedRoom.startUse. */
  private promptAt(x: number, z: number): string | null {
    const me = this.me;
    if (!me || me.health !== "alive" || me.action) return null;
    if (me.hidingSpot) return "Hold E  Step out";

    for (const p of this.others.values()) {
      if (p.health === "downed" && Math.hypot(p.x - x, p.z - z) <= config.interact.reviveRangeM) return `Hold E  Revive ${p.name}`;
    }
    if (!me.relic) {
      const dropped = this.relicsNear.find((r) => !r.hidden && Math.hypot(r.x - x, r.z - z) <= config.relics.useRangeM);
      if (dropped) return `E  Pick up ${this.relics.get(dropped.id)?.name ?? "the relic"}`;
    }
    const relicDoor = this.map.doors.find((d) => d.id === this.map.relicDoor);
    const atRelicDoor = !!relicDoor && Math.hypot(relicDoor.x - x, relicDoor.z - z) <= config.interact.rangeM;
    if (atRelicDoor && me.relic) return `Hold E  Place ${this.relics.get(me.relic)?.name ?? "the relic"}`;
    if (me.salt < config.salt.carryMax) {
      for (const jar of this.map.saltJars) {
        if (!this.saltJarsTaken.has(jar.id) && Math.hypot(jar.x - x, jar.z - z) <= config.salt.jarRangeM) return "E  Pick up salt";
      }
    }
    for (const task of this.myTasks) {
      if (task.done) continue;
      const def = this.map.tasks.find((t) => t.id === task.stationId);
      if (def && Math.hypot(def.x - x, def.z - z) <= config.tasks.useRangeM) return `E  ${def.name}`;
    }
    if (!me.relic) {
      // Every unsearched place in a group can be searched, so the prompt gives nothing away (GDD 26.5).
      for (const spot of this.map.relicSpots) {
        const place = spot.places?.find((p) => !this.stations.searched(p.id) && Math.hypot(p.x - x, p.z - z) <= config.relics.useRangeM);
        if (place) return `E  ${spot.label}`;
      }
      // A spot with one place: you only know it holds a relic once you can hear it whisper.
      const hidden = this.relicsNear.find((r) => r.hidden && Math.hypot(r.x - x, r.z - z) <= config.relics.useRangeM);
      const spot = hidden && this.map.relicSpots.find((s) => s.id === hidden.spotId && !s.places);
      if (spot) return `E  ${spot.label}`;
    }
    const taken = new Set([...this.others.values()].map((p) => p.hidingSpot).filter(Boolean));
    for (const spot of this.map.hidingSpots) {
      if (!taken.has(spot.id) && Math.hypot(spot.exit.x - x, spot.exit.z - z) <= config.interact.hideRangeM) return "Hold E  Hide";
    }
    if (atRelicDoor) {
      const relics = [...this.relics.values()];
      const placed = relics.filter((r) => r.status === "placed").length;
      // Once every slot is full the door stays open, and there is nothing to do here.
      if (placed < relics.length) return `Locked: ${placed} of ${relics.length} relics placed`;
    }
    const doors = this.map.doors.filter((d) => d.id !== this.map.relicDoor);
    if (doors.some((d) => Math.hypot(d.x - x, d.z - z) <= config.interact.rangeM)) return "E  Open / close door";
    return null;
  }

  private updateStatusHud(me: PlayerData) {
    if (me.health === "downed") this.hud.setStatus({ kind: "downed", bleedLeft: me.bleedLeft });
    else if (me.health === "dead") this.hud.setStatus({ kind: "dead" });
    else if (me.hidingSpot) this.hud.setStatus({ kind: "hidden", holdingBreath: me.holdingBreath, breathCooldown: me.breathCooldown });
    else this.hud.setStatus({ kind: "alive" });
    this.hud.setAction(me.action ? (ACTION_LABELS[me.action] ?? null) : null, me.actionProgress);
    this.hud.setItems(me.salt, me.cameraShots);
    this.hud.setCarrying(me.relic ? (this.relics.get(me.relic)?.name ?? "a relic") : null);
  }

  /** Starts hands-on work on a station or a place to search (GDD 26.5). */
  private startHands(id: string, kind: MinigameKind) {
    const model = this.stations.hands(id);
    if (!model || model.kind !== kind) {
      // No parts to work on: give it up rather than leave you stuck.
      this.leaveTask();
      return;
    }
    const task = createHandsTask(model, {
      play: (sound, pitch) => this.sound.taskSound(sound, pitch),
      noise: () => {
        const now = performance.now() / 1000;
        if (now - this.handsNoiseAt < config.tasks.noiseCooldownSec) return;
        this.handsNoiseAt = now;
        this.room?.send("taskNoise");
      },
    });
    this.stations.setBusy(id);
    this.hands.start(task, this.input.yaw, this.input.pitch);
    this.input.working = true;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(HINTS_SEEN_KEY) ?? "[]");
    } catch {
      // Storage blocked: show the hint every time.
    }
    this.hud.setWorkHint(seen.includes(kind) ? STOP_HINT : `${task.hint}  (${STOP_HINT})`);
    try {
      if (!seen.includes(kind)) localStorage.setItem(HINTS_SEEN_KEY, JSON.stringify([...seen, kind]));
    } catch {
      // See above.
    }
  }

  private stopHands() {
    this.hands.stop();
    this.foundAt = null;
    this.stations.setBusy(null);
    this.input.working = false;
    this.hud.setWorkHint(null);
  }

  /** Your hands at work, and the view narrowing toward the work. */
  private updateHands(dt: number) {
    if (this.hands.active && this.hands.frame(dt, this.input.yaw, this.input.pitch) && this.taskState === "open") {
      this.taskState = "finished";
      this.room?.send("taskDone", { stationId: this.openStation });
    }
    const fov = this.hands.active ? WORK_FOV : NORMAL_FOV;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, FOV_LERP_PER_SEC * dt);
      this.camera.updateProjectionMatrix();
    }
  }

  /** The room name, the floor plan arrow and the sound subtitles. */
  private updateWhereabouts(whisper: WorldPoint | null, now: number) {
    const me = this.predicted;
    if (me) {
      this.hud.setRoom(roomAt(this.map, me.x, me.z)?.name ?? null, levelOf(this.map, me.x, me.z).name);
      this.hud.setPlanPosition(me.x, me.z, this.input.yaw);
    }
    if (this.bellCue && now > this.bellCue.until) this.bellCue = null;
    const cues: SoundCue[] = [];
    if (whisper) cues.push(this.whisperCue(whisper));
    if (this.bellCue) cues.push(this.cue("The bell rings", this.bellCue.at));
    this.hud.setSoundCues(this.ended ? [] : cues);
  }

  /** How far a place is from your feet, in meters. */
  private distanceFromMe(at: WorldPoint): number {
    const cam = this.camera.position;
    return Math.hypot(at.x - cam.x, at.y - (cam.y - this.eyeHeight), at.z - cam.z);
  }

  /**
   * The whisper's subtitle says how close it is. From afar a rough arrow points the way; up
   * close there is none, so you must listen and search (GDD 26.5).
   */
  private whisperCue(at: WorldPoint): SoundCue {
    const s = config.relics.search;
    const d = this.distanceFromMe(at);
    const text = d <= s.veryCloseM ? "A relic whispers, very close" : d <= s.closeM ? "A relic whispers close by" : "A faint whisper";
    const cue = this.cue(text, at);
    return { ...cue, angle: d <= s.closeM || cue.angle === null ? null : roundDirection(cue.angle) };
  }

  private cue(text: string, at: WorldPoint): SoundCue {
    const cam = this.camera.position;
    const dy = at.y - (cam.y - this.eyeHeight);
    const vertical = dy > CUE_FLOOR_DIFF_M ? "above" : dy < -CUE_FLOOR_DIFF_M ? "below" : null;
    return { text, angle: directionTo(cam.x, cam.z, this.input.yaw, at.x, at.z), vertical };
  }

  /** The closest hidden relic within whisper range, for the whisper sound. */
  private nearestHiddenRelic(): WorldPoint | null {
    const me = this.predicted;
    if (!me) return null;
    let best: RelicNear | null = null;
    let bestDist: number = config.relics.whisperM;
    for (const r of this.relicsNear) {
      const d = worldDistance(this.map, r, me);
      const found = this.foundAt && Math.hypot(r.x - this.foundAt.x, r.z - this.foundAt.z) < FOUND_SAME_PLACE_M;
      if (r.hidden && !found && d <= bestDist) {
        best = r;
        bestDist = d;
      }
    }
    return best && this.place(best);
  }

  /** The real 3D place of a simulation position. */
  private place(p: { x: number; z: number }): WorldPoint {
    return toWorld(this.map, p.x, p.z);
  }
}

/** How the Tab panel describes a relic (GDD 10). It never says where a dropped relic is. */
function relicStatusText(r: RelicData): string {
  switch (r.status) {
    case "carried":
      return `Carried by ${r.carrier}`;
    case "dropped":
      return `Dropped (last carried by ${r.carrier})`;
    case "placed":
      return "Placed";
    default:
      return "Hidden";
  }
}
