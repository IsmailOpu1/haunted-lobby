import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ModelLoaders } from "./loaders.ts";

// The torch in your hand (Phase 8 plan, 4.5): an old nickel-plated metal torch held low and to the
// right in your gloveless right hand and coat sleeve (tools/art/blender/build_hand.py), swaying
// with your steps and lagging a little behind your view. It is drawn in its own
// pass over the world, so it never sinks into a wall you stand against. The beam comes out of its
// lens. Looks only: none of this is a game number.

const MODEL_URL = `${import.meta.env.BASE_URL}assets/held/held_torch.glb`;
/** Where the flashlight sits in front of your eye (right, down, forward). */
const HOLD = new THREE.Vector3(0.19, -0.23, -0.42);
/** Life size: the torch (tools/art/blender/build_torch.py) is 24.5 cm long, about 5 cm across the head. */
const HELD_SCALE = 1;
/** Turned in a little toward the middle of the view, and the lens tipped up a touch. */
const HOLD_YAW_RAD = 0.08;
const HOLD_PITCH_RAD = 0.04;
/** The model's lens faces +z, its body runs along z; it is turned to face forward (-z). */
const MODEL_TURN_RAD = Math.PI;
/** Walking: one sway cycle for every two steps of about this length. */
const STEP_M = 0.75;
const BOB_SIDE_M = 0.012;
const BOB_UP_M = 0.009;
/** Faster than walking makes the sway bigger, up to this many times. */
const BOB_MAX_SCALE = 1.7;
const WALK_SPEED_M_PER_SEC = 2.2;
/** How far the flashlight lags behind turning your view, and how fast it catches up. */
const LAG_RAD_PER_RAD = 0.25;
const LAG_MAX_RAD = 0.06;
const LAG_RETURN_PER_SEC = 10;
/** Its glass glows while it is on (bloom picks this up). */
const LENS_GLOW = 0xffe2b0;
const LENS_GLOW_INTENSITY = 3;
/**
 * Light from the beam bouncing back off what it hits, so you can see what you hold. It comes from
 * ahead and below, where the beam lands; beside the torch it made one hot spot on the polished metal.
 */
const BOUNCE_COLOR = 0xffe8c8;
const BOUNCE_INTENSITY = 0.35;
const BOUNCE_AT = new THREE.Vector3(0.12, -0.45, -1.1);
const BOUNCE_RANGE_M = 2;
/**
 * Polished metal shows only what it reflects, and the dark hotel gives it almost nothing, so the
 * torch reflects a soft, dim studio of its own (as games light what you hold), fading with the lamps.
 */
const STUDIO_INTENSITY = 0.25;
const STUDIO_BLUR = 0.04;
/**
 * The hand and sleeve take only a little of that studio, and are toned down and warmed toward the
 * hotel's lamps: the torch's cool fill, made for metal, turned skin into a bright grey rubber glove.
 */
const SKIN_STUDIO_SCALE = 0.25;
const SKIN_TINT = new THREE.Color(0.55, 0.47, 0.4);
const SKIN_MATERIALS = /^(skin|wool)/i;

export interface HeldState {
  /** Shown at all (not while working a task, holding up the camera, or as a Wisp). */
  visible: boolean;
  on: boolean;
  /** The beam's brightness now, 0 to 1 (it flickers near the ghost). */
  brightness: number;
  /** The world's dim light, so the flashlight is lit like everything around it. */
  ambient: number;
  /** The hotel's lamps, 1 lit to 0 in a blackout (dims the torch's reflections). */
  lamps: number;
}

export class HeldFlashlight {
  /** Drawn over the world (see post.ts). */
  readonly scene = new THREE.Scene();
  private root = new THREE.Group();
  private hold = new THREE.Group();
  private lens: THREE.MeshStandardMaterial[] = [];
  /** The lens in the model's own space, where the beam starts. */
  private lensLocal = new THREE.Vector3();
  private bounce = new THREE.PointLight(BOUNCE_COLOR, 0, BOUNCE_RANGE_M, 2);
  private ambient = new THREE.HemisphereLight(0xb8c0d0, 0x202020, 0);
  private phase = 0;
  private lastPos = new THREE.Vector3();
  private lastYaw = 0;
  private lastPitch = 0;
  private lagYaw = 0;
  private lagPitch = 0;
  private sway = new THREE.Vector3();

  private constructor() {
    this.scene.add(this.root, this.ambient);
    this.root.add(this.hold, this.bounce);
    this.bounce.position.copy(BOUNCE_AT);
  }

  /** Loads the model. Without it (a failed load) you still have the beam, just no flashlight drawn. */
  static async load(loaders: ModelLoaders, renderer: THREE.WebGLRenderer): Promise<HeldFlashlight> {
    const held = new HeldFlashlight();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    held.scene.environment = pmrem.fromScene(room, STUDIO_BLUR).texture;
    room.dispose();
    pmrem.dispose();
    try {
      const gltf = await loaders.gltf.loadAsync(MODEL_URL);
      held.setModel(gltf.scene);
    } catch (err) {
      console.error("The flashlight model failed to load, so only its beam shows", err);
    }
    return held;
  }

  private setModel(model: THREE.Object3D) {
    model.rotation.y = MODEL_TURN_RAD;
    model.scale.setScalar(HELD_SCALE);
    // Measured with the hold at rest, so the box is in the hold's own space.
    this.hold.add(model);
    this.hold.updateMatrixWorld(true);
    const lensBox = new THREE.Box3();
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.frustumCulled = false;
      const material = obj.material as THREE.MeshStandardMaterial;
      if (SKIN_MATERIALS.test(material.name)) {
        material.envMapIntensity = SKIN_STUDIO_SCALE;
        material.color.multiply(SKIN_TINT);
      }
      if (/glass/i.test(material.name)) {
        material.emissive = new THREE.Color(LENS_GLOW);
        this.lens.push(material);
        lensBox.union(new THREE.Box3().setFromObject(obj, true));
      }
    });
    if (!lensBox.isEmpty()) lensBox.getCenter(this.lensLocal);
    this.hold.rotation.set(HOLD_PITCH_RAD, HOLD_YAW_RAD, 0, "YXZ");
  }

  /**
   * Follows the camera with sway and lag, and returns where the beam starts, in the camera's
   * own space (for the spotlight attached to the camera).
   */
  update(dt: number, camera: THREE.Camera, state: HeldState, out: THREE.Vector3): THREE.Vector3 {
    const pos = camera.getWorldPosition(new THREE.Vector3());
    const speed = dt > 0 ? Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z) / dt : 0;
    this.lastPos.copy(pos);
    // A teleport (a respawn, the meeting) is not a step.
    const walking = speed < 20 ? speed : 0;
    this.phase += (walking / STEP_M) * Math.PI * dt;
    const scale = Math.min(walking / WALK_SPEED_M_PER_SEC, BOB_MAX_SCALE);
    this.sway.set(Math.sin(this.phase) * BOB_SIDE_M * scale, -Math.abs(Math.cos(this.phase)) * BOB_UP_M * scale, 0);

    const yaw = camera.rotation.y;
    const pitch = camera.rotation.x;
    const dYaw = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
    this.lagYaw = THREE.MathUtils.clamp(this.lagYaw - dYaw * LAG_RAD_PER_RAD, -LAG_MAX_RAD, LAG_MAX_RAD);
    this.lagPitch = THREE.MathUtils.clamp(this.lagPitch - (pitch - this.lastPitch) * LAG_RAD_PER_RAD, -LAG_MAX_RAD, LAG_MAX_RAD);
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const back = Math.exp(-LAG_RETURN_PER_SEC * dt);
    this.lagYaw *= back;
    this.lagPitch *= back;

    this.root.visible = state.visible;
    this.root.position.copy(pos);
    this.root.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
    this.hold.position.copy(HOLD).add(this.sway);
    this.hold.rotation.set(HOLD_PITCH_RAD + this.lagPitch, HOLD_YAW_RAD + this.lagYaw, 0, "YXZ");

    const glow = state.on ? state.brightness : 0;
    for (const m of this.lens) m.emissiveIntensity = LENS_GLOW_INTENSITY * glow;
    this.bounce.intensity = BOUNCE_INTENSITY * glow;
    this.ambient.intensity = state.ambient;
    this.scene.environmentIntensity = STUDIO_INTENSITY * state.lamps;

    this.hold.updateMatrix();
    return out.copy(this.lensLocal).applyMatrix4(this.hold.matrix);
  }
}
