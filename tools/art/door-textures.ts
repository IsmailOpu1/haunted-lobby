// Makes the doors' own surfaces (tools/art/blender/build_doors.py) from the downloaded CC0 textures
// in assets-src/textures: rusted iron and stained brass for the hardware, chipped paint over wood,
// dark walnut, aged oak and a red-stained pine. Each is written as a texture folder of its own
// (diff + rough; the normal map is the source's), so the door builder uses them like any other.
// The same inputs always make the same pictures.
//
//   npx tsx tools/art/door-textures.ts
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const TEX = join(import.meta.dirname, "../../assets-src/textures");
const SIZE = 2048;

interface Image {
  data: Buffer;
  channels: number;
}

async function load(name: string, kind: string): Promise<Image> {
  const { data, info } = await sharp(join(TEX, name, `${name}_${kind}_2k.jpg`)).resize(SIZE, SIZE).raw().toBuffer({ resolveWithObject: true });
  return { data, channels: info.channels };
}

/** Tileable fractal value noise in 0..1 (wraps at the edges, like the textures it is laid over). */
function noise(seed: number, cells: number, octaves: number): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lattice = new Float32Array(n * n);
    let s = (seed * 7919 + o * 104729) >>> 0;
    for (let i = 0; i < lattice.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      lattice[i] = s / 4294967296;
    }
    for (let y = 0; y < SIZE; y++) {
      const fy = (y / SIZE) * n;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      const r0 = (y0 % n) * n;
      const r1 = ((y0 + 1) % n) * n;
      for (let x = 0; x < SIZE; x++) {
        const fx = (x / SIZE) * n;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const c0 = x0 % n;
        const c1 = (x0 + 1) % n;
        const a = lattice[r0 + c0]! + (lattice[r0 + c1]! - lattice[r0 + c0]!) * tx;
        const b = lattice[r1 + c0]! + (lattice[r1 + c1]! - lattice[r1 + c0]!) * tx;
        out[y * SIZE + x]! += (a + (b - a) * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * size: the pictures' width in pixels. Hardware is small and tiles every 30 cm, so 1K is already
 * finer than the wood's 2K over 1.2 m.
 */
async function write(name: string, diff: Buffer, rough: Buffer, normalFrom: string, size = SIZE) {
  const folder = join(TEX, name);
  mkdirSync(folder, { recursive: true });
  await sharp(diff, { raw: { width: SIZE, height: SIZE, channels: 3 } }).resize(size, size).jpeg({ quality: 95 }).toFile(join(folder, `${name}_diff_2k.jpg`));
  await sharp(rough, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(size, size).jpeg({ quality: 95 }).toFile(join(folder, `${name}_rough_2k.jpg`));
  const normal = join(TEX, normalFrom, `${normalFrom}_nor_gl_2k.jpg`);
  if (size === SIZE) copyFileSync(normal, join(folder, `${name}_nor_gl_2k.jpg`));
  else await sharp(normal).resize(size, size).jpeg({ quality: 95 }).toFile(join(folder, `${name}_nor_gl_2k.jpg`));
  console.log(`Wrote ${name}`);
}

/** How rusty each pixel of the rusty metal is (0 bare paint, 1 thick rust): orange is red over blue. */
function rustMask(src: Image): Float32Array {
  const m = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < m.length; i++) {
    const r = src.data[i * src.channels]!;
    const b = src.data[i * src.channels + 2]!;
    m[i] = clamp((r - b - 30) / 110);
  }
  return m;
}

/** Hinges, straps and studs: black iron gone to rust, the rust where the metal photo has it. */
async function rustIron(metal: Image, metalRough: Image, mask: Float32Array) {
  const grime = noise(3, 6, 4);
  const diff = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < mask.length; i++) {
    const m = Math.pow(mask[i]!, 1.3) * 0.85;
    const g = 0.75 + grime[i]! * 0.5;
    const r = metal.data[i * metal.channels]!;
    const gg = metal.data[i * metal.channels + 1]!;
    const b = metal.data[i * metal.channels + 2]!;
    diff[i * 3] = clamp(mix(30 * g, r * 0.45, m), 0, 255);
    diff[i * 3 + 1] = clamp(mix(27 * g, gg * 0.28, m), 0, 255);
    diff[i * 3 + 2] = clamp(mix(25 * g, b * 0.16, m), 0, 255);
    rough[i] = clamp(mix(150, 235, m) + (metalRough.data[i * metalRough.channels]! - 128) * 0.2, 0, 255);
  }
  await write("door_rust_iron", diff, rough, "rusty_metal_02", 1024);
}

/** Old brass: dull, darkened in patches, with rust run onto it from the iron around it. */
async function oldBrass(mask: Float32Array) {
  const tarnish = noise(11, 5, 5);
  const diff = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < mask.length; i++) {
    const t = clamp((tarnish[i]! - 0.35) * 2.2);
    const m = Math.pow(mask[i]!, 2) * 0.45;
    diff[i * 3] = mix(mix(168, 82, t), 120, m);
    diff[i * 3 + 1] = mix(mix(128, 64, t), 62, m);
    diff[i * 3 + 2] = mix(mix(62, 34, t), 26, m);
    rough[i] = clamp(mix(95, 170, t) + m * 70, 0, 255);
  }
  await write("door_old_brass", diff, rough, "rusty_metal_02", 1024);
}

/** Paint over wood: worn through in chips, darker with grime in patches. */
async function paint(name: string, rgb: [number, number, number], wood: Image, seed: number, edge: number) {
  const chips = noise(seed, 24, 5);
  const blotch = noise(seed + 1, 4, 4);
  const diff = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < chips.length; i++) {
    // Chipped where the fine noise is high: a hard edge, with a darker rim of lifted paint.
    const c = chips[i]!;
    const bare = clamp((c - edge) * 40);
    const rim = clamp(1 - Math.abs(c - edge + 0.012) * 60) * (1 - bare);
    // The grain shows faintly through the paint.
    const grain = (wood.data[i * wood.channels]! + wood.data[i * wood.channels + 1]!) / 2 / 110;
    const shade = (0.82 + blotch[i]! * 0.3) * (1 - rim * 0.35) * (0.9 + clamp(grain, 0, 2) * 0.1);
    for (let k = 0; k < 3; k++) {
      const w = wood.data[i * wood.channels + k]! * 0.5;
      diff[i * 3 + k] = clamp(mix(rgb[k]! * shade, w, bare), 0, 255);
    }
    rough[i] = mix(130 + blotch[i]! * 50, 215, bare);
  }
  await write(name, diff, rough, "dark_wood");
}

/** A wood darkened and tinted (walnut from mahogany, oak from scrubbed pine, the relic door's stain). */
async function stain(name: string, from: string, mul: [number, number, number], roughAdd: number) {
  const wood = await load(from, "diff");
  const woodRough = await load(from, "rough");
  const diff = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE);
  const wear = noise(23, 5, 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const w = 0.85 + wear[i]! * 0.3;
    for (let k = 0; k < 3; k++) diff[i * 3 + k] = clamp(wood.data[i * wood.channels + k]! * mul[k]! * w, 0, 255);
    rough[i] = clamp(woodRough.data[i * woodRough.channels]! + roughAdd, 0, 255);
  }
  await write(name, diff, rough, from);
}

const metal = await load("rusty_metal_02", "diff");
const metalRough = await load("rusty_metal_02", "rough");
const mask = rustMask(metal);
await rustIron(metal, metalRough, mask);
await oldBrass(mask);
const wood = await load("dark_wood", "diff");
await paint("door_paint_green", [36, 56, 42], wood, 31, 0.67);
await paint("door_paint_ivory", [190, 178, 150], wood, 37, 0.74);
await paint("door_paint_blue", [66, 84, 98], wood, 41, 0.72);
await paint("door_paint_brown", [86, 62, 44], wood, 43, 0.65);
await paint("door_paint_rose", [136, 98, 94], wood, 47, 0.73);
await paint("door_paint_charcoal", [28, 30, 29], wood, 53, 0.66);
await stain("door_walnut", "dark_wood", [0.52, 0.42, 0.36], 10);
await stain("door_oak", "scrubbed_wood", [0.55, 0.42, 0.28], 20);
await stain("door_relic_pine", "rough_pine_door", [0.78, 0.36, 0.3], 10);
