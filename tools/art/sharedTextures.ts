// Shared textures for built models (tools/art/build-room.ts, build-doors.ts): each texture is
// stored once in client/public/assets/textures, named by its contents, with its 1K copy under the
// same name in textures-1k (the Low quality set).
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = resolve(import.meta.dirname, "../..");
/** Textures live here once each, named by their contents, and every model that uses one points to it. */
const TEXTURES = join(ROOT, "client/public/assets/textures");
/** The Low quality set: the same textures at most 1K, under the same names (PRD Section 9). */
const TEXTURES_LOW = join(ROOT, "client/public/assets/textures-1k");

/**
 * Writes a built model (a room, the doors) as .gltf + .bin with its textures as separate files named by their contents, so a
 * texture used in several rooms (the same sofa, the same wallpaper) downloads once for the whole
 * hotel. Each texture's 1K copy (from texturedLow, the same room with smaller textures) goes in
 * textures-1k under the same name, so the game picks a set by folder. Meshes are compressed last.
 */
export async function writeShared(textured: string, texturedLow: string, outDir: string, name: string) {
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
  rmSync(join(outDir, `${name}.glb`), { force: true }); // the old single-file build
  await io.write(join(outDir, `${name}.gltf`), doc);
}
