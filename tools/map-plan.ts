// Draws a map's floor plan as an SVG, one floor beside the next, in real coordinates.
// Usage: npx tsx tools/map-plan.ts [out.svg]   (default: docs/maps/marrow-hotel.svg)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { furnitureBox, hidingSpotBox, levelOf, stairFloors, wallBox, type MapData } from "@haunted/shared";
import { marrowHotelGreybox } from "@haunted/maps";

const SCALE = 12; // pixels per meter
const GAP_M = 6;

function plan(map: MapData): string {
  const parts: string[] = [];
  let offsetX = 0;
  let height = 0;
  for (const level of map.levels) {
    const inLevel = (x: number, z: number) => levelOf(map, x, z) === level;
    const rooms = map.rooms.filter((r) => inLevel((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2));
    const minX = Math.min(...rooms.map((r) => r.minX)) - 2;
    const maxX = Math.max(...rooms.map((r) => r.maxX)) + 2;
    const minZ = Math.min(...rooms.map((r) => r.minZ)) - 4;
    const maxZ = Math.max(...rooms.map((r) => r.maxZ)) + 2;
    const X = (x: number) => (offsetX + x - minX) * SCALE;
    const Z = (z: number) => (z - minZ) * SCALE;
    const rect = (x0: number, z0: number, x1: number, z1: number, style: string) =>
      parts.push(`<rect x="${X(x0)}" y="${Z(z0)}" width="${(x1 - x0) * SCALE}" height="${(z1 - z0) * SCALE}" ${style}/>`);
    const box = (b: { x: number; z: number; sizeX: number; sizeZ: number }, style: string) =>
      rect(b.x - b.sizeX / 2, b.z - b.sizeZ / 2, b.x + b.sizeX / 2, b.z + b.sizeZ / 2, style);
    const dot = (x: number, z: number, color: string, r = 4) => parts.push(`<circle cx="${X(x)}" cy="${Z(z)}" r="${r}" fill="${color}"/>`);
    const text = (x: number, z: number, s: string, size = 11) =>
      parts.push(`<text x="${X(x)}" y="${Z(z)}" font-size="${size}" text-anchor="middle" font-family="sans-serif" fill="#333">${s}</text>`);

    text((minX + maxX) / 2, minZ + 2, `${level.name} (y ${level.y} m)`, 16);
    for (const r of rooms) rect(r.minX, r.minZ, r.maxX, r.maxZ, `fill="${r.outdoor ? "#d8ead2" : "#f2efe8"}"`);
    for (const f of stairFloors(map).filter((f) => inLevel((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2))) {
      rect(f.minX, f.minZ, f.maxX, f.maxZ, `fill="#c9c2e0"`);
    }
    for (const w of map.walls.filter((w) => inLevel((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))) box(wallBox(w, map.wallThicknessM), `fill="#444"`);
    for (const d of map.doors.filter((d) => inLevel(d.x, d.z))) {
      const b = { x: d.x, z: d.z, sizeX: d.axis === "x" ? d.width : 0.35, sizeZ: d.axis === "x" ? 0.35 : d.width };
      box(b, `fill="${d.id === map.relicDoor ? "#c0392b" : "#b5835a"}"`);
    }
    for (const f of map.furniture.filter((f) => inLevel(f.x, f.z))) box(furnitureBox(f), `fill="#a9a39a"`);
    for (const h of map.hidingSpots.filter((h) => inLevel(h.x, h.z))) box(hidingSpotBox(h), `fill="#5b7fa6"`);
    for (const t of map.tasks.filter((t) => inLevel(t.x, t.z))) dot(t.x, t.z, "#e08e0b", 5);
    for (const r of map.relicSpots.filter((r) => inLevel(r.x, r.z))) dot(r.x, r.z, "#c9a227", 5);
    for (const j of map.saltJars.filter((j) => inLevel(j.x, j.z))) dot(j.x, j.z, "#ffffff", 4);
    for (const s of map.spawns.filter((s) => inLevel(s.x, s.z))) dot(s.x, s.z, "#2e8b57", 3);
    for (const [p, c] of [
      [map.bell, "#8e44ad"],
      [map.fuseBox, "#16a085"],
      [map.altar, "#c0392b"],
    ] as const) {
      if (p && inLevel(p.x, p.z)) dot(p.x, p.z, c, 6);
    }
    const names = new Map<string, (typeof rooms)[number]>();
    for (const r of rooms) {
      const best = names.get(r.name);
      if (!best || (r.maxX - r.minX) * (r.maxZ - r.minZ) > (best.maxX - best.minX) * (best.maxZ - best.minZ)) names.set(r.name, r);
    }
    for (const [name, r] of names) text((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, name);

    offsetX += maxX - minX + GAP_M;
    height = Math.max(height, (maxZ - minZ) * SCALE);
  }
  const legend = [
    ["#e08e0b", "task"],
    ["#c9a227", "relic spot"],
    ["#ffffff", "salt jar"],
    ["#2e8b57", "spawn"],
    ["#8e44ad", "bell"],
    ["#16a085", "fuse box"],
    ["#c0392b", "altar / relic door"],
    ["#5b7fa6", "hiding spot"],
    ["#a9a39a", "furniture"],
    ["#c9c2e0", "stairs"],
  ];
  legend.forEach(([c, label], i) => {
    parts.push(`<rect x="${10 + i * 120}" y="${height + 10}" width="14" height="14" fill="${c}" stroke="#333"/>`);
    parts.push(`<text x="${30 + i * 120}" y="${height + 22}" font-size="12" font-family="sans-serif">${label}</text>`);
  });
  const width = offsetX * SCALE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 40}" viewBox="0 0 ${width} ${height + 40}"><rect width="100%" height="100%" fill="#fff"/>${parts.join("")}</svg>`;
}

const out = process.argv[2] ?? "docs/maps/marrow-hotel.svg";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, plan(marrowHotelGreybox));
console.log(`Wrote ${out}`);
