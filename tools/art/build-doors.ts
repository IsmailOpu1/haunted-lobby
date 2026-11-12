// Builds the hotel's doors: every door style (the map dressing's `doors`) at every leaf width the
// map uses it at → Blender (tools/art/blender/build_doors.py) → compressed files the game loads
// (client/public/assets/doors), with their textures in the shared texture folders like the rooms'.
// Run: npx tsx tools/art/build-doors.ts [--blender-only]   (--blender-only: just the .glb, to look at)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { doorLayout, doorModelName, type DoorStyle } from "@haunted/shared";
import { defaultMap } from "../../maps/index.ts";
import { marrowHotelDressing } from "../../maps/marrow-hotel/dressing.ts";
import { roomFiles } from "./roomFiles.ts";
import { writeShared } from "./sharedTextures.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const TOKTX = process.env.TOKTX ?? "C:/Program Files/KTX-Software/bin/toktx.exe";
const OUT = join(ROOT, "client/public/assets/doors");
const WORK = join(ROOT, "assets-src/build");
/** The Low quality set: textures at most this size (PRD Section 9). */
const LOW_TEXTURE_PX = 1024;
/** Texture encoders at once; each takes a CPU core (owner, 2026-11-10: keep the CPU cool). */
const COMPRESS_JOBS = 2;

const map = defaultMap;
const styles = marrowHotelDressing.doors ?? {};
const leaves = new Map<string, { name: string; style: DoorStyle; width: number; number?: number }>();
const transoms = new Map<string, { name: string; style: DoorStyle; width: number }>();
let layout: ReturnType<typeof doorLayout> | undefined;
for (const def of map.doors) {
  const dressing = styles[def.id];
  if (!dressing) continue;
  layout = doorLayout(def.width, map.wallHeightM);
  const width = Math.round(layout.leafWidth * 100) / 100;
  const plain = doorModelName(dressing.style, "leaf", width);
  leaves.set(plain, { name: plain, style: dressing.style, width });
  if (dressing.number !== undefined) {
    // The number goes on the first leaf only (client/src/world.ts DoorView).
    const numbered = doorModelName(dressing.style, "leaf", width, dressing.number);
    leaves.set(numbered, { name: numbered, style: dressing.style, width, number: dressing.number });
  }
  if (layout.transomHeight > 0.01) {
    const name = doorModelName(dressing.style, "transom", def.width);
    transoms.set(name, { name, style: dressing.style, width: def.width });
  }
}
if (!layout) throw new Error("No door in the map has a style (maps/<map>/dressing.ts doors)");

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const raw = join(WORK, "doors.glb");
const job = {
  texturesDir: join(ROOT, "assets-src/textures"),
  leafHeight: layout.leafHeight,
  transomHeight: layout.transomHeight,
  leaves: [...leaves.values()],
  transoms: [...transoms.values()],
  out: raw,
};
const jobPath = join(WORK, "doors.json");
writeFileSync(jobPath, JSON.stringify(job, null, 2));
console.log(`Blender: building ${leaves.size} door leaves and ${transoms.size} transoms...`);
execFileSync(BLENDER, ["--background", "--factory-startup", "--python-exit-code", "1", "--python", join(ROOT, "tools/art/blender/build_doors.py"), "--", jobPath], { stdio: "inherit" });
if (process.argv.includes("--blender-only")) process.exit(0);

console.log("Compressing...");
const gltf = join(ROOT, "node_modules/.bin/gltf-transform");
const env = { ...process.env, PATH: `${dirname(TOKTX)};${process.env.PATH}` };
const run = (args: string[]) => execFileSync(`"${gltf}"`, args, { stdio: "inherit", shell: true, env });
const clean = join(WORK, "doors-clean.glb");
const textured = join(WORK, "doors-ktx2.glb");
const smaller = join(WORK, "doors-clean-1k.glb");
const texturedLow = join(WORK, "doors-ktx2-1k.glb");
// Keep every piece apart (no joining, no flattening): the game finds each by its name.
run(["optimize", `"${raw}"`, `"${clean}"`, "--compress", "false", "--texture-compress", "false", "--texture-size", "2048", "--simplify", "false", "--join", "false", "--instance", "false", "--palette", "false", "--flatten", "false"]);
run(["uastc", `"${clean}"`, `"${textured}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
run(["resize", `"${clean}"`, `"${smaller}"`, "--width", String(LOW_TEXTURE_PX), "--height", String(LOW_TEXTURE_PX)]);
run(["uastc", `"${smaller}"`, `"${texturedLow}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
await writeShared(textured, texturedLow, OUT, "doors");

// What the game downloads for the doors, with sizes: for the loading bar, and so a rebuilt set of
// doors is fetched again rather than taken from the browser's cache (client/src/doorModels.ts).
const files = roomFiles(dirname(OUT), "doors/doors.gltf");
writeFileSync(join(OUT, "doors.json"), JSON.stringify({ gltf: "assets/doors/doors.gltf", files }, null, 2));
console.log(`Done: ${leaves.size} leaves, ${transoms.size} transoms`);
