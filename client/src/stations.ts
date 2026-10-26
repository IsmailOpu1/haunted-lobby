import * as THREE from "three";
import type { MapData, MinigameKind, TaskStationDef } from "@haunted/shared";

// Placeholder task station models until the Phase 8 art pass. Visible tasks (GDD 9) show
// their result to everyone: the candelabra stays lit and the clock's pendulum swings.

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
function facingYaw(map: MapData, def: TaskStationDef): number {
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

const MODELS: Record<MinigameKind, () => StationView> = { candelabra, clock, stove, letter: fireplace, cradle, piano, boiler };

/** Task stations in the world, with visible tasks showing their done state from the server. */
export class StationsView {
  private views = new Map<string, StationView>();

  constructor(scene: THREE.Scene, map: MapData) {
    for (const def of map.tasks) {
      const view = MODELS[def.minigame]();
      view.group.position.set(def.x, 0, def.z);
      view.group.rotation.y = facingYaw(map, def);
      scene.add(view.group);
      // Only visible tasks change for everyone; the rest never show a result.
      this.views.set(def.id, def.visible ? view : { ...view, setDone() {} });
    }
  }

  update(state: any) {
    state.stations?.forEach((s: { done: boolean }, id: string) => this.views.get(id)?.setDone(s.done));
  }

  render(time: number) {
    for (const v of this.views.values()) v.update?.(time);
  }
}
