import * as THREE from "three";
import { config } from "@haunted/shared";
import { createFlashlight } from "./flashlight.ts";

/** What the server said about another player at one moment. */
interface Snapshot {
  t: number;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  flashlightOn: boolean;
}

const MAX_SNAPSHOTS = 30;
const BODY_COLOR = 0x3a3a40;
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

  constructor(private scene: THREE.Scene) {
    const { radiusM, heightM } = config.body;
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(radiusM, heightM - radiusM * 2, 4, 12),
      new THREE.MeshLambertMaterial({ color: BODY_COLOR }),
    );
    this.body.position.y = heightM / 2;
    this.root.add(this.body);

    this.head.position.y = config.movement.eyeHeightM;
    this.root.add(this.head);

    const { light, target } = createFlashlight();
    this.light = light;
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

    this.root.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
    this.root.rotation.y = lerpAngle(a.yaw, b.yaw, t);
    this.head.rotation.x = a.pitch + (b.pitch - a.pitch) * t;

    const crouching = b.crouching;
    this.body.scale.y = crouching ? CROUCH_SCALE : 1;
    this.body.position.y = (config.body.heightM / 2) * this.body.scale.y;
    this.head.position.y = crouching ? config.movement.crouchEyeHeightM : config.movement.eyeHeightM;

    this.light.visible = b.flashlightOn;
    this.lens.visible = b.flashlightOn;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

export class RemotePlayers {
  private players = new Map<string, RemotePlayer>();

  constructor(private scene: THREE.Scene) {}

  /** Records the latest server state for every other player, and removes players who left. */
  update(states: Map<string, Omit<Snapshot, "t">>, now: number) {
    for (const [id, s] of states) {
      let p = this.players.get(id);
      if (!p) {
        p = new RemotePlayer(this.scene);
        this.players.set(id, p);
      }
      p.push({ ...s, t: now });
    }
    for (const [id, p] of this.players) {
      if (!states.has(id)) {
        p.dispose();
        this.players.delete(id);
      }
    }
  }

  render(now: number) {
    const renderTime = now - config.net.interpolationMs;
    for (const p of this.players.values()) p.render(renderTime);
  }
}
