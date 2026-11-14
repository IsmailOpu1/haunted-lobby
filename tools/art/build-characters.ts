// Packs the eight player characters and their shared animations (built in Blender by
// tools/art/blender/build_character.py into assets-src/build/char-*.glb) into
// client/public/assets/characters: UASTC textures and Meshopt meshes, like the held items.
// Each character also gets a Low quality copy in characters/low (PRD 9: Low stays under 250 draw
// calls and 300,000 triangles with seven other players in view): built in Blender by
// build_character_low.py (props skinned to their bone, one mesh), then simplified, its plain
// colours merged into one palette material, and its textures at most 1K.
// Run: npx tsx tools/art/build-characters.ts            (all eight and the animations)
//      npx tsx tools/art/build-characters.ts priest     (just one; --low-only for just its Low copy)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { NodeIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { joinPrimitives } from "@gltf-transform/functions";

const ROOT = resolve(import.meta.dirname, "../..");
const TOKTX = process.env.TOKTX ?? "C:/Program Files/KTX-Software/bin/toktx.exe";
const OUT = join(ROOT, "client/public/assets/characters");
const WORK = join(ROOT, "assets-src/build");
/** Texture encoders at once; each takes a CPU core (owner, 2026-11-10: keep the CPU cool). */
const COMPRESS_JOBS = 2;
const LOW_OUT = join(OUT, "low");
/** The Low copy keeps about this share of the vertices, unless that bends its shape further than LOW_ERROR. */
const LOW_RATIO = 0.25;
/** The most the Low copy's surface may move, as a share of the character's size. */
const LOW_ERROR = 0.02;
const LOW_TEXTURE_PX = 1024;
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

async function packLow(name: string) {
  const source = join(WORK, `char-${name}-low.glb`);
  if (!existsSync(source)) throw new Error(`Missing ${source}: build it with build_character_low.py first`);
  const clean = join(WORK, `char-${name}-low-clean.glb`);
  const ktx = join(WORK, `char-${name}-low-ktx2.glb`);
  run([
    "optimize", `"${source}"`, `"${clean}"`, "--compress", "false", "--texture-compress", "false", "--instance", "false",
    "--weld", "true", "--simplify", "true", "--simplify-ratio", String(LOW_RATIO), "--simplify-error", String(LOW_ERROR),
    "--palette", "true", "--palette-min", "2", "--flatten", "false", "--join", "false",
  ]);
  // The pieces sharing the palette become one, within the mesh (flattening the scene first moved
  // the skeleton's own turn and scale onto the body, which then lay on the floor).
  const joined = join(WORK, `char-${name}-low-joined.glb`);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(clean);
  // (join() leaves skinned meshes alone, so the pieces are joined here, material by material.)
  for (const mesh of doc.getRoot().listMeshes()) {
    const byMaterial = new Map<unknown, Primitive[]>();
    for (const prim of mesh.listPrimitives()) byMaterial.set(prim.getMaterial(), [...(byMaterial.get(prim.getMaterial()) ?? []), prim]);
    for (const prims of byMaterial.values()) {
      if (prims.length < 2) continue;
      mesh.addPrimitive(joinPrimitives(prims));
      for (const prim of prims) prim.dispose();
    }
  }
  await io.write(joined, doc);
  const small = join(WORK, `char-${name}-low-1k.glb`);
  run(["resize", `"${joined}"`, `"${small}"`, "--width", String(LOW_TEXTURE_PX), "--height", String(LOW_TEXTURE_PX)]);
  run(["uastc", `"${small}"`, `"${ktx}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
  run(["meshopt", `"${ktx}"`, `"${join(LOW_OUT, `${name}.glb`)}"`]);
  console.log(`Done: ${name} (Low)`);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(LOW_OUT, { recursive: true });
const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const lowOnly = process.argv.includes("--low-only");
for (const name of asked.length ? asked : [...ALL, "anims"]) {
  if (!lowOnly) pack(name, name !== "anims");
  if (name !== "anims") await packLow(name);
}
