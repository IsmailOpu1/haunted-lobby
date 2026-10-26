import { init, NavMeshQuery } from "@recast-navigation/core";
import { generateSoloNavMesh } from "@recast-navigation/generators";
import { config, HIDING_SPOT_HEIGHT_M, hidingSpotBox, levelOf, stairFloors, stairRoute, stairWalls, wallBox, type FloorBox, type MapData } from "@haunted/shared";

export interface Point {
  x: number;
  z: number;
  /** A route point on another floor: the walker steps straight there (it is the same real place, see levels.ts). */
  jump?: boolean;
}

let ready: Promise<void> | undefined;

// Voxel size for navmesh baking. Smaller is more exact but slower to bake.
const CELL_SIZE = 0.1;
const CELL_HEIGHT = 0.1;

/**
 * Where the ghost can walk (PRD 10.1: recast-navigation, baked from the level).
 * Door panels are left out, so doorways are always walkable: the ghost opens doors it passes.
 */
export class NavMap {
  private constructor(
    private query: NavMeshQuery,
    private map: MapData,
  ) {}

  static async create(map: MapData): Promise<NavMap> {
    ready ??= init();
    await ready;

    const positions: number[] = [];
    const indices: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      const i = positions.length / 3;
      positions.push(...a, ...b, ...c, ...d);
      indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    };
    const box = (b: FloorBox, h: number) => {
      const x0 = b.x - b.sizeX / 2, x1 = b.x + b.sizeX / 2;
      const z0 = b.z - b.sizeZ / 2, z1 = b.z + b.sizeZ / 2;
      quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]);
      quad([x0, 0, z0], [x0, h, z0], [x0, h, z1], [x0, 0, z1]);
      quad([x1, 0, z1], [x1, h, z1], [x1, h, z0], [x1, 0, z0]);
      quad([x1, 0, z0], [x1, h, z0], [x0, h, z0], [x0, 0, z0]);
      quad([x0, 0, z1], [x0, h, z1], [x1, h, z1], [x1, 0, z1]);
    };

    // Floors slightly overlap so doorways between rooms are connected.
    for (const r of map.rooms) {
      const pad = map.wallThicknessM;
      quad([r.minX - pad, 0, r.minZ - pad], [r.maxX + pad, 0, r.minZ - pad], [r.maxX + pad, 0, r.maxZ + pad], [r.minX - pad, 0, r.maxZ + pad]);
    }
    for (const f of stairFloors(map)) quad([f.minX, 0, f.minZ], [f.maxX, 0, f.minZ], [f.maxX, 0, f.maxZ], [f.minX, 0, f.maxZ]);
    for (const segment of [...map.walls, ...stairWalls(map)]) box(wallBox(segment, map.wallThicknessM), map.wallHeightM);
    for (const spot of map.hidingSpots) box(hidingSpotBox(spot), HIDING_SPOT_HEIGHT_M);

    const result = generateSoloNavMesh(positions, indices, {
      cs: CELL_SIZE,
      ch: CELL_HEIGHT,
      walkableRadius: Math.ceil(config.ghost.radiusM / CELL_SIZE),
      walkableHeight: Math.ceil(config.ghost.heightM / CELL_HEIGHT),
      walkableClimb: 2,
    });
    if (!result.success) throw new Error(`Navmesh bake failed for map ${map.id}`);
    return new NavMap(new NavMeshQuery(result.navMesh), map);
  }

  /**
   * A path from a to b as corner points (the start point excluded). Empty if unreachable.
   * Between floors it walks to the middle of each flight of stairs and jumps to the same place
   * in the next floor's area.
   */
  path(a: Point, b: Point): Point[] {
    const route = stairRoute(this.map, levelOf(this.map, a.x, a.z).id, levelOf(this.map, b.x, b.z).id);
    if (route.length === 0) return this.pathOnFloor(a, b);
    const points: Point[] = [];
    let from = a;
    for (const step of route) {
      const leg = this.pathOnFloor(from, step.before);
      if (leg.length === 0 && Math.hypot(step.before.x - from.x, step.before.z - from.z) > 0.05) return [];
      points.push(...leg, { ...step.after, jump: true });
      from = step.after;
    }
    const last = this.pathOnFloor(from, b);
    if (last.length === 0 && Math.hypot(b.x - from.x, b.z - from.z) > 0.05) return [];
    return [...points, ...last];
  }

  private pathOnFloor(a: Point, b: Point): Point[] {
    const r = this.query.computePath({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z });
    if (!r.success) return [];
    const points = r.path.map((p) => ({ x: p.x, z: p.z }));
    if (points.length > 0 && Math.hypot(points[0]!.x - a.x, points[0]!.z - a.z) < 0.05) points.shift();
    return points;
  }

  /** The nearest walkable point. */
  closest(p: Point): Point {
    const r = this.query.findClosestPoint({ x: p.x, y: 0, z: p.z });
    return r.success ? { x: r.point.x, z: r.point.z } : p;
  }

  randomPoint(): Point {
    const r = this.query.findRandomPoint();
    return { x: r.randomPoint.x, z: r.randomPoint.z };
  }
}
