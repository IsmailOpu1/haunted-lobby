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
  /** Lay it on its back, front up (a magnifying glass or a frame modelled standing). */
  lay?: boolean;
  /** The map furniture or hiding spot this model draws, if any (its look replaces the grey box). */
  draws?: string;
  /**
   * Simplify the model to about this many triangles (build_room.py MAX_PROP_TRIS otherwise), for a
   * piece repeated many times in one room (dining chairs round every table).
   */
  maxTris?: number;
  /** Only this plant of a scan that holds several side by side (its object name, "shrub_02_b"). */
  part?: string;
  /** Light up some of its materials (a lantern's bulb and glass) in this colour temperature; strength as Blender's emission. */
  glow?: { material: string; kelvin: number; strength: number }[];
}

/**
 * A piece built by the Blender script to an exact size, for furniture no free model fits (a long
 * banquet table). `kind` names the builder in tools/art/blender/build_room.py.
 */
export type DressingBuild =
  | BanquetTableBuild
  | GrandfatherClockBuild
  | MeetingBellBuild
  | ReceptionCounterBuild
  | KeyRackBuild
  | PillarBuild
  | LuggageRackBuild
  | FileChestBuild
  | LuggageCartBuild
  | ShelfBooksBuild
  | SwitchboardBuild
  | BookcaseBuild
  | ReadingTableBuild
  | PedestalDeskBuild
  | BankerLampBuild
  | FireplaceBuild
  | JewelCabinetBuild
  | SideboardBuild
  | ClothedTableBuild
  | BarCounterBuild
  | BackBarBuild
  | CandelabraStandBuild
  | KitchenRangeBuild
  | WorkTableBuild
  | KitchenCounterBuild
  | PanRackBuild
  | HangingChainBuild
  | UprightPianoBuild
  | BandstandBuild
  | ChairRowBuild
  | PierMirrorBuild
  | WallSconceBuild
  | BenchBuild
  | BellBoardBuild
  | FuseBoardBuild
  | LinenShelvesBuild
  | BatteryRackBuild
  | DynamoBuild
  | CableDrumBuild
  | ToolBoardBuild
  | LadderBuild
  | StoreShelvesBuild
  | FountainBuild
  | PavingBuild
  | LeafBedBuild
  | RaisedBedBuild
  | PottingBenchBuild
  | GardenBenchBuild
  | UrnBuild;

/** A stone fountain: an eight-sided basin of still water round a pedestal with two bowls. */
export interface FountainBuild {
  kind: "fountain";
  x: number;
  z: number;
  turn?: number;
  diameterM: number;
  /** Height of the basin's rim. */
  rimM: number;
  draws?: string;
}

/** Flagstone paths: each rectangle is [minX, maxX, minZ, maxZ] in map coordinates. */
export interface PavingBuild {
  kind: "paving";
  rects: [number, number, number, number][];
  material?: MaterialName;
}

/** Flower beds of dead leaves edged with bricks: rectangles as PavingBuild's. */
export interface LeafBedBuild {
  kind: "leafBed";
  rects: [number, number, number, number][];
  /** The map furniture these beds draw (the bushes in them block the way). */
  drawsAll?: string[];
}

/**
 * A raised brick flower bed, long side along x at turn 0. pits: offsets along it of the squares
 * where the relic may be buried; the game draws the loose soil there (client stations.ts digSpot).
 */
export interface RaisedBedBuild {
  kind: "raisedBed";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  pits: number[];
  pitM: number;
  /** The map furniture it draws (one piece per pit) and the search places in its pits. */
  drawsAll: string[];
}

/**
 * The roses task's potting bench, back to the wall: a hand pump, a pail and dead roses where the
 * game's live parts are (client stations.ts roses, which hides its own table when this draws it).
 */
export interface PottingBenchBuild {
  kind: "pottingBench";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  pumpX: number;
  bucketX: number;
  vaseX: number;
  vaseM: number;
  material?: MaterialName;
  station: string;
  draws?: string;
}

/** A garden seat with cast-iron ends; back toward +z at turn 0 (it faces south). */
export interface GardenBenchBuild {
  kind: "gardenBench";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  depthM?: number;
  material?: MaterialName;
  draws?: string;
}

/** A stone garden urn on a plinth. */
export interface UrnBuild {
  kind: "urn";
  x: number;
  z: number;
  turn?: number;
  heightM: number;
  draws?: string;
}

/** A rack of glass battery cells wired in a row, its leads up the wall; back to the wall. */
export interface BatteryRackBuild {
  kind: "batteryRack";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  depthM: number;
  heightM: number;
  tiers?: number;
  material?: MaterialName;
  draws?: string;
}

/** The hotel's dynamo on its timber bed, cables up to the ceiling; long side along x at turn 0. */
export interface DynamoBuild {
  kind: "dynamo";
  x: number;
  z: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** A wooden drum of cable standing on its rims, its axle along x at turn 0. */
export interface CableDrumBuild {
  kind: "cableDrum";
  x: number;
  z: number;
  turn?: number;
  diameterM: number;
  widthM: number;
  material?: MaterialName;
  draws?: string;
}

/** An electrician's tool board at a wall's face, facing out of it; y is its bottom edge. */
export interface ToolBoardBuild {
  kind: "toolBoard";
  x: number;
  z: number;
  turn?: number;
  y: number;
  widthM: number;
  heightM: number;
  material?: MaterialName;
}

/** A ladder leaning on the wall behind it; depthM is its footprint out from the wall line. */
export interface LadderBuild {
  kind: "ladder";
  x: number;
  z: number;
  turn?: number;
  heightM: number;
  widthM?: number;
  depthM?: number;
  material?: MaterialName;
  draws?: string;
}

/** Open store shelves of boxes, tins, bulbs, wire and sacking; back to the wall. */
export interface StoreShelvesBuild {
  kind: "storeShelves";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  depthM: number;
  heightM: number;
  shelves?: number;
  seed?: number;
  material?: MaterialName;
  draws?: string;
}

/** A scrubbed deal bench, its long side along x at turn 0. */
export interface BenchBuild {
  kind: "bench";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  material?: MaterialName;
  draws?: string;
}

/**
 * The servants' bell board at a wall's face, facing out of it: a brass bell on a spring for each
 * room, the room's name on an enamel plate under it. y is the board's bottom edge.
 */
export interface BellBoardBuild {
  kind: "bellBoard";
  x: number;
  z: number;
  turn?: number;
  y: number;
  widthM: number;
  heightM: number;
  /** One per bell, in rows from the top left. */
  labels: string[];
  rows?: number;
  material?: MaterialName;
}

/**
 * The Blackout's fuse box (GDD 13) as a fuse board at a wall's face: slate panel, knife switch,
 * porcelain fuses, conduits to the ceiling. Baked with the room; the game's grey box is left out.
 * y is the board's bottom edge.
 */
export interface FuseBoardBuild {
  kind: "fuseBoard";
  x: number;
  z: number;
  turn?: number;
  y: number;
  widthM: number;
  heightM: number;
  material?: MaterialName;
  draws?: string;
  /** Always "fuseBox": the map's fuse box. */
  station: "fuseBox";
}

/** An open linen press stacked with folded sheets and towels, its back to the wall. */
export interface LinenShelvesBuild {
  kind: "linenShelves";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  depthM: number;
  heightM: number;
  shelves?: number;
  seed?: number;
  material?: MaterialName;
  draws?: string;
}

/**
 * The piano task's upright piano (GDD 9) in rosewood, with candle arms and a music desk, baked with
 * the room; the game then draws only the keys and the card. Placed at the station's own place,
 * facing out of the wall (south at turn 0); backM is how far the wall is behind.
 */
export interface UprightPianoBuild {
  kind: "uprightPiano";
  x: number;
  z: number;
  turn?: number;
  backM: number;
  material?: MaterialName;
  /** The cloth behind the fretwork over the music desk. */
  silk?: MaterialName;
  draws?: string;
  station: string;
}

/**
 * The ballroom's bandstand against a wall (south at turn 0): a panelled platform, satin pleated on
 * the wall behind it between velvet curtains under a pelmet, and the band's music stands on it at
 * `stands` (from its middle: x along it, y toward the wall).
 */
export interface BandstandBuild {
  kind: "bandstand";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  depthM: number;
  heightM: number;
  material?: MaterialName;
  backdrop?: MaterialName;
  stands?: [number, number][];
  seed?: number;
  draws?: string;
}

/** Gilt ballroom chairs with velvet seats, `count` evenly along lengthM, their backs to a wall (south at turn 0). */
export interface ChairRowBuild {
  kind: "chairRow";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  count: number;
  draws?: string;
}

/** A tall gilt pier mirror flat on a wall, placed at the wall's face, facing out of it; y is its bottom edge. */
export interface PierMirrorBuild {
  kind: "pierMirror";
  x: number;
  z: number;
  turn?: number;
  y: number;
  widthM: number;
  heightM: number;
}

/** A brass two-candle sconce at a wall's face, facing out of it; y is the height of its backplate. */
export interface WallSconceBuild {
  kind: "wallSconce";
  x: number;
  z: number;
  turn?: number;
  y: number;
}

/**
 * The stove task's cast-iron range (GDD 9), set in a chimney recess with a mantel shelf over it,
 * baked with the room; the game then draws only the burners, flames and knobs. Placed at the
 * station's own place, facing out of the wall (south at turn 0); backM is how far the wall is behind.
 */
export interface KitchenRangeBuild {
  kind: "kitchenRange";
  x: number;
  z: number;
  turn?: number;
  /** The range's width; the chimney breast's piers stand either side of it. */
  widthM: number;
  backM: number;
  /** The tiles lining the recess (the room's wainscot), and the plaster of the breast above. */
  tiles: MaterialName;
  wall?: MaterialName;
  /** The mantel shelf's wood. */
  material?: MaterialName;
  draws?: string;
  station: string;
}

/** A kitchen work table: a thick scrubbed top, drawers in its aprons, turned legs, a pot-board. Long side along x. */
export interface WorkTableBuild {
  kind: "workTable";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  /** The top's wood (scrubbed pine), and the frame's. */
  top?: MaterialName;
  material?: MaterialName;
  draws?: string;
}

/**
 * Base cupboards under a scrubbed top along a wall, facing out of it (south at turn 0), with a
 * glazed fireclay sink let in and brass taps on the wall over it if sinkX is given (along the
 * counter from its middle).
 */
export interface KitchenCounterBuild {
  kind: "kitchenCounter";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  depthM: number;
  heightM: number;
  sinkX?: number;
  top?: MaterialName;
  material?: MaterialName;
  draws?: string;
}

/** A wrought-iron rack hung on chains from the ceiling, copper pans on its hooks. Long side along x. */
export interface PanRackBuild {
  kind: "panRack";
  x: number;
  z: number;
  turn?: number;
  lengthM: number;
  widthM: number;
  /** Height of the rack's bars above the floor. */
  heightM: number;
  seed?: number;
}

/** A chain from the ceiling down to bottomM above the floor, for a lamp (a prop) hung from it. */
export interface HangingChainBuild {
  kind: "chain";
  x: number;
  z: number;
  bottomM: number;
}

/**
 * A low side cabinet like the jewellery box's (JewelCabinetBuild) at any height, for something the
 * game puts on it (a salt jar). Placed at that thing's place, from the wall's face (backM) to
 * frontM in front of it.
 */
export interface SideboardBuild {
  kind: "sideboard";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  backM: number;
  frontM: number;
  heightM: number;
  material?: MaterialName;
  draws?: string;
}

/** A round dining table under a long linen cloth that falls in folds to just above the floor. */
export interface ClothedTableBuild {
  kind: "clothedTable";
  x: number;
  z: number;
  diameterM: number;
  heightM: number;
  seed?: number;
  draws?: string;
}

/**
 * A bar counter: the panelled front of the reception counter with a brass foot rail along the
 * drinkers' side. Built along x; the drinkers' side faces south at turn 0.
 */
export interface BarCounterBuild {
  kind: "barCounter";
  x: number;
  z: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/**
 * The back bar against a wall: a cupboard with a serving top, then mirrored shelves of bottles up
 * to a cornice. Faces south at turn 0 (its back to the north).
 */
export interface BackBarBuild {
  kind: "backBar";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  turn?: number;
  seed?: number;
  material?: MaterialName;
  draws?: string;
}

/**
 * The candelabra task's table and brass candelabra (GDD 9), baked with the room; the game then draws
 * only the candles, their flames and light. Placed at the station's own place.
 */
export interface CandelabraStandBuild {
  kind: "candelabraStand";
  x: number;
  z: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
  station: string;
}

/** A tall library bookcase filled with books, against a wall. Faces south at turn 0. */
export interface BookcaseBuild {
  kind: "bookcase";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  turn?: number;
  seed?: number;
  material?: MaterialName;
  draws?: string;
}

/** A library reading table with a leather writing surface. Long side along x at turn 0. */
export interface ReadingTableBuild {
  kind: "readingTable";
  x: number;
  z: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** A pedestal writing desk: drawers on the sitter's side (north at turn 0), panels to the south. */
export interface PedestalDeskBuild {
  kind: "pedestalDesk";
  x: number;
  z: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** A brass desk lamp with a green glass shade. Its light is one of the room's lights. */
export interface BankerLampBuild {
  kind: "bankerLamp";
  x: number;
  z: number;
  /** Height of the surface it stands on. */
  y: number;
  turn?: number;
}

/**
 * The letter task's fireplace (GDD 9), baked with the room: a chimney breast from the wall, a
 * stone surround and mantel, a grate with logs. The game then draws only the flames, the fire's
 * light and the letter on its hook. Placed at the station's own place, facing the room.
 */
export interface FireplaceBuild {
  kind: "fireplace";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  /** From the station's place back to the wall's face. */
  backM: number;
  /** The surround and mantel (polished black slate when not given). */
  material?: MaterialName;
  /** The chimney breast (the room's wall finish). */
  wall?: MaterialName;
  draws?: string;
  station: string;
}

/**
 * The cabinet a relic spot's jewellery box stands on, baked with the room; the game then draws
 * only the box. Placed at the spot's own place, from the wall's face (backM) to frontM in front.
 */
export interface JewelCabinetBuild {
  kind: "jewelCabinet";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  backM: number;
  frontM: number;
  material?: MaterialName;
  draws?: string;
  /** The relic spot (its search place) whose grey sideboard it replaces. */
  station: string;
}

/**
 * The switchboard task's cabinet, baked with the room; the game then draws only the board's live
 * parts (plugs, sockets, lamps, cables). Placed at the station's own place, facing the room.
 */
export interface SwitchboardBuild {
  kind: "switchboard";
  x: number;
  z: number;
  turn?: number;
  widthM: number;
  heightM: number;
  /** From the station's place back to the wall's face. */
  backM: number;
  material?: MaterialName;
  /** The map furniture it draws (its body). */
  draws?: string;
  /** The task station whose grey switchboard it replaces. */
  station: string;
}

/**
 * Books and ledgers filling a bookcase model's shelves. Placed at the bookcase prop's own place and
 * turn; spines face the bookcase's front.
 */
export interface ShelfBooksBuild {
  kind: "shelfBooks";
  x: number;
  z: number;
  turn?: number;
  /** Inside width and depth of the shelves. */
  widthM: number;
  depthM: number;
  /** Each shelf's top height and the clear height above it. */
  shelves: { y: number; clearM: number }[];
  seed?: number;
}

/** A bellboy's brass luggage cart with suitcases on its deck. Long side along x at turn 0. */
export interface LuggageCartBuild {
  kind: "luggageCart";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  seed?: number;
  turn?: number;
  material?: MaterialName;
  carpet?: MaterialName;
  draws?: string;
}

/** A porter's slatted luggage rack with leather suitcases on it. Faces south at turn 0. */
export interface LuggageRackBuild {
  kind: "luggageRack";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  tiers?: number;
  /** Picks the suitcases' sizes and colours, so two racks differ. */
  seed?: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** A chest of small labelled file drawers. Faces south at turn 0. */
export interface FileChestBuild {
  kind: "fileChest";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  cols?: number;
  rows?: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** A panelled hotel reception counter. Long side along x at turn 0, the guests' side to the south. */
export interface ReceptionCounterBuild {
  kind: "receptionCounter";
  x: number;
  z: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** The pigeonhole key rack on a low cupboard. Its back is to the north at turn 0 (it faces south). */
export interface KeyRackBuild {
  kind: "keyRack";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  turn?: number;
  material?: MaterialName;
  draws?: string;
}

/** A square panelled pillar, floor to ceiling. */
export interface PillarBuild {
  kind: "pillar";
  x: number;
  z: number;
  sizeM: number;
  /** The shaft. */
  material?: MaterialName;
  /** The plinth, capital and mouldings (the shaft's material when not given). */
  trim?: MaterialName;
  draws?: string;
}

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
  /** trim: the rail, skirting, cornice, door frames and hiding cupboards (the panelling's own wood otherwise). */
  wainscot?: { material: MaterialName; heightM: number; trim?: MaterialName };
  floor: MaterialName;
  ceiling: MaterialName;
  /** Rugs: flat rectangles on the floor. */
  rugs?: { material: MaterialName; x: number; z: number; sizeX: number; sizeZ: number; turn?: number }[];
  props: DressingProp[];
  builds?: DressingBuild[];
  lights: DressingLight[];
  /** An open courtyard's walls as the outside of the building, up to the eaves (heightM), windowed. */
  facade?: { heightM: number; windowEveryM: number };
  /** Out of doors: the night sky's colour (linear RGB) and the moon (a sun lamp in the bake). */
  moon?: { sky: [number, number, number]; color: [number, number, number]; strength: number; elevation: number; toward: [number, number] };
}

export interface MapDressing {
  mapId: string;
  rooms: RoomDressing[];
}
