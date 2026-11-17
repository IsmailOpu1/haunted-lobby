// Step D of docs/plans/engine-port.md: the browser's dressed rooms, made ready for Unity's glTF
// importer (glTFast). The browser files compress their meshes (meshopt) and textures (KTX2 UASTC),
// which a desktop game doesn't need and glTFast would need extra packages for. This writes:
//   engine/Assets/Hotel/Textures/<name>.png   each shared texture once, unpacked from its KTX2
//   engine/Assets/Hotel/Rooms/<room>.gltf/.bin the room with plain meshes, pointing at those PNGs
//   engine/Assets/Hotel/Lightmaps/<room>.png   the room's baked light (light / lightmapScale, sRGB)
//   engine/Assets/Hotel/rooms.json             the browser's room list (drawn ids, lightmap scale)
//   engine/Assets/Hotel/texture-roles.json     which textures are normal maps or data (not colour)
// Unity then compresses the textures for the PC itself. The folder is made by this tool and never
// committed (engine/.gitignore). Run: npx tsx tools/engine-rooms.ts [room file name ...]
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
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
  const only = process.argv.slice(2);
  const entries = Object.entries(manifest).filter(([, e]) => !only.length || only.includes(basename(e.glb, ".gltf")));
  for (const dir of ["Textures", "Rooms", "Lightmaps"]) mkdirSync(join(OUT, dir), { recursive: true });

  for (const [room, entry] of entries) {
    const name = basename(entry.glb, ".gltf");
    const started = Date.now();
    const doc = await io.read(join(PUBLIC, entry.glb));
    await doc.transform(dequantize());
    const textures = doc.getRoot().listTextures();
    const files = textures.map((t) => basename(t.getURI(), ".ktx2"));
    await inPairs([...new Set(files)], (file) => unpack(join(ASSETS, "textures", `${file}.ktx2`), join(OUT, "Textures", `${file}.png`)));
    textures.forEach((t, i) => {
      t.setMimeType("image/png").setURI(`../Textures/${files[i]}.png`);
      t.setImage(readFileSync(join(OUT, "Textures", `${files[i]}.png`)));
    });
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (ext.extensionName === KHRTextureBasisu.EXTENSION_NAME || ext.extensionName === "EXT_meshopt_compression" || ext.extensionName === "KHR_mesh_quantization") ext.dispose();
    }
    for (const buffer of doc.getRoot().listBuffers()) buffer.setURI(`${name}.bin`);
    await io.write(join(OUT, "Rooms", `${name}.gltf`), doc);
    await unpack(join(PUBLIC, entry.lightmap), join(OUT, "Lightmaps", `${name}.png`));
    console.log(`${room}: ${textures.length} textures, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  writeFileSync(join(OUT, "rooms.json"), readFileSync(join(ASSETS, "rooms/rooms.json")));
  await writeRoles(io);
}

/**
 * Which PNGs the rooms use as normal maps, and which hold data rather than colour (the packed
 * metal/roughness, occlusion), from every converted room: Unity's importer (HotelImport.cs) reads
 * this so each texture is compressed once, with the right settings, the first time it imports.
 */
async function writeRoles(io: NodeIO) {
  const normals = new Set<string>();
  const data = new Set<string>();
  for (const file of readdirSync(join(OUT, "Rooms")).filter((f) => f.endsWith(".gltf"))) {
    const doc = await io.read(join(OUT, "Rooms", file));
    for (const m of doc.getRoot().listMaterials()) {
      const name = (t: { getURI(): string } | null) => (t ? basename(t.getURI()) : null);
      const normal = name(m.getNormalTexture());
      if (normal) normals.add(normal);
      for (const t of [m.getMetallicRoughnessTexture(), m.getOcclusionTexture()]) {
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
