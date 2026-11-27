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
//   engine/Assets/Hotel/Characters/<name>.gltf the people (step D3): characters, low/ copies,
//                                              anims, and the held torch in each hand
//   engine/Assets/Hotel/texture-roles.json     which textures are normal maps or data (not colour)
//   engine/Assets/Hotel/Resources/Sounds/      the recorded sounds (step D4): the ambience loops
//                                              and the creaks, as the browser plays them
// Unity then compresses the textures for the PC itself. The folder is made by this tool and never
// committed (engine/.gitignore). Run: npx tsx tools/engine-rooms.ts [room file name ... | --models | --characters | --sounds]
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { type Document, NodeIO, Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS, type EmissiveStrength, KHRMaterialsEmissiveStrength, KHRTextureBasisu, type Transmission } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
import { dressings } from "@haunted/maps";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { LOW_DETAIL_MIN_TRIANGLES } from "../client/src/lighter.ts";

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
  // --characters: only the people (step D3).
  if (process.argv[2] === "--characters") {
    await characters(io);
    await writeRoles(io);
    return;
  }
  // --sounds: only the recorded sounds (step D4).
  if (process.argv[2] === "--sounds") {
    sounds();
    return;
  }
  // --models: only the models that are not rooms (quick, after a door or station rebuild).
  const modelsOnly = process.argv[2] === "--models";
  const only = modelsOnly ? [] : process.argv.slice(2);
  const entries = modelsOnly ? [] : Object.entries(manifest).filter(([, e]) => !only.length || only.includes(basename(e.glb, ".gltf")));
  for (const dir of ["Textures", "Rooms", "Lightmaps", "Models"]) mkdirSync(join(OUT, dir), { recursive: true });

  for (const [room, entry] of entries) {
    const name = basename(entry.glb, ".gltf");
    const started = Date.now();
    const count = await convert(io, join(PUBLIC, entry.glb), join(OUT, "Rooms"), name, true);
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
    sounds();
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
 * The recorded sounds (step D4): audio.ts's ambience loops and creaks, copied as they are (16-bit
 * WAV) into Resources/Sounds, where Unity's game loads them by name (HouseSounds.cs).
 */
function sounds() {
  const from = join(ASSETS, "sounds");
  const dir = join(OUT, "Resources", "Sounds");
  mkdirSync(dir, { recursive: true });
  const files = readdirSync(from).filter((f) => f.endsWith(".wav"));
  for (const f of files) copyFileSync(join(from, f), join(dir, f));
  console.log(`sounds: ${files.length} files`);
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
 * The people (step D3), made ready the same way into Characters/: the eight characters
 * (client/src/characterModels.ts), their Low copies (low/), the shared animations (anims), and
 * the torch held in each one's hand (heldFlashlight.ts: held/held_<character>, and held_torch
 * before one is dealt). Their textures are inside the files; each is written once to Textures/,
 * named by its content, so a texture the Low copy shares is not saved twice.
 */
async function characters(io: NodeIO) {
  const dir = join(OUT, "Characters");
  mkdirSync(join(dir, "low"), { recursive: true });
  mkdirSync(join(OUT, "Textures"), { recursive: true });
  const people = readdirSync(join(ASSETS, "characters")).filter((f) => f.endsWith(".glb")).map((f) => basename(f, ".glb"));
  const files: [string, string][] = [
    ...people.map((p): [string, string] => [`assets/characters/${p}.glb`, p]),
    ...readdirSync(join(ASSETS, "characters/low")).filter((f) => f.endsWith(".glb")).map((f): [string, string] => [`assets/characters/low/${f}`, `low/${basename(f, ".glb")}`]),
    ...readdirSync(join(ASSETS, "held")).filter((f) => f.endsWith(".glb")).map((f): [string, string] => [`assets/held/${f}`, basename(f, ".glb")]),
  ];
  for (const [from, name] of files) {
    const count = await convert(io, join(PUBLIC, from), dir, name);
    console.log(`${name}: ${count} textures`);
  }
}

/**
 * Writes one browser glTF as a plain one for glTFast: meshes unpacked, textures as the shared PNGs
 * in Textures/, emissive strength folded in. Returns how many textures it uses.
 */
async function convert(io: NodeIO, from: string, dir: string, name: string, lighter = false): Promise<number> {
  const doc = await io.read(from);
  await doc.transform(dequantize());
  if (lighter) await addLighter(doc);
  const textures = doc.getRoot().listTextures();
  // A texture inside the file (the characters) is named by its content and unpacked from there.
  const files = textures.map((t) => (t.getURI() ? basename(t.getURI(), ".ktx2") : `c_${createHash("sha1").update(t.getImage()!).digest("hex").slice(0, 16)}`));
  textures.forEach((t, i) => {
    const ktx2 = join(OUT, "Textures", `${files[i]}.ktx2`);
    if (!t.getURI() && !existsSync(join(OUT, "Textures", `${files[i]}.png`))) writeFileSync(ktx2, t.getImage()!);
  });
  await inPairs([...new Set(files)], async (file) => {
    const inside = join(OUT, "Textures", `${file}.ktx2`);
    await unpack(existsSync(inside) ? inside : join(ASSETS, "textures", `${file}.ktx2`), join(OUT, "Textures", `${file}.png`));
    if (existsSync(inside)) unlinkSync(inside);
  });
  // The way from this file to Textures/ (Characters/low/ is a step deeper than Rooms/).
  const toTextures = relative(dirname(join(dir, name)), join(OUT, "Textures")).replace(/\\/g, "/");
  textures.forEach((t, i) => {
    t.setMimeType("image/png").setURI(`${toTextures}/${files[i]}.png`);
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
  for (const buffer of doc.getRoot().listBuffers()) buffer.setURI(`${basename(name)}.bin`);
  await io.write(join(dir, `${name}.gltf`), doc);
  return textures.length;
}

// client/src/lighter.ts: the copy keeps about this share of the triangles, within this share of
// the piece's size, and is only kept if it saves at least this share. Looks only.
const LOW_DETAIL_SHARE = 0.25;
const LOW_DETAIL_ERROR = 0.01;
const LOW_DETAIL_WORTH = 0.3;
/** The node that carries a room's lighter copies; Unity's DressedRooms hides it and swaps them in on Low. */
const LIGHTER_NODE = "__lighter";

/**
 * Low quality's lighter copies of a room's most detailed pieces, made here as the browser makes them
 * once Low is chosen (lighter.ts, the same meshoptimizer): a piece of LOW_DETAIL_MIN_TRIANGLES or
 * more keeps the triangles simplifyWithAttributes leaves. Each mesh with any becomes a copy named
 * "<mesh> lighter" (its other pieces as they are, sharing the corners, so lightmap UVs hold), on a
 * child of LIGHTER_NODE named after the mesh.
 */
async function addLighter(doc: Document) {
  await MeshoptSimplifier.ready;
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!buffer || !scene) return;
  const holder = doc.createNode(LIGHTER_NODE);
  for (const mesh of root.listMeshes()) {
    const copy = doc.createMesh(`${mesh.getName()} lighter`);
    let any = false;
    for (const prim of mesh.listPrimitives()) {
      const piece = prim.clone();
      const kept = lighterTriangles(prim);
      if (kept) {
        piece.setIndices(doc.createAccessor().setType("SCALAR").setArray(kept).setBuffer(buffer));
        any = true;
      }
      copy.addPrimitive(piece);
    }
    if (any) holder.addChild(doc.createNode(mesh.getName()).setMesh(copy));
    else {
      for (const p of copy.listPrimitives()) p.dispose();
      copy.dispose();
    }
  }
  if (holder.listChildren().length) scene.addChild(holder);
  else holder.dispose();
}

/** lighter.ts lighterTriangles, on a glTF piece: the kept triangles, or null for none. */
function lighterTriangles(prim: Primitive): Uint32Array | null {
  const index = prim.getIndices();
  const position = prim.getAttribute("POSITION");
  if (!index || !position || prim.getMode() !== Primitive.Mode.TRIANGLES) return null;
  const indices = Uint32Array.from(index.getArray()!);
  if (indices.length / 3 < LOW_DETAIL_MIN_TRIANGLES) return null;
  const positions = Float32Array.from(position.getArray()!);
  // dressedRooms.ts lighterPiece: no normals reads as zeros.
  const normal = prim.getAttribute("NORMAL");
  const normals = normal ? Float32Array.from(normal.getArray()!) : new Float32Array(positions.length);
  const target = Math.floor((indices.length * LOW_DETAIL_SHARE) / 3) * 3;
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, normals, 3, [0.5, 0.5, 0.5], null, target, LOW_DETAIL_ERROR);
  if (kept.length > indices.length * (1 - LOW_DETAIL_WORTH) || kept.length === 0) return null;
  return kept;
}

/**
 * Which PNGs the rooms use as normal maps, and which hold data rather than colour (the packed
 * metal/roughness, occlusion), from every converted room: Unity's importer (HotelImport.cs) reads
 * this so each texture is compressed once, with the right settings, the first time it imports.
 */
async function writeRoles(io: NodeIO) {
  const normals = new Set<string>();
  const data = new Set<string>();
  const converted = ["Rooms", "Models", "Characters", "Characters/low"].filter((dir) => existsSync(join(OUT, dir))).flatMap((dir) => readdirSync(join(OUT, dir)).filter((f) => f.endsWith(".gltf")).map((f) => join(OUT, dir, f)));
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
