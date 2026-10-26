import * as THREE from "three";
import type { MapData, RelicMinigame, TaskMinigame } from "@haunted/shared";
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

interface StationView {
  group: THREE.Group;
  setDone(done: boolean): void;
  update?(time: number): void;
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
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc966 });
  for (let i = 0; i < 5; i++) {
    const x = -0.28 + i * 0.14;
    const h = 0.12 + Math.sin((i / 4) * Math.PI) * 0.06;
    group.add(box(0.035, h, 0.035, 0xe9dfc6, x, 1.1 + h / 2, 0));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), flameMat);
    flame.position.set(x, 1.1 + h + 0.03, 0);
    flame.visible = false;
    group.add(flame);
    flames.push(flame);
  }
  const light = new THREE.PointLight(0xffb060, 0, CANDLE_LIGHT_RANGE_M, 2);
  light.position.set(0, 1.4, 0);
  group.add(light);
  return {
    group,
    setDone(done) {
      for (const f of flames) f.visible = done;
      light.intensity = done ? 2.5 : 0;
    },
    update(time) {
      if (light.intensity > 0) light.intensity = 2.5 + Math.sin(time * 13) * 0.25 + Math.sin(time * 31) * 0.15;
    },
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
  for (let i = 0; i < 3; i++) {
    group.add(box(0.26, 0.03, 0.26, 0x18191b, -0.38 + i * 0.38, 0.915, -0.05));
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12), new THREE.MeshLambertMaterial({ color: 0x5a5c62 }));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-0.38 + i * 0.38, 0.75, 0.37);
    group.add(knob);
  }
  return { group, setDone() {} };
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
  // A window on the wall, its shutters banging open until the task closes them.
  const group = new THREE.Group();
  group.add(box(1.2, 1.4, 0.08, 0x0b1018, 0, 1.5, -0.08));
  const hinges: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.6, 1.5, -0.02);
    hinge.add(box(0.6, 1.4, 0.04, 0x5e4630, -side * 0.3, 0, 0));
    group.add(hinge);
    hinges.push(hinge);
  }
  let shut = false;
  return {
    group,
    setDone(done) {
      shut = done;
    },
    update(time) {
      hinges.forEach((h, i) => {
        const side = i === 0 ? -1 : 1;
        h.rotation.y = shut ? 0 : side * (1.9 + Math.sin(time * 1.3 + i) * 0.15);
      });
    },
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

function lockboxSpot(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(1.0, 0.85, 0.45, WOOD, 0, 0.425, 0)); // sideboard or shelf
  group.add(box(0.3, 0.16, 0.2, 0x6a4a2a, 0, 0.93, 0));
  group.add(box(0.06, 0.06, 0.02, BRASS, 0, 0.93, 0.11));
  return group;
}

function digSpot(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.8, 0.5, 0.8, 0x5a3b22, 0, 0.25, 0));
  group.add(box(0.7, 0.04, 0.7, 0x2e2014, 0, 0.51, 0));
  group.add(box(0.06, 0.9, 0.06, 0x3d6a33, 0, 0.95, 0));
  group.add(box(0.6, 0.06, 0.06, 0x3d6a33, 0, 1.3, 0));
  return group;
}

function drainSpot(): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.7, 0.02, 0.7, 0x2b3324, 0, 0.01, 0));
  for (let i = -2; i <= 2; i++) group.add(box(0.04, 0.03, 0.6, 0x555048, i * 0.13, 0.025, 0));
  return group;
}

const RELIC_SPOTS: Record<RelicMinigame, () => THREE.Group> = { lockbox: lockboxSpot, dig: digSpot, drain: drainSpot };

/** Task stations in the world, with visible tasks showing their done state from the server. */
export class StationsView {
  private views = new Map<string, StationView>();

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
      const prop = RELIC_SPOTS[spot.minigame]();
      prop.position.set(spot.x, 0, spot.z);
      liftToFloor(map, prop);
      prop.rotation.y = facingYaw(map, spot);
      scene.add(prop);
    }
  }

  update(state: any) {
    state.stations?.forEach((s: { done: boolean }, id: string) => this.views.get(id)?.setDone(s.done));
  }

  render(time: number) {
    for (const v of this.views.values()) v.update?.(time);
  }
}
