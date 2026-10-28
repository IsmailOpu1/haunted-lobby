// A developed Spirit Camera photo, drawn from what the server says was in the frame (GDD 15.2).

import { clockTime, type DevelopedPhoto } from "@haunted/shared";

// Look of the print. Visual tuning only.
const W = 280;
const H = 180;
const HORIZON = H * 0.6;
const FIGURE_H = 110;
/** A figure this far away is drawn at full size; nearer is bigger, farther smaller. */
const FULL_SIZE_M = 2.5;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.3;
const GRAIN_DOTS = 900;
const FIGURE_COLOR = "#17120d";
const DEMON_EYES = "#ff2a1a";
const LABEL_COLOR = "#d8cfbf";

type Figure = { kind: "player"; name: string; demon: boolean; frameX: number; dist: number } | { kind: "ghost"; frameX: number; dist: number };

/** A photo card: the print and who took it when. */
export function photoCard(photo: DevelopedPhoto): HTMLElement {
  const card = document.createElement("figure");
  card.className = "photo";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  drawPhoto(canvas.getContext("2d")!, photo);
  const caption = document.createElement("figcaption");
  caption.textContent = `${photo.by}'s photo, ${clockTime(photo.nightTime)}${photo.subjects.length || photo.ghost ? "" : " (nobody in it)"}`;
  card.append(canvas, caption);
  return card;
}

function drawPhoto(g: CanvasRenderingContext2D, photo: DevelopedPhoto) {
  // A dim sepia room.
  const bg = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, "#4a3b2a");
  bg.addColorStop(1, "#0d0a07");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(0, HORIZON, W, H - HORIZON);

  const figures: Figure[] = photo.subjects.map((s) => ({ kind: "player" as const, ...s }));
  if (photo.ghost) figures.push({ kind: "ghost", ...photo.ghost });
  // Far ones first, so near ones stand in front.
  figures.sort((a, b) => b.dist - a.dist);
  for (const f of figures) {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, FULL_SIZE_M / f.dist));
    const x = ((f.frameX + 1) / 2) * W;
    const feet = HORIZON + 40 * s;
    if (f.kind === "ghost") drawGhost(g, x, feet, s);
    else drawPerson(g, x, feet, s, f.demon, f.name);
  }

  // Film grain, the same for the same photo.
  let seed = Math.floor(photo.nightTime * 1000) + photo.by.length;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < GRAIN_DOTS; i++) {
    g.fillStyle = rand() < 0.5 ? "rgba(255, 240, 210, 0.06)" : "rgba(0, 0, 0, 0.12)";
    g.fillRect(rand() * W, rand() * H, 1, 1);
  }
  const vignette = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.65);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.75)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
}

function drawPerson(g: CanvasRenderingContext2D, x: number, feet: number, s: number, demon: boolean, name: string) {
  const h = FIGURE_H * s;
  const headR = 12 * s;
  const headY = feet - h + headR;
  g.fillStyle = FIGURE_COLOR;
  // Shoulders and body.
  g.beginPath();
  g.moveTo(x - 20 * s, feet);
  g.lineTo(x - 22 * s, headY + headR + 14 * s);
  g.quadraticCurveTo(x, headY + headR - 2 * s, x + 22 * s, headY + headR + 14 * s);
  g.lineTo(x + 20 * s, feet);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(x, headY, headR, 0, Math.PI * 2);
  g.fill();

  if (demon) {
    // Horns, glowing slanted eyes and a jagged grin.
    g.beginPath();
    for (const side of [-1, 1]) {
      g.moveTo(x + side * headR * 0.5, headY - headR * 0.7);
      g.lineTo(x + side * headR * 1.1, headY - headR * 1.9);
      g.lineTo(x + side * headR * 0.9, headY - headR * 0.4);
    }
    g.fill();
    g.save();
    g.shadowColor = DEMON_EYES;
    g.shadowBlur = 8 * s;
    g.fillStyle = DEMON_EYES;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + side * headR * 0.15, headY - headR * 0.05);
      g.lineTo(x + side * headR * 0.7, headY - headR * 0.35);
      g.lineTo(x + side * headR * 0.6, headY + headR * 0.1);
      g.closePath();
      g.fill();
    }
    g.beginPath();
    const teeth = 5;
    g.moveTo(x - headR * 0.6, headY + headR * 0.4);
    for (let i = 1; i <= teeth * 2; i++) {
      g.lineTo(x - headR * 0.6 + (i * headR * 1.2) / (teeth * 2), headY + headR * (i % 2 ? 0.7 : 0.4));
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  g.fillStyle = LABEL_COLOR;
  g.font = `${Math.round(9 + 3 * s)}px sans-serif`;
  g.textAlign = "center";
  const labelX = Math.max(24, Math.min(W - 24, x));
  g.fillText(name, labelX, Math.min(H - 6, feet + 12));
}

function drawGhost(g: CanvasRenderingContext2D, x: number, feet: number, s: number) {
  const h = FIGURE_H * 1.1 * s;
  g.save();
  g.globalAlpha = 0.55;
  g.shadowColor = "#e8e4da";
  g.shadowBlur = 16 * s;
  g.fillStyle = "#cfc9bc";
  g.beginPath();
  g.ellipse(x, feet - h / 2, 16 * s, h / 2, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Hollow eyes.
  g.fillStyle = "#000";
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + side * 5 * s, feet - h + 18 * s, 2.5 * s, 4 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
}
