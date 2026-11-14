// Keyboard and mouse for first-person play (GDD Section 6). Keys are remappable (keys.ts, GDD 23).
import { KEY_ACTIONS, keys, type KeyAction } from "./keys.ts";

/**
 * Mouse sensitivity uses the standard scale of Counter-Strike and other Source games: each count
 * of the mouse turns the view 0.022 degrees times the sensitivity, so a player can bring the number
 * they use elsewhere (Valorant's number times 3.18). 2.5 is Counter-Strike's default.
 */
const DEG_PER_COUNT_PER_SENSITIVITY = 0.022;
export const SENSITIVITY_MIN = 0.1;
export const SENSITIVITY_MAX = 10;
export const DEFAULT_SENSITIVITY = 2.5;
const MAX_PITCH = Math.PI / 2 - 0.05;
/**
 * The browser sometimes reports a huge jump for one mouse event (a known Chrome bug with a locked
 * pointer); a real hand never moves the mouse this many counts between two events.
 */
const MAX_COUNTS_PER_EVENT = 400;

/**
 * Captures the mouse for looking around, with raw movement like other games: without it, Windows'
 * "Enhance pointer precision" makes slow moves crawl and stutter and fast ones fly (owner,
 * 2026-11-11). Browsers that cannot give raw movement get the ordinary kind.
 */
export function lockPointer(canvas: HTMLCanvasElement) {
  const ordinary = () => Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  try {
    Promise.resolve(canvas.requestPointerLock({ unadjustedMovement: true })).catch((err: unknown) => {
      // Not supported here: fall back. Any other refusal (for example right after Esc): click again.
      if (err instanceof DOMException && err.name === "NotSupportedError") void ordinary();
    });
  } catch {
    void ordinary();
  }
}

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
  /** B: open the basement now, without the relics (debug servers only). */
  onOpenBasement(): void;
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
  /** Space (up, 1) or C (down, -1): a Wisp floats to another floor (GDD 17). */
  onFloorKey(dir: 1 | -1): void;
}

/** Keys that walk: pressing one while working stops the work. */
const MOVE_ACTIONS: readonly KeyAction[] = ["forward", "back", "left", "right"];

export class PlayerInput {
  yaw = 0;
  pitch = 0;
  /** The Options slider, SENSITIVITY_MIN to SENSITIVITY_MAX. */
  sensitivity = DEFAULT_SENSITIVITY;
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
      const is = (action: KeyAction) => keys.is(e.code, action);
      // Tab, Space and the like would otherwise move focus or scroll while you play.
      if (this.looking && e.code !== "Escape" && KEY_ACTIONS.some(({ action }) => is(action))) e.preventDefault();
      if (!this.looking || e.repeat) return;
      if (is("status")) actions.onStatusPanel(true);
      if (this.working) {
        if (is("use") || MOVE_ACTIONS.some(is)) actions.onStopWork();
        if (is("flashlight")) actions.onFlashlight();
        return;
      }
      if (is("powers")) actions.onPowerWheel("open");
      if (is("floatUp")) actions.onFloorKey(1);
      if (is("crouch")) actions.onFloorKey(-1);
      if (is("drop")) actions.onDropRelic();
      if (is("use")) actions.onUse(true);
      if (is("flashlight")) actions.onFlashlight();
      if (is("camera")) {
        this.cameraRaised = !this.cameraRaised;
        actions.onCameraToggle(this.cameraRaised);
      }
      if (is("salt")) actions.onPourSalt();
      if (e.code === "KeyL") actions.onToggleDebugLights();
      if (e.code === "KeyK") actions.onToggleGhost();
      if (e.code === "KeyB") actions.onOpenBasement();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (keys.is(e.code, "use")) actions.onUse(false);
      if (keys.is(e.code, "status")) actions.onStatusPanel(false);
      if (keys.is(e.code, "powers") && this.wheelOpen) actions.onPowerWheel("use");
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
        lockPointer(canvas);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button !== 0 || !this.handDown) return;
      this.handDown = false;
      actions.onHand(false);
    });

    document.addEventListener("pointerlockchange", () => {
      // Chrome can leave the arrow drawn while the mouse is captured for raw movement; hide it
      // ourselves while you look around (owner, 2026-11-11).
      document.documentElement.classList.toggle("looking", this.looking);
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
      if (Math.abs(e.movementX) > MAX_COUNTS_PER_EVENT || Math.abs(e.movementY) > MAX_COUNTS_PER_EVENT) return;
      const turn = ((this.sensitivity * DEG_PER_COUNT_PER_SENSITIVITY) * Math.PI) / 180;
      this.yaw -= e.movementX * turn;
      this.pitch -= e.movementY * turn;
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
    const held = (action: KeyAction) => [...this.keys].some((code) => keys.is(code, action));
    return {
      forward: (held("forward") ? 1 : 0) - (held("back") ? 1 : 0),
      right: (held("right") ? 1 : 0) - (held("left") ? 1 : 0),
      run: held("run"),
      crouch: held("crouch"),
    };
  }
}
