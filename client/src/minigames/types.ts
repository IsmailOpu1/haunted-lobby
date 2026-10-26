// Shared pieces for task minigames (GDD Section 9). Each minigame draws on a 640 x 400 board;
// the overlay scales it to the screen and turns mouse positions into board units.

export const BOARD_W = 640;
export const BOARD_H = 400;

export interface Point {
  x: number;
  y: number;
}

export type TaskSoundKind =
  | "tick"
  | "click"
  | "strike"
  | "fizz"
  | "wrong"
  | "cry"
  | "note"
  | "badNote"
  | "scrape"
  | "splash"
  | "thud"
  | "spark"
  | "scare";

/** Sounds from a noisy task done badly (GDD 9). The ghost can hear these. */
export const NOISY_SOUNDS: ReadonlySet<TaskSoundKind> = new Set(["cry", "badNote"]);

export interface Minigame {
  /** One line telling the player what to do, shown under the board. */
  readonly hint: string;
  /** True once the task is finished. */
  readonly done: boolean;
  update(dt: number, time: number): void;
  draw(g: CanvasRenderingContext2D, time: number): void;
  pointerDown?(p: Point): void;
  pointerMove?(p: Point): void;
  pointerUp?(p: Point): void;
  key?(code: string): void;
}

/** Plays a minigame sound. pitch is a note number for the piano (0 is the lowest key). */
export type PlaySound = (kind: TaskSoundKind, pitch?: number) => void;

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Compass angle in degrees of `to` seen from `from` (0 is up, 90 is right). */
export function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
}

/** The short way round from one angle to another, in degrees (-180 to 180). */
export function angleDiff(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** A dark wooden backdrop with a soft vignette. */
export function drawBackdrop(g: CanvasRenderingContext2D, color = "#1c140e") {
  g.fillStyle = color;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.strokeStyle = "rgba(0, 0, 0, 0.25)";
  g.lineWidth = 1;
  for (let y = 12; y < BOARD_H; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(BOARD_W * 0.3, y + 4, BOARD_W * 0.6, y - 4, BOARD_W, y + 2);
    g.stroke();
  }
  const v = g.createRadialGradient(BOARD_W / 2, BOARD_H / 2, 80, BOARD_W / 2, BOARD_H / 2, BOARD_W * 0.62);
  v.addColorStop(0, "rgba(0, 0, 0, 0)");
  v.addColorStop(1, "rgba(0, 0, 0, 0.7)");
  g.fillStyle = v;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
}

/** A small flickering flame with its tip pointing up from (x, y). */
export function drawFlame(g: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, seed = 0) {
  const flick = 1 + 0.12 * Math.sin(time * 17 + seed * 3.1) + 0.08 * Math.sin(time * 29 + seed);
  const h = size * 2.2 * flick;
  const glow = g.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, size * 4);
  glow.addColorStop(0, "rgba(255, 190, 90, 0.35)");
  glow.addColorStop(1, "rgba(255, 150, 50, 0)");
  g.fillStyle = glow;
  g.fillRect(x - size * 4, y - h * 0.4 - size * 4, size * 8, size * 8);
  g.fillStyle = "#ffcf6a";
  g.beginPath();
  g.moveTo(x, y - h);
  g.quadraticCurveTo(x + size, y - h * 0.35, x, y);
  g.quadraticCurveTo(x - size, y - h * 0.35, x, y - h);
  g.fill();
  g.fillStyle = "#fff4cf";
  g.beginPath();
  g.ellipse(x, y - h * 0.3, size * 0.35, h * 0.25, 0, 0, Math.PI * 2);
  g.fill();
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type SymbolKind = "circle" | "ring" | "triangle" | "drop" | "square" | "diamond" | "cross" | "star";
export const SYMBOLS: SymbolKind[] = ["circle", "ring", "triangle", "drop", "square", "diamond", "cross", "star"];

/** Simple occult-looking symbols drawn as shapes, so they look the same on every computer. */
export function drawSymbol(g: CanvasRenderingContext2D, kind: SymbolKind, x: number, y: number, r: number) {
  g.beginPath();
  switch (kind) {
    case "circle":
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      return;
    case "ring":
      g.lineWidth = r * 0.35;
      g.arc(x, y, r * 0.8, 0, Math.PI * 2);
      g.stroke();
      return;
    case "triangle":
      g.moveTo(x, y - r);
      g.lineTo(x + r, y + r * 0.8);
      g.lineTo(x - r, y + r * 0.8);
      break;
    case "drop":
      g.moveTo(x, y + r);
      g.lineTo(x + r, y - r * 0.8);
      g.lineTo(x - r, y - r * 0.8);
      break;
    case "square":
      g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      break;
    case "diamond":
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.75, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r * 0.75, y);
      break;
    case "cross":
      g.rect(x - r * 0.25, y - r, r * 0.5, r * 2);
      g.rect(x - r, y - r * 0.25, r * 2, r * 0.5);
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const d = i % 2 === 0 ? r : r * 0.45;
        g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      break;
  }
  g.closePath();
  g.fill();
}
