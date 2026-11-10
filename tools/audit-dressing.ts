// Audit (owner feedback 2026-11-10): furniture that stands near a wall without touching it,
// kinds repeated within a room, and how much of each room's floor is empty.
// Run: npx tsx tools/audit-dressing.ts
import { marrowHotelGreybox as map } from "../maps/index.ts";

const T = map.wallThicknessM / 2;
type Box = { id: string; room: string; kind: string; minX: number; maxX: number; minZ: number; maxZ: number };
const boxes: Box[] = [
  ...map.furniture.map((f) => ({ id: f.id, room: f.room, kind: f.kind, minX: f.x - f.sizeX / 2, maxX: f.x + f.sizeX / 2, minZ: f.z - f.sizeZ / 2, maxZ: f.z + f.sizeZ / 2 })),
  ...map.hidingSpots.map((h) => ({ id: h.id, room: "", kind: h.kind, minX: h.x - h.sizeX / 2, maxX: h.x + h.sizeX / 2, minZ: h.z - h.sizeZ / 2, maxZ: h.z + h.sizeZ / 2 })),
];

function gapToWalls(b: Box): number {
  let best = Infinity;
  for (const [x1, z1, x2, z2] of map.walls) {
    if (z1 === z2) {
      if (b.maxX < Math.min(x1, x2) || b.minX > Math.max(x1, x2)) continue;
      best = Math.min(best, Math.abs(b.minZ - (z1 + T)), Math.abs(b.maxZ - (z1 - T)));
    } else {
      if (b.maxZ < Math.min(z1, z2) || b.minZ > Math.max(z1, z2)) continue;
      best = Math.min(best, Math.abs(b.minX - (x1 + T)), Math.abs(b.maxX - (x1 - T)));
    }
  }
  return best;
}

console.log("== Near a wall but not touching it (gap 2 cm to 1.2 m) ==");
for (const b of boxes) {
  const g = gapToWalls(b);
  if (g > 0.02 && g < 1.2) console.log(`${b.id.padEnd(28)} ${b.kind.padEnd(10)} ${b.room.padEnd(18)} gap ${g.toFixed(2)} m`);
}

console.log("\n== Rooms: floor area, furniture cover, kinds ==");
const area = new Map<string, number>();
for (const r of map.rooms) area.set(r.name, (area.get(r.name) ?? 0) + (r.maxX - r.minX) * (r.maxZ - r.minZ));
for (const [room, a] of area) {
  const inRoom = map.furniture.filter((f) => f.room === room);
  const covered = inRoom.reduce((s, f) => s + f.sizeX * f.sizeZ, 0);
  const kinds = new Map<string, number>();
  for (const f of inRoom) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
  const tasks = map.tasks.filter((t) => t.room === room).length;
  console.log(`${room.padEnd(18)} ${a.toFixed(0).padStart(4)} m2  furniture ${((100 * covered) / a).toFixed(0).padStart(3)}%  tasks ${tasks}  ${[...kinds].map(([k, n]) => `${k}x${n}`).join(" ")}`);
}
