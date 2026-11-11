// Makes a recoloured copy of a downloaded texture set: the colour map multiplied by a tint, the
// other maps copied as they are. The copy is a texture of its own in assets-src/textures. With
// "turn" the copy is also turned a quarter (upright tiles laid on their sides), the normal map's
// directions turned with it; with "sat=<n>" its colour is that much as saturated (before the tint,
// which may go up to 3 to lighten); with "grid=<columns>x<rows>" that many copies are laid side by
// side and squeezed into one square map (a cloth scanned taller than wide becomes square, so the
// room builder can tile it evenly); with "contrast=<n>" its light and dark are pulled that many
// times further apart round their average (a faint woven pattern made to read from across a room).
//
//   npx tsx tools/art/tint-texture.ts <source> <new name> <r> <g> <b> [turn] [sat=<n>]
//   npx tsx tools/art/tint-texture.ts velour_velvet velour_velvet_wine 0.75 0.5 0.52
//   npx tsx tools/art/tint-texture.ts long_white_tiles long_white_tiles_laid 1 0.97 0.9 turn
//   npx tsx tools/art/tint-texture.ts dark_wood scrubbed_wood 2.45 2.8 2.35 sat=0.3
//   npx tsx tools/art/tint-texture.ts floral_jacquard damask_gold 2.3 1.85 1.1 grid=3x2 contrast=1.8
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [source, name, r, g, b, ...options] = process.argv.slice(2);
const tint = [r, g, b].map(Number);
const turn = options.includes("turn");
const satOption = options.find((o) => o.startsWith("sat="));
const saturation = satOption ? Number(satOption.slice(4)) : 1;
const gridOption = options.find((o) => o.startsWith("grid="));
const contrastOption = options.find((o) => o.startsWith("contrast="));
const contrast = contrastOption ? Number(contrastOption.slice(9)) : 1;
const [columns, rows] = gridOption ? gridOption.slice(5).split("x").map(Number) : [1, 1];
const known = options.every((o) => o === "turn" || o.startsWith("sat=") || o.startsWith("grid=") || o.startsWith("contrast="));
if (!(contrast >= 1 && contrast <= 4)) throw new Error("contrast=<n>, 1 to 4");
if (!(columns! >= 1 && rows! >= 1)) throw new Error("grid=<columns>x<rows>, each 1 or more");
if (!source || !name || tint.some((v) => !(v >= 0 && v <= 3)) || !known || !(saturation >= 0 && saturation <= 1)) {
  throw new Error("usage: tint-texture.ts <source> <new name> <r> <g> <b> [turn] [sat=<n>] (tint 0 to 3, sat 0 to 1)");
}
const root = join(import.meta.dirname, "../../assets-src/textures");
const from = join(root, source);
const to = join(root, name);
if (!existsSync(from)) throw new Error(`no texture ${from}`);
mkdirSync(to, { recursive: true });

/** The map laid out columns by rows and squeezed back to a square of its own width. */
async function gridded(src: string): Promise<Buffer> {
  const { width, height } = await sharp(src).metadata();
  if (columns === 1 && rows === 1) return sharp(src).toBuffer();
  const tile = await sharp(src).toBuffer();
  const composite = [];
  for (let r = 0; r < rows!; r++) for (let c = 0; c < columns!; c++) composite.push({ input: tile, left: c * width!, top: r * height! });
  const big = await sharp({ create: { width: width! * columns!, height: height! * rows!, channels: 3, background: "#000" } }).composite(composite).png().toBuffer();
  return sharp(big).resize(width!, width!, { fit: "fill" }).png().toBuffer();
}

for (const file of readdirSync(from)) {
  const src = join(from, file);
  const out = join(to, file.replace(source, name));
  if (file.includes("_diff_")) {
    // One linear step (sharp keeps only the last): contrast round each channel's mean, then the tint.
    const map = await sharp(await gridded(src)).rotate(turn ? 90 : 0).modulate({ saturation }).png().toBuffer();
    const mean = (await sharp(map).stats()).channels.slice(0, 3).map((c) => c.mean);
    await sharp(map).linear(tint.map((t) => t * contrast), tint.map((t, i) => t * mean[i]! * (1 - contrast))).jpeg({ quality: 95 }).toFile(out);
  } else if (turn && file.includes("_nor_gl_")) {
    // Turned a quarter clockwise, what pointed up now points right and what pointed right points
    // down: the new red is the old green, the new green the old red flipped.
    const { data, info } = await sharp(await gridded(src)).rotate(90).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 3) {
      const red = data[i]!;
      data[i] = data[i + 1]!;
      data[i + 1] = 255 - red;
    }
    await sharp(data, { raw: info }).jpeg({ quality: 95 }).toFile(out);
  } else if (turn || gridOption) {
    await sharp(await gridded(src)).rotate(turn ? 90 : 0).jpeg({ quality: 95 }).toFile(out);
  } else {
    copyFileSync(src, out);
  }
  console.log(out);
}
