import * as THREE from "three";
import { config } from "@haunted/shared";

// Look of the flashlight beam (GDD Section 8.1: 12 m cone). Visual tuning only.
const BEAM_ANGLE = (config.flashlight.coneHalfAngleDeg * Math.PI) / 180; // half-angle of the cone
const BEAM_PENUMBRA = 0.5;
const BEAM_INTENSITY = 30;
const BEAM_DECAY = 1.2;

/**
 * Up close the beam would blow out what it hits (light grows fast as the distance shrinks, and
 * bloom spreads it over the screen). Your eyes would adjust, so the beam does: nearer than this,
 * it dims so what it hits is never lit more than at this distance.
 */
// 2.5 m: at 1.6 m a wall or the clock a step away still glared and bloomed into a haze (owner, 2026-11-10).
const ADAPT_NEAR_M = 2.5;
/** It never dims below this fraction, so the beam still reads as on. */
const ADAPT_MIN = 0.2;
/** How fast it adjusts (per second), like eyes, not instantly. */
const ADAPT_RATE_PER_SEC = 6;
/** Looks for what the beam hits every this many frames. */
const ADAPT_EVERY_FRAMES = 3;
/** Detailed models are checked by the box around them (close enough to judge glare), simple ones exactly. */
const EXACT_MAX_TRIANGLES = 2000;

/**
 * How bright your own beam should be right now (0 to 1) for what is in front of it. Checks the
 * middle of the beam out to ADAPT_NEAR_M against the world (doors, players: exactly) and the
 * dressed rooms (still, so the box around each detailed model is worked out once).
 */
export class BeamAdaptation {
  private raycaster = new THREE.Raycaster();
  private frame = 0;
  private target = 1;
  private level = 1;
  private forward = new THREE.Vector3();
  private from = new THREE.Vector3();
  private hitAt = new THREE.Vector3();
  private boxed: THREE.Box3[] = [];
  private exact: THREE.Mesh[] = [];

  private dressedRoots: Set<THREE.Object3D>;

  /** world: the scene's top-level objects (read on every check, so players added later count). */
  constructor(private world: THREE.Object3D[], dressed: THREE.Object3D[]) {
    this.dressedRoots = new Set(dressed);
    this.raycaster.far = ADAPT_NEAR_M;
    for (const root of dressed) {
      root.updateMatrixWorld(true);
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const geometry = obj.geometry as THREE.BufferGeometry;
        const triangles = (geometry.index?.count ?? geometry.attributes.position!.count) / 3;
        if (triangles <= EXACT_MAX_TRIANGLES) this.exact.push(obj);
        else this.boxed.push(new THREE.Box3().setFromObject(obj, false));
      });
    }
  }

  update(dt: number, camera: THREE.Camera): number {
    if (this.frame++ % ADAPT_EVERY_FRAMES === 0) {
      camera.getWorldDirection(this.forward);
      camera.getWorldPosition(this.from);
      this.raycaster.set(this.from, this.forward);
      this.raycaster.camera = camera;
      const visible = (h: THREE.Intersection) => h.object.visible && !(h.object instanceof THREE.Sprite);
      const world = this.raycaster.intersectObjects(this.world.filter((o) => !this.dressedRoots.has(o)), true).find(visible)?.distance ?? Infinity;
      const simple = this.raycaster.intersectObjects(this.exact, false).find(visible)?.distance ?? Infinity;
      let nearest = Math.min(world, simple);
      const ray = this.raycaster.ray;
      for (const box of this.boxed) {
        // A box you stand inside says nothing about what is in front of you.
        if (box.containsPoint(this.from) || !ray.intersectBox(box, this.hitAt)) continue;
        nearest = Math.min(nearest, this.hitAt.distanceTo(this.from));
      }
      // Lit in proportion to distance^-decay, so this keeps it at what ADAPT_NEAR_M would give.
      this.target = nearest < ADAPT_NEAR_M ? Math.max(ADAPT_MIN, Math.pow(nearest / ADAPT_NEAR_M, BEAM_DECAY)) : 1;
    }
    this.level += (this.target - this.level) * (1 - Math.exp(-ADAPT_RATE_PER_SEC * dt));
    return this.level;
  }
}

/** A spotlight with its own target, so it can be attached to a camera or a player model. */
export function createFlashlight(): { light: THREE.SpotLight; target: THREE.Object3D } {
  const light = new THREE.SpotLight(0xfff2d6, BEAM_INTENSITY, config.flashlight.coneM, BEAM_ANGLE, BEAM_PENUMBRA, BEAM_DECAY);
  const target = new THREE.Object3D();
  target.position.set(0, 0, -1);
  light.target = target;
  return { light, target };
}
