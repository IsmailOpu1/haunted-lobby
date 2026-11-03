import * as THREE from "three";
import { config } from "@haunted/shared";
import type { TaskSoundKind } from "./sounds.ts";
import { jugModel, type HandsModel } from "../stations.ts";
import {
  BoilerLogic,
  CandelabraLogic,
  ClockLogic,
  CradleLogic,
  DigLogic,
  DrainLogic,
  type FacePoint,
  type JugAction,
  LetterLogic,
  LockboxLogic,
  MirrorLogic,
  PianoLogic,
  PortraitsLogic,
  RosesLogic,
  SheetsLogic,
  ShuttersLogic,
  StoveLogic,
  SwitchboardLogic,
  TrunkLogic,
} from "./logic.ts";

// Hands-on tasks in the 3D world (GDD 26.5): each one ties its rules (logic.ts) to the real
// parts of its station (stations.ts) and the tool in your hand.

/** What your hands are doing this frame. */
export interface HandsFrame {
  dt: number;
  /** From your eye through the crosshair, in world space. */
  ray: THREE.Ray;
  /** The part under the crosshair within reach ("knob:1"), or null. */
  aim: string | null;
  /** The part you grabbed when you pressed the button, or null. */
  held: string | null;
  /** The mouse button is down (with or without a part in hand). */
  holding: boolean;
  /** Mouse movement this frame while the button is down, in pixels (right and down are positive). */
  dragX: number;
  dragY: number;
  /** How fast your view is turning, in radians per second. */
  lookSpeed: number;
}

export interface HandsEvents {
  /** pitch is a note number for the piano (0 is the lowest key). */
  play(kind: TaskSoundKind, pitch?: number): void;
  /** A noise the ghost can hear (the server limits how often). */
  noise(): void;
}

export interface HandsTask {
  readonly done: boolean;
  /** The first-time hint: how to use your hands on this task. */
  readonly hint: string;
  /** The parts the crosshair can pick. */
  readonly parts: THREE.Object3D[];
  /** The tool in your hand, if any: added to the scene while you work. */
  readonly tool?: THREE.Object3D;
  /** Whether pressing the button on this part grabs it. */
  canHold(part: string): boolean;
  /** Whether this part should glow under the crosshair (usable now). */
  glows(part: string): boolean;
  update(f: HandsFrame): void;
  /** The server says the relic is here: keep going (digging only). */
  setFound?(): void;
}

/** The number in a part name: "knob:2" is 2. */
function index(part: string | null, kind: string): number | null {
  if (!part?.startsWith(`${kind}:`)) return null;
  return Number(part.slice(kind.length + 1));
}

const TOOL_LIGHT_RANGE_M = 2;
/** How far in front of your eye a tool sits when there is nothing to touch. */
const TOOL_REST_M = 0.7;
const _v = new THREE.Vector3();

function matchTool(): { tool: THREE.Group; flame: THREE.Mesh; light: THREE.PointLight } {
  const tool = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.09), new THREE.MeshBasicMaterial({ color: 0x8a6a40 }));
  stick.position.z = 0.045;
  tool.add(stick);
  tool.add(new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0x5a1a12 })));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 6), new THREE.MeshBasicMaterial({ color: 0xffc966 }));
  flame.position.y = 0.015;
  tool.add(flame);
  const light = new THREE.PointLight(0xffa040, 0, TOOL_LIGHT_RANGE_M, 2);
  tool.add(light);
  return { tool, flame, light };
}

class CandelabraTask implements HandsTask {
  readonly hint = "Hold the mouse button and flick down to strike a match. Hold the flame on each wick until it catches. Turn slowly, or it goes out.";
  readonly parts: THREE.Object3D[];
  readonly tool: THREE.Group;
  private logic: CandelabraLogic;
  private flame: THREE.Mesh;
  private light: THREE.PointLight;

  constructor(private model: Extract<HandsModel, { kind: "candelabra" }>, events: HandsEvents) {
    this.logic = new CandelabraLogic(events.play);
    this.parts = model.wicks;
    ({ tool: this.tool, flame: this.flame, light: this.light } = matchTool());
    model.setLit(this.logic.lit);
  }

  get done() {
    return this.logic.done;
  }

  canHold() {
    return false;
  }

  glows(part: string) {
    const i = index(part, "wick");
    return this.logic.matchLit && i !== null && !this.logic.lit[i];
  }

  update(f: HandsFrame) {
    // The match head is where the crosshair meets the candles' depth.
    const tips = this.model.tips.map((t) => t.getWorldPosition(new THREE.Vector3()));
    const depth = f.ray.origin.distanceTo(tips[Math.floor(tips.length / 2)]!);
    f.ray.at(Math.min(depth, TOOL_REST_M * 2), this.tool.position);
    this.tool.lookAt(f.ray.origin);

    let wick: number | null = null;
    let best: number = config.tasks.hands.candelabra.aimM;
    tips.forEach((tip, i) => {
      const d = f.ray.distanceToPoint(tip);
      if (d < best) {
        best = d;
        wick = i;
      }
    });
    this.logic.update(f.dt, { wick, holding: f.holding, dragY: f.dragY, lookSpeed: f.lookSpeed });
    this.flame.visible = this.logic.matchLit;
    this.light.intensity = this.logic.matchLit ? 1.2 : 0;
    this.model.setLit(this.logic.lit);
  }
}

class ShuttersTask implements HandsTask {
  readonly hint = "Point at a shutter, hold the mouse button and drag right to shut it. Hold it shut until the latch clicks. Gusts whistle before they hit.";
  readonly parts: THREE.Object3D[];
  private logic: ShuttersLogic;

  constructor(private model: Extract<HandsModel, { kind: "shutters" }>, events: HandsEvents) {
    this.logic = new ShuttersLogic(events.play, events.noise);
    this.parts = model.panels;
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    const i = index(part, "shutter");
    return i !== null && !this.logic.latched[i];
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: index(f.held, "shutter"), dragX: f.dragX });
    this.model.setOpen(this.logic.open);
  }
}

class StoveTask implements HandsTask {
  readonly hint = "Point at a knob, hold the mouse button and drag left or right to turn it. Turn slowly near the off mark and it clicks into place.";
  readonly parts: THREE.Object3D[];
  private logic: StoveLogic;

  constructor(private model: Extract<HandsModel, { kind: "stove" }>, events: HandsEvents) {
    this.logic = new StoveLogic(events.play);
    this.parts = model.knobs;
    model.setKnobs(this.logic.angle, this.logic.flame);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return index(part, "knob") !== null;
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: index(f.held, "knob"), dragX: f.dragX });
    this.model.setKnobs(this.logic.angle, this.logic.flame);
  }
}

/** When the relic starts to show near the bottom of the hole. */
const RELIC_SHOWS_DEPTH = 0.8;
/** How far the trowel dips into the soil as you scoop. */
const SCOOP_DIP_M = 0.06;

class DigTask implements HandsTask {
  readonly hint = "Point at the soil, hold the mouse button and move the mouse down to scoop. Dig steadily: frantic digging is loud.";
  readonly parts: THREE.Object3D[];
  readonly tool: THREE.Group;
  private logic: DigLogic;
  private dip = 0;

  constructor(private model: Extract<HandsModel, { kind: "dig" }>, events: HandsEvents) {
    this.logic = new DigLogic(events.play, events.noise);
    this.parts = [model.soil];
    this.tool = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.005, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a8d92 }));
    blade.position.z = -0.06;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.1), new THREE.MeshLambertMaterial({ color: 0x5a3b22 }));
    handle.position.z = 0.05;
    this.tool.add(blade, handle);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "soil";
  }

  glows(part: string) {
    return this.canHold(part);
  }

  setFound() {
    this.logic.setFound();
  }

  update(f: HandsFrame) {
    const onSoil = f.held === "soil";
    this.logic.update(f.dt, { onSoil, holding: f.holding, dragY: f.dragY });
    // The trowel rests where you look at the soil, and dips as you scoop.
    const soil = this.model.soil.getWorldPosition(_v);
    const depth = Math.min(f.ray.origin.distanceTo(soil), TOOL_REST_M * 2);
    this.dip = onSoil && f.dragY > 0 ? SCOOP_DIP_M : Math.max(0, this.dip - f.dt * 0.3);
    f.ray.at(depth, this.tool.position);
    this.tool.position.y -= this.dip;
    this.tool.lookAt(f.ray.origin.x, this.tool.position.y + 0.3, f.ray.origin.z);
    this.model.setDepth(this.logic.depth, this.logic.found && this.logic.depth >= RELIC_SHOWS_DEPTH);
  }
}

class LetterTask implements HandsTask {
  readonly hint = "Hold the mouse button and flick down to strike a match. Keep the flame just under the swaying letter until it catches. Turn slowly, or it goes out.";
  readonly parts: THREE.Object3D[];
  readonly tool: THREE.Group;
  private logic: LetterLogic;
  private flame: THREE.Mesh;
  private light: THREE.PointLight;

  constructor(private model: Extract<HandsModel, { kind: "letter" }>, events: HandsEvents) {
    this.logic = new LetterLogic(events.play);
    this.parts = [model.letter];
    ({ tool: this.tool, flame: this.flame, light: this.light } = matchTool());
  }

  get done() {
    return this.logic.done;
  }

  canHold() {
    return false;
  }

  glows() {
    return this.logic.match.lit && !this.logic.caught;
  }

  update(f: HandsFrame) {
    const bottom = this.model.bottom.getWorldPosition(_v);
    const depth = f.ray.origin.distanceTo(bottom);
    f.ray.at(Math.min(depth, TOOL_REST_M * 2), this.tool.position);
    this.tool.lookAt(f.ray.origin);
    const under = f.ray.distanceToPoint(bottom) < config.tasks.hands.letter.aimM;
    this.logic.update(f.dt, { under, holding: f.holding, dragY: f.dragY, lookSpeed: f.lookSpeed });
    this.flame.visible = this.logic.match.lit;
    this.light.intensity = this.logic.match.lit ? 1.2 : 0;
    const c = config.tasks.hands.letter;
    this.model.setLetter(this.logic.sway, this.logic.heat / c.catchSec, this.logic.burned / c.burnSec);
  }
}

class ClockTask implements HandsTask {
  readonly hint = "The clock has stopped. The guest book in this room says when to wake the house: grab the clock face and drag right or left to turn the hands to that time, then let go.";
  readonly parts: THREE.Object3D[];
  private logic: ClockLogic;

  constructor(private model: Extract<HandsModel, { kind: "clock" }>, events: HandsEvents) {
    this.logic = new ClockLogic(events.play, model.target);
    this.parts = [model.face];
    model.setHands(this.logic.minuteDeg, this.logic.hourDeg);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "face" && !this.logic.done;
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: f.held === "face", dragX: f.dragX });
    this.model.setHands(this.logic.minuteDeg, this.logic.hourDeg);
  }
}

class BoilerTask implements HandsTask {
  readonly hint = "Point at the wheel, hold the mouse button and drag right to open the valve, left to close it. Bring the needle into the green and keep it there.";
  readonly parts: THREE.Object3D[];
  private logic: BoilerLogic;

  constructor(private model: Extract<HandsModel, { kind: "boiler" }>, events: HandsEvents) {
    this.logic = new BoilerLogic(events.play);
    this.parts = model.wheel;
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "wheel";
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { holding: f.held === "wheel", dragX: f.dragX });
    this.model.setValve(this.logic.openDeg, this.logic.pressure);
  }
}

class PortraitsTask implements HandsTask {
  readonly hint = "Point at a crooked portrait, hold the mouse button and drag sideways to level it, then let go. They are heavy: turn them slowly.";
  readonly parts: THREE.Object3D[];
  private logic: PortraitsLogic;

  constructor(private model: Extract<HandsModel, { kind: "portraits" }>, events: HandsEvents) {
    this.logic = new PortraitsLogic(events.play);
    this.parts = model.frames;
    model.setTilt(this.logic.tilt);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    const i = index(part, "portrait");
    return i !== null && !this.logic.level[i];
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: index(f.held, "portrait"), dragX: f.dragX });
    this.model.setTilt(this.logic.tilt);
  }
}

/** How far above the thing you aim at the jug in your hand hangs. */
const JUG_ABOVE_M = 0.32;
/** How far the jug in your hand tips while it pours. */
const JUG_TIP_RAD = 1.6;

class RosesTask implements HandsTask {
  readonly hint =
    "Get exactly the vase's number of measures into it. Click a jug to pick it up. With a jug in hand, click the pump to fill it, the other jug or the vase to pour into it, the bucket to empty it, or its mat to put it down. Too much in the vase? Click it with empty hands to tip it out.";
  readonly parts: THREE.Object3D[];
  readonly tool: THREE.Group;
  private logic: RosesLogic;
  private jug = jugModel();
  private last: string | null = null;

  constructor(private model: Extract<HandsModel, { kind: "roses" }>, events: HandsEvents) {
    this.logic = new RosesLogic(events.play);
    this.parts = [...model.jugs, ...model.mats, model.vase, model.pump, model.bucket];
    this.tool = new THREE.Group();
    this.tool.add(this.jug.group);
    model.setPuzzle(this.logic.puzzle);
    this.show();
  }

  get done() {
    return this.logic.done;
  }

  /** What clicking this part does now. */
  private action(part: string | null): JugAction | null {
    const hand = this.logic.inHand;
    const jug = index(part, "jug");
    if (jug !== null) return hand === null ? { kind: "pick", jug } : { kind: "pour", jug };
    if (index(part, "mat") !== null) return index(part, "mat") === hand ? { kind: "putDown" } : null;
    if (part === "vase") return hand === null ? { kind: "tipVase" } : { kind: "pourVase" };
    if (part === "pump") return { kind: "fill" };
    if (part === "bucket") return { kind: "empty" };
    return null;
  }

  canHold(part: string) {
    const a = this.action(part);
    return a !== null && this.logic.can(a);
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    // A click counts once, when the button goes down on a part.
    const clicked = f.held !== null && f.held !== this.last ? f.held : null;
    this.last = f.held;
    const a = this.action(clicked);
    if (a) this.logic.act(a);
    this.logic.update(f.dt);
    this.show();
    // The jug in your hand hangs over what you aim at, or in front of you; it tips as it pours.
    const hand = this.logic.done ? null : this.logic.inHand;
    this.jug.group.visible = hand !== null;
    if (hand === null) return;
    const aimed = f.aim ? this.parts.find((p) => p.userData.part === f.aim) : undefined;
    const target = aimed ? aimed.getWorldPosition(_v) : null;
    if (target) this.tool.position.set(target.x, target.y + JUG_ABOVE_M, target.z);
    else f.ray.at(TOOL_REST_M, this.tool.position);
    this.tool.position.addScaledVector(f.ray.direction, -0.12);
    this.tool.rotation.set(0, Math.atan2(-f.ray.direction.x, -f.ray.direction.z), 0);
    const pouring = this.logic.busy > 0 ? Math.sin((this.logic.busy / config.tasks.hands.roses.pourSec) * Math.PI) : 0;
    this.jug.group.rotation.x = -pouring * JUG_TIP_RAD;
  }

  private show() {
    const l = this.logic;
    // Done, the jug in your hand goes back on its mat.
    this.model.setWater(l.water, l.vase, l.done ? null : l.inHand);
    if (l.inHand !== null) this.jug.setJug(l.puzzle.jugs[l.inHand]!, l.water[l.inHand]!);
  }
}

class SwitchboardTask implements HandsTask {
  readonly hint = "Point at a plug, hold the mouse button and drag it up to the socket of the same colour. Hold it there until the lamp lights. The wrong socket sparks.";
  readonly parts: THREE.Object3D[];
  private logic: SwitchboardLogic;

  constructor(private model: Extract<HandsModel, { kind: "switchboard" }>, events: HandsEvents) {
    this.logic = new SwitchboardLogic(events.play, model.hooks, model.sockets);
    this.parts = model.plugs;
    // Each socket wears the colour of the cable that belongs in it.
    const colors: number[] = [];
    this.logic.socketOf.forEach((socket, cable) => (colors[socket] = model.colors[cable]!));
    model.setSockets(colors);
    this.show();
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    const i = index(part, "plug");
    return i !== null && !this.logic.plugged[i];
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: index(f.held, "plug"), dragX: f.dragX, dragY: f.dragY });
    this.show();
  }

  private show() {
    const lit = this.model.sockets.map((_, j) => this.logic.plugged.some((p, i) => p && this.logic.socketOf[i] === j));
    this.model.setPlugs(this.logic.plug, lit);
  }
}

/** How far in front of the glass the cloth sits as you wipe. */
const CLOTH_OFF_M = 0.02;
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane();

class MirrorTask implements HandsTask {
  readonly hint = "Hold the mouse button on the glass and move the mouse to wipe the fog away. Wipe slowly: scrubbing fast only smears it.";
  readonly parts: THREE.Object3D[];
  readonly tool: THREE.Mesh;
  private logic: MirrorLogic;

  constructor(private model: Extract<HandsModel, { kind: "mirror" }>, events: HandsEvents) {
    this.logic = new MirrorLogic(events.play);
    this.parts = [model.glass];
    this.tool = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.015), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
    model.setFog(this.logic.fog, 0);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "glass";
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    const holding = f.held === "glass";
    const grab = holding && !this.logic.cloth ? this.onGlass(f.ray) : null;
    this.logic.update(f.dt, { grab, holding, dragX: f.dragX, dragY: f.dragY });
    this.model.setFog(this.logic.fog, this.logic.faceLeft / config.tasks.hands.mirror.faceSec);
    // The cloth is on the glass while you wipe, and in your hand in front of you otherwise.
    const cloth = this.logic.cloth;
    const glass = this.model.glass;
    if (cloth) {
      glass.localToWorld(this.tool.position.set(cloth.u, cloth.v, CLOTH_OFF_M));
      this.tool.quaternion.copy(glass.getWorldQuaternion(_q));
    } else {
      f.ray.at(TOOL_REST_M, this.tool.position);
      this.tool.lookAt(f.ray.origin);
    }
  }

  /** Where the crosshair meets the glass, from the glass's middle. */
  private onGlass(ray: THREE.Ray): FacePoint | null {
    const glass = this.model.glass;
    _n.set(0, 0, 1).applyQuaternion(glass.getWorldQuaternion(_q));
    _plane.setFromNormalAndCoplanarPoint(_n, glass.getWorldPosition(_v));
    const hit = ray.intersectPlane(_plane, _hit);
    if (!hit) return null;
    const local = glass.worldToLocal(hit);
    return { u: local.x, v: local.y };
  }
}

/** The lid strains harder this long before it bursts open. */
const RATTLE_FROM_SEC = 2;

class TrunkTask implements HandsTask {
  readonly hint = "Point at the lid, hold the mouse button and drag down to press it shut. Hold it until it clicks, then drag each latch to the right before the lid bursts open.";
  readonly parts: THREE.Object3D[];
  private logic: TrunkLogic;

  constructor(private model: Extract<HandsModel, { kind: "trunk" }>, events: HandsEvents) {
    this.logic = new TrunkLogic(events.play);
    this.parts = [model.lid, ...model.latches];
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    if (part === "lid") return !this.logic.shut;
    const i = index(part, "latch");
    return i !== null && this.logic.shut && this.logic.latch[i]! < 90;
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { onLid: f.held === "lid", latch: index(f.held, "latch"), dragX: f.dragX, dragY: f.dragY });
    const l = this.logic;
    const rattle = l.shut && !l.done ? 1 - Math.min(1, l.popLeft / RATTLE_FROM_SEC) : 0;
    this.model.setTrunk(l.lid, l.latch, rattle);
  }
}

class PianoTask implements HandsTask {
  readonly hint = "Listen: the piano plays a tune, its keys going down as it plays. Then click the same keys in the same order. Each round adds a note. A wrong key is a sour note the ghost can hear. Click the card to hear the tune again.";
  readonly parts: THREE.Object3D[];
  private logic: PianoLogic;
  private last: string | null = null;
  private down: number | null = null;

  constructor(private model: Extract<HandsModel, { kind: "piano" }>, events: HandsEvents) {
    this.logic = new PianoLogic(events.play, events.noise);
    this.parts = [...model.keys, model.card];
    this.show();
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return (index(part, "key") !== null || part === "card") && this.logic.mode === "play" && !this.logic.done;
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    // A key (or the card) counts once each time the button goes down on it.
    const clicked = f.held !== null && f.held !== this.last ? f.held : null;
    this.last = f.held;
    const pressed = index(clicked, "key");
    this.logic.update(f.dt, { pressed, replay: clicked === "card" });
    if (pressed !== null && this.logic.ring === config.tasks.hands.piano.ringSec) this.down = pressed;
    this.show();
  }

  private show() {
    const l = this.logic;
    const mode = l.done ? "done" : l.mode === "play" ? "play" : l.again ? "again" : "listen";
    const card = { round: l.round, rounds: config.tasks.hands.piano.rounds, notes: l.length, played: l.mode === "play" ? l.step : 0, mode } as const;
    // Once in tune no key stays down: the piano is left as it was.
    this.model.setPiano(card, l.done ? null : l.mode === "listen" ? l.showing : l.ring > 0 ? this.down : null);
  }
}

class SheetsTask implements HandsTask {
  readonly hint = "Point at the loose half of the sheet, hold the mouse button and pull it over: drag down to pull it toward you, left to pull it across. Let go too soon and it slides back.";
  readonly parts: THREE.Object3D[];
  private logic: SheetsLogic;

  constructor(private model: Extract<HandsModel, { kind: "sheets" }>, events: HandsEvents) {
    this.logic = new SheetsLogic(events.play);
    this.parts = [model.flap];
    model.setSheet(0, 0);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "sheet" && !this.logic.done;
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: f.held === "sheet", dragX: f.dragX, dragY: f.dragY });
    this.model.setSheet(this.logic.folds, this.logic.progress);
  }
}

class CradleTask implements HandsTask {
  readonly hint = "Hold the mouse button on the cradle and push it gently left and right in time with its swing. Push too hard and the baby cries, and the ghost hears it.";
  readonly parts: THREE.Object3D[];
  private logic: CradleLogic;

  constructor(private model: Extract<HandsModel, { kind: "cradle" }>, events: HandsEvents) {
    this.logic = new CradleLogic(events.play, events.noise);
    this.parts = [model.basket];
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "basket";
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: f.held === "basket", dragX: f.dragX });
    this.model.setCradle(this.logic.angle, this.logic.calm / config.tasks.hands.cradle.fillSec, this.logic.crying > 0);
  }
}

class LockboxTask implements HandsTask {
  readonly hint = "Hold the dial and drag right until a pin clicks, then drag left until the next one clicks, then right, then left. A stud lights up for each pin.";
  readonly parts: THREE.Object3D[];
  private logic: LockboxLogic;

  constructor(private model: Extract<HandsModel, { kind: "lockbox" }>, events: HandsEvents) {
    this.logic = new LockboxLogic(events.play);
    this.parts = [model.dial];
    model.setDial(0, 0, false);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "dial" && !this.logic.done;
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { held: f.held === "dial", dragX: f.dragX });
    this.model.setDial(this.logic.dial, this.logic.set, this.logic.done);
  }
}

/** How often a ripple spreads from your hand: far from the relic, and right on it. */
const RIPPLE_SLOW_PER_SEC = 0.6;
const RIPPLE_FAST_PER_SEC = 2.5;

class DrainTask implements HandsTask {
  readonly hint = "Hold the mouse button to reach into the water, and feel about slowly. The water ripples faster near the relic. Hold still on it to grip it, then drag up to pull it out.";
  readonly parts: THREE.Object3D[];
  private logic: DrainLogic;
  /** Right and away from you, in the drain's own x and z (along its sides, so your hand stays in the water). */
  private axes: { right: { x: number; z: number }; away: { x: number; z: number } } | null = null;
  private ripple = 0;

  constructor(private model: Extract<HandsModel, { kind: "drain" }>, events: HandsEvents) {
    this.logic = new DrainLogic(events.play);
    this.parts = [model.water];
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "water";
  }

  glows(part: string) {
    return this.canHold(part) && !this.logic.gripped;
  }

  update(f: HandsFrame) {
    this.axes ??= this.sides(f.ray.direction);
    const holding = f.held === "water";
    this.logic.update(f.dt, { holding, dragX: f.dragX, dragY: f.dragY });
    const near = this.logic.closeness;
    this.ripple = (this.ripple + f.dt * (RIPPLE_SLOW_PER_SEC + (RIPPLE_FAST_PER_SEC - RIPPLE_SLOW_PER_SEC) * near)) % 1;
    const { right, away } = this.axes;
    const h = this.logic.hand;
    const at = holding || this.logic.gripped ? { x: right.x * h.u + away.x * h.v, z: right.z * h.u + away.z * h.v } : null;
    const lift = this.logic.pulled / config.relics.hands.drain.pullPx;
    this.model.setDrain({ at, ripple: this.ripple, strength: near, lift, gripped: this.logic.gripped });
  }

  private sides(look: THREE.Vector3) {
    const d = _v.copy(look).applyQuaternion(this.model.water.parent!.getWorldQuaternion(_q).invert());
    const away = Math.abs(d.x) > Math.abs(d.z) ? { x: Math.sign(d.x), z: 0 } : { x: 0, z: Math.sign(d.z) || -1 };
    return { right: { x: -away.z, z: away.x }, away };
  }
}

/** The hands-on task for a station's or place's parts. */
export function createHandsTask(model: HandsModel, events: HandsEvents): HandsTask {
  switch (model.kind) {
    case "candelabra":
      return new CandelabraTask(model, events);
    case "shutters":
      return new ShuttersTask(model, events);
    case "stove":
      return new StoveTask(model, events);
    case "dig":
      return new DigTask(model, events);
    case "letter":
      return new LetterTask(model, events);
    case "clock":
      return new ClockTask(model, events);
    case "boiler":
      return new BoilerTask(model, events);
    case "portraits":
      return new PortraitsTask(model, events);
    case "roses":
      return new RosesTask(model, events);
    case "switchboard":
      return new SwitchboardTask(model, events);
    case "mirror":
      return new MirrorTask(model, events);
    case "trunk":
      return new TrunkTask(model, events);
    case "piano":
      return new PianoTask(model, events);
    case "sheets":
      return new SheetsTask(model, events);
    case "cradle":
      return new CradleTask(model, events);
    case "lockbox":
      return new LockboxTask(model, events);
    case "drain":
      return new DrainTask(model, events);
  }
}
