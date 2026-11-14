import { levelOf, type MapData } from "@haunted/shared";

// Which rooms you could possibly see from where you stand, so the dressed rooms behind walls are
// not drawn (PRD 9: Low quality under 300,000 triangles). Only the map's walls block the view:
// doors may open and furniture is low, so neither hides a room. Worked out in the floor plan
// (world x and z), one floor at a time. It errs on the side of drawing: a room counts as seen if
// any spot in it can be seen from anywhere near you, so nothing pops in as you walk or turn.

/** A room further than this (the fog's end, game.ts VIEW_FAR_M) can't be seen anyway. */
const VIEW_M = 19;
/** Spots tried in each room, this far apart, and this far in from its edges. */
const SPOT_STEP_M = 1;
const SPOT_INSET_M = 0.2;
/** Besides your own spot, these around you: what you will see a moment from now, walking or running. */
const AROUND_M = 0.75;
/** A floor is the one you stand on when your feet are within this of it. */
const SAME_FLOOR_M = 1.5;

interface Rect {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Spots to look at, as x, z pairs. */
  spots: number[];
}

interface Floor {
  y: number;
  /** Wall segments as x1, z1, x2, z2. */
  walls: number[];
  rects: Rect[];
}

export class RoomSight {
  private floors: Floor[] = [];

  constructor(map: MapData) {
    const floorOf = (x: number, z: number) => {
      const level = levelOf(map, x, z);
      let floor = this.floors.find((f) => f.y === level.y);
      if (!floor) this.floors.push((floor = { y: level.y, walls: [], rects: [] }));
      return { floor, sx: level.shiftX, sz: level.shiftZ };
    };
    for (const [x1, z1, x2, z2] of map.walls) {
      const { floor, sx, sz } = floorOf((x1 + x2) / 2, (z1 + z2) / 2);
      floor.walls.push(x1 + sx, z1 + sz, x2 + sx, z2 + sz);
    }
    for (const r of map.rooms) {
      const { floor, sx, sz } = floorOf((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2);
      const rect = { name: r.name, minX: r.minX + sx, maxX: r.maxX + sx, minZ: r.minZ + sz, maxZ: r.maxZ + sz, spots: [] as number[] };
      for (const x of steps(rect.minX, rect.maxX)) for (const z of steps(rect.minZ, rect.maxZ)) rect.spots.push(x, z);
      floor.rects.push(rect);
    }
  }

  /**
   * The rooms (by name) that might be seen from here, or null when you are between floors (on the
   * stairs): then nothing is left out. x, z: where you stand in the world; feetY: your floor height.
   */
  seen(x: number, feetY: number, z: number): Set<string> | null {
    const floor = this.floors.find((f) => Math.abs(f.y - feetY) < SAME_FLOOR_M);
    if (!floor) return null;
    const eyes = [x, z, x + AROUND_M, z, x - AROUND_M, z, x, z + AROUND_M, x, z - AROUND_M];
    const seen = new Set<string>();
    for (const rect of floor.rects) {
      if (seen.has(rect.name)) continue;
      const near = Math.hypot(Math.max(rect.minX - x, 0, x - rect.maxX), Math.max(rect.minZ - z, 0, z - rect.maxZ));
      if (near > VIEW_M + AROUND_M) continue;
      if (this.sees(floor, eyes, rect)) seen.add(rect.name);
    }
    return seen;
  }

  private sees(floor: Floor, eyes: number[], rect: Rect): boolean {
    for (let e = 0; e < eyes.length; e += 2) {
      const ex = eyes[e]!;
      const ez = eyes[e + 1]!;
      if (ex >= rect.minX && ex <= rect.maxX && ez >= rect.minZ && ez <= rect.maxZ) return true;
      // The room's spot nearest this eye first (it sees through a doorway right beside you).
      const nx = Math.min(Math.max(ex, rect.minX + SPOT_INSET_M), rect.maxX - SPOT_INSET_M);
      const nz = Math.min(Math.max(ez, rect.minZ + SPOT_INSET_M), rect.maxZ - SPOT_INSET_M);
      if (clear(floor.walls, ex, ez, nx, nz)) return true;
      for (let s = 0; s < rect.spots.length; s += 2) {
        const sx = rect.spots[s]!;
        const sz = rect.spots[s + 1]!;
        if (Math.hypot(sx - ex, sz - ez) > VIEW_M) continue;
        if (clear(floor.walls, ex, ez, sx, sz)) return true;
      }
    }
    return false;
  }
}

/** Evenly spaced spots from a to b, SPOT_INSET_M in from each end, at most SPOT_STEP_M apart. */
function steps(a: number, b: number): number[] {
  const from = a + SPOT_INSET_M;
  const to = b - SPOT_INSET_M;
  if (to <= from) return [(a + b) / 2];
  const n = Math.ceil((to - from) / SPOT_STEP_M);
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
}

/** True if the line from (ax, az) to (bx, bz) crosses none of the walls. */
export function clear(walls: number[], ax: number, az: number, bx: number, bz: number): boolean {
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minZ = Math.min(az, bz);
  const maxZ = Math.max(az, bz);
  const dx = bx - ax;
  const dz = bz - az;
  for (let i = 0; i < walls.length; i += 4) {
    const x1 = walls[i]!;
    const z1 = walls[i + 1]!;
    const x2 = walls[i + 2]!;
    const z2 = walls[i + 3]!;
    if (Math.max(x1, x2) < minX || Math.min(x1, x2) > maxX || Math.max(z1, z2) < minZ || Math.min(z1, z2) > maxZ) continue;
    const wx = x2 - x1;
    const wz = z2 - z1;
    const denom = dx * wz - dz * wx;
    if (denom === 0) continue; // parallel: a line along a wall's face is not stopped by it
    const t = ((x1 - ax) * wz - (z1 - az) * wx) / denom;
    const u = ((x1 - ax) * dz - (z1 - az) * dx) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) return false;
  }
  return true;
}
