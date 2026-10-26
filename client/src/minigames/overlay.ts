import type { MinigameKind } from "@haunted/shared";
import { Boiler } from "./boiler.ts";
import { Candelabra } from "./candelabra.ts";
import { Clock } from "./clock.ts";
import { Cradle } from "./cradle.ts";
import { Letter } from "./letter.ts";
import { Piano } from "./piano.ts";
import { Stove } from "./stove.ts";
import { BOARD_H, BOARD_W, NOISY_SOUNDS, type Minigame, type PlaySound, type Point } from "./types.ts";

const MAKERS: Record<MinigameKind, (play: PlaySound) => Minigame> = {
  candelabra: (play) => new Candelabra(play),
  stove: (play) => new Stove(play),
  clock: (play) => new Clock(play),
  letter: (play) => new Letter(play),
  cradle: (play) => new Cradle(play),
  piano: (play) => new Piano(play),
  boiler: (play) => new Boiler(play),
};

export interface OverlayEvents {
  /** The minigame is finished. */
  onFinish(): void;
  /** The player pressed Leave or Esc. */
  onLeave(): void;
  /** A noisy task went wrong (the baby cried, a wrong note): the server lets the ghost hear it. */
  onNoise(): void;
}

/**
 * The task minigame window. The mouse is released while it is open; the player stays still
 * (moving away cancels the task on the server).
 */
export class MinigameOverlay {
  private game: Minigame | null = null;
  private frame = 0;
  private last = 0;
  private time = 0;
  private g: CanvasRenderingContext2D;

  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
    private title: HTMLElement,
    private hint: HTMLElement,
    leave: HTMLButtonElement,
    private play: PlaySound,
    private events: OverlayEvents,
  ) {
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    this.g = canvas.getContext("2d")!;
    leave.addEventListener("click", () => this.leave());
    canvas.addEventListener("pointerdown", (e) => {
      // Keeps drags working when the mouse leaves the board. Can throw for an unknown pointer.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // The drag still works while the mouse stays on the board.
      }
      this.handle((g, p) => g.pointerDown?.(p), e);
    });
    canvas.addEventListener("pointermove", (e) => this.handle((g, p) => g.pointerMove?.(p), e));
    canvas.addEventListener("pointerup", (e) => this.handle((g, p) => g.pointerUp?.(p), e));
    window.addEventListener("keydown", (e) => {
      if (!this.game || e.repeat) return;
      if (e.code === "Escape") {
        e.preventDefault(); // so the page does not also treat it as "show the room panel"
        return this.leave();
      }
      if (e.code === "Space") e.preventDefault();
      this.game.key?.(e.code);
      this.checkDone();
    });
  }

  get isOpen(): boolean {
    return this.game !== null;
  }

  open(kind: MinigameKind, name: string) {
    this.game = MAKERS[kind]((sound, pitch) => {
      this.play(sound, pitch);
      if (NOISY_SOUNDS.has(sound)) this.events.onNoise();
    });
    this.title.textContent = name;
    this.hint.textContent = this.game.hint;
    this.root.classList.remove("hidden");
    this.time = 0;
    this.last = performance.now();
    cancelAnimationFrame(this.frame);
    const loop = (now: number) => {
      if (!this.game) return;
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.time += dt;
      this.game.update(dt, this.time);
      this.game.draw(this.g, this.time);
      this.frame = requestAnimationFrame(loop);
      this.checkDone();
    };
    this.frame = requestAnimationFrame(loop);
  }

  close() {
    this.game = null;
    cancelAnimationFrame(this.frame);
    this.root.classList.add("hidden");
  }

  private leave() {
    if (!this.game) return;
    this.close();
    this.events.onLeave();
  }

  private handle(fn: (game: Minigame, p: Point) => void, e: PointerEvent) {
    if (!this.game) return;
    const rect = this.canvas.getBoundingClientRect();
    const p = { x: ((e.clientX - rect.left) / rect.width) * BOARD_W, y: ((e.clientY - rect.top) / rect.height) * BOARD_H };
    fn(this.game, p);
    this.checkDone();
  }

  /** Checked after every event and every frame, since some minigames finish inside update. */
  private checkDone() {
    if (!this.game?.done) return;
    this.close();
    this.events.onFinish();
  }
}
