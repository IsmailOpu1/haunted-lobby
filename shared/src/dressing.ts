// How a map looks (Phase 8, GDD 26.15): each room's materials, props and practical lights.
// Looks only: the rules never read this. Anything that blocks walking or sight is map furniture
// (map.ts), so the server, physics and the ghost's paths are not affected by dressing.

/** A licensed model from assets-src/models (its folder name), placed in a room. */
export interface DressingProp {
  model: string;
  /** Where its footprint's middle stands, in map coordinates (the same as the map's rooms). */
  x: number;
  z: number;
  /** Height of its base above the floor (for things on a table or shelf). */
  y?: number;
  /** Turn in degrees, counter-clockwise seen from above; 0 faces +z (south). */
  turn?: number;
  scale?: number;
  /** The map furniture or hiding spot this model draws, if any (its look replaces the grey box). */
  draws?: string;
}

/**
 * A piece built by the Blender script to an exact size, for furniture no free model fits (a long
 * banquet table). `kind` names the builder in tools/art/blender/build_room.py.
 */
export type DressingBuild = BanquetTableBuild | GrandfatherClockBuild | MeetingBellBuild;

export interface BanquetTableBuild {
  kind: "banquetTable";
  /** Middle of its footprint, in map coordinates. */
  x: number;
  z: number;
  /** Long side along x when turn is 0. */
  lengthM: number;
  widthM: number;
  /** Height of the top surface. */
  heightM: number;
  turn?: number;
  material: MaterialName;
  /** The map furniture it draws (its look replaces the grey box). */
  draws?: string;
}

/**
 * A task station's grandfather clock: the model's case, baked with the room, with a glass window
 * cut in its trunk door to show the pendulum. Its hands and pendulum move, so the game draws those
 * (client/src/stations.ts). Placed at the model's own centre, which is the station's place.
 */
export interface GrandfatherClockBuild {
  kind: "grandfatherClock";
  model: string;
  x: number;
  z: number;
  turn?: number;
  /** The map furniture it draws (its case). */
  draws?: string;
  /** The task station whose grey clock it replaces. */
  station: string;
}

/**
 * The meeting bell (GDD 16): a brass service bell on a turned pedestal, built by script and baked
 * with the room. Stands at the map's bell; the game then leaves out its grey bell.
 */
export interface MeetingBellBuild {
  kind: "meetingBell";
  x: number;
  z: number;
  /** Height of the pedestal's top. */
  heightM?: number;
  material?: MaterialName;
  turn?: number;
  /** The map furniture it draws (the pedestal). */
  draws?: string;
  /** Always "bell": the map's meeting bell. */
  station: "bell";
}

/** A warm practical light (lamp, candle, fireplace), baked into the room's lightmap. */
export interface DressingLight {
  x: number;
  z: number;
  /** Height above the floor. */
  y: number;
  /** Colour temperature in kelvin (2,700 K is a warm bulb, 1,900 K a candle). */
  kelvin: number;
  /** Blender light power in watts. */
  watts: number;
  /** Radius of the glowing part in metres (softer shadows when bigger). */
  radius: number;
}

/** A material name from assets-src/textures. */
export type MaterialName = string;

export interface RoomDressing {
  room: string;
  /** Wall above the panelling (or the whole wall when there is no panelling). */
  wall: MaterialName;
  /** Wood panelling up to this height in metres, with a rail on top. */
  wainscot?: { material: MaterialName; heightM: number };
  floor: MaterialName;
  ceiling: MaterialName;
  /** Rugs: flat rectangles on the floor. */
  rugs?: { material: MaterialName; x: number; z: number; sizeX: number; sizeZ: number; turn?: number }[];
  props: DressingProp[];
  builds?: DressingBuild[];
  lights: DressingLight[];
}

export interface MapDressing {
  mapId: string;
  rooms: RoomDressing[];
}
