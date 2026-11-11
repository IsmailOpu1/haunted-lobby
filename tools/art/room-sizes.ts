// Fills in each built room's file list and sizes in rooms.json (for the game's loading bar) without
// rebuilding the room. build-room.ts does the same for a room it builds.
// Run: npx tsx tools/art/room-sizes.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { roomFiles } from "./roomFiles.ts";

const ASSETS = resolve(import.meta.dirname, "../../client/public/assets");
const manifestPath = join(ASSETS, "rooms/rooms.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, { glb: string; lightmap: string; files?: Record<string, number> }>;
const strip = (p: string) => p.replace(/^assets\//, "");
let total = 0;
for (const [room, entry] of Object.entries(manifest)) {
  entry.files = roomFiles(ASSETS, strip(entry.glb), strip(entry.lightmap));
  const mb = Object.entries(entry.files).filter(([p]) => !p.startsWith("textures-1k/")).reduce((a, [, b]) => a + b, 0) / 1e6;
  total += mb;
  console.log(`${room}: ${Object.keys(entry.files).length} files, ${mb.toFixed(0)} MB (full textures, before sharing)`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Sum ${total.toFixed(0)} MB; rooms that share a texture download it once.`);
