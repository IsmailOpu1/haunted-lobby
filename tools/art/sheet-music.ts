// Draws a page of printed sheet music (aged paper, staves, notes, a title) as a texture of its own in
// assets-src/textures/sheet_music, for the pages scattered on the Ballroom floor. Drawn, not
// downloaded, so it needs no licence. The same seed always draws the same page.
//
//   npx tsx tools/art/sheet-music.ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const W = 1024;
const H = 1344; // a page about 22 by 29 cm
const out = join(import.meta.dirname, "../../assets-src/textures/sheet_music");
mkdirSync(out, { recursive: true });

let state = 7;
const rnd = () => {
  state = (state * 1103515245 + 12345) % 2147483648;
  return state / 2147483648;
};

const ink = "#241d18";
const parts: string[] = [];
parts.push(`<text x="${W / 2}" y="120" font-family="Georgia, serif" font-size="54" font-style="italic" text-anchor="middle" fill="${ink}">Valse des Ombres</text>`);
parts.push(`<text x="${W - 90}" y="175" font-family="Georgia, serif" font-size="26" text-anchor="end" fill="${ink}">Op. 13</text>`);
const left = 80;
const right = W - 80;
const gap = 13; // between staff lines
for (let s = 0; s < 9; s++) {
  const top = 230 + s * 122;
  for (let l = 0; l < 5; l++) parts.push(`<line x1="${left}" y1="${top + l * gap}" x2="${right}" y2="${top + l * gap}" stroke="${ink}" stroke-width="2"/>`);
  // Bar lines, and a clef-like curl at the start of each staff.
  for (const x of [left, left + 230, left + 450, left + 670, right]) parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + 4 * gap}" stroke="${ink}" stroke-width="${x === right && s === 8 ? 6 : 2}"/>`);
  parts.push(`<path d="M${left + 22} ${top + 62} C ${left + 4} ${top + 30}, ${left + 44} ${top - 6}, ${left + 30} ${top + 28} S ${left + 10} ${top + 44}, ${left + 30} ${top + 46}" stroke="${ink}" stroke-width="4" fill="none"/>`);
  // Notes: heads on lines and spaces, stems up or down, ledger lines under the staff.
  for (let x = left + 70; x < right - 20; x += 36 + rnd() * 20) {
    const step = Math.floor(rnd() * 9) - 1;
    const y = top + 4 * gap - step * (gap / 2);
    const up = step < 4;
    const filled = rnd() > 0.2;
    parts.push(`<ellipse cx="${x}" cy="${y}" rx="8.5" ry="6" transform="rotate(-20 ${x} ${y})" fill="${filled ? ink : "none"}" stroke="${ink}" stroke-width="2.5"/>`);
    const sx = up ? x + 7.5 : x - 7.5;
    parts.push(`<line x1="${sx}" y1="${y}" x2="${sx}" y2="${up ? y - 46 : y + 46}" stroke="${ink}" stroke-width="2.5"/>`);
    if (step < 0) parts.push(`<line x1="${x - 14}" y1="${top + 5 * gap}" x2="${x + 14}" y2="${top + 5 * gap}" stroke="${ink}" stroke-width="2"/>`);
  }
}
parts.push(`<text x="${W / 2}" y="${H - 50}" font-family="Georgia, serif" font-size="24" text-anchor="middle" fill="${ink}">— 3 —</text>`);

// Aged paper: warm, darker toward the edges, with a few faint foxing spots.
const spots = Array.from({ length: 26 }, () => `<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${3 + rnd() * 14}" fill="#7a5a33" opacity="${0.05 + rnd() * 0.1}"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><radialGradient id="age" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#e3d6b8"/><stop offset="100%" stop-color="#b9a47a"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#age)"/>${spots}
<g opacity="0.88">${parts.join("")}</g></svg>`;

await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(join(out, "sheet_music_diff_2k.jpg"));
// Paper is matt.
await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 225, g: 225, b: 225 } } }).jpeg({ quality: 92 }).toFile(join(out, "sheet_music_rough_2k.jpg"));
console.log("wrote", out);
