// What the game downloads for one dressed room, with each file's size, so it can show a loading
// bar in megabytes (client/src/dressedRooms.ts). Keys are paths under client/public/assets.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";

/** Paths under client/public/assets → bytes: the room's glTF, its buffers, its lightmap, and every
 * texture it uses in both sets (textures/ and textures-1k/); the game counts the set it loads. */
export function roomFiles(assetsDir: string, gltfPath: string, lightmapPath: string): Record<string, number> {
  const files: Record<string, number> = {};
  const add = (rel: string) => {
    const full = join(assetsDir, rel);
    if (existsSync(full)) files[rel] = statSync(full).size;
  };
  add(gltfPath);
  add(lightmapPath);
  const gltf = JSON.parse(readFileSync(join(assetsDir, gltfPath), "utf8")) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  const base = dirname(gltfPath).replaceAll("\\", "/");
  for (const item of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    if (!item.uri || item.uri.startsWith("data:")) continue;
    const rel = posix.normalize(posix.join(base, item.uri));
    add(rel);
    if (rel.startsWith("textures/")) add(rel.replace(/^textures\//, "textures-1k/"));
  }
  return files;
}
