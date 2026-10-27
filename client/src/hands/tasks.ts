import * as THREE from "three";
import { config } from "@haunted/shared";
import type { TaskSoundKind } from "../minigames/types.ts";
import type { HandsModel } from "../stations.ts";
import { CandelabraLogic, DigLogic, ShuttersLogic, StoveLogic } from "./logic.ts";

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
  }
}
