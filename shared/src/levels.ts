import type { LevelDef, MapData, StairDef, WallSegment } from "./map.ts";

// Floors and stairs (GDD 21.1). The simulation stays flat: each floor lives in its own area of
// the plane, and stairs link the areas. These helpers turn simulation positions into real 3D
// places (for drawing and for sound) and move walkers across the stairs.

export interface Point {
  x: number;
  z: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

const DIRS: Record<StairDef["dir"], Point> = { "+x": { x: 1, z: 0 }, "-x": { x: -1, z: 0 }, "+z": { x: 0, z: 1 }, "-z": { x: 0, z: -1 } };

/** A map with no floors listed is one ground floor. */
const GROUND: LevelDef = { id: "ground", name: "Ground", minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, y: 0, shiftX: 0, shiftZ: 0 };

/** The floor whose area holds this point. Points outside every area count as the first floor. */
export function levelOf(map: MapData, x: number, z: number): LevelDef {
  return map.levels.find((l) => x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ) ?? map.levels[0] ?? GROUND;
}

function levelById(map: MapData, id: string): LevelDef {
  const level = map.levels.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown level ${id} in map ${map.id}`);
  return level;
}

/** How a flight of stairs sits in the plane: its direction, and the jump between the two floors' areas. */
function geometry(map: MapData, stair: StairDef) {
  const lower = levelById(map, stair.lower);
  const upper = levelById(map, stair.upper);
  const u = DIRS[stair.dir];
  // A point in the lower floor's area plus `shift` is the same real place in the upper floor's area.
  const shift = { x: lower.shiftX - upper.shiftX, z: lower.shiftZ - upper.shiftZ };
  return { lower, upper, u, shift };
}

/** Where a point is along a flight (0 at the bottom step, lengthM at the top) and how far off its middle line. */
function onStair(stair: StairDef, u: Point, p: Point): { along: number; side: number } {
  const dx = p.x - stair.x;
  const dz = p.z - stair.z;
  return { along: dx * u.x + dz * u.z, side: dx * -u.z + dz * u.x };
}

function inside(stair: StairDef, s: { along: number; side: number }): boolean {
  return s.along >= 0 && s.along <= stair.lengthM && Math.abs(s.side) <= stair.widthM / 2;
}

/** The real 3D place of a simulation point: on a floor, or partway up a flight of stairs. */
export function toWorld(map: MapData, x: number, z: number): WorldPoint {
  const level = levelOf(map, x, z);
  let y = level.y;
  for (const stair of map.stairs) {
    const g = geometry(map, stair);
    const fromLower = level === g.lower ? { x, z } : level === g.upper ? { x: x - g.shift.x, z: z - g.shift.z } : null;
    if (!fromLower) continue;
    const s = onStair(stair, g.u, fromLower);
    if (!inside(stair, s)) continue;
    y = g.lower.y + ((g.upper.y - g.lower.y) * s.along) / stair.lengthM;
    break;
  }
  return { x: x + level.shiftX, y, z: z + level.shiftZ };
}

/** Real 3D distance between two simulation points, through floors if they are on different ones. */
export function worldDistance(map: MapData, a: Point, b: Point): number {
  const wa = toWorld(map, a.x, a.z);
  const wb = toWorld(map, b.x, b.z);
  return Math.hypot(wa.x - wb.x, wa.y - wb.y, wa.z - wb.z);
}

export function sameLevel(map: MapData, a: Point, b: Point): boolean {
  return levelOf(map, a.x, a.z) === levelOf(map, b.x, b.z);
}

/**
 * A walker moved from `from` to `to`. If that took it past the middle of a flight of stairs,
 * it is now on the other floor: returns where it is in that floor's area. Otherwise `to`.
 */
export function crossStairs(map: MapData, from: Point, to: Point): Point {
  for (const stair of map.stairs) {
    const g = geometry(map, stair);
    const half = stair.lengthM / 2;
    const level = levelOf(map, from.x, from.z);
    if (level === g.lower) {
      const a = onStair(stair, g.u, from);
      const b = onStair(stair, g.u, to);
      if (a.along < half && b.along >= half && inside(stair, b)) return { x: to.x + g.shift.x, z: to.z + g.shift.z };
    } else if (level === g.upper) {
      const back = (p: Point) => ({ x: p.x - g.shift.x, z: p.z - g.shift.z });
      const a = onStair(stair, g.u, back(from));
      const b = onStair(stair, g.u, back(to));
      if (a.along >= half && b.along < half && inside(stair, b)) return back(to);
    }
  }
  return to;
}

/**
 * The walls around each flight, in both floors' areas: the two sides, plus the far end
 * (the top in the lower floor's area, the bottom in the upper floor's). They keep walkers on
 * the flight until they cross its middle.
 */
export function stairWalls(map: MapData): WallSegment[] {
  const walls: WallSegment[] = [];
  for (const stair of map.stairs) {
    const g = geometry(map, stair);
    const at = (along: number, side: number, shift = { x: 0, z: 0 }): [number, number] => [
      stair.x + g.u.x * along - g.u.z * side + shift.x,
      stair.z + g.u.z * along + g.u.x * side + shift.z,
    ];
    const w = stair.widthM / 2;
    const L = stair.lengthM;
    for (const shift of [{ x: 0, z: 0 }, g.shift]) {
      walls.push([...at(0, -w, shift), ...at(L, -w, shift)], [...at(0, w, shift), ...at(L, w, shift)]);
    }
    walls.push([...at(L, -w), ...at(L, w)], [...at(0, -w, g.shift), ...at(0, w, g.shift)]);
  }
  return walls;
}

/** Each flight's floor area in both floors' areas, as boxes: where the ghost may walk on it. */
export function stairFloors(map: MapData): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  const out: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const stair of map.stairs) {
    const g = geometry(map, stair);
    const w = stair.widthM / 2;
    const corners = [
      { x: stair.x - g.u.z * w, z: stair.z + g.u.x * w },
      { x: stair.x + g.u.z * w, z: stair.z - g.u.x * w },
      { x: stair.x + g.u.x * stair.lengthM - g.u.z * w, z: stair.z + g.u.z * stair.lengthM + g.u.x * w },
      { x: stair.x + g.u.x * stair.lengthM + g.u.z * w, z: stair.z + g.u.z * stair.lengthM - g.u.x * w },
    ];
    for (const shift of [{ x: 0, z: 0 }, g.shift]) {
      const xs = corners.map((c) => c.x + shift.x);
      const zs = corners.map((c) => c.z + shift.z);
      out.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    }
  }
  return out;
}

/**
 * The ways from one floor to another for something that walks a route (the ghost). Each way
 * lists the flights to take, in order: the point just below the middle of a flight on this
 * floor, and just above it on the next floor. Every way that never visits a floor twice is
 * listed, so the walker can pick the shortest. Empty if already on the same floor or no stairs
 * connect them.
 */
export function stairRoutes(map: MapData, fromLevel: string, toLevel: string): { before: Point; after: Point }[][] {
  if (fromLevel === toLevel) return [];
  const NUDGE = 0.3;
  const routes: { before: Point; after: Point }[][] = [];
  const walk = (level: string, seen: Set<string>, route: { before: Point; after: Point }[]) => {
    if (level === toLevel) {
      routes.push(route);
      return;
    }
    for (const stair of map.stairs) {
      const g = geometry(map, stair);
      const mid = { x: stair.x + (g.u.x * stair.lengthM) / 2, z: stair.z + (g.u.z * stair.lengthM) / 2 };
      const belowMid = { x: mid.x - g.u.x * NUDGE, z: mid.z - g.u.z * NUDGE };
      const aboveMid = { x: mid.x + g.u.x * NUDGE + g.shift.x, z: mid.z + g.u.z * NUDGE + g.shift.z };
      let next: string;
      let step: { before: Point; after: Point };
      if (stair.lower === level) {
        next = stair.upper;
        step = { before: belowMid, after: aboveMid };
      } else if (stair.upper === level) {
        next = stair.lower;
        step = { before: aboveMid, after: belowMid };
      } else continue;
      if (seen.has(next)) continue;
      walk(next, new Set([...seen, next]), [...route, step]);
    }
  };
  walk(fromLevel, new Set([fromLevel]), []);
  return routes;
}
