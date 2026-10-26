import * as THREE from "three";
import { config, type WorldPoint } from "@haunted/shared";
import { createFlashlight } from "./flashlight.ts";
import { Flicker } from "./flicker.ts";

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
}

const MAX_SNAPSHOTS = 30;
const BODY_COLOR = 0x3a3a40;
const DEAD_COLOR = 0x1a1a1c;
const CROUCH_SCALE = config.movement.crouchEyeHeightM / config.movement.eyeHeightM;

function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

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

  constructor(private scene: THREE.Scene) {
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

    scene.add(this.root);
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
    this.bodyMaterial.color.setHex(b.health === "dead" ? DEAD_COLOR : BODY_COLOR);

    this.light.visible = b.flashlightOn;
    this.lens.visible = b.flashlightOn;
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
    this.scene.remove(this.root);
  }
}

export class RemotePlayers {
  private players = new Map<string, RemotePlayer>();

  /** `toWorld` turns a simulation position into its real place (shared/levels.ts). */
  constructor(private scene: THREE.Scene, private toWorld: (x: number, z: number) => WorldPoint) {}

  /** Records the latest server state for every other player, and removes players who left. */
  update(states: Map<string, Omit<Snapshot, "t" | "y">>, now: number) {
    for (const [id, s] of states) {
      let p = this.players.get(id);
      if (!p) {
        p = new RemotePlayer(this.scene);
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
      p.applyFlicker(dt, ghostDistanceFrom);
    }
  }
}
