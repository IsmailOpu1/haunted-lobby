// Makes the built rooms' textures only as big as they need to be (owner, 2026-11-14, "Plan B"):
//  - a texture sharper than you could ever see, standing as close as you can, gets smaller
//    (texture-needs.ts works out the size from the surfaces it covers);
//  - shine maps (metallic/roughness) are half the size of the room's other textures: they only
//    set how glossy a surface is, and their detail is blurred away at most distances.
// Each texture is re-made from its source picture (assets-src/build/<room>-clean.glb), not from the
// compressed one, with the same encoder settings as the room build (UASTC level 2, zstd 18), for
// both sets (textures/ for High, textures-1k/ for Low). Rooms are then pointed at the new files and
// files nothing uses any more are deleted. build-room.ts runs it after building; re-running only
// redoes what changed (assets-src/build/texture-fits.json remembers what was made).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Document, NodeIO, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getTextureChannelMask, getTextureColorSpace, listTextureSlots } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { texturePx } from "./texture-needs.ts";
import { roomFiles } from "./roomFiles.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const ASSETS = join(ROOT, "client/public/assets");
const ROOMS = join(ASSETS, "rooms");
const HIGH = join(ASSETS, "textures");
const LOW = join(ASSETS, "textures-1k");
const WORK = join(ROOT, "assets-src/build");
const FITS = join(WORK, "texture-fits.json");
const KTX = process.env.KTX ?? "C:/Program Files/KTX-Software/bin/ktx.exe";
/** The sets' largest sizes (build-room.ts: --texture-size 2048 and LOW_TEXTURE_PX). */
const HIGH_PX = 2048;
const LOW_PX = 1024;
/** Encoder threads: the CPU stays cool (owner, 2026-11-10). */
const THREADS = 2;
/** Shine maps are this much smaller than the room's other textures. */
const SHINE_SHARE = 0.5;
/** A texture that would shrink by less than this share keeps its size. */
const KEEP_ABOVE = 0.75;
/** Bump this when the rules change, so everything is re-made. */
const RULES = 1;

interface Fit {
  /** The new file's name (in both sets). */
  name: string;
  high: number;
  low: number;
  rules: number;
}

const slug = (room: string) => room.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fileHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 20);
const longest = (t: Texture) => Math.max(...(t.getSize() ?? [0, 0]));

/** The longest side a texture should have in each set: what it needs, shine maps at half, never more than built. */
function targets(texture: Texture): { high: number; low: number; highBuilt: number; lowBuilt: number } {
  const source = longest(texture);
  const highBuilt = Math.min(source, HIGH_PX);
  const lowBuilt = Math.min(source, LOW_PX);
  const shine = listTextureSlots(texture).some((s) => s.includes("metallicRoughness"));
  const need = texturePx(texture);
  // A small trim (2088 → 2048) isn't worth resampling the picture for.
  const fit = (built: number) => {
    const px = Math.min(built, need, shine ? built * SHINE_SHARE : Infinity);
    return px > built * KEEP_ABOVE ? built : px;
  };
  return { high: fit(highBuilt), low: fit(lowBuilt), highBuilt, lowBuilt };
}

/** The ktx encoder's settings for this texture, as gltf-transform's uastc command sets them, with 2 threads. */
function ktxParams(texture: Texture): string[] {
  const slots = listTextureSlots(texture);
  const channels = getTextureChannelMask(texture);
  const colorSpace = getTextureColorSpace(texture);
  const R = 0x1000;
  const G = 0x0100;
  const A = 0x0001;
  const params = ["create", "--generate-mipmap", "--encode", "uastc", "--uastc-quality", "2", "--zstd", "18"];
  if (colorSpace === "srgb") params.push("--assign-tf", "srgb", "--assign-primaries", "bt709");
  else if (colorSpace === "srgb-linear") params.push("--assign-tf", "linear", "--assign-primaries", "bt709");
  else if (slots.length && !colorSpace) params.push("--assign-tf", "linear", "--assign-primaries", "none");
  if (channels === R) params.push("--format", "R8_UNORM");
  else if (channels === G || channels === (R | G)) params.push("--format", "R8G8_UNORM");
  else if (!(channels & A)) params.push("--format", colorSpace === "srgb" ? "R8G8B8_SRGB" : "R8G8B8_UNORM");
  else params.push("--format", colorSpace === "srgb" ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM");
  params.push("--threads", String(THREADS));
  return params;
}

/** The source picture at this longest side (aspect kept, each side a multiple of four), as KTX2. */
async function encode(texture: Texture, px: number, dir: string, tag: string): Promise<Buffer> {
  const [w, h] = texture.getSize()!;
  const scale = Math.min(1, px / Math.max(w, h));
  const four = (v: number) => Math.max(4, Math.ceil(v / 4) * 4);
  const png = await sharp(Buffer.from(texture.getImage()!), { limitInputPixels: false })
    .resize(four(w * scale), four(h * scale), { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const src = join(dir, `${tag}.png`);
  const dst = join(dir, `${tag}.ktx2`);
  writeFileSync(src, png);
  execFileSync(KTX, [...ktxParams(texture), src, dst], { stdio: "inherit" });
  return readFileSync(dst);
}

export async function shrinkTextures() {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const manifestPath = join(ROOMS, "rooms.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, { glb: string; lightmap: string; files: Record<string, number> }>;
  const fits: Record<string, Fit> = existsSync(FITS) ? JSON.parse(readFileSync(FITS, "utf8")) : {};

  // 1. Every texture the rooms were built with (its file as built → its source and the sizes it should have).
  type Want = { doc: Document; index: number; high: number; low: number; highBuilt: number; lowBuilt: number };
  const wanted = new Map<string, Want>();
  for (const room of Object.keys(manifest)) {
    const name = slug(room);
    const built = join(WORK, `${name}-ktx2.glb`);
    const clean = join(WORK, `${name}-clean.glb`);
    if (!existsSync(built) || !existsSync(clean)) {
      console.warn(`${room}: no build files in assets-src/build, its textures are left as they are`);
      continue;
    }
    const builtTextures = (await io.read(built)).getRoot().listTextures();
    const doc = await io.read(clean);
    const sources = doc.getRoot().listTextures();
    if (sources.length !== builtTextures.length) throw new Error(`${room}: ${sources.length} source textures, ${builtTextures.length} built`);
    sources.forEach((source, index) => {
      const image = builtTextures[index]!.getImage();
      if (!image) return;
      const file = `${fileHash(image)}.ktx2`;
      const t = targets(source);
      const old = wanted.get(file);
      // Used in several rooms: the largest any of them needs.
      wanted.set(file, old ? { ...old, high: Math.max(old.high, t.high), low: Math.max(old.low, t.low) } : { doc, index, ...t });
    });
  }

  // 2. Make each texture that should be smaller (once; the same sizes as last time are kept).
  const renames = new Map<string, string>();
  const dir = mkdtempSync(join(tmpdir(), "shrink-"));
  let made = 0;
  for (const [file, want] of wanted) {
    if (want.high >= want.highBuilt && want.low >= want.lowBuilt) continue; // stays as built
    const fit = fits[file];
    if (fit && fit.high === want.high && fit.low === want.low && fit.rules === RULES && existsSync(join(HIGH, fit.name)) && existsSync(join(LOW, fit.name))) {
      renames.set(file, fit.name);
      continue;
    }
    const source = want.doc.getRoot().listTextures()[want.index]!;
    const high = await encode(source, want.high, dir, `${made}-high`);
    const low = await encode(source, want.low, dir, `${made}-low`);
    const name = `${createHash("sha256").update(high).update(low).digest("hex").slice(0, 20)}.ktx2`;
    writeFileSync(join(HIGH, name), high);
    writeFileSync(join(LOW, name), low);
    fits[file] = { name, high: want.high, low: want.low, rules: RULES };
    writeFileSync(FITS, JSON.stringify(fits, null, 2));
    renames.set(file, name);
    made++;
    console.log(`${file}: ${want.highBuilt} → ${want.high} (High), ${want.lowBuilt} → ${want.low} (Low)`);
  }
  rmSync(dir, { recursive: true, force: true });

  // 3. Point the rooms at the new files, and list each room's files again for the loading bar.
  const local = (p: string) => p.replace(/^assets\//, "");
  for (const entry of Object.values(manifest)) {
    const gltfPath = join(ASSETS, local(entry.glb));
    const text = readFileSync(gltfPath, "utf8");
    const next = text.replace(/\.\.\/textures\/([0-9a-f]{20}\.ktx2)/g, (whole, file: string) => (renames.has(file) ? `../textures/${renames.get(file)}` : whole));
    if (next !== text) writeFileSync(gltfPath, next);
    entry.files = roomFiles(ASSETS, local(entry.glb), local(entry.lightmap));
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // 4. Delete texture files no built model uses any more (rooms and doors share the folders).
  const used = new Set<string>();
  for (const folder of ["rooms", "doors"]) {
    const path = join(ASSETS, folder);
    if (!existsSync(path)) continue;
    for (const f of readdirSync(path).filter((f) => f.endsWith(".gltf"))) {
      for (const m of readFileSync(join(path, f), "utf8").matchAll(/\.\.\/textures\/([0-9a-f]{20}\.ktx2)/g)) used.add(m[1]!);
    }
  }
  let removed = 0;
  for (const folder of [HIGH, LOW]) {
    for (const f of readdirSync(folder)) {
      if (f.endsWith(".ktx2") && !used.has(f)) {
        rmSync(join(folder, f));
        removed++;
      }
    }
  }
  const size = (folder: string) => readdirSync(folder).reduce((s, f) => s + statSync(join(folder, f)).size, 0) / 1e6;
  console.log(`Made ${made}, ${renames.size} smaller in all, ${removed} unused files deleted. High set ${size(HIGH).toFixed(0)} MB, Low set ${size(LOW).toFixed(0)} MB.`);
}

if (process.argv[1]?.endsWith("shrink-textures.ts")) await shrinkTextures();
