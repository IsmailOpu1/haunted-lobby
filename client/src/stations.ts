import * as THREE from "three";
import { searchPlaces, type MapData, type RelicMinigame, type TaskMinigame } from "@haunted/shared";
import { liftToFloor } from "./place.ts";

// Placeholder task station models until the Phase 8 art pass. Visible tasks (GDD 9) show
// their result to everyone: the candelabra stays lit, the clock's pendulum swings, the
// shutters close and the portraits hang straight. Relic hiding spots get props too, so every
// spot looks the same whether or not a relic is in it this match.

const BRASS = 0xa07a34;
const WOOD = 0x3b2416;
const IRON = 0x2a2c30;
const CANDLE_LIGHT_RANGE_M = 5;
const FIRE_LIGHT_RANGE_M = 7;
const PENDULUM_SWING_RAD = 0.3;
const PENDULUM_PERIOD_SEC = 1.5;
const CANDLE_LIGHT = 2.5;
const SHUTTER_OPEN_RAD = 1.9;
/** How deep a dug pot's soil goes, and how far down a searched (empty) one stays. */
const DIG_DEPTH_M = 0.3;
const SEARCHED_DEPTH = 0.4;

/**
 * The parts of a station your hands work on (GDD 26.5). Each part is a mesh named by
 * userData.part ("wick:2", "knob:0", "shutter:1", "soil"), which the crosshair can pick.
 */
export type HandsModel =
  | { kind: "candelabra"; wicks: THREE.Mesh[]; tips: THREE.Object3D[]; setLit(lit: readonly boolean[]): void }
  | { kind: "stove"; knobs: THREE.Mesh[]; setKnobs(angleDeg: readonly number[], flame: readonly number[]): void }
  | { kind: "shutters"; panels: THREE.Mesh[]; setOpen(open: readonly number[]): void }
  | { kind: "dig"; soil: THREE.Mesh; setDepth(depth: number, relicShows: boolean): void };

interface StationView {
  group: THREE.Group;
  setDone(done: boolean): void;
  update?(time: number): void;
  hands?: HandsModel;
}

/** A place to search for a relic (GDD 26.5). Searched places stay dug up for everyone. */
interface PlaceView {
  group: THREE.Group;
  setSearched(searched: boolean): void;
  hands?: HandsModel;
}

/** A mesh with its own material, so it can glow on its own when the crosshair is on it. */
function part(mesh: THREE.Mesh, name: string): THREE.Mesh {
  mesh.userData.part = name;
  return mesh;
}

/** Turns the station to face away from the nearest wall (walls are axis-aligned). Models face +z. */
function facingYaw(map: MapData, def: { x: number; z: number }): number {
  let best = Infinity;
  let yaw = 0;
  for (const [x1, z1, x2, z2] of map.walls) {
    const cx = Math.max(Math.min(x1, x2), Math.min(Math.max(x1, x2), def.x));
    const cz = Math.max(Math.min(z1, z2), Math.min(Math.max(z1, z2), def.z));
    const d = Math.hypot(def.x - cx, def.z - cz);
    if (d >= best) continue;
    best = d;
    if (x1 === x2) yaw = def.x > x1 ? Math.PI / 2 : -Math.PI / 2;
    else yaw = def.z > z1 ? 0 : Math.PI;
  }
  return yaw;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
}

function candelabra(): StationView {
  const group = new THREE.Group();
  group.add(box(0.9, 0.75, 0.9, WOOD, 0, 0.375, 0)); // table
  group.add(box(0.06, 0.35, 0.06, BRASS, 0, 0.92, 0));
  group.add(box(0.6, 0.04, 0.04, BRASS, 0, 1.08, 0));
  const flames: THREE.Mesh[] = [];
  const wicks: THREE.Mesh[] = [];
  const tips: THREE.Object3D[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc966 });
  for (let i = 0; i < 5; i++) {
    const x = -0.28 + i * 0.14;
    const h = 0.12 + Math.sin((i / 4) * Math.PI) * 0.06;
    const wick = part(box(0.035, h, 0.035, 0xe9dfc6, x, 1.1 + h / 2, 0), `wick:${i}`);
    group.add(wick);
    wicks.push(wick);
    // Where a flame must touch to light it: the top of the candle.
    const tip = new THREE.Object3D();
    tip.position.set(x, 1.1 + h + 0.01, 0);
    group.add(tip);
    tips.push(tip);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), flameMat);
    flame.position.set(x, 1.1 + h + 0.03, 0);
    flame.visible = false;
    group.add(flame);
    flames.push(flame);
  }
  const light = new THREE.PointLight(0xffb060, 0, CANDLE_LIGHT_RANGE_M, 2);
  light.position.set(0, 1.4, 0);
  group.add(light);
  const setLit = (lit: readonly boolean[]) => {
    flames.forEach((f, i) => (f.visible = !!lit[i]));
    light.intensity = (CANDLE_LIGHT * lit.filter(Boolean).length) / flames.length;
  };
  return {
    group,
    setDone(done) {
      setLit(flames.map(() => done));
    },
    update(time) {
      const lit = flames.filter((f) => f.visible).length;
      if (lit > 0) light.intensity = ((CANDLE_LIGHT + Math.sin(time * 13) * 0.25 + Math.sin(time * 31) * 0.15) * lit) / flames.length;
    },
    hands: { kind: "candelabra", wicks, tips, setLit },
  };
}

function clock(): StationView {
  const group = new THREE.Group();
  group.add(box(0.55, 2.1, 0.35, WOOD, 0, 1.05, 0));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshLambertMaterial({ color: 0xe9dfc6 }));
  face.position.set(0, 1.75, 0.18);
  group.add(face);
  const pivot = new THREE.Group();
  pivot.position.set(0, 1.35, 0.19);
  pivot.add(box(0.02, 0.55, 0.02, BRASS, 0, -0.275, 0));
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16), new THREE.MeshLambertMaterial({ color: BRASS }));
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -0.55;
  pivot.add(bob);
  group.add(pivot);
  let swinging = false;
  return {
    group,
    setDone(done) {
      swinging = done;
      if (!done) pivot.rotation.z = 0;
    },
    update(time) {
      if (swinging) pivot.rotation.z = Math.sin((time / PENDULUM_PERIOD_SEC) * Math.PI * 2) * PENDULUM_SWING_RAD;
    },
  };
}

function stove(): StationView {
  const group = new THREE.Group();
  group.add(box(1.2, 0.9, 0.7, IRON, 0, 0.45, 0));
  const knobs: THREE.Mesh[] = [];
  const pivots: THREE.Group[] = [];
  const flames: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x4a7dff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const x = -0.38 + i * 0.38;
    group.add(box(0.26, 0.03, 0.26, 0x18191b, x, 0.915, -0.05));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 10, 1, true), flameMat);
    flame.position.set(x, 0.97, -0.05);
    group.add(flame);
    flames.push(flame);
    // The knob turns about the axis that points at you; its pointer shows where it is set.
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.72, 0.37);
    const knob = part(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 16), new THREE.MeshLambertMaterial({ color: 0x5a5c62 })), `knob:${i}`);
    knob.rotation.x = Math.PI / 2;
    knob.position.z = 0.025;
    pivot.add(knob);
    pivot.add(box(0.012, 0.045, 0.01, 0xe9dfc6, 0, 0.025, 0.055));
    group.add(pivot);
    pivots.push(pivot);
    knobs.push(knob);
    // The "off" mark above each knob.
    group.add(box(0.01, 0.025, 0.005, 0xe9dfc6, x, 0.8, 0.352));
  }
  const setKnobs = (angleDeg: readonly number[], flame: readonly number[]) => {
    pivots.forEach((p, i) => (p.rotation.z = (-(angleDeg[i] ?? 0) * Math.PI) / 180));
    flames.forEach((f, i) => {
      const level = flame[i] ?? 1;
      f.visible = level > 0;
      f.scale.setScalar(Math.max(0.15, level));
    });
  };
  setKnobs([150, 150, 150], [1, 1, 1]);
  return { group, setDone() {}, hands: { kind: "stove", knobs, setKnobs } };
}

function fireplace(): StationView {
  const group = new THREE.Group();
  const stone = 0x4a4440;
  group.add(box(1.4, 1.1, 0.5, stone, 0, 0.55, -0.05));
  group.add(box(1.6, 0.1, 0.6, 0x2a2522, 0, 1.15, -0.05)); // mantel
  group.add(box(0.8, 0.7, 0.42, 0x0b0807, 0, 0.35, 0.02)); // opening
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), fireMat);
    flame.position.set(-0.18 + i * 0.18, 0.2, 0.08);
    flame.visible = false;
    group.add(flame);
    flames.push(flame);
  }
  const light = new THREE.PointLight(0xff7a30, 0, FIRE_LIGHT_RANGE_M, 2);
  light.position.set(0, 0.5, 0.5);
  group.add(light);
  return {
    group,
    setDone(done) {
      for (const f of flames) f.visible = done;
      light.intensity = done ? 3 : 0;
    },
    update(time) {
      if (light.intensity === 0) return;
      light.intensity = 3 + Math.sin(time * 9) * 0.4 + Math.sin(time * 23) * 0.3;
      flames.forEach((f, i) => (f.scale.y = 1 + Math.sin(time * 11 + i * 2) * 0.2));
    },
  };
}

function piano(): StationView {
  const group = new THREE.Group();
  group.add(box(1.5, 1.2, 0.6, 0x1e1410, 0, 0.6, -0.05));
  group.add(box(1.4, 0.06, 0.25, 0xe6decb, 0, 0.78, 0.35)); // keys
  return { group, setDone() {} };
}

function cradle(): StationView {
  const group = new THREE.Group();
  group.add(box(0.9, 0.35, 0.5, 0x6b4a2e, 0, 0.5, 0));
  group.add(box(1.0, 0.05, 0.08, 0x5a3a22, 0, 0.12, 0.22));
  group.add(box(1.0, 0.05, 0.08, 0x5a3a22, 0, 0.12, -0.22));
  return { group, setDone() {} };
}

function boiler(): StationView {
  const group = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 16), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  tank.position.set(0, 0.9, -0.1);
  group.add(tank);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), new THREE.MeshLambertMaterial({ color: 0xa8392a }));
  wheel.position.set(0.25, 1.1, 0.4);
  group.add(wheel);
  return { group, setDone() {} };
}

function switchboard(): StationView {
  const group = new THREE.Group();
  group.add(box(1.0, 1.0, 0.15, WOOD, 0, 1.3, -0.1));
  for (let i = 0; i < 4; i++) group.add(box(0.06, 0.06, 0.04, 0x0d0a07, -0.3 + i * 0.2, 1.4, 0));
  group.add(box(1.0, 0.8, 0.4, WOOD, 0, 0.4, 0.05)); // desk
  return { group, setDone() {} };
}

function mirror(): StationView {
  const group = new THREE.Group();
  group.add(box(0.9, 1.3, 0.06, BRASS, 0, 1.45, -0.05));
  group.add(box(0.75, 1.15, 0.02, 0xa8b0b6, 0, 1.45, -0.01));
  group.add(box(0.9, 0.8, 0.4, WOOD, 0, 0.4, 0.1)); // dresser
  return { group, setDone() {} };
}

function trunk(): StationView {
  const group = new THREE.Group();
  group.add(box(1.0, 0.5, 0.55, 0x4b3420, 0, 0.25, 0));
  group.add(box(1.02, 0.12, 0.57, 0x553a22, 0, 0.56, 0));
  for (let i = -1; i <= 1; i++) group.add(box(0.06, 0.08, 0.02, BRASS, i * 0.3, 0.45, 0.29));
  return { group, setDone() {} };
}

function sheets(): StationView {
  const group = new THREE.Group();
  group.add(box(1.2, 0.75, 0.7, WOOD, 0, 0.375, 0)); // table
  group.add(box(0.9, 0.08, 0.5, 0xd9d4c4, 0, 0.79, 0));
  return { group, setDone() {} };
}

function roses(): StationView {
  const group = new THREE.Group();
  group.add(box(1.1, 0.75, 0.5, WOOD, 0, 0.375, 0));
  const glass = new THREE.MeshLambertMaterial({ color: 0xb8c8d0, transparent: true, opacity: 0.5 });
  for (let i = -1; i <= 1; i++) {
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.3, 10), glass);
    vase.position.set(i * 0.32, 0.9, 0);
    group.add(vase);
    group.add(box(0.1, 0.1, 0.1, 0x8a2a36, i * 0.32, 1.12, 0));
  }
  return { group, setDone() {} };
}

function shutters(): StationView {
  // Three windows on the wall, each with a shutter banging in the wind until the task closes it.
  // A shutter hangs on its left side; open 1 is swung out into the corridor, 0 is shut.
  const group = new THREE.Group();
  const hinges: THREE.Group[] = [];
  const panels: THREE.Mesh[] = [];
  for (let i = -1; i <= 1; i++) {
    const x = i * 0.7;
    group.add(box(0.55, 1.3, 0.06, 0x0b1018, x, 1.5, -0.08));
    const hinge = new THREE.Group();
    hinge.position.set(x - 0.27, 1.5, -0.02);
    const panel = part(box(0.54, 1.3, 0.04, 0x5e4630, 0.27, 0, 0), `shutter:${i + 1}`);
    hinge.add(panel);
    group.add(hinge);
    hinges.push(hinge);
    panels.push(panel);
  }
  let open: readonly number[] = [1, 1, 1];
  let shut = false;
  let working = false;
  const setOpen = (o: readonly number[]) => {
    working = true;
    open = o;
  };
  return {
    group,
    setDone(done) {
      shut = done;
      working = false;
    },
    update(time) {
      hinges.forEach((h, i) => {
        // Loose shutters sway in the wind; while you work on them they go where the task says.
        const o = working ? open[i]! : shut ? 0 : 1;
        const sway = o > 0 ? Math.sin(time * 1.3 + i) * 0.08 * o : 0;
        h.rotation.y = -(o * SHUTTER_OPEN_RAD + sway);
      });
    },
    hands: { kind: "shutters", panels, setOpen },
  };
}

function portraits(): StationView {
  const group = new THREE.Group();
  const frames: THREE.Group[] = [];
  const tilts = [0.3, -0.45, 0.25];
  for (let i = -1; i <= 1; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(i * 0.75, 1.9, -0.06);
    pivot.add(box(0.5, 0.65, 0.05, BRASS, 0, -0.4, 0));
    pivot.add(box(0.4, 0.55, 0.02, 0x2e2a24, 0, -0.4, 0.03));
    pivot.rotation.z = tilts[i + 1]!;
    group.add(pivot);
    frames.push(pivot);
  }
  return {
    group,
    setDone(done) {
      frames.forEach((f, i) => (f.rotation.z = done ? 0 : tilts[i]!));
    },
  };
}

const MODELS: Record<TaskMinigame, () => StationView> = {
  candelabra,
  clock,
  stove,
  letter: fireplace,
  cradle,
  piano,
  boiler,
  switchboard,
  mirror,
  trunk,
  sheets,
  roses,
  shutters,
  portraits,
};

function lockboxSpot(): PlaceView {
  const group = new THREE.Group();
  group.add(box(1.0, 0.85, 0.45, WOOD, 0, 0.425, 0)); // sideboard or shelf
  group.add(box(0.3, 0.16, 0.2, 0x6a4a2a, 0, 0.93, 0));
  group.add(box(0.06, 0.06, 0.02, BRASS, 0, 0.93, 0.11));
  return { group, setSearched() {} };
}

function digSpot(): PlaceView {
  const group = new THREE.Group();
  group.add(box(0.8, 0.5, 0.8, 0x5a3b22, 0, 0.25, 0));
  const soil = part(box(0.7, 0.04, 0.7, 0x2e2014, 0, 0.51, 0), "soil");
  group.add(soil);
  const plant = new THREE.Group();
  plant.add(box(0.06, 0.9, 0.06, 0x3d6a33, 0, 0.95, 0));
  plant.add(box(0.6, 0.06, 0.06, 0x3d6a33, 0, 1.3, 0));
  group.add(plant);
  // Soil thrown out of a dug pot, and the relic glinting at the bottom.
  const heap = box(0.3, 0.12, 0.3, 0x2e2014, 0.55, 0.06, 0.2);
  heap.visible = false;
  group.add(heap);
  const relic = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0xc9a640, emissive: 0x3a2a08 }));
  relic.position.set(0, 0.25, 0);
  relic.visible = false;
  group.add(relic);
  const setDepth = (depth: number, relicShows: boolean) => {
    soil.position.y = 0.51 - depth * DIG_DEPTH_M;
    plant.visible = depth < 0.1;
    heap.visible = depth > 0.1;
    heap.scale.y = Math.max(0.3, depth);
    relic.visible = relicShows;
  };
  return {
    group,
    setSearched(searched) {
      setDepth(searched ? SEARCHED_DEPTH : 0, false);
    },
    hands: { kind: "dig", soil, setDepth },
  };
}

function drainSpot(): PlaceView {
  const group = new THREE.Group();
  group.add(box(0.7, 0.02, 0.7, 0x2b3324, 0, 0.01, 0));
  for (let i = -2; i <= 2; i++) group.add(box(0.04, 0.03, 0.6, 0x555048, i * 0.13, 0.025, 0));
  return { group, setSearched() {} };
}

const RELIC_SPOTS: Record<RelicMinigame, () => PlaceView> = { lockbox: lockboxSpot, dig: digSpot, drain: drainSpot };

/** Task stations in the world, with visible tasks showing their done state from the server. */
export class StationsView {
  private views = new Map<string, StationView>();
  private places = new Map<string, PlaceView>();
  /** The station or place in your hands: the server's state does not reset it while you work. */
  private busy: string | null = null;
  private lastState: any = null;

  constructor(scene: THREE.Scene, map: MapData) {
    for (const def of map.tasks) {
      const view = MODELS[def.minigame]();
      view.group.position.set(def.x, 0, def.z);
      liftToFloor(map, view.group);
      view.group.rotation.y = facingYaw(map, def);
      scene.add(view.group);
      // Only visible tasks change for everyone; the rest never show a result.
      this.views.set(def.id, def.visible ? view : { ...view, setDone() {} });
    }
    for (const spot of map.relicSpots) {
      for (const place of searchPlaces(spot)) {
        const view = RELIC_SPOTS[spot.minigame]();
        view.group.position.set(place.x, 0, place.z);
        liftToFloor(map, view.group);
        view.group.rotation.y = facingYaw(map, place);
        scene.add(view.group);
        this.places.set(place.id, view);
      }
    }
  }

  /** The hands-on parts of a task station or a place to search, by id. */
  hands(id: string): HandsModel | undefined {
    return (this.views.get(id) ?? this.places.get(id))?.hands;
  }

  /** While you work on one, keep the server's state off it; afterwards show the server's state again. */
  setBusy(id: string | null) {
    this.busy = id;
    if (id === null && this.lastState) this.update(this.lastState);
  }

  update(state: any) {
    this.lastState = state;
    state.stations?.forEach((s: { done: boolean }, id: string) => {
      if (id !== this.busy) this.views.get(id)?.setDone(s.done);
    });
    state.searchPlaces?.forEach((p: { searched: boolean }, id: string) => {
      if (id !== this.busy) this.places.get(id)?.setSearched(p.searched);
    });
  }

  /** Whether a place to search has been searched (GDD 26.5). */
  searched(id: string): boolean {
    return !!this.lastState?.searchPlaces?.get(id)?.searched;
  }

  render(time: number) {
    for (const v of this.views.values()) v.update?.(time);
  }
}
