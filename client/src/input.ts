// Keyboard and mouse for first-person play (GDD Section 6).
// Remapping comes with the accessibility options (Phase 8).

const MOUSE_SENSITIVITY = 0.0022; // radians per pixel; becomes a settings slider in Phase 8
const MAX_PITCH = Math.PI / 2 - 0.05;

export interface InputActions {
  onFlashlight(): void;
  /** Key 2: raise or lower the Spirit Camera. */
  onCameraToggle(raised: boolean): void;
  /** Click while the camera is raised. */
  onPhoto(): void;
  /** Key 3: pour a salt line. */
  onPourSalt(): void;
  /** E pressed (true) or released (false). */
  onUse(down: boolean): void;
  /** G: drop the relic you carry. */
  onDropRelic(): void;
  /** Tab held (true) or released (false): the status panel. */
  onStatusPanel(open: boolean): void;
  onToggleDebugLights(): void;
  /** K: send the ghost away or bring it back (debug servers only). */
  onToggleGhost(): void;
  onLookChange(looking: boolean): void;
  /** Any click or key press (browsers only start sound after one). */
  onUserGesture(): void;
  /** While working with your hands: the mouse button went down (true) or up (false). */
  onHand(down: boolean): void;
  /** While working with the button held: the mouse moved, in pixels. */
  onHandMove(dx: number, dy: number): void;
  /** While working: E, a movement key or Esc stops the work. */
  onStopWork(): void;
  /** R pressed (open), released (use) or the mouse let go (cancel): the possessed's power wheel (GDD 14.2). */
  onPowerWheel(state: "open" | "use" | "cancel"): void;
  /** While the power wheel is open: the mouse moved, in pixels. */
  onWheelMove(dx: number, dy: number): void;
}

/** Keys that walk: pressing one while working stops the work. */
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

export class PlayerInput {
  yaw = 0;
  pitch = 0;
  private keys = new Set<string>();
  private enabled = false;
  private cameraRaised = false;
  /**
   * Working with your hands (GDD 26.5): the mouse button is your hand instead of the
   * flashlight, holding it moves the mouse into the task, and you cannot walk.
   */
  working = false;
  /** The power wheel is open: the mouse picks a power instead of turning your head. */
  wheelOpen = false;
  private handDown = false;

  constructor(private canvas: HTMLCanvasElement, private actions: InputActions) {
    window.addEventListener("keydown", (e) => {
      actions.onUserGesture();
      this.keys.add(e.code);
      // Tab would otherwise move focus to the room panel's buttons.
      if (e.code === "Tab" && this.looking) e.preventDefault();
      if (!this.looking || e.repeat) return;
      if (e.code === "Tab") actions.onStatusPanel(true);
      if (this.working) {
        if (e.code === "KeyE" || MOVE_KEYS.has(e.code)) actions.onStopWork();
        if (e.code === "Digit1") actions.onFlashlight();
        return;
      }
      if (e.code === "KeyR") actions.onPowerWheel("open");
      if (e.code === "KeyG") actions.onDropRelic();
      if (e.code === "KeyE") actions.onUse(true);
      if (e.code === "Digit1") actions.onFlashlight();
      if (e.code === "Digit2") {
        this.cameraRaised = !this.cameraRaised;
        actions.onCameraToggle(this.cameraRaised);
      }
      if (e.code === "Digit3") actions.onPourSalt();
      if (e.code === "KeyL") actions.onToggleDebugLights();
      if (e.code === "KeyK") actions.onToggleGhost();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyE") actions.onUse(false);
      if (e.code === "Tab") actions.onStatusPanel(false);
      if (e.code === "KeyR" && this.wheelOpen) actions.onPowerWheel("use");
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      if (this.wheelOpen) actions.onPowerWheel("cancel");
      actions.onUse(false);
      actions.onStatusPanel(false);
    });

    canvas.addEventListener("mousedown", (e) => {
      actions.onUserGesture();
      if (!this.enabled || e.button !== 0) return;
      if (this.looking && this.working) {
        this.handDown = true;
        actions.onHand(true);
      } else if (this.looking) {
        // With the camera raised, a click takes the photo; otherwise it toggles the flashlight.
        if (this.cameraRaised) {
          actions.onPhoto();
          this.cameraRaised = false;
          actions.onCameraToggle(false);
        } else {
          actions.onFlashlight();
        }
      } else {
        // Browsers can refuse (for example right after Esc); the player just clicks again.
        Promise.resolve(canvas.requestPointerLock()).catch(() => {});
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button !== 0 || !this.handDown) return;
      this.handDown = false;
      actions.onHand(false);
    });

    document.addEventListener("pointerlockchange", () => {
      if (!this.looking) {
        if (this.handDown) {
          this.handDown = false;
          actions.onHand(false);
        }
        if (this.working) actions.onStopWork();
        this.keys.clear();
        actions.onUse(false);
        if (this.wheelOpen) actions.onPowerWheel("cancel");
        if (this.cameraRaised) {
          this.cameraRaised = false;
          actions.onCameraToggle(false);
        }
      }
      actions.onLookChange(this.looking);
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.looking) return;
      if (this.working && this.handDown) {
        actions.onHandMove(e.movementX, e.movementY);
        return;
      }
      if (this.wheelOpen) {
        actions.onWheelMove(e.movementX, e.movementY);
        return;
      }
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
    if (!this.looking || this.working) return { forward: 0, right: 0, run: false, crouch: false };
    const k = this.keys;
    return {
      forward: (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0),
      right: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
      crouch: k.has("KeyC"),
    };
  }
}
