import type {
  DoorDef,
  FurnitureDef,
  HidingSpotDef,
  LevelDef,
  MapData,
  RelicSpotDef,
  RoomDef,
  StairDef,
  TaskStationDef,
  WallSegment,
} from "@haunted/shared";

// Builds MapData from a floor plan written in real coordinates (x east, z south, per floor).
// Walls are not listed by hand: they go wherever two different rooms (or a room and the
// outside) meet, except at doors, open archways and stairwells. Each floor is then moved to
// its own area of the flat simulation plane (shared/levels.ts).

type Point = { x: number; z: number };

/** A gap in a wall with no door: an archway, or where two corridors run into each other. */
export interface Opening {
  x: number;
  z: number;
  width: number;
  axis: "x" | "z";
}

export interface FloorPlan {
  id: string;
  name: string;
  /** Height of this floor in meters. */
  y: number;
  /** Where this floor's area sits in the simulation plane: simulation x = real x + offsetX. */
  offsetX: number;
  rooms: RoomDef[];
  doors?: DoorDef[];
  openings?: Opening[];
  hidingSpots?: HidingSpotDef[];
  furniture?: FurnitureDef[];
  saltJars?: { id: string; x: number; z: number }[];
  tasks?: TaskStationDef[];
  relicSpots?: RelicSpotDef[];
  spawns?: Point[];
  bell?: Point;
  fuseBox?: Point;
  altar?: Point;
  ghostStart?: Point;
}

export interface Plan {
  id: string;
  name: string;
  wallHeightM: number;
  wallThicknessM: number;
  floors: FloorPlan[];
  /** Stairs with the bottom step in real coordinates. */
  stairs: StairDef[];
  relicDoor?: string;
  relicNames: string[];
}

const EPS = 1e-3;
const BOUNDS_MARGIN_M = 10;

const DIRS: Record<StairDef["dir"], Point> = { "+x": { x: 1, z: 0 }, "-x": { x: -1, z: 0 }, "+z": { x: 0, z: 1 }, "-z": { x: 0, z: -1 } };

/** A flight's footprint on the floor plan (real coordinates). */
export function stairFootprint(s: StairDef): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const u = DIRS[s.dir];
  const endX = s.x + u.x * s.lengthM;
  const endZ = s.z + u.z * s.lengthM;
  const w = s.widthM / 2;
  return {
    minX: Math.min(s.x, endX) - (u.x === 0 ? w : 0),
    maxX: Math.max(s.x, endX) + (u.x === 0 ? w : 0),
    minZ: Math.min(s.z, endZ) - (u.z === 0 ? w : 0),
    maxZ: Math.max(s.z, endZ) + (u.z === 0 ? w : 0),
  };
}

function roomNameAt(rooms: RoomDef[], x: number, z: number): string | null {
  return rooms.find((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)?.name ?? null;
}

/** The walls of one floor, in real coordinates. */
export function floorWalls(floor: FloorPlan, stairs: StairDef[]): WallSegment[] {
  const gaps: Opening[] = [...(floor.doors ?? []), ...(floor.openings ?? [])];
  const holes = stairs.filter((s) => s.lower === floor.id || s.upper === floor.id).map(stairFootprint);
  const inHole = (x: number, z: number) => holes.some((h) => x >= h.minX - EPS && x <= h.maxX + EPS && z >= h.minZ - EPS && z <= h.maxZ + EPS);
  const walls: WallSegment[] = [];

  // Every line a room edge lies on, and every place along it where something might change.
  const xs = new Set<number>();
  const zs = new Set<number>();
  for (const r of floor.rooms) {
    xs.add(r.minX).add(r.maxX);
    zs.add(r.minZ).add(r.maxZ);
  }
  for (const h of holes) {
    xs.add(h.minX).add(h.maxX);
    zs.add(h.minZ).add(h.maxZ);
  }
  const cutsAlongX = new Set(xs);
  const cutsAlongZ = new Set(zs);
  for (const g of gaps) {
    if (g.axis === "x") cutsAlongX.add(g.x - g.width / 2).add(g.x + g.width / 2);
    else cutsAlongZ.add(g.z - g.width / 2).add(g.z + g.width / 2);
  }

  const lines = (fixed: Set<number>, cuts: Set<number>, alongX: boolean) => {
    const sorted = [...cuts].sort((a, b) => a - b);
    for (const c of fixed) {
      let start: number | null = null;
      for (let i = 0; i + 1 < sorted.length; i++) {
        const a = sorted[i]!;
        const b = sorted[i + 1]!;
        const m = (a + b) / 2;
        const [x, z] = alongX ? [m, c] : [c, m];
        const one = alongX ? roomNameAt(floor.rooms, x, z - EPS) : roomNameAt(floor.rooms, x - EPS, z);
        const two = alongX ? roomNameAt(floor.rooms, x, z + EPS) : roomNameAt(floor.rooms, x + EPS, z);
        const gap = gaps.some((g) => g.axis === (alongX ? "x" : "z") && Math.abs((alongX ? g.z : g.x) - c) < EPS && Math.abs((alongX ? g.x : g.z) - m) < g.width / 2);
        const wall = one !== two && !gap && !inHole(x, z);
        if (wall && start === null) start = a;
        if (!wall && start !== null) {
          walls.push(alongX ? [start, c, a, c] : [c, start, c, a]);
          start = null;
        }
        if (wall && i + 2 === sorted.length) walls.push(alongX ? [start!, c, b, c] : [c, start!, c, b]);
      }
    }
  };
  lines(zs, cutsAlongX, true);
  lines(xs, cutsAlongZ, false);

  // A door or opening must sit where a wall would be, along its whole width: between two
  // different rooms, the same two all the way.
  for (const g of gaps) {
    const sides = [-0.45, 0, 0.45].map((t) => {
      const along = t * g.width;
      const [x, z] = g.axis === "x" ? [g.x + along, g.z] : [g.x, g.z + along];
      const [ax, az, bx, bz] = g.axis === "x" ? [x, z - EPS, x, z + EPS] : [x - EPS, z, x + EPS, z];
      return `${roomNameAt(floor.rooms, ax, az)}|${roomNameAt(floor.rooms, bx, bz)}`;
    });
    const [one, two] = sides[1]!.split("|");
    if (one === two || new Set(sides).size > 1) throw new Error(`Gap at ${g.x}, ${g.z} on ${floor.id} is not between two rooms along its whole width`);
  }
  return walls;
}

export function buildMap(plan: Plan): MapData {
  const byId = new Map(plan.floors.map((f) => [f.id, f]));
  const floor = (id: string) => {
    const f = byId.get(id);
    if (!f) throw new Error(`Unknown floor ${id}`);
    return f;
  };

  const map: MapData = {
    id: plan.id,
    name: plan.name,
    wallHeightM: plan.wallHeightM,
    wallThicknessM: plan.wallThicknessM,
    levels: [],
    stairs: plan.stairs.map((s) => ({ ...s, x: s.x + floor(s.lower).offsetX })),
    walls: [],
    doors: [],
    rooms: [],
    hidingSpots: [],
    saltJars: [],
    tasks: [],
    relicSpots: [],
    relicNames: plan.relicNames,
    spawns: [],
    furniture: [],
    relicDoor: plan.relicDoor,
  };

  for (const f of plan.floors) {
    const dx = f.offsetX;
    const p = <T extends Point>(o: T): T => ({ ...o, x: o.x + dx });
    const xs = f.rooms.flatMap((r) => [r.minX, r.maxX]);
    const zs = f.rooms.flatMap((r) => [r.minZ, r.maxZ]);
    const level: LevelDef = {
      id: f.id,
      name: f.name,
      minX: Math.min(...xs) - BOUNDS_MARGIN_M + dx,
      maxX: Math.max(...xs) + BOUNDS_MARGIN_M + dx,
      minZ: Math.min(...zs) - BOUNDS_MARGIN_M,
      maxZ: Math.max(...zs) + BOUNDS_MARGIN_M,
      y: f.y,
      shiftX: -dx,
      shiftZ: 0,
    };
    map.levels.push(level);
    map.walls.push(...floorWalls(f, plan.stairs).map(([x1, z1, x2, z2]): WallSegment => [x1 + dx, z1, x2 + dx, z2]));
    map.rooms.push(...f.rooms.map((r) => ({ ...r, minX: r.minX + dx, maxX: r.maxX + dx })));
    map.doors.push(...(f.doors ?? []).map(p));
    map.hidingSpots.push(...(f.hidingSpots ?? []).map((h) => ({ ...p(h), exit: p(h.exit) })));
    map.furniture.push(...(f.furniture ?? []).map(p));
    map.saltJars.push(...(f.saltJars ?? []).map(p));
    map.tasks.push(...(f.tasks ?? []).map(p));
    map.relicSpots.push(...(f.relicSpots ?? []).map(p));
    map.spawns.push(...(f.spawns ?? []).map(p));
    if (f.bell) map.bell = p(f.bell);
    if (f.fuseBox) map.fuseBox = p(f.fuseBox);
    if (f.altar) map.altar = p(f.altar);
    if (f.ghostStart) map.ghostStart = p(f.ghostStart);
  }
  // Floors must not overlap in the simulation plane.
  for (const a of map.levels) {
    for (const b of map.levels) {
      if (a !== b && a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ) throw new Error(`Floors ${a.id} and ${b.id} overlap`);
    }
  }
  return map;
}

// Helpers for placing things against a wall. `at` is a point on the wall's center line and
// `facing` points into the room.

type Facing = "n" | "s" | "e" | "w";
const FACING: Record<Facing, Point> = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };
const HALF_WALL_M = 0.1;
const EXIT_GAP_M = 0.45;

const HIDE_SIZE: Record<HidingSpotDef["kind"], { width: number; depth: number }> = {
  wardrobe: { width: 1.2, depth: 0.6 },
  cupboard: { width: 1.2, depth: 0.6 },
  curtain: { width: 1.0, depth: 0.4 },
};

/** A hiding spot standing against a wall, with its exit in front of it. */
export function hide(id: string, kind: HidingSpotDef["kind"], x: number, z: number, facing: Facing): HidingSpotDef {
  const { width, depth } = HIDE_SIZE[kind];
  const f = FACING[facing];
  const back = HALF_WALL_M + depth / 2;
  const front = HALF_WALL_M + depth + EXIT_GAP_M;
  const across = f.x === 0;
  return {
    id,
    kind,
    x: x + f.x * back,
    z: z + f.z * back,
    sizeX: across ? width : depth,
    sizeZ: across ? depth : width,
    exit: { x: x + f.x * front, z: z + f.z * front },
  };
}

/** A piece of furniture against a wall: `width` along the wall, `depth` into the room. */
export function against(id: string, kind: string, room: string, x: number, z: number, facing: Facing, width: number, depth: number, heightM: number): FurnitureDef {
  const f = FACING[facing];
  const back = HALF_WALL_M + depth / 2;
  const across = f.x === 0;
  return { id, kind, room, x: x + f.x * back, z: z + f.z * back, sizeX: across ? width : depth, sizeZ: across ? depth : width, heightM };
}

/** A free-standing piece of furniture, centered on (x, z). */
export function piece(id: string, kind: string, room: string, x: number, z: number, sizeX: number, sizeZ: number, heightM: number): FurnitureDef {
  return { id, kind, room, x, z, sizeX, sizeZ, heightM };
}
