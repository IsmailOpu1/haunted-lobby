import * as THREE from "three";
import type { HandsFrame, HandsTask } from "./tasks.ts";

// Working with your hands (GDD 26.5): the crosshair is your hand. Point at a part; hold the
// mouse button to grab it, and the mouse moves it instead of your view. Let go to look around.

/** How far your hand reaches from your eye. */
const REACH_M = 2.2;
/** How a usable part glows under the crosshair. */
const GLOW = 0x3a2c14;
/** How quickly the measured turning speed of your view follows the real one. */
const LOOK_SMOOTH_SEC = 0.08;

export class HandsWork {
  private task: HandsTask | null = null;
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private holding = false;
  private held: string | null = null;
  /**
   * What the button did since the last frame, so a quick press and release between two
   * frames (a flick) still counts as holding, with the part that was grabbed.
   */
  private pressedSinceFrame = false;
  private heldSinceFrame: string | null = null;
  private aim: string | null = null;
  private glowing: THREE.Mesh | null = null;
  private dragX = 0;
  private dragY = 0;
  private lookSpeed = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private wasDone = false;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.raycaster.far = REACH_M;
  }

  get active(): boolean {
    return this.task !== null;
  }

  /** The mouse button is down: the hands get the mouse, not the view. */
  get grabbing(): boolean {
    return this.task !== null && this.holding;
  }

  start(task: HandsTask, yaw: number, pitch: number) {
    this.stop();
    this.task = task;
    this.wasDone = false;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    this.lookSpeed = 0;
    if (task.tool) this.scene.add(task.tool);
  }

  stop() {
    if (!this.task) return;
    if (this.task.tool) this.scene.remove(this.task.tool);
    this.setGlow(null);
    this.task = null;
    this.holding = false;
    this.held = null;
  }

  press(down: boolean) {
    this.holding = down;
    this.held = down && this.aim && this.task?.canHold(this.aim) ? this.aim : null;
    if (down) {
      this.pressedSinceFrame = true;
      this.heldSinceFrame = this.held;
    }
  }

  move(dx: number, dy: number) {
    this.dragX += dx;
    this.dragY += dy;
  }

  /** The server says the relic is in this place: dig on. */
  found() {
    this.task?.setFound?.();
    this.wasDone = false;
  }

  /** One frame of work. Returns true the moment the task (or this stage of it) is done. */
  frame(dt: number, yaw: number, pitch: number): boolean {
    const task = this.task;
    if (!task || dt <= 0) return false;
    // The shorter way round, in case the view's yaw was set across the half turn.
    const dYaw = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
    const turned = Math.hypot(dYaw, pitch - this.lastPitch) / dt;
    this.lookSpeed += (turned - this.lookSpeed) * Math.min(1, dt / LOOK_SMOOTH_SEC);
    this.lastYaw = yaw;
    this.lastPitch = pitch;

    this.raycaster.setFromCamera(this.center, this.camera);
    const hit = this.raycaster.intersectObjects(task.parts, false)[0];
    this.aim = (hit?.object.userData.part as string | undefined) ?? null;
    this.setGlow(hit && this.aim && task.glows(this.aim) ? (hit.object as THREE.Mesh) : null);

    const f: HandsFrame = {
      dt,
      ray: this.raycaster.ray,
      aim: this.aim,
      held: this.held ?? this.heldSinceFrame,
      holding: this.holding || this.pressedSinceFrame,
      dragX: this.dragX,
      dragY: this.dragY,
      lookSpeed: this.lookSpeed,
    };
    this.dragX = this.dragY = 0;
    this.pressedSinceFrame = false;
    this.heldSinceFrame = null;
    task.update(f);
    const justDone = task.done && !this.wasDone;
    this.wasDone = task.done;
    return justDone;
  }

  private setGlow(mesh: THREE.Mesh | null) {
    if (mesh === this.glowing) return;
    const set = (m: THREE.Mesh | null, hex: number) => {
      const mat = m?.material as THREE.MeshLambertMaterial | undefined;
      mat?.emissive?.setHex(hex);
    };
    set(this.glowing, 0x000000);
    set(mesh, GLOW);
    this.glowing = mesh;
  }
}
