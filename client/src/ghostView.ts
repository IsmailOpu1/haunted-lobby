import * as THREE from "three";
import { config, type GhostView as GhostMsg } from "@haunted/shared";

interface Snapshot extends GhostMsg {
  t: number;
}

const MAX_SNAPSHOTS = 30;

function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

/**
 * The ghost as this client knows it. The server sends its position only while it is near
 * (PRD 10.3), and it is drawn only while it hunts. Placeholder look until the Phase 8 art pass.
 */
export class GhostView {
  private snapshots: Snapshot[] = [];
  private root = new THREE.Group();
  /** Latest known position (for flicker and heartbeat), or null when the ghost is far or gone. */
  known: { x: number; z: number } | null = null;

  constructor(scene: THREE.Scene) {
    const { radiusM, heightM } = config.ghost;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(radiusM, heightM - radiusM * 2, 4, 12),
      new THREE.MeshBasicMaterial({ color: 0x050505, fog: false }),
    );
    body.position.y = heightM / 2;
    this.root.add(body);

    // Two faint eyes, so the shape reads as a face in the dark.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, fog: false });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
      eye.position.set(side * 0.09, heightM - 0.3, -radiusM + 0.02);
      this.root.add(eye);
    }
    this.root.visible = false;
    scene.add(this.root);
  }

  push(msg: GhostMsg | null, now: number) {
    if (!msg) {
      this.snapshots = [];
      this.known = null;
      this.root.visible = false;
      return;
    }
    this.snapshots.push({ ...msg, t: now });
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
    this.known = { x: msg.x, z: msg.z };
  }

  render(now: number) {
    const snaps = this.snapshots;
    if (snaps.length === 0) return;
    const renderTime = now - config.net.interpolationMs;
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
    this.root.visible = b.visible;
  }

  distanceTo(x: number, z: number): number {
    return this.known ? Math.hypot(this.known.x - x, this.known.z - z) : Infinity;
  }
}
