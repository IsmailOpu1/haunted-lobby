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
import { GhostView } from "./ghostView.ts";
import { PlayerInput } from "./input.ts";
import { RemotePlayers } from "./remotePlayers.ts";
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
}

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

  /** Starts playing in a joined room. */
  attach(room: Room) {
    this.room = room;
    this.input.enable();
    room.onStateChange((state) => this.onServerState(state));
    room.onMessage("ghost", (msg: ServerMessages["ghost"]) => this.ghost.push(msg, performance.now()));
    room.onMessage("hunt", (msg: ServerMessages["hunt"]) => {
      if (msg.phase === "warning") this.sound.huntWarning(config.ghost.preHuntSilenceSec);
      else if (msg.phase === "start") this.sound.huntStart();
      else this.sound.huntEnd();
    });
    room.onMessage("dawn", () => this.hud.showBanner("Dawn. The night is over.", 6));
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
    this.sound.update(ghostDistance);
    this.renderer.render(this.scene, this.camera);
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
