import * as THREE from "three";
import { config } from "@haunted/shared";
import type { TaskSoundKind } from "../minigames/types.ts";
import type { HandsModel } from "../stations.ts";
import { BoilerLogic, CandelabraLogic, ClockLogic, DigLogic, LetterLogic, PortraitsLogic, RosesLogic, ShuttersLogic, StoveLogic } from "./logic.ts";

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
  play(kind: TaskSoundKind): void;
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
  readonly hint = "Point at the key, hold the mouse button and drag right to turn it: one quarter turn on each tick. Off the beat, it slips back.";
  readonly parts: THREE.Object3D[];
  private logic: ClockLogic;

  constructor(private model: Extract<HandsModel, { kind: "clock" }>, events: HandsEvents) {
    this.logic = new ClockLogic(events.play);
    this.parts = [model.key];
    model.setKey(0);
  }

  get done() {
    return this.logic.done;
  }

  canHold(part: string) {
    return part === "key";
  }

  glows(part: string) {
    return this.canHold(part);
  }

  update(f: HandsFrame) {
    this.logic.update(f.dt, { holding: f.held === "key", dragX: f.dragX });
    this.model.setKey(this.logic.keyDeg);
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

/** How far above a vase's middle the can's spout sits while you pour. */
const SPOUT_ABOVE_M = 0.3;
/** How far the can tips forward when fully tipped. */
const CAN_TIP_RAD = 1.0;

class RosesTask implements HandsTask {
  readonly hint = "Aim the watering can at a vase and hold the mouse button to pour. Stop between the line and the rim: water keeps coming a moment after you let go.";
  readonly parts: THREE.Object3D[];
  readonly tool: THREE.Group;
  private logic: RosesLogic;
  private can: THREE.Group;
  private stream: THREE.Mesh;

  constructor(private model: Extract<HandsModel, { kind: "roses" }>, events: HandsEvents) {
    this.logic = new RosesLogic(events.play);
    this.parts = model.vases;
    this.tool = new THREE.Group();
    this.can = new THREE.Group();
    const tin = new THREE.MeshLambertMaterial({ color: 0x5f6f66 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), tin);
    body.position.z = 0.1;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, 6), tin);
    spout.rotation.x = Math.PI / 2.6;
    spout.position.set(0, 0.04, -0.02);
    this.can.add(body, spout);
    this.tool.add(this.can);
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), new THREE.MeshLambertMaterial({ color: 0x5a7a98, transparent: true, opacity: 0.7 }));
    this.stream.visible = false;
    this.tool.add(this.stream);
    model.setWater(this.logic.water);
  }

  get done() {
    return this.logic.done;
  }

  canHold() {
    return false;
  }

  glows(part: string) {
    const i = index(part, "vase");
    return i !== null && this.logic.water[i]! < config.tasks.hands.roses.line;
  }

  update(f: HandsFrame) {
    const vase = index(f.aim, "vase");
    this.logic.update(f.dt, { vase, holding: f.holding });
    this.model.setWater(this.logic.water);
    // The can hangs over the vase you aim at, or in front of you; it tips as you pour.
    const target = vase !== null ? this.model.vases[vase]!.getWorldPosition(_v) : null;
    if (target) this.tool.position.set(target.x, target.y + SPOUT_ABOVE_M, target.z);
    else f.ray.at(TOOL_REST_M, this.tool.position);
    this.tool.position.addScaledVector(f.ray.direction, -0.12);
    this.tool.rotation.set(0, Math.atan2(-f.ray.direction.x, -f.ray.direction.z), 0);
    this.can.rotation.x = -this.logic.tilt * CAN_TIP_RAD;
    this.stream.visible = this.logic.tilt > 0.3;
    if (this.stream.visible) {
      const fall = target ? SPOUT_ABOVE_M - 0.1 : 0.8;
      this.stream.scale.y = fall;
      this.stream.position.set(0, -fall / 2, -0.1);
    }
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
  }
}
