// Map data format (PRD Section 10.8). Everything map-specific is data in /maps,
// loaded by the same rules code. Coordinates: x is east, z is south, y is up, in meters.

/** A straight wall segment between two points on the floor. Must be axis-aligned. */
export type WallSegment = [x1: number, z1: number, x2: number, z2: number];

export interface DoorDef {
  id: string;
  /** Center of the doorway. */
  x: number;
  z: number;
  /** Width of the door panel. */
  width: number;
  /** The direction the closed door spans: along x (in a wall running east-west) or along z. */
  axis: "x" | "z";
}

export interface RoomDef {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A wardrobe, cupboard or curtain a player can hide in (GDD Section 6). It is also solid furniture. */
export interface HidingSpotDef {
  id: string;
  kind: "wardrobe" | "cupboard" | "curtain";
  /** Center of the furniture; a hidden player sits here. */
  x: number;
  z: number;
  sizeX: number;
  sizeZ: number;
  /** Where a player stands when they step out. */
  exit: { x: number; z: number };
}

/** The minigames that exist. Each map's task list picks from these (GDD Section 9). */
export type MinigameKind = "candelabra" | "stove" | "clock" | "letter" | "cradle" | "piano" | "boiler";

/** A place in the map where a task is done. */
export interface TaskStationDef {
  id: string;
  name: string;
  room: string;
  minigame: MinigameKind;
  x: number;
  z: number;
  /** Visible tasks leave a change everyone can see (GDD 9), which the possessed cannot fake. */
  visible: boolean;
  /** Noisy tasks make a sound the ghost can hear when done badly (GDD 9). */
  noisy: boolean;
}

export interface MapData {
  id: string;
  name: string;
  wallHeightM: number;
  wallThicknessM: number;
  walls: WallSegment[];
  doors: DoorDef[];
  rooms: RoomDef[];
  hidingSpots: HidingSpotDef[];
  /** Salt jar spots, one per possible player (GDD 8.3 / 21.1). Each refills 1 handful once. */
  saltJars: { id: string; x: number; z: number }[];
  /** Task stations, in different areas, never in the basement (GDD Section 9). */
  tasks: TaskStationDef[];
  spawns: { x: number; z: number }[];
}

export const HIDING_SPOT_HEIGHT_M = 2;

export function hidingSpotBox(spot: HidingSpotDef): FloorBox {
  return { x: spot.x, z: spot.z, sizeX: spot.sizeX, sizeZ: spot.sizeZ };
}

/** An axis-aligned box on the floor: center and full size. */
export interface FloorBox {
  x: number;
  z: number;
  sizeX: number;
  sizeZ: number;
}

/** Turns a wall segment into a solid box with the map's wall thickness. */
export function wallBox(segment: WallSegment, thickness: number): FloorBox {
  const [x1, z1, x2, z2] = segment;
  if (x1 !== x2 && z1 !== z2) throw new Error(`Wall segment ${segment.join(",")} is not axis-aligned`);
  const alongX = z1 === z2;
  return {
    x: (x1 + x2) / 2,
    z: (z1 + z2) / 2,
    // Extend by half the thickness at each end so corners close without gaps.
    sizeX: alongX ? Math.abs(x2 - x1) + thickness : thickness,
    sizeZ: alongX ? thickness : Math.abs(z2 - z1) + thickness,
  };
}

/** The closed door panel as a solid box. */
export function doorBox(door: DoorDef, thickness: number): FloorBox {
  return {
    x: door.x,
    z: door.z,
    sizeX: door.axis === "x" ? door.width : thickness,
    sizeZ: door.axis === "x" ? thickness : door.width,
  };
}

export function roomAt(map: MapData, x: number, z: number): RoomDef | undefined {
  return map.rooms.find((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}
