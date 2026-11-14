import * as THREE from "three";
import { config, type WorldPoint } from "@haunted/shared";
import { createFlashlight } from "./flashlight.ts";
import { Flicker } from "./flicker.ts";
import { chooseClip, CRAWL_TURN_RAD, type CharacterBody, type CharacterModels, type ClipName } from "./characterModels.ts";

/** What the server said about another player at one moment, at their real place (with floor height). */
interface Snapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  flashlightOn: boolean;
  health: string;
  hidden: boolean;
  /** Their name and their character's colour (shown only when recognised, GDD 22.2). */
  name: string;
  colour: string;
  /** Their character's id ("" until one is dealt, GDD 26.14). */
  character: string;
}

const MAX_SNAPSHOTS = 30;
/** A nameless shadow in the dark (GDD 22.2). */
const BODY_COLOR = 0x3a3a40;
/** How fast the name and colour fade in or out, per second. */
const REVEAL_FADE_PER_SEC = 6;
const LABEL_HEIGHT_M = 0.22;
const LABEL_ABOVE_HEAD_M = 0.35;
const LABEL_FONT_PX = 44;
const DEAD_COLOR = 0x1a1a1c;
const CROUCH_SCALE = config.movement.crouchEyeHeightM / config.movement.eyeHeightM;

function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

const EYE_COLOR = 0xff2a1a;
const WHITE = new THREE.Color(1, 1, 1);
/** Where the red eyes sit in front of the head's centre, on a character model. */
const MODEL_EYES_FORWARD_M = 0.11;
/** Seconds one clip blends into the next. */
const CLIP_BLEND_SEC = 0.25;
/** How quickly the measured walking speed follows the real one, per second. */
const SPEED_SMOOTHING_PER_SEC = 8;
/** The speed (m/s) each moving clip was made at, so feet keep pace with the ground. */
const CLIP_SPEED_MPS: Partial<Record<ClipName, number>> = { walk: 1.6, run: 4.2, "crouch-walk": 1.1, crawl: 0.6 };
const CLIP_RATE_MIN = 0.6;
const CLIP_RATE_MAX = 1.8;
/** How quickly a downed body turns round to crawl, per second. */
const CRAWL_TURN_PER_SEC = 5;

/** Another player's body and flashlight, drawn 100 ms in the past so movement is smooth. */
class RemotePlayer {
  private snapshots: Snapshot[] = [];
  private root = new THREE.Group();
  private body: THREE.Mesh;
  private head = new THREE.Group();
  private light: THREE.SpotLight;
  private lens: THREE.Mesh;
  private bodyMaterial = new THREE.MeshLambertMaterial({ color: BODY_COLOR });
  private flicker = new Flicker();
  private baseIntensity: number;
  private latest: Snapshot | null = null;
  /** Red eyes, lit for a moment after this player Summons the ghost in your light (GDD 14.2). */
  private eyes = new THREE.Group();
  private eyesUntil = 0;
  /** The name above their head, drawn once per name. */
  private label: THREE.Sprite;
  private labelText = "";
  /** 0 = a nameless shadow, 1 = fully recognised (GDD 22.2); eased toward `revealTarget`. */
  private reveal = 0;
  private revealTarget = 0;
  private shadowColour = new THREE.Color(BODY_COLOR);
  private ownColour = new THREE.Color(BODY_COLOR);

  /** The character's model, once loaded; until then the plain body stands in. */
  private model: CharacterBody | null = null;
  /** The file the model is from (CharacterModels.fileFor), and its character. */
  private modelFor = "";
  private modelCharacter = "";
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private clip: ClipName | null = null;
  private speed = 0;
  private lastX = NaN;
  private lastZ = NaN;
  private lastT = 0;
  private tint = new THREE.Color();
  /** The model's turn on the floor (CRAWL_TURN_RAD once it has crawled while downed). */
  private bodyTurn = 0;

  constructor(private scene: THREE.Scene, private models: CharacterModels) {
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.label.visible = false;
    this.label.renderOrder = 10;
    this.root.add(this.label);

    const { radiusM, heightM } = config.body;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(radiusM, heightM - radiusM * 2, 4, 12), this.bodyMaterial);
    this.body.position.y = heightM / 2;
    this.root.add(this.body);

    this.head.position.y = config.movement.eyeHeightM;
    this.root.add(this.head);

    const { light, target } = createFlashlight();
    this.light = light;
    this.baseIntensity = light.intensity;
    light.position.set(0.2, -0.25, -0.2);
    this.head.add(light, target);

    this.lens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d6 }));
    this.lens.position.copy(light.position);
    this.head.add(this.lens);

    const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_COLOR });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
      eye.position.set(side * 0.08, 0, -config.body.radiusM - 0.01);
      this.eyes.add(eye);
    }
    this.eyes.visible = false;
    this.head.add(this.eyes);

    scene.add(this.root);
  }

  glowEyes(until: number) {
    this.eyesUntil = until;
  }

  showEyes(now: number) {
    this.eyes.visible = now < this.eyesUntil;
  }

  push(s: Snapshot) {
    this.snapshots.push(s);
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
  }

  render(renderTime: number) {
    const snaps = this.snapshots;
    if (snaps.length === 0) return;

    // Find the two snapshots around renderTime and blend between them.
    let a = snaps[0]!;
    let b = a;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i]!.t <= renderTime) {
        a = snaps[i]!;
        b = snaps[i + 1] ?? a;
        break;
      }
    }
    const span = b.t - a.t;
    const t = span > 0 ? Math.min(1, (renderTime - a.t) / span) : 1;

    this.root.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    this.root.rotation.y = lerpAngle(a.yaw, b.yaw, t);
    this.head.rotation.x = a.pitch + (b.pitch - a.pitch) * t;

    this.latest = b;
    // Hidden players are inside the furniture.
    this.root.visible = !b.hidden;

    const lying = b.health !== "alive";
    if (lying) {
      // Downed or dead: lying on the floor.
      this.body.rotation.x = Math.PI / 2;
      this.body.scale.y = 1;
      this.body.position.y = config.body.radiusM;
      this.head.position.y = config.body.radiusM;
    } else {
      const crouching = b.crouching;
      this.body.rotation.x = 0;
      this.body.scale.y = crouching ? CROUCH_SCALE : 1;
      this.body.position.y = (config.body.heightM / 2) * this.body.scale.y;
      this.head.position.y = crouching ? config.movement.crouchEyeHeightM : config.movement.eyeHeightM;
    }
    if (this.models.fileFor(b.character) !== this.modelFor) this.useCharacter(b.character);
    this.measureSpeed(renderTime);
    if (b.name !== this.labelText) this.drawLabel(b.name);
    this.ownColour.set(b.colour || BODY_COLOR);
    this.label.position.y = this.head.position.y + LABEL_ABOVE_HEAD_M;

    this.light.visible = b.flashlightOn;
    this.lens.visible = b.flashlightOn;
  }

  /**
   * Swaps in this character's model (or the plain body while it loads, or with none dealt). When
   * only the quality changed, the model they have stays until the other copy is in.
   */
  private useCharacter(character: string) {
    const file = this.models.fileFor(character);
    if (this.modelCharacter !== character) this.dropModel();
    this.modelFor = file;
    this.modelCharacter = character;
    if (!character) return;
    void this.models.body(character).then((model) => {
      if (!model || this.modelFor !== file || !this.root.parent) return;
      this.dropModel();
      this.model = model;
      this.mixer = new THREE.AnimationMixer(model.root);
      for (const [name, clip] of model.clips) this.actions.set(name, this.mixer.clipAction(clip));
      this.root.add(model.root);
      this.body.visible = false;
      this.eyes.position.z = config.body.radiusM + 0.01 - MODEL_EYES_FORWARD_M;
      // A player first seen downed or dead is already on the floor.
      const health = this.latest?.health;
      if (health === "dead") this.play("dying", true);
      else if (health === "downed") this.play("downed-idle", true);
    });
  }

  private dropModel() {
    if (this.model) this.root.remove(this.model.root);
    this.mixer?.stopAllAction();
    this.model = null;
    this.mixer = null;
    this.actions.clear();
    this.clip = null;
    this.body.visible = true;
    this.eyes.position.z = 0;
  }

  /** How fast they move across the floor, smoothed (m/s), from where they are drawn. */
  private measureSpeed(t: number) {
    const { x, z } = this.root.position;
    const dt = (t - this.lastT) / 1000;
    if (dt > 0 && Number.isFinite(this.lastX)) {
      const now = Math.hypot(x - this.lastX, z - this.lastZ) / dt;
      this.speed += (now - this.speed) * (1 - Math.exp(-SPEED_SMOOTHING_PER_SEC * dt));
    }
    if (dt !== 0) {
      this.lastX = x;
      this.lastZ = z;
      this.lastT = t;
    }
  }

  /** Blends into a clip; `atEnd` jumps straight to its last frame (a fall that already happened). */
  private play(name: ClipName, atEnd = false) {
    const next = this.actions.get(name);
    if (!next || this.clip === name) return;
    const prev = this.clip ? this.actions.get(this.clip) : undefined;
    this.clip = name;
    next.reset();
    const once = name === "knocked-down" || name === "dying";
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    if (atEnd) next.time = next.getClip().duration;
    next.play();
    if (prev && !atEnd) next.crossFadeFrom(prev, CLIP_BLEND_SEC, false);
    else prev?.stop();
  }

  /** Moves the model's bones on: picks the clip for what they are doing and keeps its pace. */
  animate(dt: number) {
    if (!this.mixer || !this.latest) return;
    const s = this.latest;
    const current = this.clip ? this.actions.get(this.clip) : undefined;
    // Downed: the fall plays once, then they lie breathing or crawl.
    const knockedDownDone =
      this.clip === "knocked-down"
        ? !!current && current.time >= current.getClip().duration - CLIP_BLEND_SEC
        : this.clip === "downed-idle" || this.clip === "crawl";
    const want = chooseClip(s.health, s.crouching, this.speed, knockedDownDone);
    this.play(want);
    const action = this.actions.get(want);
    const made = CLIP_SPEED_MPS[want];
    if (action) action.timeScale = made ? THREE.MathUtils.clamp(this.speed / made, CLIP_RATE_MIN, CLIP_RATE_MAX) : 1;
    this.mixer.update(dt);
    // Turned round to crawl, they stay that way while lying there; standing up or a new fall resets it.
    if (want === "crawl") this.bodyTurn = CRAWL_TURN_RAD;
    else if (want !== "downed-idle" && want !== "dying") this.bodyTurn = 0;
    const body = this.model!.root;
    body.rotation.y += (this.bodyTurn - body.rotation.y) * (1 - Math.exp(-CRAWL_TURN_PER_SEC * dt));
  }

  /** Whether you can tell who this is right now (GDD 22.2); the change fades in over a moment. */
  setRecognised(yes: boolean) {
    this.revealTarget = yes ? 1 : 0;
  }

  /** Eases the name and colour toward what you can see. */
  fade(dt: number) {
    this.reveal += (this.revealTarget - this.reveal) * (1 - Math.exp(-REVEAL_FADE_PER_SEC * dt));
    const dead = this.latest?.health === "dead";
    if (dead) this.bodyMaterial.color.setHex(DEAD_COLOR);
    else this.bodyMaterial.color.copy(this.shadowColour).lerp(this.ownColour, this.reveal);
    if (this.model) {
      // A model keeps its own colours when recognised and falls to a shadow when not (GDD 22.2).
      if (dead) this.tint.setHex(DEAD_COLOR);
      else this.tint.copy(this.shadowColour).lerp(WHITE, this.reveal);
      for (const { material, colour } of this.model.materials) material.color.copy(colour).multiply(this.tint);
    }
    const mat = this.label.material;
    mat.opacity = this.reveal;
    this.label.visible = this.reveal > 0.02 && !!this.labelText;
  }

  private drawLabel(text: string) {
    this.labelText = text;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const font = `600 ${LABEL_FONT_PX}px "Manrope Variable", "Segoe UI", sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + LABEL_FONT_PX;
    canvas.width = w;
    canvas.height = Math.ceil(LABEL_FONT_PX * 1.6);
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = LABEL_FONT_PX / 5;
    ctx.fillStyle = "#f2ead8";
    ctx.fillText(text, w / 2, canvas.height / 2);
    const mat = this.label.material;
    mat.map?.dispose();
    mat.map = new THREE.CanvasTexture(canvas);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.needsUpdate = true;
    this.label.scale.set((LABEL_HEIGHT_M * canvas.width) / canvas.height, LABEL_HEIGHT_M, 1);
  }

  /** Where this player is drawn right now and what they are doing (for footstep sounds). */
  view(): { x: number; y: number; z: number; crouching: boolean; health: string; hidden: boolean } | null {
    if (!this.latest) return null;
    const { crouching, health, hidden } = this.latest;
    const { x, y, z } = this.root.position;
    return { x, y, z, crouching, health, hidden };
  }

  /** Flicker this player's flashlight when the ghost is near them. */
  applyFlicker(dt: number, ghostDistanceFrom: (at: WorldPoint) => number) {
    const level = this.flicker.update(dt, ghostDistanceFrom(this.root.position));
    this.light.intensity = this.baseIntensity * level;
    (this.lens.material as THREE.MeshBasicMaterial).color.setScalar(level > 0.5 ? 1 : 0.2);
  }

  dispose() {
    this.dropModel();
    this.scene.remove(this.root);
    this.label.material.map?.dispose();
    this.label.material.dispose();
  }
}

export class RemotePlayers {
  private players = new Map<string, RemotePlayer>();

  /** `toWorld` turns a simulation position into its real place (shared/levels.ts). */
  constructor(
    private scene: THREE.Scene,
    private toWorld: (x: number, z: number) => WorldPoint,
    private models: CharacterModels,
  ) {}

  /** Low quality draws every player's Low copy; each swaps over once it has loaded. */
  setLowQuality(low: boolean) {
    this.models.setLowQuality(low);
  }

  /** Records the latest server state for every other player, and removes players who left. */
  update(states: Map<string, Omit<Snapshot, "t" | "y">>, now: number) {
    for (const [id, s] of states) {
      let p = this.players.get(id);
      if (!p) {
        p = new RemotePlayer(this.scene, this.models);
        this.players.set(id, p);
      }
      p.push({ ...s, ...this.toWorld(s.x, s.z), t: now });
    }
    for (const [id, p] of this.players) {
      if (!states.has(id)) {
        p.dispose();
        this.players.delete(id);
      }
    }
  }

  /** Every other player as currently drawn. */
  views(): Map<string, NonNullable<ReturnType<RemotePlayer["view"]>>> {
    const out = new Map();
    for (const [id, p] of this.players) {
      const v = p.view();
      if (v) out.set(id, v);
    }
    return out;
  }

  render(now: number, dt: number, ghostDistanceFrom: (at: WorldPoint) => number) {
    const renderTime = now - config.net.interpolationMs;
    for (const p of this.players.values()) {
      p.render(renderTime);
      p.animate(dt);
      p.applyFlicker(dt, ghostDistanceFrom);
      p.showEyes(now);
      p.fade(dt);
    }
  }

  /** Marks who you can recognise right now (GDD 22.2); the rest stay nameless shadows. */
  reveal(isRecognised: (id: string) => boolean) {
    for (const [id, p] of this.players) p.setRecognised(isRecognised(id));
  }

  /** This player's eyes glow red for config.powers.summon.eyeGlowSec. */
  glowEyes(id: string, now: number) {
    this.players.get(id)?.glowEyes(now + config.powers.summon.eyeGlowSec * 1000);
  }
}
