// Step D of docs/plans/engine-port.md: the browser's dressed rooms, made ready for Unity's glTF
// importer (glTFast). The browser files compress their meshes (meshopt) and textures (KTX2 UASTC),
// which a desktop game doesn't need and glTFast would need extra packages for. This writes:
//   engine/Assets/Hotel/Textures/<name>.png   each shared texture once, unpacked from its KTX2
//   engine/Assets/Hotel/Rooms/<room>.gltf/.bin the room with plain meshes, pointing at those PNGs
//   engine/Assets/Hotel/Lightmaps/<room>.png   the room's baked light (light / lightmapScale, sRGB)
//   engine/Assets/Hotel/rooms.json             the browser's room list (drawn ids, lightmap scale),
//                                              plus each build's reflection spots from its dressing
//   engine/Assets/Hotel/Models/<name>.gltf/.bin the doors and the stations' own models (step D2),
//                                              and door-styles.json, each door's style by map
//   engine/Assets/Hotel/texture-roles.json     which textures are normal maps or data (not colour)
// Unity then compresses the textures for the PC itself. The folder is made by this tool and never
// committed (engine/.gitignore). Run: npx tsx tools/engine-rooms.ts [room file name ... | --models]
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, type EmissiveStrength, KHRMaterialsEmissiveStrength, KHRTextureBasisu, type Transmission } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
import { dressings } from "@haunted/maps";
import { MeshoptDecoder } from "meshoptimizer";

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "client/public");
const ASSETS = join(PUBLIC, "assets");
const OUT = join(ROOT, process.env.ENGINE_HOTEL ?? "engine/Assets/Hotel");
const KTX = process.env.KTX ?? "C:/Program Files/KTX-Software/bin/ktx.exe";
/** Two at a time: the owner's PC runs hot on long CPU jobs (quality-and-heat rule). */
const JOBS = 2;

/** Unpacks a KTX2 file to a PNG once; later rooms that share it reuse the file. */
async function unpack(ktx2: string, png: string) {
  if (existsSync(png)) return;
  await run(KTX, ["extract", "--transcode", "rgba8", ktx2, png]);
}

async function inPairs<T>(items: T[], work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: JOBS }, async () => {
    while (next < items.length) await work(items[next++]!);
  }));
}

async function main() {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const manifest = JSON.parse(readFileSync(join(ASSETS, "rooms/rooms.json"), "utf8")) as Record<string, { glb: string; lightmap: string }>;
  // --models: only the models that are not rooms (quick, after a door or station rebuild).
  const modelsOnly = process.argv[2] === "--models";
  const only = modelsOnly ? [] : process.argv.slice(2);
  const entries = modelsOnly ? [] : Object.entries(manifest).filter(([, e]) => !only.length || only.includes(basename(e.glb, ".gltf")));
  for (const dir of ["Textures", "Rooms", "Lightmaps", "Models"]) mkdirSync(join(OUT, dir), { recursive: true });

  for (const [room, entry] of entries) {
    const name = basename(entry.glb, ".gltf");
    const started = Date.now();
    const count = await convert(io, join(PUBLIC, entry.glb), join(OUT, "Rooms"), name);
    await unpack(join(PUBLIC, entry.lightmap), join(OUT, "Lightmaps", `${name}.png`));
    console.log(`${room}: ${count} textures, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  if (!only.length) {
    for (const [from, name] of MODELS) {
      const count = await convert(io, join(PUBLIC, from), join(OUT, "Models"), name);
      console.log(`${name}: ${count} textures`);
    }
    // Each door's style (the map dressing), for Unity's Doors as world.ts's DoorView reads it.
    const doors = Object.fromEntries(Object.values(dressings).map((d) => [d.mapId, d.doors ?? {}]));
    writeFileSync(join(OUT, "Models", "door-styles.json"), JSON.stringify(doors, null, 1));
  }
  // The browser takes each build's reflections where its dressing says (one in the middle when it
  // says nothing: DressedRooms.add); Unity's copy of the list carries those spots too.
  const all = JSON.parse(readFileSync(join(ASSETS, "rooms/rooms.json"), "utf8")) as Record<string, Record<string, unknown>>;
  for (const room of Object.values(dressings).flatMap((d) => d.rooms)) {
    if (room.probes?.length && all[room.room]) all[room.room]!.probes = room.probes;
  }
  writeFileSync(join(OUT, "rooms.json"), JSON.stringify(all, null, 1));
  await writeRoles(io);
}

/**
 * The models that are not rooms, made ready the same way into Models/: the doors
 * (client/src/doorModels.ts) and the stations' own models (stations.ts: the clock's hands, the
 * cradle, the trunk). Step D2.
 */
const MODELS: [string, string][] = [
  ["assets/doors/doors.gltf", "doors"],
  ["assets/stations/clock_hands.glb", "clock_hands"],
  ["assets/stations/cradle.glb", "cradle"],
  ["assets/stations/trunk.glb", "trunk"],
];

/**
 * Writes one browser glTF as a plain one for glTFast: meshes unpacked, textures as the shared PNGs
 * in Textures/, emissive strength folded in. Returns how many textures it uses.
 */
async function convert(io: NodeIO, from: string, dir: string, name: string): Promise<number> {
  const doc = await io.read(from);
  await doc.transform(dequantize());
  const textures = doc.getRoot().listTextures();
  const files = textures.map((t) => basename(t.getURI(), ".ktx2"));
  await inPairs([...new Set(files)], (file) => unpack(join(ASSETS, "textures", `${file}.ktx2`), join(OUT, "Textures", `${file}.png`)));
  textures.forEach((t, i) => {
    t.setMimeType("image/png").setURI(`../Textures/${files[i]}.png`);
    t.setImage(readFileSync(join(OUT, "Textures", `${files[i]}.png`)));
  });
  // glTFast ignores KHR_materials_emissive_strength, so bulbs and flames would glow 6 times too
  // weakly: fold the strength into the emissive colour (glTFast doesn't clamp it to 1).
  for (const material of doc.getRoot().listMaterials()) {
    const strength = material.getExtension<EmissiveStrength>(KHRMaterialsEmissiveStrength.EXTENSION_NAME);
    if (!strength) continue;
    const s = strength.getEmissiveStrength();
    material.setEmissiveFactor(material.getEmissiveFactor().map((c) => c * s) as [number, number, number]);
    material.setExtension(KHRMaterialsEmissiveStrength.EXTENSION_NAME, null);
  }
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === KHRTextureBasisu.EXTENSION_NAME || ext.extensionName === "EXT_meshopt_compression" || ext.extensionName === "KHR_mesh_quantization") ext.dispose();
  }
  for (const buffer of doc.getRoot().listBuffers()) buffer.setURI(`${name}.bin`);
  await io.write(join(dir, `${name}.gltf`), doc);
  return textures.length;
}

/**
 * Which PNGs the rooms use as normal maps, and which hold data rather than colour (the packed
 * metal/roughness, occlusion), from every converted room: Unity's importer (HotelImport.cs) reads
 * this so each texture is compressed once, with the right settings, the first time it imports.
 */
async function writeRoles(io: NodeIO) {
  const normals = new Set<string>();
  const data = new Set<string>();
  const converted = ["Rooms", "Models"].flatMap((dir) => readdirSync(join(OUT, dir)).filter((f) => f.endsWith(".gltf")).map((f) => join(OUT, dir, f)));
  for (const file of converted) {
    const doc = await io.read(file);
    for (const m of doc.getRoot().listMaterials()) {
      const name = (t: { getURI(): string } | null) => (t ? basename(t.getURI()) : null);
      const normal = name(m.getNormalTexture());
      if (normal) normals.add(normal);
      // Glass's transmission map is data too (its red is how much light passes).
      const transmission = m.getExtension<Transmission>("KHR_materials_transmission");
      for (const t of [m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), transmission?.getTransmissionTexture() ?? null]) {
        const n = name(t);
        if (n) data.add(n);
      }
    }
  }
  writeFileSync(join(OUT, "texture-roles.json"), JSON.stringify({ normals: [...normals].sort(), data: [...data].sort() }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
