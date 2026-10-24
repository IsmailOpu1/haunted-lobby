// Keyboard and mouse for first-person play (GDD Section 6).
// Remapping comes with the accessibility options (Phase 8).

const MOUSE_SENSITIVITY = 0.0022; // radians per pixel; becomes a settings slider in Phase 8
const MAX_PITCH = Math.PI / 2 - 0.05;

export interface InputActions {
  onFlashlight(): void;
  /** E pressed (true) or released (false). */
  onUse(down: boolean): void;
  onToggleDebugLights(): void;
  onLookChange(looking: boolean): void;
  /** Any click or key press (browsers only start sound after one). */
  onUserGesture(): void;
}

export class PlayerInput {
  yaw = 0;
  pitch = 0;
  private keys = new Set<string>();
  private enabled = false;

  constructor(private canvas: HTMLCanvasElement, private actions: InputActions) {
    window.addEventListener("keydown", (e) => {
      actions.onUserGesture();
      this.keys.add(e.code);
      if (!this.looking || e.repeat) return;
      if (e.code === "KeyE") actions.onUse(true);
      if (e.code === "Digit1") actions.onFlashlight();
      if (e.code === "KeyL") actions.onToggleDebugLights();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyE") actions.onUse(false);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      actions.onUse(false);
    });

    canvas.addEventListener("mousedown", (e) => {
      actions.onUserGesture();
      if (!this.enabled || e.button !== 0) return;
      if (this.looking) actions.onFlashlight();
      else canvas.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
      if (!this.looking) {
        this.keys.clear();
        actions.onUse(false);
      }
      actions.onLookChange(this.looking);
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.looking) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });
  }

  /** Allows clicking the scene to capture the mouse (after joining a room). */
  enable() {
    this.enabled = true;
  }

  get looking(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** The movement keys held right now. Nothing counts while the mouse is not captured. */
  movement() {
    if (!this.looking) return { forward: 0, right: 0, run: false, crouch: false };
    const k = this.keys;
    return {
      forward: (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0),
      right: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
      crouch: k.has("KeyC"),
    };
  }
}
