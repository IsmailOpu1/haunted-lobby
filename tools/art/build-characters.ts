// Packs the eight player characters and their shared animations (built in Blender by
// tools/art/blender/build_character.py into assets-src/build/char-*.glb) into
// client/public/assets/characters: UASTC textures and Meshopt meshes, like the held items.
// Run: npx tsx tools/art/build-characters.ts            (all eight and the animations)
//      npx tsx tools/art/build-characters.ts priest     (just one)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const TOKTX = process.env.TOKTX ?? "C:/Program Files/KTX-Software/bin/toktx.exe";
const OUT = join(ROOT, "client/public/assets/characters");
const WORK = join(ROOT, "assets-src/build");
/** Texture encoders at once; each takes a CPU core (owner, 2026-11-10: keep the CPU cool). */
const COMPRESS_JOBS = 2;
const ALL = ["priest", "journalist", "nurse", "student", "detective", "photographer", "mechanic", "caretaker"];

const gltf = join(ROOT, "node_modules/.bin/gltf-transform");
const env = { ...process.env, PATH: `${dirname(TOKTX)};${process.env.PATH}` };
const run = (args: string[]) => execFileSync(`"${gltf}"`, args, { stdio: "inherit", shell: true, env });

function pack(name: string, textured: boolean) {
  const source = join(WORK, `char-${name}.glb`);
  if (!existsSync(source)) throw new Error(`Missing ${source}: build it in Blender first`);
  const clean = join(WORK, `char-${name}-clean.glb`);
  const ktx = join(WORK, `char-${name}-ktx2.glb`);
  // Skinned meshes stay apart (joining would break skins); no simplifying: quality stays.
  run(["optimize", `"${source}"`, `"${clean}"`, "--compress", "false", "--texture-compress", "false", "--simplify", "false", "--join", "false", "--instance", "false", "--palette", "false", "--flatten", "false"]);
  if (textured) run(["uastc", `"${clean}"`, `"${ktx}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
  run(["meshopt", `"${textured ? ktx : clean}"`, `"${join(OUT, `${name}.glb`)}"`]);
  console.log(`Done: ${name}`);
}

mkdirSync(OUT, { recursive: true });
const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const name of asked.length ? asked : [...ALL, "anims"]) pack(name, name !== "anims");
