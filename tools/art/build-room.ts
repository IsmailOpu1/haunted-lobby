// Builds dressed rooms: map data + dressing → Blender (build, light, bake) → compressed files the
// game loads (client/public/assets/rooms). Run: npx tsx tools/art/build-room.ts "Main Hall" [--fast]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { dirname, join, resolve } from "node:path";
import { HIDING_SPOT_HEIGHT_M, levelOf, toWorld, wallFaces, type MapData } from "@haunted/shared";
import { defaultMap } from "../../maps/index.ts";
import { marrowHotelDressing } from "../../maps/marrow-hotel/dressing.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const TOKTX = process.env.TOKTX ?? "C:/Program Files/KTX-Software/bin/toktx.exe";
const OUT = join(ROOT, "client/public/assets/rooms");
/** Textures live here once each, named by their contents, and every room that uses one points to it. */
const TEXTURES = join(ROOT, "client/public/assets/textures");
/** The Low quality set: the same textures at most 1K, under the same names (PRD Section 9). */
const TEXTURES_LOW = join(ROOT, "client/public/assets/textures-1k");
const LOW_TEXTURE_PX = 1024;
const WORK = join(ROOT, "assets-src/build");
/** The door panel is this much of the wall's height (client/src/world.ts DOOR_HEIGHT_FRACTION). */
const DOOR_HEIGHT_FRACTION = 0.9;
/** Lightmaps store light / this, so values up to it fit in 8 bits; the game multiplies back. Only
 * lamp glass goes over 2, and a lower scale keeps more steps in the darks, where most of a room is. */
const LIGHTMAP_SCALE = 2;
/** How many texture encoders run at once (each takes a CPU core). */
const COMPRESS_JOBS = 2;

export function slug(room: string): string {
  return room.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** The room's shell in world coordinates: floor parts, wall faces and doorways on its edges. */
export function roomJob(map: MapData, room: string) {
  const parts = map.rooms.filter((r) => r.name === room);
  if (!parts.length) throw new Error(`No room named ${room}`);
  const level = levelOf(map, (parts[0]!.minX + parts[0]!.maxX) / 2, (parts[0]!.minZ + parts[0]!.maxZ) / 2);
  const sx = level.shiftX;
  const sz = level.shiftZ;
  const inside = (x: number, z: number) => parts.some((p) => x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ);
  const doors = map.doors.flatMap((d) => {
    const [nx, nz] = d.axis === "x" ? [0, 1] : [1, 0];
    const into = inside(d.x + nx * 0.3, d.z + nz * 0.3) ? [nx, nz] : inside(d.x - nx * 0.3, d.z - nz * 0.3) ? [-nx, -nz] : null;
    return into ? [{ x: d.x + sx, z: d.z + sz, width: d.width, axis: d.axis, into }] : [];
  });
  // Hiding spots are built as furniture here (wardrobes and cupboards); `front` points to where
  // the player steps out, which is the side the doors are on.
  const hidingSpots = map.hidingSpots
    .filter((h) => h.kind !== "curtain" && inside(h.x, h.z))
    .map((h) => {
      const [dx, dz] = [h.exit.x - h.x, h.exit.z - h.z];
      const front = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
      return { id: h.id, kind: h.kind, x: h.x + sx, z: h.z + sz, sizeX: h.sizeX, sizeZ: h.sizeZ, heightM: HIDING_SPOT_HEIGHT_M, front };
    });
  // Stairwells that open into this room: built here (steps, runner, walls, rail, ceiling), and the
  // stairwell walls the room sees get the room's own wall finish, like any other wall face.
  const T = map.wallThicknessM;
  const extraFaces: { room: string; x: number; z: number; length: number; axis: "x" | "z"; facing: number }[] = [];
  const stairs = map.stairs.flatMap((s) => {
    const u = s.dir === "+x" ? { x: 1, z: 0 } : s.dir === "-x" ? { x: -1, z: 0 } : s.dir === "+z" ? { x: 0, z: 1 } : { x: 0, z: -1 };
    const side = { x: -u.z, z: u.x }; // levels.ts stairWalls: the flight's sideways direction
    const bottom = toWorld(map, s.x, s.z);
    const top = toWorld(map, s.x + u.x * s.lengthM, s.z + u.z * s.lengthM);
    // The end of the flight on this room's floor is open to the room; the other end is closed.
    const open = bottom.y === level.y ? 0 : top.y === level.y ? s.lengthM : null;
    if (open === null) return [];
    const at = (along: number, across: number) => ({ x: bottom.x + u.x * along + side.x * across - sx, z: bottom.z + u.z * along + side.z * across - sz });
    const out = open === 0 ? -0.3 : s.lengthM + 0.3;
    const mouth = at(out, 0);
    if (!inside(mouth.x, mouth.z)) return [];
    const runsAlongX = u.x !== 0;
    const sign = (n: number) => (n > 0 ? 1 : -1);
    let hallSide = 0;
    for (const sideSign of [-1, 1]) {
      const beside = at(s.lengthM / 2, sideSign * (s.widthM / 2 + T / 2 + 0.3));
      if (!inside(beside.x, beside.z)) continue;
      hallSide = sideSign;
      const c = at(s.lengthM / 2, (sideSign * s.widthM) / 2);
      extraFaces.push({ room, x: c.x + sx, z: c.z + sz, length: s.lengthM, axis: runsAlongX ? "x" : "z", facing: sign(runsAlongX ? sideSign * side.z : sideSign * side.x) });
    }
    // The closed end: under the top of a flight going up, or the floor's wall over a flight going down.
    const closed = open === 0 ? s.lengthM : 0;
    const beyond = at(closed === 0 ? -0.3 : s.lengthM + 0.3, 0);
    if (inside(beyond.x, beyond.z)) {
      const line = closed === 0 ? 0 : s.lengthM - T / 2; // the wall over a flight is T thick, centred on its end
      const c = at(line, (hallSide * T) / 2);
      const outward = closed === 0 ? -1 : 1;
      extraFaces.push({ room, x: c.x + sx, z: c.z + sz, length: s.widthM, axis: runsAlongX ? "z" : "x", facing: sign(runsAlongX ? outward * u.x : outward * u.z) });
    }
    return [{ id: s.id, x: bottom.x, y: bottom.y, z: bottom.z, ux: u.x, uz: u.z, lengthM: s.lengthM, widthM: s.widthM, rise: top.y - bottom.y, open, hallSide }];
  });
  return {
    room,
    levelY: level.y,
    wallHeight: map.wallHeightM,
    wallThickness: map.wallThicknessM,
    doorHeight: map.wallHeightM * DOOR_HEIGHT_FRACTION,
    outdoor: parts.some((p) => p.outdoor),
    parts: parts.map((p) => ({ minX: p.minX + sx, maxX: p.maxX + sx, minZ: p.minZ + sz, maxZ: p.maxZ + sz })),
    faces: [...wallFaces(map).filter((f) => f.room === room).map((f) => ({ ...f, x: f.x + sx, z: f.z + sz })), ...extraFaces],
    doors,
    hidingSpots,
    stairs,
  };
}

/**
 * Writes the room as .gltf + .bin with its textures as separate files named by their contents, so a
 * texture used in several rooms (the same sofa, the same wallpaper) downloads once for the whole
 * hotel. Each texture's 1K copy (from texturedLow, the same room with smaller textures) goes in
 * textures-1k under the same name, so the game picks a set by folder. Meshes are compressed last.
 */
async function writeShared(textured: string, texturedLow: string, name: string) {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(textured);
  const low = (await io.read(texturedLow)).getRoot().listTextures();
  const textures = doc.getRoot().listTextures();
  if (low.length !== textures.length) throw new Error(`The 1K build has ${low.length} textures, the 2K build ${textures.length}`);
  mkdirSync(TEXTURES, { recursive: true });
  mkdirSync(TEXTURES_LOW, { recursive: true });
  textures.forEach((texture, i) => {
    const image = texture.getImage();
    const small = low[i]!.getImage();
    if (!image || !small) return;
    const file = `${createHash("sha256").update(image).digest("hex").slice(0, 20)}.ktx2`;
    texture.setURI(`../textures/${file}`);
    writeFileSync(join(TEXTURES_LOW, file), small);
  });
  for (const buffer of doc.getRoot().listBuffers()) buffer.setURI(`${name}.bin`);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  rmSync(join(OUT, `${name}.glb`), { force: true }); // the old single-file build
  await io.write(join(OUT, `${name}.gltf`), doc);
}

async function build(room: string, fast: boolean, skipBlender: boolean) {
  const dressing = marrowHotelDressing.rooms.find((r) => r.room === room);
  if (!dressing) throw new Error(`No dressing for ${room}`);
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const name = slug(room);
  const raw = join(WORK, `${name}.glb`);
  const lightmapPng = join(WORK, `${name}-lightmap.png`);
  const shell = roomJob(defaultMap, room);
  const job = {
    ...shell,
    dressing,
    modelsDir: join(ROOT, "assets-src/models"),
    texturesDir: join(ROOT, "assets-src/textures"),
    lightmapPx: fast ? 1024 : 2048,
    lightmapScale: LIGHTMAP_SCALE,
    samples: fast ? 64 : 512,
    glbOut: raw,
    lightmapOut: lightmapPng,
  };
  const jobPath = join(WORK, `${name}.json`);
  writeFileSync(jobPath, JSON.stringify(job, null, 2));
  console.log(`Blender: building and baking ${room}...`);
  if (!skipBlender) execFileSync(BLENDER, ["--background", "--factory-startup", "--python-exit-code", "1", "--python", join(ROOT, "tools/art/blender/build_room.py"), "--", jobPath], { stdio: "inherit" });

  console.log("Compressing...");
  const gltf = join(ROOT, "node_modules/.bin/gltf-transform");
  // Texture compression has no GPU encoder for this format, so it runs on the CPU. Full quality
  // (UASTC for every texture), but only 2 encoders at a time instead of the tool's 24, so the CPU
  // stays cool; it takes longer, the result is the same (owner, 2026-11-10).
  const env = { ...process.env, PATH: `${dirname(TOKTX)};${process.env.PATH}` };
  const run = (args: string[]) => execFileSync(`"${gltf}"`, args, { stdio: "inherit", shell: true, env });
  // Keep the lightmap UVs (TEXCOORD_1): no material names them, so pruning would drop them.
  // Clean up first, then textures, then mesh compression last (compressing textures decodes it).
  const clean = join(WORK, `${name}-clean.glb`);
  const textured = join(WORK, `${name}-ktx2.glb`);
  const smaller = join(WORK, `${name}-clean-1k.glb`);
  const texturedLow = join(WORK, `${name}-ktx2-1k.glb`);
  run(["optimize", `"${raw}"`, `"${clean}"`, "--compress", "false", "--prune-attributes", "false", "--texture-compress", "false", "--texture-size", "2048", "--simplify", "false", "--join", "false", "--instance", "false", "--palette", "false", "--flatten", "false"]);
  run(["uastc", `"${clean}"`, `"${textured}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
  run(["resize", `"${clean}"`, `"${smaller}"`, "--width", String(LOW_TEXTURE_PX), "--height", String(LOW_TEXTURE_PX)]);
  run(["uastc", `"${smaller}"`, `"${texturedLow}"`, "--level", "2", "--zstd", "18", "--jobs", String(COMPRESS_JOBS)]);
  await writeShared(textured, texturedLow, name);
  execFileSync(TOKTX, ["--t2", "--threads", String(COMPRESS_JOBS), "--encode", "uastc", "--uastc_quality", "2", "--zcmp", "19", "--assign_oetf", "srgb", join(OUT, `${name}-lightmap.ktx2`), lightmapPng], { stdio: "inherit" });

  const manifestPath = join(OUT, "rooms.json");
  // The map furniture and hiding spots this build draws, so the game leaves out their grey boxes.
  const drawn = [...new Set([...dressing.props.flatMap((p) => (p.draws ? [p.draws] : [])), ...(dressing.builds ?? []).flatMap((b) => [...(b.draws ? [b.draws] : []), ...("station" in b ? [b.station] : [])]), ...shell.hidingSpots.map((h) => h.id), ...shell.stairs.map((s) => s.id)])];
  const manifest: Record<string, { glb: string; lightmap: string; lightmapScale: number; drawn: string[] }> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  manifest[room] = { glb: `assets/rooms/${name}.gltf`, lightmap: `assets/rooms/${name}-lightmap.ktx2`, lightmapScale: LIGHTMAP_SCALE, drawn };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Done: ${room}`);
}

const args = process.argv.slice(2);
const fast = args.includes("--fast");
const skipBlender = args.includes("--skip-blender");
for (const room of args.filter((a) => !a.startsWith("--"))) await build(room, fast, skipBlender);
