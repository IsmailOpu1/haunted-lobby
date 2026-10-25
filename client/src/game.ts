import * as THREE from "three";
import type { Room } from "@colyseus/sdk";
import {
  config,
  initPhysics,
  PhysicsWorld,
  SIM_DT,
  stepMovement,
  type CollideFn,
  type MapData,
  type MoveInput,
  type MoveMode,
  type MoveState,
  type ServerMessages,
} from "@haunted/shared";
import { SoundScape } from "./audio.ts";
import { createFlashlight } from "./flashlight.ts";
import { Flicker } from "./flicker.ts";
import { playerStepKind, StepTracker } from "./footsteps.ts";
import { GhostView } from "./ghostView.ts";
import { PlayerInput } from "./input.ts";
import { RemotePlayers } from "./remotePlayers.ts";
import { VoiceChat } from "./voice.ts";
import { buildWorld, type DoorView } from "./world.ts";

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

const ACTION_LABELS: Record<string, string> = { revive: "Reviving", hide: "Hiding", unhide: "Stepping out" };

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
  private remotes: RemotePlayers;
  private ghost: GhostView;
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
  private correctionX = 0;
  private correctionZ = 0;
  private voice: VoiceChat;
  /** False until the mic check passes when voice is on (GDD 5: a working mic is required). */
  private micChecked = false;
  private myStepTracker = new StepTracker();
  private stepTrackers = new Map<string, StepTracker>();
  private ghostStepTracker = new StepTracker();

  private constructor(canvas: HTMLCanvasElement, private map: MapData, private hud: GameHud) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);
    this.scene.add(this.ambient);

    this.doors = buildWorld(this.scene, map);
    this.remotes = new RemotePlayers(this.scene);
    this.ghost = new GhostView(this.scene);
    this.physics = new PhysicsWorld(map);
    this.collide = this.physics.addBody().collide;

    // Your flashlight is held slightly to the right and below your eyes.
    this.camera.rotation.order = "YXZ";
    this.flashlight.light.position.set(0.25, -0.2, 0);
    this.flashlightIntensity = this.flashlight.light.intensity;
    this.camera.add(this.flashlight.light, this.flashlight.target);
    this.scene.add(this.camera);
    const spawn = map.spawns[0] ?? { x: 0, z: 0 };
    this.camera.position.set(spawn.x, config.movement.eyeHeightM, spawn.z);

    this.input = new PlayerInput(canvas, {
      onFlashlight: () => this.room?.send("flashlight"),
      onUse: (down) => this.room?.send("use", { down }),
      onToggleDebugLights: () => {
        this.ambient.intensity = this.ambient.intensity === DARK_AMBIENT ? DEBUG_AMBIENT : DARK_AMBIENT;
      },
      onLookChange: (looking) => hud.setLooking(looking),
      onUserGesture: () => this.sound.unlock(),
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
    room.onMessage("dawn", () => this.hud.showBanner("Dawn. The night is over.", 6));

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
      this.doors.get(id)?.setOpen(door.open);
      this.physics.setDoorOpen(id, door.open);
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
    return "normal";
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
      const errX = this.predicted.x - s.x;
      const errZ = this.predicted.z - s.z;
      if (Math.hypot(errX, errZ) > SNAP_DISTANCE) {
        this.correctionX = this.correctionZ = 0;
      } else {
        this.correctionX += errX;
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
        this.simulateStep();
      }
      this.updateCamera(dt);
    }
    const now = performance.now();
    for (const door of this.doors.values()) door.update(dt);
    this.ghost.render(now);
    this.remotes.render(now, dt, (x, z) => this.ghost.distanceTo(x, z));

    const ghostDistance = this.ghost.distanceTo(this.camera.position.x, this.camera.position.z);
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
    this.correctionZ *= fade;
    const x = prev.x + (curr.x - prev.x) * alpha + this.correctionX;
    const z = prev.z + (curr.z - prev.z) * alpha + this.correctionZ;

    const m = config.movement;
    const downed = this.me?.health === "downed" || this.me?.health === "dead";
    const targetEye = downed ? m.downedEyeHeightM : curr.crouching ? m.crouchEyeHeightM : m.eyeHeightM;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, CROUCH_LERP_PER_SEC * dt);

    this.camera.position.set(x, this.eyeHeight, z);
    this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);

    this.hud.setStamina(curr.stamina / m.staminaSec);
    this.hud.setPrompt(this.promptAt(x, z));
  }

  /** The E prompt for where you stand. Mirrors the server's choice in HauntedRoom.startUse. */
  private promptAt(x: number, z: number): string | null {
    const me = this.me;
    if (!me || me.health !== "alive" || me.action) return null;
    if (me.hidingSpot) return "Hold E  Step out";

    for (const p of this.others.values()) {
      if (p.health === "downed" && Math.hypot(p.x - x, p.z - z) <= config.interact.reviveRangeM) return `Hold E  Revive ${p.name}`;
    }
    const taken = new Set([...this.others.values()].map((p) => p.hidingSpot).filter(Boolean));
    for (const spot of this.map.hidingSpots) {
      if (!taken.has(spot.id) && Math.hypot(spot.exit.x - x, spot.exit.z - z) <= config.interact.hideRangeM) return "Hold E  Hide";
    }
    if (this.map.doors.some((d) => Math.hypot(d.x - x, d.z - z) <= config.interact.rangeM)) return "E  Open / close door";
    return null;
  }

  private updateStatusHud(me: PlayerData) {
    if (me.health === "downed") this.hud.setStatus({ kind: "downed", bleedLeft: me.bleedLeft });
    else if (me.health === "dead") this.hud.setStatus({ kind: "dead" });
    else if (me.hidingSpot) this.hud.setStatus({ kind: "hidden", holdingBreath: me.holdingBreath, breathCooldown: me.breathCooldown });
    else this.hud.setStatus({ kind: "alive" });
    this.hud.setAction(me.action ? (ACTION_LABELS[me.action] ?? null) : null, me.actionProgress);
  }
}
