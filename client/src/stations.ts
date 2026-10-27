import * as THREE from "three";
import { config, searchPlaces, type MapData, type RelicMinigame, type TaskMinigame } from "@haunted/shared";
import { liftToFloor } from "./place.ts";
import type { FacePoint } from "./hands/logic.ts";

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
/** The letter hangs this far below its hook on the mantel. */
const LETTER_DROP_M = 0.2;
const LETTER_HEIGHT_M = 0.2;
const PAPER = 0xe9dfc6;
const SCORCH = 0x3a2010;
/** A gauge's needle sweeps this far each way from straight up, from no pressure to full. */
const GAUGE_SWEEP_RAD = (135 * Math.PI) / 180;
const VASE_HEIGHT_M = 0.3;
/** How deep a dug pot's soil goes, and how far down a searched (empty) one stays. */
const DIG_DEPTH_M = 0.3;
const SEARCHED_DEPTH = 0.4;
/** The piano's keys span this much, at this height. */
const PIANO_KEYS_M = 1.3;
const PIANO_KEY_Y = 0.785;
/** The tuning card stands high on the music stand, so it shows over the keys. */
const PIANO_CARD_Y = 1.12;
/** How fast the cradle's mobile turns once the baby is fully calm. */
const MOBILE_TURN_RAD_PER_SEC = 1.5;
/** The switchboard's face: its middle, its front, and the rows of hooks and sockets either side. */
const BOARD_Y = 1.3;
const BOARD_FRONT_Z = -0.025;
const BOARD_ROW_M = 0.2;
const SOCKET_GAP_M = 0.2;
const CABLE_COLORS = [0xb03a2e, 0x2e7d4f, 0x2f5fa8, 0xc9a23a, 0x8a4aa0, 0xd8d0c0];
const MIRROR_Y = 1.45;
const TRUNK_LID_OPEN_RAD = 0.6;
const TRUNK_RATTLE_RAD = 0.04;
const LINEN = 0xd9d4c4;
const SHEET_W_M = 0.9;
const SHEET_D_M = 0.5;
const SHEET_THICK_M = 0.004;
const LOCKBOX_OPEN_RAD = 1.2;
/** The drain: the water's width inside its stone curb, and how far the relic comes up as you pull. */
const DRAIN_INNER_M = 0.56;
const DRAIN_CURB_M = 0.08;
const DRAIN_CURB_WIDTH_M = 0.07;
const DRAIN_WATER_Y = 0.05;
const DRAIN_HAND_DEPTH_M = 0.15;
const DRAIN_LIFT_M = 0.35;

/** What the piano's tuning card shows. */
export interface PianoCard {
  line: readonly number[];
  step: number;
  round: number;
  rounds: number;
  /** Between rounds the card turns over. */
  turning: boolean;
}

/** Your arm in the drain: where (in the drain's own x and z), the ripple, and how far it is pulled up. */
export interface DrainShow {
  at: { x: number; z: number } | null;
  /** Where the ripple is in its spread, 0 to 1, and how strong it is. */
  ripple: number;
  strength: number;
  /** 0 in the water, 1 pulled out. */
  lift: number;
  gripped: boolean;
}

/**
 * The parts of a station your hands work on (GDD 26.5). Each part is a mesh named by
 * userData.part ("wick:2", "knob:0", "shutter:1", "soil"), which the crosshair can pick.
 */
export type HandsModel =
  | { kind: "candelabra"; wicks: THREE.Mesh[]; tips: THREE.Object3D[]; setLit(lit: readonly boolean[]): void }
  | { kind: "stove"; knobs: THREE.Mesh[]; setKnobs(angleDeg: readonly number[], flame: readonly number[]): void }
  | { kind: "shutters"; panels: THREE.Mesh[]; setOpen(open: readonly number[]): void }
  | { kind: "dig"; soil: THREE.Mesh; setDepth(depth: number, relicShows: boolean): void }
  | { kind: "letter"; letter: THREE.Mesh; bottom: THREE.Object3D; setLetter(swayM: number, heat: number, burned: number): void }
  | { kind: "clock"; key: THREE.Mesh; setKey(angleDeg: number): void }
  | { kind: "boiler"; wheel: THREE.Mesh[]; setValve(openDeg: number, pressure: number): void }
  | { kind: "portraits"; frames: THREE.Mesh[]; setTilt(deg: readonly number[]): void }
  | { kind: "roses"; vases: THREE.Mesh[]; setWater(levels: readonly number[]): void }
  | {
      kind: "switchboard";
      plugs: THREE.Mesh[];
      hooks: FacePoint[];
      sockets: FacePoint[];
      /** The colour of each cable. */
      colors: readonly number[];
      setSockets(colors: readonly number[]): void;
      setPlugs(at: readonly FacePoint[], lit: readonly boolean[]): void;
    }
  | { kind: "mirror"; glass: THREE.Mesh; setFog(fog: readonly number[], face: number): void }
  | { kind: "trunk"; lid: THREE.Mesh; latches: THREE.Mesh[]; setTrunk(lid: number, latchDeg: readonly number[], rattle: number): void }
  | { kind: "piano"; keys: THREE.Mesh[]; setPiano(card: PianoCard, down: number | null): void }
  | { kind: "sheets"; flap: THREE.Mesh; setSheet(folds: number, progress: number): void }
  | { kind: "cradle"; basket: THREE.Mesh; setCradle(angle: number, calm: number, crying: boolean): void }
  | { kind: "lockbox"; dial: THREE.Mesh; setDial(deg: number, set: number, open: boolean): void }
  | { kind: "drain"; water: THREE.Mesh; setDrain(show: DrainShow): void };

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
  // The winding key in its hole below the hands; it turns about the axis pointing at you.
  const keyPivot = new THREE.Group();
  keyPivot.position.set(0, 1.66, 0.19);
  keyPivot.add(box(0.012, 0.012, 0.03, BRASS, 0, 0, 0.015));
  const key = part(box(0.08, 0.045, 0.012, BRASS, 0, 0, 0.035), "key");
  keyPivot.add(key);
  group.add(keyPivot);
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
    hands: { kind: "clock", key, setKey: (deg) => (keyPivot.rotation.z = (-deg * Math.PI) / 180) },
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
  // The cursed letter hangs on a string from a hook under the mantel, swaying in the draught.
  const hook = new THREE.Group();
  hook.position.set(0, 1.1, 0.3);
  hook.add(box(0.004, LETTER_DROP_M, 0.004, 0x8a8070, 0, -LETTER_DROP_M / 2, 0));
  const paper = new THREE.MeshLambertMaterial({ color: PAPER });
  const letter = part(new THREE.Mesh(new THREE.BoxGeometry(0.15, LETTER_HEIGHT_M, 0.004), paper), "letter");
  letter.position.y = -LETTER_DROP_M - LETTER_HEIGHT_M / 2;
  hook.add(letter);
  // Where the flame must be: just under the letter's bottom edge.
  const bottom = new THREE.Object3D();
  bottom.position.y = -LETTER_DROP_M - LETTER_HEIGHT_M - 0.02;
  hook.add(bottom);
  group.add(hook);
  const paperColor = new THREE.Color(PAPER);
  const scorch = new THREE.Color(SCORCH);
  const setLetter = (swayM: number, heat: number, burned: number) => {
    hook.rotation.z = -Math.atan2(swayM, LETTER_DROP_M + LETTER_HEIGHT_M);
    paper.color.copy(paperColor).lerp(scorch, Math.min(1, heat) * 0.6);
    paper.emissive.setHex(burned > 0 ? 0xff6a20 : 0x000000);
    letter.scale.y = Math.max(0.05, 1 - burned);
    letter.position.y = -LETTER_DROP_M - (LETTER_HEIGHT_M * letter.scale.y) / 2;
    letter.visible = burned < 1;
  };
  return {
    group,
    setDone(done) {
      for (const f of flames) f.visible = done;
      light.intensity = done ? 3 : 0;
      setLetter(0, 0, done ? 1 : 0);
    },
    update(time) {
      if (light.intensity === 0) return;
      light.intensity = 3 + Math.sin(time * 9) * 0.4 + Math.sin(time * 23) * 0.3;
      flames.forEach((f, i) => (f.scale.y = 1 + Math.sin(time * 11 + i * 2) * 0.2));
    },
    hands: { kind: "letter", letter, bottom, setLetter },
  };
}

function boiler(): StationView {
  const group = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 16), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  tank.position.set(0, 0.9, -0.1);
  group.add(tank);
  // The valve wheel turns about the axis pointing at you; its rim and spokes are all handles.
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(0.25, 1.1, 0.42);
  const red = 0xa8392a;
  const rim = part(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), new THREE.MeshLambertMaterial({ color: red })), "wheel");
  const spokeA = part(box(0.28, 0.025, 0.025, red), "wheel");
  const spokeB = part(box(0.025, 0.28, 0.025, red), "wheel");
  wheelPivot.add(rim, spokeA, spokeB);
  group.add(wheelPivot);
  // The pressure gauge: a dial with a green safe band and a needle.
  const gauge = new THREE.Group();
  gauge.position.set(-0.2, 1.4, 0.37);
  gauge.add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshLambertMaterial({ color: 0xe9dfc6 })));
  const { safeMin, safeMax } = config.tasks.hands.boiler;
  const angleOf = (p: number) => GAUGE_SWEEP_RAD - p * 2 * GAUGE_SWEEP_RAD; // from straight up, counterclockwise
  const band = new THREE.Mesh(
    new THREE.RingGeometry(0.085, 0.11, 16, 1, Math.PI / 2 + angleOf(safeMax), angleOf(safeMin) - angleOf(safeMax)),
    new THREE.MeshLambertMaterial({ color: 0x3e8a4a }),
  );
  band.position.z = 0.002;
  gauge.add(band);
  const needle = new THREE.Group();
  needle.position.z = 0.004;
  needle.add(box(0.008, 0.1, 0.004, 0x1a1010, 0, 0.05, 0));
  gauge.add(needle);
  group.add(gauge);
  const setValve = (openDeg: number, pressure: number) => {
    wheelPivot.rotation.z = (-openDeg * Math.PI) / 180;
    needle.rotation.z = angleOf(Math.max(0, Math.min(1, pressure)));
  };
  setValve(0, config.tasks.hands.boiler.startPressure);
  return { group, setDone() {}, hands: { kind: "boiler", wheel: [rim, spokeA, spokeB], setValve } };
}

function roses(): StationView {
  const group = new THREE.Group();
  group.add(box(1.1, 0.75, 0.5, WOOD, 0, 0.375, 0));
  const vases: THREE.Mesh[] = [];
  const waters: THREE.Mesh[] = [];
  const bottomY = 0.75;
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a5a78, transparent: true, opacity: 0.8 });
  for (let i = -1; i <= 1; i++) {
    const glass = new THREE.MeshLambertMaterial({ color: 0xb8c8d0, transparent: true, opacity: 0.35, depthWrite: false });
    const vase = part(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, VASE_HEIGHT_M, 10), glass), `vase:${i + 1}`);
    vase.position.set(i * 0.32, bottomY + VASE_HEIGHT_M / 2, 0);
    group.add(vase);
    vases.push(vase);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.055, 1, 10), waterMat);
    water.position.set(i * 0.32, bottomY, 0);
    water.visible = false;
    group.add(water);
    waters.push(water);
    // The line to fill to, painted round the vase.
    const line = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.004, 4, 16), new THREE.MeshBasicMaterial({ color: 0x1a1410 }));
    line.rotation.x = Math.PI / 2;
    line.position.set(i * 0.32, bottomY + VASE_HEIGHT_M * config.tasks.hands.roses.line, 0);
    group.add(line);
    group.add(box(0.1, 0.1, 0.1, 0x8a2a36, i * 0.32, 1.12, 0));
  }
  const setWater = (levels: readonly number[]) => {
    waters.forEach((w, i) => {
      const h = VASE_HEIGHT_M * Math.max(0, levels[i] ?? 0);
      w.visible = h > 0.002;
      w.scale.y = Math.max(0.001, h);
      w.position.y = bottomY + h / 2;
    });
  };
  return { group, setDone() {}, hands: { kind: "roses", vases, setWater } };
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
  const pivots: THREE.Group[] = [];
  const frames: THREE.Mesh[] = [];
  const tilts = [17, -26, 14];
  for (let i = -1; i <= 1; i++) {
    // Each hangs from a nail at the top and swings about it.
    const pivot = new THREE.Group();
    pivot.position.set(i * 0.75, 1.9, -0.06);
    const frame = part(box(0.5, 0.65, 0.05, BRASS, 0, -0.4, 0), `portrait:${i + 1}`);
    pivot.add(frame);
    pivot.add(box(0.4, 0.55, 0.02, 0x2e2a24, 0, -0.4, 0.03));
    group.add(pivot);
    pivots.push(pivot);
    frames.push(frame);
  }
  const setTilt = (deg: readonly number[]) => pivots.forEach((p, i) => (p.rotation.z = (-(deg[i] ?? 0) * Math.PI) / 180));
  setTilt(tilts);
  return {
    group,
    setDone(done) {
      setTilt(done ? [0, 0, 0] : tilts);
    },
    hands: { kind: "portraits", frames, setTilt },
  };
}

/** A thin rod, one meter long, to be stretched between two points (a cable, a string). */
function rod(radius: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 6), new THREE.MeshLambertMaterial({ color }));
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/** Lays a rod from a to b. */
function stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  _dir.subVectors(b, a);
  const len = _dir.length();
  mesh.scale.set(1, Math.max(len, 0.001), 1);
  if (len > 0) mesh.quaternion.setFromUnitVectors(_up, _dir.divideScalar(len));
}

function piano(): StationView {
  const group = new THREE.Group();
  group.add(box(1.5, 1.2, 0.6, 0x1e1410, 0, 0.6, -0.05));
  group.add(box(1.5, 0.05, 0.32, 0x1e1410, 0, 0.74, 0.39)); // keybed
  const { keys: count } = config.tasks.hands.piano;
  const keys: THREE.Mesh[] = [];
  const width = PIANO_KEYS_M / count;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * width;
    const key = part(box(width - 0.012, 0.04, 0.26, 0xe6decb, x, PIANO_KEY_Y, 0.4), `key:${i}`);
    group.add(key);
    keys.push(key);
    // The black keys between, as on a real piano (no gap after the third and seventh).
    if (i < count - 1 && i % 7 !== 2 && i % 7 !== 6) group.add(box(width * 0.5, 0.03, 0.15, 0x0d0a08, x + width / 2, PIANO_KEY_Y + 0.03, 0.34));
  }
  // The tuning card on the music stand: which keys to press, in order.
  group.add(box(0.9, 0.42, 0.02, 0x1e1410, 0, PIANO_CARD_Y, 0.24));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.36), new THREE.MeshBasicMaterial({ map: texture }));
  card.position.set(0, PIANO_CARD_Y, 0.252);
  card.rotation.x = -0.12;
  group.add(card);
  let shown = "";
  const setPiano = (c: PianoCard, down: number | null) => {
    keys.forEach((k) => (k.position.y = PIANO_KEY_Y));
    if (down !== null) keys[down]!.position.y = PIANO_KEY_Y - 0.012;
    const key = JSON.stringify(c);
    if (key === shown) return;
    shown = key;
    drawPianoCard(canvas.getContext("2d")!, c, count);
    texture.needsUpdate = true;
  };
  setPiano({ line: [], step: 0, round: 0, rounds: 0, turning: true }, null);
  return { group, setDone() {}, hands: { kind: "piano", keys, setPiano } };
}

/** The tuning card: a little keyboard with the order to press the keys written over it. */
function drawPianoCard(g: CanvasRenderingContext2D, c: PianoCard, keys: number) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  g.fillStyle = "#e8dcc0";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#3a2a1a";
  g.font = "bold 30px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (c.turning) {
    const text = c.rounds === 0 ? "Tuning" : c.round >= c.rounds ? "In tune" : `Round ${c.round + 1} of ${c.rounds}`;
    g.fillText(text, W / 2, H / 2);
    return;
  }
  g.font = "bold 24px Georgia, serif";
  g.fillText(`Round ${c.round + 1} of ${c.rounds}`, W / 2, 24);
  const kw = (W - 40) / keys;
  for (let i = 0; i < keys; i++) {
    const x = 20 + i * kw;
    g.strokeStyle = "#3a2a1a";
    g.lineWidth = 3;
    g.strokeRect(x + 3, 56, kw - 6, 190);
    const steps = c.line.map((k, s) => (k === i ? s : -1)).filter((s) => s >= 0);
    // A key pressed more than once shows its turns side by side.
    const gap = kw / (steps.length + 1);
    steps.forEach((s, j) => {
      g.fillStyle = s < c.step ? "#b8a890" : s === c.step ? "#a02818" : "#3a2a1a";
      g.font = `bold ${steps.length > 1 ? 50 : 72}px Georgia, serif`;
      g.fillText(String(s + 1), x + gap * (j + 1), 170);
    });
  }
}

/** The cradle: it rocks on its rockers, the baby in it stirs and cries, and a mobile above turns as it calms. */
function cradle(): StationView {
  const group = new THREE.Group();
  const rock = new THREE.Group();
  group.add(rock);
  rock.add(box(1.0, 0.05, 0.08, 0x5a3a22, 0, 0.12, 0.22));
  rock.add(box(1.0, 0.05, 0.08, 0x5a3a22, 0, 0.12, -0.22));
  const basket = part(box(0.9, 0.35, 0.5, 0x6b4a2e, 0, 0.5, 0), "basket");
  rock.add(basket);
  const baby = new THREE.Group();
  baby.add(box(0.36, 0.1, 0.24, 0xd8cfc0, -0.05, 0.7, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc8a890 }));
  head.position.set(0.2, 0.72, 0);
  baby.add(head);
  rock.add(baby);
  // A mobile on a post over the cradle.
  group.add(box(0.04, 1.4, 0.04, 0x5a3a22, -0.55, 0.7, -0.3));
  const arm = rod(0.012, 0x5a3a22);
  stretch(arm, new THREE.Vector3(-0.55, 1.38, -0.3), new THREE.Vector3(0, 1.38, 0));
  group.add(arm);
  const mobile = new THREE.Group();
  mobile.position.set(0, 1.3, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * 0.12;
    const z = Math.sin(a) * 0.12;
    const string = rod(0.002, 0x8a8070);
    stretch(string, new THREE.Vector3(x, 0.08, z), new THREE.Vector3(x, -0.08, z));
    mobile.add(string);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), new THREE.MeshLambertMaterial({ color: 0xc9a640 }));
    star.position.set(x, -0.1, z);
    mobile.add(star);
  }
  group.add(mobile);
  let angle = 0;
  let calm = 0;
  let crying = false;
  let last = 0;
  return {
    group,
    setDone() {},
    update(time) {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      rock.rotation.z = -angle;
      baby.position.set(crying ? Math.sin(time * 37) * 0.012 : 0, crying ? Math.abs(Math.sin(time * 23)) * 0.01 : 0, 0);
      mobile.rotation.y += dt * calm * MOBILE_TURN_RAD_PER_SEC;
    },
    hands: {
      kind: "cradle",
      basket,
      setCradle(a, c, cry) {
        angle = a;
        calm = c;
        crying = cry;
      },
    },
  };
}

/** The switchboard: plugs on hooks below, coloured sockets above, each with a lamp. */
function switchboard(): StationView {
  const group = new THREE.Group();
  group.add(box(1.0, 1.0, 0.15, WOOD, 0, BOARD_Y, -0.1));
  group.add(box(1.0, 0.8, 0.4, WOOD, 0, 0.4, 0.05)); // desk
  const { cables } = config.tasks.hands.switchboard;
  const hooks: FacePoint[] = [];
  const sockets: FacePoint[] = [];
  const rings: THREE.MeshLambertMaterial[] = [];
  const lamps: THREE.MeshLambertMaterial[] = [];
  const plugs: THREE.Mesh[] = [];
  const wires: THREE.Mesh[] = [];
  const roots: THREE.Vector3[] = [];
  for (let i = 0; i < cables; i++) {
    const u = (i - (cables - 1) / 2) * SOCKET_GAP_M;
    hooks.push({ u, v: -BOARD_ROW_M });
    sockets.push({ u, v: BOARD_ROW_M });
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 16), ringMat);
    ring.position.set(u, BOARD_Y + BOARD_ROW_M, BOARD_FRONT_Z + 0.004);
    group.add(ring);
    rings.push(ringMat);
    group.add(box(0.035, 0.035, 0.01, 0x050403, u, BOARD_Y + BOARD_ROW_M, BOARD_FRONT_Z));
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3020 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), lampMat);
    lamp.position.set(u, BOARD_Y + BOARD_ROW_M + 0.1, BOARD_FRONT_Z + 0.01);
    group.add(lamp);
    lamps.push(lampMat);
    group.add(box(0.05, 0.012, 0.04, BRASS, u, BOARD_Y - BOARD_ROW_M - 0.035, BOARD_FRONT_Z + 0.02)); // hook
    const plug = part(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.06, 10), new THREE.MeshLambertMaterial({ color: CABLE_COLORS[i] })), `plug:${i}`);
    plug.rotation.x = Math.PI / 2;
    group.add(plug);
    plugs.push(plug);
    const wire = rod(0.008, CABLE_COLORS[i]!);
    group.add(wire);
    wires.push(wire);
    roots.push(new THREE.Vector3(u, BOARD_Y - 0.46, BOARD_FRONT_Z + 0.01));
  }
  const setPlugs = (at: readonly FacePoint[], lit: readonly boolean[]) => {
    at.forEach((p, i) => {
      // A seated plug sits flush in its socket; a loose one stands out from the board.
      const seated = sockets.some((s) => s.u === p.u && s.v === p.v);
      plugs[i]!.position.set(p.u, BOARD_Y + p.v, BOARD_FRONT_Z + (seated ? 0.02 : 0.05));
      stretch(wires[i]!, roots[i]!, plugs[i]!.position);
    });
    lamps.forEach((m, j) => {
      m.color.setHex(lit[j] ? 0xffd27a : 0x3a3020);
      m.emissive.setHex(lit[j] ? 0x8a5a10 : 0x000000);
    });
  };
  setPlugs(hooks, []);
  return {
    group,
    setDone() {},
    hands: {
      kind: "switchboard",
      plugs,
      hooks,
      sockets,
      colors: CABLE_COLORS.slice(0, cables),
      setSockets: (colors) => rings.forEach((m, j) => m.color.setHex(colors[j] ?? 0x555555)),
      setPlugs,
    },
  };
}

/** A pale face, for the mirror. */
function faceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext("2d")!;
  const glow = g.createRadialGradient(64, 80, 10, 64, 80, 70);
  glow.addColorStop(0, "rgba(220, 225, 220, 0.9)");
  glow.addColorStop(1, "rgba(220, 225, 220, 0)");
  g.fillStyle = glow;
  g.beginPath();
  g.ellipse(64, 80, 46, 64, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(10, 8, 8, 0.95)";
  for (const x of [46, 82]) {
    g.beginPath();
    g.ellipse(x, 66, 9, 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.ellipse(64, 112, 8, 14, 0, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The mirror over the dresser, fogged over; the glass is (0, 0) at its middle. */
function mirror(): StationView {
  const group = new THREE.Group();
  const { widthM, heightM, cols, rows } = config.tasks.hands.mirror;
  group.add(box(widthM + 0.16, heightM + 0.16, 0.05, BRASS, 0, MIRROR_Y, -0.05));
  const glass = part(new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshPhongMaterial({ color: 0x1c2226, specular: 0x667078, shininess: 90 })), "glass");
  glass.position.set(0, MIRROR_Y, -0.02);
  group.add(glass);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, opacity: 0, depthWrite: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.33), faceMat);
  face.position.set(0.06, MIRROR_Y + 0.14, -0.018);
  group.add(face);
  // The fog: one texel for each patch of glass.
  const data = new Uint8Array(cols * rows * 4);
  const fogTexture = new THREE.DataTexture(data, cols, rows);
  fogTexture.magFilter = THREE.LinearFilter;
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshLambertMaterial({ map: fogTexture, transparent: true, depthWrite: false }));
  fog.position.set(0, MIRROR_Y, -0.016);
  group.add(fog);
  group.add(box(0.9, 0.8, 0.4, WOOD, 0, 0.4, 0.1)); // dresser
  const setFog = (patches: readonly number[], showFace: number) => {
    patches.forEach((f, i) => {
      data.set([200, 204, 206, Math.round(225 * f)], i * 4);
    });
    fogTexture.needsUpdate = true;
    faceMat.opacity = showFace * 0.85;
  };
  setFog(Array.from({ length: cols * rows }, () => 1), 0);
  return { group, setDone() {}, hands: { kind: "mirror", glass, setFog } };
}

/** The old trunk: a sprung lid hinged at the back, and three latches on the front. */
function trunk(): StationView {
  const group = new THREE.Group();
  group.add(box(1.0, 0.5, 0.55, 0x4b3420, 0, 0.25, 0));
  group.add(box(0.94, 0.02, 0.49, 0x0b0807, 0, 0.495, 0)); // the dark inside
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.5, -0.285);
  const lid = part(box(1.02, 0.12, 0.57, 0x553a22, 0, 0.06, 0.285), "lid");
  hinge.add(lid);
  group.add(hinge);
  const pivots: THREE.Group[] = [];
  const latches: THREE.Mesh[] = [];
  const { latches: count } = config.tasks.hands.trunk;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.3;
    group.add(box(0.06, 0.06, 0.01, 0x2a2016, x, 0.44, 0.28)); // the catch
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, 0.29);
    const latch = part(box(0.026, 0.1, 0.016, BRASS, 0, 0, 0.006), `latch:${i}`);
    pivot.add(latch);
    group.add(pivot);
    pivots.push(pivot);
    latches.push(latch);
  }
  let open = 0;
  let rattle = 0;
  const setTrunk = (lidOpen: number, latchDeg: readonly number[], r: number) => {
    open = lidOpen;
    rattle = r;
    pivots.forEach((p, i) => (p.rotation.z = (-(latchDeg[i] ?? 0) * Math.PI) / 180));
  };
  return {
    group,
    setDone() {},
    update(time) {
      // The lid strains against the latches when it is about to burst.
      hinge.rotation.x = -open * TRUNK_LID_OPEN_RAD - rattle * TRUNK_RATTLE_RAD * Math.abs(Math.sin(time * 31));
    },
    hands: { kind: "trunk", lid, latches, setTrunk },
  };
}

/** A sheet on the table, folded in half each time: toward you, right to left, toward you. */
function sheets(): StationView {
  const group = new THREE.Group();
  group.add(box(1.2, 0.75, 0.7, WOOD, 0, 0.375, 0)); // table
  const top = 0.75;
  const flat = box(1, SHEET_THICK_M, 1, LINEN);
  group.add(flat);
  const pivot = new THREE.Group();
  const flap = part(box(1, SHEET_THICK_M, 1, LINEN), "sheet");
  pivot.add(flap);
  group.add(pivot);
  const { folds: total } = config.tasks.hands.sheets;
  const setSheet = (folds: number, progress: number) => {
    let r = { cx: 0, cz: 0, w: SHEET_W_M, d: SHEET_D_M };
    for (let k = 0; k < Math.min(folds, total); k++) r = foldedHalf(r, k);
    const layers = 2 ** Math.min(folds, total);
    const still = folds < total ? foldedHalf(r, folds) : r;
    flat.scale.set(still.w, layers, still.d);
    flat.position.set(still.cx, top + (SHEET_THICK_M * layers) / 2, still.cz);
    flap.visible = folds < total;
    if (!flap.visible) return;
    pivot.position.set(r.cx, top + SHEET_THICK_M * layers * 1.5, r.cz);
    flap.scale.set(1, layers, 1);
    if (folds % 2 === 0) {
      // The far half lifts and comes over toward you.
      flap.scale.x = r.w;
      flap.scale.z = r.d / 2;
      flap.position.set(0, 0, -r.d / 4);
      pivot.rotation.set(progress * Math.PI, 0, 0);
    } else {
      // The right half lifts and goes over to the left.
      flap.scale.x = r.w / 2;
      flap.scale.z = r.d;
      flap.position.set(r.w / 4, 0, 0);
      pivot.rotation.set(0, 0, progress * Math.PI);
    }
  };
  setSheet(0, 0);
  return { group, setDone() {}, hands: { kind: "sheets", flap, setSheet } };
}

/** The half of a sheet that stays down when it is folded: the near half, or the left half. */
function foldedHalf(r: { cx: number; cz: number; w: number; d: number }, fold: number) {
  return fold % 2 === 0 ? { cx: r.cx, cz: r.cz + r.d / 4, w: r.w, d: r.d / 2 } : { cx: r.cx - r.w / 4, cz: r.cz, w: r.w / 2, d: r.d };
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

/** A jewellery box on a sideboard, with a dial lock on its front and a stud for each pin set. */
function lockboxSpot(): PlaceView {
  const group = new THREE.Group();
  group.add(box(1.0, 0.85, 0.45, WOOD, 0, 0.425, 0)); // sideboard or shelf
  group.add(box(0.3, 0.16, 0.2, 0x6a4a2a, 0, 0.93, 0));
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.01, -0.1);
  hinge.add(box(0.31, 0.03, 0.21, 0x7a5a36, 0, 0.015, 0.1));
  group.add(hinge);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.92, 0.1);
  const dial = part(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24), new THREE.MeshLambertMaterial({ color: BRASS })), "dial");
  dial.rotation.x = Math.PI / 2;
  dial.position.z = 0.01;
  pivot.add(dial);
  pivot.add(box(0.008, 0.035, 0.004, 0x1a1010, 0, 0.022, 0.022)); // its pointer
  group.add(pivot);
  group.add(box(0.012, 0.012, 0.004, 0xe9dfc6, 0, 0.976, 0.102)); // the mark at the top
  const { pins } = config.relics.hands.lockbox;
  const studs: THREE.MeshLambertMaterial[] = [];
  for (let i = 0; i < pins; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a2016 });
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), mat);
    stud.position.set((i - (pins - 1) / 2) * 0.03, 0.99, 0.102);
    group.add(stud);
    studs.push(mat);
  }
  const setDial = (deg: number, set: number, open: boolean) => {
    pivot.rotation.z = (-deg * Math.PI) / 180;
    studs.forEach((m, i) => {
      m.color.setHex(i < set ? 0xd8b050 : 0x2a2016);
      m.emissive.setHex(i < set ? 0x4a3008 : 0x000000);
    });
    hinge.rotation.x = open ? -LOCKBOX_OPEN_RAD : 0;
  };
  return {
    group,
    setSearched(searched) {
      setDial(0, searched ? pins : 0, searched);
    },
    hands: { kind: "lockbox", dial, setDial },
  };
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

/** A drain in the floor with its grate lifted off and laid beside it: dark water in a stone curb. */
function drainSpot(): PlaceView {
  const group = new THREE.Group();
  const stone = 0x4a4a44;
  const half = DRAIN_INNER_M / 2;
  const t = DRAIN_CURB_WIDTH_M;
  const outer = DRAIN_INNER_M + 2 * t;
  for (const s of [-1, 1]) {
    group.add(box(outer, DRAIN_CURB_M, t, stone, 0, DRAIN_CURB_M / 2, s * (half + t / 2)));
    group.add(box(t, DRAIN_CURB_M, DRAIN_INNER_M, stone, s * (half + t / 2), DRAIN_CURB_M / 2, 0));
  }
  const water = part(new THREE.Mesh(new THREE.PlaneGeometry(DRAIN_INNER_M, DRAIN_INNER_M), new THREE.MeshLambertMaterial({ color: 0x10160f })), "water");
  water.rotation.x = -Math.PI / 2;
  water.position.y = DRAIN_WATER_Y;
  group.add(water);
  for (let i = -2; i <= 2; i++) group.add(box(0.03, 0.02, 0.5, 0x555048, half + t + 0.16 + i * 0.05, 0.01, 0)); // the grate
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xa0b0a0, transparent: true, opacity: 0, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.visible = false;
  group.add(ripple);
  // Your forearm going down into the water, and the relic in your hand once you have it.
  const arm = new THREE.Group();
  arm.add(box(0.07, 0.4, 0.07, 0xb8a090, 0, 0.2, 0));
  const relic = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0xc9a640, emissive: 0x3a2a08 }));
  arm.add(relic);
  arm.visible = false;
  group.add(arm);
  const setDrain = (s: DrainShow) => {
    arm.visible = ripple.visible = s.at !== null;
    if (!s.at) return;
    arm.position.set(s.at.x, DRAIN_WATER_Y - DRAIN_HAND_DEPTH_M + s.lift * DRAIN_LIFT_M, s.at.z);
    relic.visible = s.gripped;
    ripple.position.set(s.at.x, DRAIN_WATER_Y + 0.002, s.at.z);
    ripple.scale.setScalar(0.03 + s.ripple * 0.12);
    (ripple.material as THREE.MeshBasicMaterial).opacity = (1 - s.ripple) * (0.12 + 0.6 * s.strength);
  };
  return { group, setSearched() {}, hands: { kind: "drain", water, setDrain } };
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
