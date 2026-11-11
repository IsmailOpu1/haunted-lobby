// Builds the things you hold in first person (the flashlight) from their source models in
// assets-src/models into client/public/assets/held, at full quality: UASTC textures at the source
// size (they are always close to your eye) and Meshopt meshes.
// Run: npx tsx tools/art/build-held.ts vintage_flashlight
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TOKTX = process.env.TOKTX ?? "C:/Program Files/KTX-Software/bin/toktx.exe";
const OUT = join(ROOT, "client/public/assets/held");
const WORK = join(ROOT, "assets-src/build");
/** Texture encoders at once; each takes a CPU core (owner, 2026-11-10: keep the CPU cool). */
const COMPRESS_JOBS = 2;

function build(model: string) {
  const folder = join(ROOT, "assets-src/models", model);
  const source = readdirSync(folder).find((f) => f.endsWith(".gltf"));
  if (!source) throw new Error(`No .gltf in ${folder}`);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  const gltf = join(ROOT, "node_modules/.bin/gltf-transform");
  const env = { ...process.env, PATH: `${dirname(TOKTX)};${process.env.PATH}` };
  const run = (args: string[]) => execFileSync(`"${gltf}"`, args, { stdio: "inherit", shell: true, env });
  const clean = join(WORK, `held-${model}-clean.glb`);
  const textured = join(WORK, `held-${model}-ktx2.glb`);
  run(["optimize", `"${join(folder, source)}"`, `"${clean}"`, "--compress", "false", "--texture-compress", "false", "--simplify", "false", "--join", "false", "--instance", "false", "--palette", "false", "--flatten", "false"]);
  run(["uastc", `"${clean}"`, `"${textured}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
  run(["meshopt", `"${textured}"`, `"${join(OUT, `${model}.glb`)}"`]);
  console.log(`Done: ${model}`);
}

for (const model of process.argv.slice(2).filter((a) => !a.startsWith("--"))) build(model);
