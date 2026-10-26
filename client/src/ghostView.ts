import * as THREE from "three";
import { config, type GhostView as GhostMsg, type WorldPoint } from "@haunted/shared";

/** A server update, at the ghost's real place (with floor height). */
interface Snapshot extends GhostMsg {
  t: number;
  y: number;
}

const MAX_SNAPSHOTS = 30;
// Placeholder look until the Phase 8 art pass.
const HEAD_RADIUS_M = 0.16;
const AURA_INTENSITY = 1.5;
const AURA_RANGE_M = 4;
const SHIMMER_PER_SEC = 6;

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
  private bodyMat = new THREE.MeshLambertMaterial({
    color: 0xc8d0dc,
    emissive: 0x4a5566,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  private aura = new THREE.PointLight(0x9fb4ff, AURA_INTENSITY, AURA_RANGE_M, 2);
  /** Latest known position (for flicker and heartbeat), or null when the ghost is far or gone. */
  known: WorldPoint | null = null;

  /** `toWorld` turns a simulation position into its real place (shared/levels.ts). */
  constructor(scene: THREE.Scene, private toWorld: (x: number, z: number) => WorldPoint) {
    const { radiusM, heightM } = config.ghost;
    // A pale, faintly glowing figure: visible in the dark on its own, brighter in a flashlight,
    // so it can be seen even when your flashlight cuts out next to it (GDD Section 8).
    const robe = new THREE.Mesh(new THREE.ConeGeometry(radiusM * 1.4, heightM * 0.85, 12, 1, true), this.bodyMat);
    robe.position.y = (heightM * 0.85) / 2;
    this.root.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS_M, 12, 10), this.bodyMat);
    head.position.y = heightM - HEAD_RADIUS_M;
    this.root.add(head);

    // Dark sockets with bright eyes, facing where it walks (-z).
    const socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), socketMat);
      socket.position.set(side * 0.06, heightM - HEAD_RADIUS_M + 0.02, -HEAD_RADIUS_M + 0.03);
      this.root.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
      eye.position.set(side * 0.06, heightM - HEAD_RADIUS_M + 0.02, -HEAD_RADIUS_M - 0.005);
      this.root.add(eye);
    }

    // A cold glow that lights the floor and walls around it.
    this.aura.position.y = heightM * 0.6;
    this.root.add(this.aura);
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
    const at = this.toWorld(msg.x, msg.z);
    this.snapshots.push({ ...msg, ...at, t: now });
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
    this.known = at;
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
    this.root.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    this.root.rotation.y = lerpAngle(a.yaw, b.yaw, t);
    this.root.visible = b.visible;
    // A slow shimmer, so it never looks quite solid.
    const shimmer = Math.sin((now / 1000) * SHIMMER_PER_SEC);
    this.bodyMat.opacity = 0.72 + 0.1 * shimmer;
    this.aura.intensity = AURA_INTENSITY * (0.85 + 0.15 * shimmer);
  }

  /** Where the ghost is drawn while it hunts (its footsteps are heard then), else null. */
  huntingAt(): WorldPoint | null {
    if (!this.root.visible) return null;
    const { x, y, z } = this.root.position;
    return { x, y, z };
  }

  distanceTo(at: WorldPoint): number {
    return this.known ? Math.hypot(this.known.x - at.x, this.known.y - at.y, this.known.z - at.z) : Infinity;
  }
}
