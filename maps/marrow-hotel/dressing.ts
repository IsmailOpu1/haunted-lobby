import type { DressingBuild, DressingLight, DressingProp, MapDressing } from "@haunted/shared";

/**
 * How the Marrow Hotel looks (Phase 8, GDD 23 and 26.15). Looks only: the furniture that blocks is
 * in greybox.ts, and each prop that draws one names it in `draws`. Places are map coordinates
 * (x east, z south). A turn of 0 faces south, 90 east, 180 north, -90 west.
 *
 * Models and textures are CC0 from Poly Haven (docs/ASSETS.md).
 */

// Heights of the tops that small things stand on.
const CONSOLE_TOP = 0.95;
const MEETING_TOP = 0.877;
/** The linen runner down the banquet table (build_room.py RUNNER_T). */
const RUNNER_M = 0.004;
const COFFEE_WEST_TOP = 0.52;
const COFFEE_EAST_TOP = 0.56;
const SIDE_TOP = 0.55;
const RECEPTION_COUNTER_TOP = 1.1;
const TALL_SIDE_TOP = 0.76;
const OFFICE_DESK_TOP = 0.83;
const CRATE_TOP = 0.46;
const LIBRARY_CEILING = 2.95;
const READING_TOP = 0.78;
const STUDY_DESK_TOP = 0.78;
const NIGHTSTAND_TOP = 0.7;
/** build_room.py LOCKBOX_TOP. */
const JEWEL_CABINET_TOP = 0.85;
/** build_room.py MANTEL_Y plus the mantel shelf's thickness. */
const MANTEL_TOP = 1.175;
// The room side of the Main Hall's north and south walls (the dressed wall stands 5 mm off the
// grey wall box, tools/art/blender/build_room.py FACE_GAP).
const NORTH_FACE = 4.605;
const SOUTH_FACE = 18.395;

// The Restaurant (map furniture in greybox.ts diningTable).
const RESTAURANT_CEILING = 2.95;
/** The cloth's top (build_room.py clothed_table: the table's height plus the cloth). */
const CLOTH_TOP = 0.764;
const SIDEBOARD_TOP = 0.79;
const BAR_TOP = 1.05;
const BISTRO_TOP = 0.746;
const BARREL_TOP = 0.871;
const LANTERN_H = 0.878;
// The room side of the Restaurant's west and east walls, and of the bar's north wall.
const RESTAURANT_WEST_FACE = 9.105;
const RESTAURANT_EAST_FACE = 22.895;
const BAR_WALL_NORTH_FACE = 13.395;
/** Dining chairs repeat round every table: simplified harder than one-off props. */
const CHAIR_TRIS = 6000;

// The Kitchen.
const WORK_TOP = 0.9;
const POT_BOARD = 0.16;
const KITCHEN_CABINET_TOP = 1.182;
const RANGE_MANTEL_TOP = 1.795;
/** The dresser's top and its shelves (measured on the model). */
const DRESSER_TOP = 1.167;
const DRESSER_SHELVES = [1.58, 1.894, 2.189];
/** The mantel shelf's middle, out from the east wall (build_room.py kitchen_range). */
const RANGE_MANTEL_X = 22.27;
const LANTERN_SMALL_H = 0.294;
const LANTERN_CHAIN_BOTTOM = 2.255;
const KITCHEN_LANTERNS: [number, number][] = [
  [13.6, -3.6],
  [13.6, 2.3],
  [20.3, 2.3],
  [20.3, -3.4],
];
const CHAIR_OUT_M = 0.78;

// The Ballroom: the room side of its four walls.
const BALLROOM_WEST_FACE = -22.895;
const BALLROOM_EAST_FACE = -11.605;
const BALLROOM_SOUTH_FACE = -6.105;
const STAGE_TOP = 0.5;
/** The refreshment table's top. */
const REFRESH_TOP = 0.76;
/** The piano's lid (build_room.py upright_piano: its top plus the lid), and the lid's middle out from the wall. */
const PIANO_LID_TOP = 1.29;
const PIANO_LID_X = -22.6;
/** The chandeliers hang as the Reception's does, their bottoms at this height. */
const BALLROOM_CHANDELIER_Y = 2.06;
const BALLROOM_CHANDELIERS: [number, number][] = [
  [-17.25, -10.5],
  [-17.25, -15.5],
];
/** Wall sconces: the backplate's height, and how far out from the wall their candles stand. */
const SCONCE_Y = 1.75;
const SCONCE_OUT = 0.15;
const SCONCES_SOUTH = [-18.75, -16.05];
const SCONCES_WEST = [-17.4, -15.2, -10.4];
const PIER_MIRROR = { y: 1.05, widthM: 0.9, heightM: 1.5 };

// The Service Room: the room side of its west and south walls.
// The Garden Courtyard (open to the sky; the Service Room's lessons on dark, dull materials hold).
const COURTYARD_WEST_FACE = -8.895;
const COURTYARD_EAST_FACE = 8.895;
const COURTYARD_SOUTH_FACE = 1.895;
const COURTYARD_NORTH_FACE = -13.895;
/**
 * street_lamp_02 (a lantern on a scrolled wall bracket): 0.81 deep, its bulb 0.61 out and 1.065 up.
 * The baked light sits just under the model's bulb, inside the glass: inside the bulb it is shut in.
 */
const LAMP_DEPTH = 0.81;
const LAMP_BULB_OUT = 0.61;
const LAMP_LIGHT_UP = 0.985;
const LAMP_BASE_Y = 1.45;
/** The lantern lit: its bulb bright, its glass a soft warm glow. */
const LAMP_GLOW = [
  { material: "street_lamp_02_bulb", kelvin: 2400, strength: 8 },
  { material: "street_lamp_02_glass", kelvin: 2400, strength: 1.2 },
];
const RAISED_BED_TOP = 0.48;
/** Wall lanterns: where along the wall, and the wall (its face and which way it looks). */
const COURTYARD_LAMPS: { x: number; z: number; turn: number; nx: number; nz: number }[] = [
  ...[-1.75, 1.75].map((x) => ({ x, z: COURTYARD_SOUTH_FACE, turn: 180, nx: 0, nz: -1 })),
  ...[-1.75, 1.75].map((x) => ({ x, z: COURTYARD_NORTH_FACE, turn: 0, nx: 0, nz: 1 })),
  ...[-1.5, -6].map((z) => ({ x: COURTYARD_WEST_FACE, z, turn: 90, nx: 1, nz: 0 })),
  ...[-1.5, -8].map((z) => ({ x: COURTYARD_EAST_FACE, z, turn: -90, nx: -1, nz: 0 })),
];
/** Dead rose bushes in the beds by the walls: [x, z, which plant of shrub_02, turn]. */
const COURTYARD_SHRUBS: [number, number, string, number][] = [
  [-8.5, 0.4, "a", 20],
  [-8.5, -1.6, "b", 140],
  [-8.5, -3.5, "c", 260],
  [8.5, 0.5, "d", 200],
  [8.5, -1.4, "a", 80],
  [8.5, -3.4, "c", 320],
  [8.5, -6.2, "b", 10],
  [8.5, -8.6, "d", 190],
  [-7.6, -13.5, "c", 30],
  [-5.8, -13.5, "a", 200],
  [-4.1, -13.5, "b", 100],
  [7.4, -13.5, "a", 300],
];
/** Nettles and weeds: [x, z, y, which plant, turn]. */
const COURTYARD_NETTLES: [number, number, number, string, number][] = [
  [-2.9, -3.1, 1.02, "tall_a", 0],
  [2.9, -3.1, 1.02, "medium_a", 90],
  [-2.9, -8.9, 1.02, "tall_b", 200],
  [2.9, -8.9, 1.02, "medium_b", 30],
  [5.0, -12.9, RAISED_BED_TOP, "tall_a", 60],
  [5.1, -7.1, RAISED_BED_TOP, "medium_a", 160],
  [4.85, -8.85, RAISED_BED_TOP, "small_a", 10],
  [-0.95, 1.55, 0, "small_b", 0],
  [0.95, -13.55, 0, "small_a", 120],
  [-8.6, -9.4, 0, "tall_b", 70],
  [8.6, -12.6, 0, "medium_b", 250],
  [-3.2, -13.5, 0, "small_b", 300],
  [-8.55, -4.75, 0, "medium_a", 40],
  [2.75, -5.0, 0, "small_a", 180],
];

const SERVICE_WEST_FACE = 11.605;
const SERVICE_SOUTH_FACE = -6.105;
const SERVANTS_TABLE_TOP = 0.76;
const SERVICE_SIDEBOARD_TOP = 0.79;
const FUSE_BENCH_TOP = 0.85;
/** The dresser's middle out from the west wall (greybox.ts service-dresser). */
const SERVICE_DRESSER_X = 11.965;
const SERVICE_LANTERNS: [number, number][] = [
  [15, -11.5],
  [18.6, -14.2],
  [21.75, -8.2],
  [14.2, -19.6],
  [19.6, -19.4],
];

/** The dining chairs round a table (greybox.ts diningTable), each facing it, none quite square. */
function chairs(id: string, x: number, z: number, sides: ("n" | "s" | "w" | "e")[], seed: number): DressingProp[] {
  const at = { n: [0, -1, 0], s: [0, 1, 180], w: [-1, 0, 90], e: [1, 0, -90] } as const;
  return sides.map((s, i) => {
    const [dx, dz, turn] = at[s];
    // Small fixed nudges, as if pushed back by whoever last sat there.
    const k = (seed * 7 + i * 3) % 5;
    const out = CHAIR_OUT_M + [0, 0.03, -0.02, 0.05, 0.01][k]!;
    return { model: "dining_chair_02", x: x + dx * out, z: z + dz * out, turn: turn + [-4, 3, 6, -7, 1][k]!, maxTris: CHAIR_TRIS, draws: `${id}-chair-${s}` };
  });
}

// The corridor ring: the corridor side of each wall (greybox.ts walls are 0.2 thick, faces 5 mm proud).
const FRONT_SOUTH_FACE = 4.395;
const FRONT_NORTH_FACE = 2.105;
const WEST_WEST_FACE = -11.395;
const WEST_EAST_FACE = -9.105;
const EAST_WEST_FACE = 9.105;
const EAST_EAST_FACE = 11.395;
const NORTH_NORTH_FACE = -16.395;
const NORTH_SOUTH_FACE = -14.105;
const CORRIDOR_CEILING = 2.95;
/** The runner down the middle of each corridor; the side corridors' runners stop at the long ones. */
const RUNNER_W = 1.0;
/** The commode's top (GothicCommode_01). */
const COMMODE_TOP = 1.212;
/** Which way a wall sconce faces, out of its wall. */
const SCONCE_TURN = { n: 180, s: 0, e: 90, w: -90 } as const;
const SCONCE_DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
/** build_room.py wall_sconce: each candle 0.13 to the side and 0.15 out, its flame 0.23 over the plate's middle. */
const SCONCE_CANDLE_SIDE = 0.13;
const SCONCE_FLAME_UP = 0.23;
/** The ring's sconces: x, z at the wall's face, the way it faces, and whether its candles still burn. */
const CORRIDOR_SCONCES: [number, number, keyof typeof SCONCE_TURN, boolean][] = [
  // Front Corridor: either side of the Main Hall's door, and two on the courtyard side.
  [-7, FRONT_SOUTH_FACE, "n", false],
  [-1.9, FRONT_SOUTH_FACE, "n", true],
  [1.9, FRONT_SOUTH_FACE, "n", true],
  [7, FRONT_SOUTH_FACE, "n", true],
  [-2.6, FRONT_NORTH_FACE, "s", true],
  [5.6, FRONT_NORTH_FACE, "s", true],
  // West Corridor: either side of the sofa, one by the Ballroom's door, two on the courtyard side.
  [WEST_WEST_FACE, -4.2, "e", true],
  [WEST_WEST_FACE, -7.8, "e", false],
  [WEST_WEST_FACE, -12.5, "e", true],
  [WEST_EAST_FACE, -0.8, "w", true],
  [WEST_EAST_FACE, -8.4, "w", true],
  // East Corridor: either side of the commode, a dead one by the luggage.
  [EAST_EAST_FACE, -4.6, "w", true],
  [EAST_EAST_FACE, -8.4, "w", true],
  [EAST_EAST_FACE, -12.2, "w", false],
  [EAST_WEST_FACE, 0.5, "e", true],
  [EAST_WEST_FACE, -9, "e", true],
  // North Corridor: either side of the console, and along the courtyard side.
  [-6.2, NORTH_NORTH_FACE, "s", true],
  [-1.5, NORTH_NORTH_FACE, "s", false],
  [3.4, NORTH_NORTH_FACE, "s", true],
  [6.6, NORTH_NORTH_FACE, "s", true],
  [-5.5, NORTH_SOUTH_FACE, "n", true],
  [5.8, NORTH_SOUTH_FACE, "n", true],
];
/** Lanterns over the four corners where the corridors meet; two still lit. */
const CORRIDOR_LANTERNS: [number, number, boolean][] = [
  [-10.25, 3.25, true],
  [10.25, 3.25, false],
  [-10.25, -15.25, false],
  [10.25, -15.25, true],
];

export const marrowHotelDressing: MapDressing = {
  mapId: "marrow-hotel-greybox",
  rooms: [
    {
      // A grand lobby left mid-evening: a guest book open on the table, luggage abandoned by the
      // stairs, the clock stopped, a few lamps still burning.
      room: "Main Hall",
      wall: "decrepit_wallpaper",
      wainscot: { material: "dark_paneled_wood", heightM: 1.05 },
      floor: "herringbone_parquet",
      ceiling: "worn_cracked_plaster",
      rugs: [
        { material: "dirty_carpet", x: 0, z: 11, sizeX: 6.6, sizeZ: 3.6 },
        { material: "dirty_carpet", x: -4.4, z: 6.4, sizeX: 3.4, sizeZ: 2.4 },
        { material: "dirty_carpet", x: 4.2, z: 6.4, sizeX: 3, sizeZ: 2.6 },
      ],
      props: [
        // The meeting table (built, see builds below), a chandelier over it.
        { model: "Chandelier_01", x: 0, z: 11, y: 2.13 },
        { model: "brass_candleholders", x: -1.1, z: 11, y: MEETING_TOP + RUNNER_M, turn: 8 },

        // West seating group by the front door.
        { model: "sofa_03", x: -4.2, z: 5.065, draws: "hall-sofa-west" },
        { model: "CoffeeTable_01", x: -4.2, z: 6.5, draws: "hall-coffee-west" },
        { model: "ArmChair_01", x: -6, z: 6.6, turn: 90, draws: "hall-armchair-west" },
        { model: "book_encyclopedia_set_01", x: -4.55, z: 6.45, y: COFFEE_WEST_TOP, turn: 12 },
        { model: "wooden_candlestick", x: -3.75, z: 6.6, y: COFFEE_WEST_TOP },
        { model: "fancy_picture_frame_02", x: -4.2, z: NORTH_FACE + 0.045, y: 1.45 },

        // East seating group.
        { model: "Sofa_01", x: 4.2, z: 4.93, draws: "hall-sofa-east" },
        { model: "gothic_coffee_table", x: 4.2, z: 6.5, draws: "hall-coffee-east" },
        { model: "GreenChair_01", x: 5.9, z: 6.5, turn: -90, draws: "hall-chair-east" },
        { model: "Ottoman_01", x: 2.75, z: 6.5, turn: 90, draws: "hall-ottoman" },
        { model: "side_table_01", x: 5.75, z: 4.85, draws: "hall-side-east" },
        { model: "vintage_oil_lamp", x: 5.75, z: 4.85, y: SIDE_TOP },
        { model: "standing_picture_frame_01", x: 4.5, z: 6.3, y: COFFEE_EAST_TOP, turn: -20 },
        { model: "wooden_candlestick", x: 3.9, z: 6.7, y: COFFEE_EAST_TOP },
        { model: "fancy_picture_frame_01", x: 4.2, z: NORTH_FACE + 0.01, y: 1.4 },

        // Plants either side of the front door, and one in the far corner.
        { model: "potted_plant_02", x: -1.95, z: 5.05, turn: 30, draws: "hall-plant-door-west" },
        { model: "potted_plant_02", x: 1.95, z: 5.05, turn: 200, draws: "hall-plant-door-east" },
        { model: "potted_plant_01", x: -5.8, z: 17.8, turn: 60, draws: "hall-plant-southwest" },

        // The south wall: consoles either side of the clock, a mirror and a painting above them.
        { model: "ClassicConsole_01", x: -2, z: 18.105, turn: 180, draws: "hall-console-west" },
        { model: "ClassicConsole_01", x: 2, z: 18.105, turn: 180, draws: "hall-console-east" },
        { model: "vintage_oil_lamp", x: -2.5, z: 18.1, y: CONSOLE_TOP },
        { model: "mantel_clock_01", x: -1.65, z: 18.15, y: CONSOLE_TOP, turn: 180 },
        { model: "vintage_oil_lamp", x: 2.55, z: 18.1, y: CONSOLE_TOP },
        { model: "antique_ceramic_vase_01", x: 1.6, z: 18.15, y: CONSOLE_TOP },
        { model: "ornate_mirror_01", x: -2, z: SOUTH_FACE - 0.015, y: 1.5, turn: 180 },
        { model: "fancy_picture_frame_02", x: 2, z: SOUTH_FACE - 0.045, y: 1.45, turn: 180 },
        { model: "side_table_01", x: 5.8, z: 17.9, turn: 180, draws: "hall-side-southeast" },
        { model: "marble_bust_01", x: 5.8, z: 17.95, y: SIDE_TOP, turn: 200 },

        // Luggage left at the foot of the grand stairs.
        { model: "vintage_suitcase", x: 7.75, z: 18.23, turn: 180, draws: "hall-luggage" },
      ],
      builds: [
        // The grandfather clock (task-clock), its back to the south wall; the game draws its hands and pendulum.
        // The meeting bell, at the map's bell in front of the meeting table.
        { kind: "meetingBell", x: 0, z: 8.5, heightM: 0.95, material: "dark_wood", draws: "hall-bell-stand", station: "bell" },
        { kind: "grandfatherClock", model: "vintage_grandfather_clock_01", x: 0, z: 18.207, turn: 180, draws: "hall-clock-case", station: "task-clock" },
        // One long mahogany banquet table with a linen runner, where the meetings are held.
        { kind: "banquetTable", x: 0, z: 11, lengthM: 4.5, widthM: 1.4, heightM: MEETING_TOP, material: "dark_wood", draws: "hall-meeting-table" },
      ],
      lights: [
        // Oil lamps on the consoles and the east side table: warm pools at the walls.
        { x: -2.5, z: 18.1, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 35, radius: 0.05 },
        { x: 2.55, z: 18.1, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 35, radius: 0.05 },
        { x: 5.75, z: 4.85, y: SIDE_TOP + 0.45, kelvin: 2300, watts: 30, radius: 0.05 },
        // Candles on the meeting table and the west coffee table.
        { x: -1.1, z: 11, y: MEETING_TOP + 0.8, kelvin: 1900, watts: 6, radius: 0.03 },
        { x: -3.75, z: 6.6, y: COFFEE_WEST_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
      ],
    },
    {
      // The front desk of a hotel that stopped mid-shift: keys still on their hooks, a lamp left
      // burning on the counter, guests' luggage never collected. Marble underfoot and plain plaster
      // over tall dark panelling, unlike the Main Hall's parquet and wallpaper.
      room: "Reception",
      wall: "worn_cracked_plaster",
      wainscot: { material: "dark_wood", heightM: 1.35 },
      floor: "marble_01",
      ceiling: "worn_cracked_plaster",
      rugs: [
        { material: "dirty_carpet", x: -10.9, z: 9, sizeX: 3, sizeZ: 3 },
        { material: "dirty_carpet", x: -13.5, z: 13.9, sizeX: 3.4, sizeZ: 1.3 },
        { material: "dirty_carpet", x: -20.2, z: 15.3, sizeX: 2.2, sizeZ: 2.8 },
      ],
      props: [
        // The desk hall: a chandelier over the way in, the counter's lamp, the clerk's commode and
        // the wall telephone behind the counter.
        { model: "Chandelier_03", x: -13.5, z: 9, y: 2.06, scale: 0.85 },
        { model: "vintage_oil_lamp", x: -12.1, z: 15.35, y: RECEPTION_COUNTER_TOP },
        { model: "GothicCommode_01", x: -11, z: 18.11, turn: 180, draws: "reception-commode" },
        { model: "vintage_telephone_wall_clock", x: -9.2, z: 17.3, y: 1.15, turn: -90 },
        // Waiting group by the east wall.
        { model: "sofa_02", x: -9.51, z: 9, turn: -90, draws: "reception-sofa" },
        { model: "side_table_tall_01", x: -9.29, z: 7.6, draws: "reception-side-north" },
        { model: "side_table_tall_01", x: -9.29, z: 10.4, turn: 40, draws: "reception-side-south" },
        { model: "vintage_oil_lamp", x: -9.29, z: 7.6, y: TALL_SIDE_TOP },
        { model: "CoffeeTable_01", x: -10.65, z: 9, turn: 90, draws: "reception-coffee" },
        { model: "ArmChair_01", x: -11.95, z: 8.4, turn: 75, draws: "reception-armchair-north" },
        { model: "ArmChair_01", x: -11.95, z: 9.6, turn: 105, draws: "reception-armchair-south" },
        { model: "hanging_picture_frame_01", x: -16.885, z: 6.4, y: 1.45, turn: 90 },
        { model: "potted_plant_01", x: -16.5, z: 5.05, turn: 140, draws: "reception-plant-northwest" },
        { model: "potted_plant_02", x: -9.45, z: 13.2, turn: 80, draws: "reception-plant-east" },

        // The back office.
        { model: "WoodenTable_03", x: -20, z: 11.88, draws: "office-desk" },
        { model: "dining_chair_02", x: -20.1, z: 12.75, turn: 170, draws: "office-chair" },
        { model: "office_notepads", x: -19.85, z: 11.9, y: OFFICE_DESK_TOP, scale: 0.6, turn: 4 },
        { model: "round_spectacles", x: -19.55, z: 12.0, y: OFFICE_DESK_TOP, turn: -25 },
        { model: "Lantern_01", x: -20.45, z: 11.8, y: OFFICE_DESK_TOP },
        { model: "wooden_bookshelf_worn", x: -19.5, z: 18.11, turn: 180, draws: "office-ledgers" },

        // The luggage room.
        { model: "treasure_chest", x: -21.3, z: 11.14, turn: 180, draws: "luggage-trunk" },
        { model: "vintage_suitcase", x: -19.9, z: 11.23, turn: 180, draws: "luggage-cases" },
        { model: "wooden_crate_02", x: -22.635, z: 6.4, draws: "luggage-crate" }, // long side along the wall (z), under the candle
        { model: "wooden_candlestick", x: -22.6, z: 6.1, y: CRATE_TOP },
      ],
      builds: [
        { kind: "receptionCounter", x: -13.5, z: 15.5, lengthM: 4, widthM: 1, heightM: RECEPTION_COUNTER_TOP, turn: 180, material: "dark_wood", draws: "reception-desk" },
        { kind: "keyRack", x: -13.5, z: 18.25, widthM: 1.8, depthM: 0.3, heightM: 2.1, turn: 180, material: "dark_wood", draws: "reception-keys" },
        // The switchboard task's cabinet, from the west wall out to the board the game draws on.
        { kind: "switchboard", x: -22.2, z: 14, turn: 90, widthM: 1.24, heightM: 1.9, backM: 0.7, material: "dark_wood", draws: "office-switchboard", station: "task-switchboard" },
        // Ledgers and books on the office bookcase's shelves (heights measured on the model).
        {
          kind: "shelfBooks", x: -19.5, z: 18.11, turn: 180, widthM: 1.24, depthM: 0.5, seed: 21,
          shelves: [{ y: 0.11, clearM: 0.26 }, { y: 0.39, clearM: 0.26 }, { y: 0.67, clearM: 0.27 }, { y: 0.96, clearM: 0.3 }, { y: 1.28, clearM: 0.36 }, { y: 1.66, clearM: 0.38 }],
        },
        // The guest files in the office, and the porter's racks of unclaimed luggage.
        { kind: "fileChest", x: -17.35, z: 12.7, widthM: 1.2, depthM: 0.5, heightM: 1.25, turn: -90, material: "dark_wood", draws: "office-files" },
        { kind: "luggageRack", x: -21.4, z: 4.9, widthM: 1.4, depthM: 0.6, heightM: 1.6, seed: 3, material: "dark_wood", draws: "luggage-shelf-west" },
        { kind: "luggageRack", x: -19.6, z: 4.9, widthM: 1.4, depthM: 0.6, heightM: 1.6, seed: 11, material: "dark_wood", draws: "luggage-shelf-east" },
        { kind: "luggageCart", x: -18.3, z: 11.1, widthM: 1, depthM: 0.6, heightM: 1.75, seed: 5, material: "dark_wood", draws: "luggage-trolley" },
        // Marble shafts on dark wood bases and capitals, matching the floor and the panelling.
        { kind: "pillar", x: -15, z: 12.5, sizeM: 0.5, material: "marble_01", trim: "dark_wood", draws: "reception-pillar-west" },
        { kind: "pillar", x: -12, z: 12.5, sizeM: 0.5, material: "marble_01", trim: "dark_wood", draws: "reception-pillar-east" },
      ],
      lights: [
        { x: -12.1, z: 15.35, y: RECEPTION_COUNTER_TOP + 0.45, kelvin: 2300, watts: 35, radius: 0.05 },
        { x: -9.29, z: 7.6, y: TALL_SIDE_TOP + 0.45, kelvin: 2300, watts: 25, radius: 0.05 },
        { x: -20.45, z: 11.8, y: OFFICE_DESK_TOP + 0.15, kelvin: 2000, watts: 12, radius: 0.03 },
        { x: -22.6, z: 6.1, y: CRATE_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
      ],
    },
    {
      // The Founder's library, kept as he left it: walls of books, green lamps on the reading table,
      // a game of chess never finished; in his study the cold fireplace under his portrait. Boards
      // underfoot and panelling to above head height, unlike the hall's parquet and the marble.
      room: "Library",
      wall: "decrepit_wallpaper",
      wainscot: { material: "dark_paneled_wood", heightM: 2.1 },
      floor: "dark_wood",
      ceiling: "worn_cracked_plaster",
      rugs: [
        { material: "dirty_carpet", x: -14.6, z: -1.6, sizeX: 3, sizeZ: 4.2 },
        { material: "dirty_carpet", x: -14.6, z: 2.3, sizeX: 3.2, sizeZ: 1.8 },
        { material: "dirty_carpet", x: -21.2, z: 1.8, sizeX: 2.4, sizeZ: 2 },
        { material: "dirty_carpet", x: -19.5, z: -3.5, sizeX: 2.8, sizeZ: 2.4 },
      ],
      props: [
        // The reading room: the chandelier over the table, the card catalogue under a landscape,
        // chairs drawn up to the table, books and a magnifying glass left on it.
        { model: "Chandelier_02", x: -14.6, z: -1.6, y: LIBRARY_CEILING - 0.85 },
        { model: "vintage_wooden_drawer_01", x: -15.9, z: -5.395, draws: "library-catalogue" },
        // Off the panelling, which stands 15 mm proud of the wall below 2.1 m.
        { model: "fancy_picture_frame_01", x: -15.9, z: -5.865, y: 1.6 },
        { model: "dining_chair_02", x: -15.4, z: -2.4, turn: 90, draws: "library-chair-west-north" },
        { model: "dining_chair_02", x: -15.45, z: -0.75, turn: 78, draws: "library-chair-west-south" },
        { model: "dining_chair_02", x: -13.8, z: -2.4, turn: -95, draws: "library-chair-east-north" },
        { model: "dining_chair_02", x: -13.75, z: -0.8, turn: -90, draws: "library-chair-east-south" },
        { model: "book_encyclopedia_set_01", x: -14.8, z: -1.05, y: READING_TOP, turn: 90 },
        { model: "magnifying_glass_01", x: -14.35, z: -1.9, y: READING_TOP, turn: 35, lay: true },
        // Two armchairs over an unfinished game of chess.
        { model: "ArmChair_01", x: -15.6, z: 2.3, turn: 90, draws: "library-armchair-west" },
        { model: "ArmChair_01", x: -13.6, z: 2.3, turn: -90, draws: "library-armchair-east" },
        { model: "side_table_01", x: -14.6, z: 2.3, turn: 90, draws: "library-chess-table" },
        { model: "chess_set", x: -14.6, z: 2.3, y: SIDE_TOP, turn: 8 },
        // The west bay: a rocking chair by the lamp, the glazed cabinet, the jewellery box's cabinet.
        { model: "ClassicNightstand_01", x: -22.69, z: 0.65, turn: 90, draws: "library-nightstand" },
        { model: "vintage_oil_lamp", x: -22.69, z: 0.65, y: NIGHTSTAND_TOP },
        { model: "Rockingchair_01", x: -21.6, z: 1.6, turn: 60, draws: "library-rocking-chair" },
        { model: "vintage_cabinet_01", x: -19.6, z: 4.065, turn: 180, draws: "library-display-cabinet" },
        { model: "wooden_candlestick", x: -22.62, z: 3.9, y: JEWEL_CABINET_TOP },

        // The study: his portrait over the mantel, candles either end, his desk and armchair.
        { model: "hanging_picture_frame_03", x: -22.165, z: -1, y: 1.45, turn: 90 },
        { model: "wooden_candlestick", x: -22.06, z: -1.55, y: MANTEL_TOP },
        { model: "wooden_candlestick", x: -22.06, z: -0.45, y: MANTEL_TOP },
        { model: "GreenChair_01", x: -19.4, z: -4.25, turn: 6, draws: "study-chair" },
        { model: "vintage_oil_lamp", x: -18.85, z: -3.6, y: STUDY_DESK_TOP },
        { model: "magnifying_glass_01", x: -19.7, z: -3.3, y: STUDY_DESK_TOP, turn: -20, lay: true },
        { model: "ArmChair_01", x: -21.0, z: -2.5, turn: -120, draws: "study-armchair" },
        { model: "ClassicNightstand_01", x: -17.31, z: -2.2, turn: -90, draws: "study-nightstand" },
        { model: "brass_vase_01", x: -17.31, z: -2.2, y: NIGHTSTAND_TOP },
      ],
      builds: [
        // Bookcases along the east and south walls, and behind the Founder's desk.
        { kind: "bookcase", x: -11.81, z: -4.6, turn: -90, widthM: 2.2, depthM: 0.42, heightM: 2.5, seed: 31, material: "dark_wood", draws: "library-books-east-north" },
        { kind: "bookcase", x: -11.81, z: 0.35, turn: -90, widthM: 2.2, depthM: 0.42, heightM: 2.5, seed: 32, material: "dark_wood", draws: "library-books-east" },
        { kind: "bookcase", x: -11.81, z: 2.65, turn: -90, widthM: 2.2, depthM: 0.42, heightM: 2.5, seed: 33, material: "dark_wood", draws: "library-books-east-south" },
        { kind: "bookcase", x: -15.65, z: 4.19, turn: 180, widthM: 2.3, depthM: 0.42, heightM: 2.5, seed: 34, material: "dark_wood", draws: "library-books-south-west" },
        { kind: "bookcase", x: -13.25, z: 4.19, turn: 180, widthM: 2.3, depthM: 0.42, heightM: 2.5, seed: 35, material: "dark_wood", draws: "library-books-south-east" },
        { kind: "bookcase", x: -19.6, z: -5.69, widthM: 2.0, depthM: 0.42, heightM: 2.5, seed: 36, material: "dark_wood", draws: "study-books" },
        { kind: "readingTable", x: -14.6, z: -1.6, turn: 90, lengthM: 2.8, widthM: 1.1, heightM: READING_TOP, material: "dark_wood", draws: "library-table" },
        { kind: "bankerLamp", x: -14.6, z: -2.75, y: READING_TOP },
        { kind: "bankerLamp", x: -14.6, z: -0.45, y: READING_TOP, turn: 180 },
        { kind: "pedestalDesk", x: -19.4, z: -3.4, lengthM: 1.5, widthM: 0.8, heightM: STUDY_DESK_TOP, material: "dark_wood", draws: "study-desk" },
        // The letter task's fireplace, from the west wall out to the flames and the letter the game draws.
        { kind: "fireplace", x: -22.3, z: -1, turn: 90, widthM: 1.8, backM: 0.6, wall: "decrepit_wallpaper", draws: "study-fireplace", station: "task-letter" },
        // The jewellery box's cabinet (relic-library), from the west wall to just in front of the box.
        { kind: "jewelCabinet", x: -22.55, z: 3.5, turn: 90, widthM: 1.0, backM: 0.35, frontM: 0.2, material: "dark_wood", draws: "library-jewel-cabinet", station: "relic-library" },
      ],
      lights: [
        { x: -14.6, z: -1.6, y: LIBRARY_CEILING - 0.6, kelvin: 2700, watts: 60, radius: 0.25 },
        // Under the banker's lamps' shades (build_room.py banker_lamp).
        { x: -14.6, z: -2.72, y: READING_TOP + 0.33, kelvin: 2400, watts: 12, radius: 0.03 },
        { x: -14.6, z: -0.48, y: READING_TOP + 0.33, kelvin: 2400, watts: 12, radius: 0.03 },
        { x: -22.69, z: 0.65, y: NIGHTSTAND_TOP + 0.45, kelvin: 2300, watts: 22, radius: 0.05 },
        { x: -22.62, z: 3.9, y: JEWEL_CABINET_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -22.06, z: -1.55, y: MANTEL_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -22.06, z: -0.45, y: MANTEL_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -18.85, z: -3.6, y: STUDY_DESK_TOP + 0.45, kelvin: 2300, watts: 20, radius: 0.05 },
      ],
    },
    {
      // The hotel's restaurant, laid for a dinner nobody came down to: cloths on every table, the
      // candelabra waiting to be lit, the tea things set out on the console. Through its door the
      // bar, bottles still on the shelves behind the counter. A checkered stone floor, unlike any
      // other room's.
      room: "Restaurant",
      wall: "decrepit_wallpaper",
      wainscot: { material: "dark_wood", heightM: 1.2 },
      floor: "floor_tiles_06",
      ceiling: "worn_cracked_plaster",
      props: [
        // Lantern chandeliers over the dining room's two halves and over the bar.
        { model: "lantern_chandelier_01", x: 12.2, z: 9.55, y: RESTAURANT_CEILING - LANTERN_H },
        { model: "lantern_chandelier_01", x: 19.4, z: 9.45, y: RESTAURANT_CEILING - LANTERN_H },
        { model: "lantern_chandelier_01", x: 19.3, z: 15.9, y: RESTAURANT_CEILING - LANTERN_H },

        // Chairs drawn up to the tables, and what was left on them.
        ...chairs("restaurant-table-1", 12.2, 7.9, ["n", "s", "w", "e"], 1),
        ...chairs("restaurant-table-2", 19.6, 7.9, ["n", "s", "w", "e"], 2),
        ...chairs("restaurant-table-3", 12.2, 11.2, ["n", "s", "w", "e"], 3),
        ...chairs("restaurant-table-4", 19.2, 11.0, ["n", "s", "w", "e"], 4),
        ...chairs("restaurant-table-5", 11.4, 15.8, ["w", "e"], 5),
        ...chairs("restaurant-table-6", 14.9, 15.8, ["w", "e"], 6),
        { model: "brass_candleholders", x: 12.2, z: 7.9, y: CLOTH_TOP, turn: 15 },
        { model: "wooden_candlestick", x: 19.6, z: 7.75, y: CLOTH_TOP },
        { model: "brass_goblets", x: 19.65, z: 8.2, y: CLOTH_TOP, turn: -12 },
        { model: "wooden_candlestick", x: 12.0, z: 11.2, y: CLOTH_TOP },
        { model: "brass_vase_02", x: 12.45, z: 11.1, y: CLOTH_TOP },
        { model: "brass_candleholders", x: 19.2, z: 11.0, y: CLOTH_TOP, turn: 100 },
        { model: "wooden_candlestick", x: 11.4, z: 15.8, y: CLOTH_TOP },
        { model: "wooden_candlestick", x: 14.75, z: 15.8, y: CLOTH_TOP },
        { model: "brass_goblets", x: 15.0, z: 15.65, y: CLOTH_TOP, turn: 80 },

        // The serving console on the west wall, the tea things set out on it, a painting above.
        { model: "ClassicConsole_01", x: RESTAURANT_WEST_FACE + 0.295, z: 9.6, turn: 90, draws: "restaurant-console" },
        { model: "tea_set_01", x: RESTAURANT_WEST_FACE + 0.3, z: 9.75, y: CONSOLE_TOP, turn: 90, maxTris: 12000 },
        { model: "vintage_oil_lamp", x: RESTAURANT_WEST_FACE + 0.3, z: 9.0, y: CONSOLE_TOP },
        { model: "fancy_picture_frame_02", x: RESTAURANT_WEST_FACE + 0.045, z: 9.6, y: 1.75, turn: 90 },

        // The south bay: the sideboard the salt jar stands on (the game draws the jar), the mirror over it.
        { model: "brass_vase_02", x: 12.4, z: 18.05, y: SIDEBOARD_TOP },
        { model: "wooden_candlestick", x: 13.6, z: 18.1, y: SIDEBOARD_TOP },
        { model: "ornate_mirror_01", x: 13, z: SOUTH_FACE - 0.015, y: 1.6, turn: 180 },

        // Pictures on the other walls, plants in two corners.
        { model: "fancy_picture_frame_01", x: 13.6, z: NORTH_FACE + 0.01, y: 1.75 },
        { model: "fancy_picture_frame_02", x: 20.5, z: NORTH_FACE + 0.045, y: 1.75 },
        { model: "fancy_picture_frame_01", x: RESTAURANT_EAST_FACE - 0.01, z: 11.3, y: 1.75, turn: -90 },
        { model: "fancy_picture_frame_01", x: 21.9, z: BAR_WALL_NORTH_FACE - 0.01, y: 1.75, turn: 180 },
        { model: "potted_plant_01", x: 22.45, z: 5.05, turn: 210, draws: "restaurant-plant-northeast" },
        { model: "potted_plant_02", x: 9.55, z: 17.95, turn: 40, draws: "restaurant-plant-southwest" },

        // The bar: stools at the counter, bottles and goblets on it, its lamp still lit.
        { model: "bar_chair_round_01", x: 20.25, z: 15.0, turn: 10, draws: "bar-stool-north" },
        { model: "bar_chair_round_01", x: 20.25, z: 15.8, turn: -25, draws: "bar-stool-middle" },
        { model: "bar_chair_round_01", x: 20.25, z: 16.6, turn: 40, draws: "bar-stool-south" },
        { model: "wine_bottles_01", x: 21.0, z: 15.75, y: BAR_TOP, turn: 90 },
        { model: "brass_goblets", x: 20.95, z: 14.75, y: BAR_TOP, turn: 70 },
        { model: "vintage_oil_lamp", x: 21.05, z: 16.5, y: BAR_TOP },
        // A table for two, and barrels against the walls with a lantern on one.
        { model: "round_wooden_table_02", x: 18.1, z: 16.0, draws: "bar-table" },
        { model: "wooden_candlestick", x: 18.15, z: 15.95, y: BISTRO_TOP },
        { model: "dining_chair_02", x: 18.1, z: 15.3, turn: 4, maxTris: CHAIR_TRIS, draws: "bar-chair-north" },
        { model: "dining_chair_02", x: 18.05, z: 16.72, turn: 172, maxTris: CHAIR_TRIS, draws: "bar-chair-south" },
        { model: "wine_barrel_01", x: 17.55, z: 14.05, turn: 20, draws: "bar-barrel-north" },
        { model: "wine_barrel_01", x: 17.55, z: 17.95, turn: -35, draws: "bar-barrel-south" },
        { model: "Lantern_01", x: 17.5, z: 17.9, y: BARREL_TOP },
      ],
      builds: [
        { kind: "clothedTable", x: 12.2, z: 7.9, diameterM: 1.2, heightM: 0.76, seed: 1, draws: "restaurant-table-1" },
        { kind: "clothedTable", x: 19.6, z: 7.9, diameterM: 1.2, heightM: 0.76, seed: 2, draws: "restaurant-table-2" },
        { kind: "clothedTable", x: 12.2, z: 11.2, diameterM: 1.2, heightM: 0.76, seed: 3, draws: "restaurant-table-3" },
        { kind: "clothedTable", x: 19.2, z: 11.0, diameterM: 1.2, heightM: 0.76, seed: 4, draws: "restaurant-table-4" },
        { kind: "clothedTable", x: 11.4, z: 15.8, diameterM: 1.2, heightM: 0.76, seed: 5, draws: "restaurant-table-5" },
        { kind: "clothedTable", x: 14.9, z: 15.8, diameterM: 1.2, heightM: 0.76, seed: 6, draws: "restaurant-table-6" },
        // The candelabra task's table and candelabra; the game draws the candles and their flames.
        { kind: "candelabraStand", x: 16, z: 12, turn: 180, material: "dark_wood", draws: "restaurant-candelabra", station: "task-candelabra" },
        // The sideboard the salt jar stands on, from the south wall out to just in front of the jar.
        { kind: "sideboard", x: 13, z: 17.9, turn: 180, widthM: 1.6, backM: 0.495, frontM: 0.1, heightM: SIDEBOARD_TOP, material: "dark_wood", draws: "restaurant-sideboard" },
        // The bar.
        { kind: "barCounter", x: 21.0, z: 15.4, turn: -90, lengthM: 2.8, widthM: 0.6, heightM: BAR_TOP, material: "dark_wood", draws: "bar-counter" },
        { kind: "backBar", x: 22.675, z: 15.25, turn: -90, widthM: 3.2, depthM: 0.45, heightM: 2.4, seed: 8, material: "dark_wood", draws: "bar-back" },
        { kind: "jewelCabinet", x: 22.55, z: 17.85, turn: -90, widthM: 1.1, backM: 0.35, frontM: 0.2, material: "dark_wood", draws: "bar-jewel-cabinet", station: "relic-restaurant" },
      ],
      lights: [
        // Inside the lanterns.
        { x: 12.2, z: 9.55, y: RESTAURANT_CEILING - 0.5, kelvin: 2500, watts: 45, radius: 0.08 },
        { x: 19.4, z: 9.45, y: RESTAURANT_CEILING - 0.5, kelvin: 2500, watts: 45, radius: 0.08 },
        { x: 19.3, z: 15.9, y: RESTAURANT_CEILING - 0.5, kelvin: 2500, watts: 35, radius: 0.08 },
        // Oil lamps on the console and the bar.
        { x: RESTAURANT_WEST_FACE + 0.3, z: 9.0, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 30, radius: 0.05 },
        { x: 21.05, z: 16.5, y: BAR_TOP + 0.45, kelvin: 2300, watts: 30, radius: 0.05 },
        // Candles on the tables, the sideboard and the bar's table; the lantern on the barrel.
        { x: 12.2, z: 7.9, y: CLOTH_TOP + 0.8, kelvin: 1900, watts: 6, radius: 0.03 },
        { x: 19.2, z: 11.0, y: CLOTH_TOP + 0.8, kelvin: 1900, watts: 6, radius: 0.03 },
        { x: 19.6, z: 7.75, y: CLOTH_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 12.0, z: 11.2, y: CLOTH_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 11.4, z: 15.8, y: CLOTH_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 14.75, z: 15.8, y: CLOTH_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 13.6, z: 18.1, y: SIDEBOARD_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 18.15, z: 15.95, y: BISTRO_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 17.5, z: 17.9, y: BARREL_TOP + 0.15, kelvin: 2000, watts: 12, radius: 0.03 },
      ],
    },
    {
      // The hotel kitchen, left in the middle of dinner: the range still alight in its chimney recess,
      // copper pans hanging over the scrubbed work table, vegetables half prepared. White tiles to
      // shoulder height, limewashed plaster above, a red quarry-tile floor.
      room: "Kitchen",
      wall: "worn_cracked_plaster",
      wainscot: { material: "long_white_tiles_laid", heightM: 1.5, trim: "dark_wood" },
      floor: "terracotta_floor_tiles",
      ceiling: "worn_cracked_plaster",
      props: [
        // Lanterns hung on chains over the room's four quarters.
        ...KITCHEN_LANTERNS.map(([x, z]): DressingProp => ({ model: "Lantern_01", x, z, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 })),

        // The north wall: the sink counter, the painted cupboard, a crate, the crock, the dresser.
        { model: "wooden_bucket_01", x: 13.91, z: -5.62, turn: 15 },
        { model: "wooden_cutting_board", x: 12.4, z: -5.62, y: WORK_TOP, turn: 8 },
        { model: "yellow_onion", x: 12.32, z: -5.6, y: WORK_TOP + 0.041 },
        { model: "yellow_onion", x: 12.47, z: -5.66, y: WORK_TOP + 0.041, turn: 70 },
        { model: "wooden_spoon", x: 12.78, z: -5.55, y: WORK_TOP, turn: 20 },
        { model: "jug_01", x: 14.55, z: -5.7, y: WORK_TOP, turn: -30 },
        { model: "painted_wooden_cabinet", x: 15.42, z: -5.587, draws: "kitchen-cabinet" },
        { model: "jug_01", x: 15.1, z: -5.6, y: KITCHEN_CABINET_TOP, turn: 40 },
        { model: "metal_jug", x: 15.75, z: -5.65, y: KITCHEN_CABINET_TOP },
        { model: "wooden_crate_01", x: 16.5, z: -5.69, draws: "kitchen-crate-north" },
        { model: "ceramic_pot", x: 20.6, z: -5.644, draws: "kitchen-crock" },
        { model: "painted_wooden_cabinet_02", x: 22.39, z: -5.53, draws: "kitchen-dresser" },
        { model: "wooden_bowl_01", x: 22.12, z: -5.45, y: DRESSER_TOP },
        { model: "yellow_onion", x: 22.6, z: -5.42, y: DRESSER_TOP },
        { model: "jug_01", x: 22.12, z: -5.76, y: DRESSER_SHELVES[0], turn: 15 },
        { model: "metal_jug", x: 22.62, z: -5.76, y: DRESSER_SHELVES[0] },
        { model: "wooden_bowl_01", x: 22.4, z: -5.76, y: DRESSER_SHELVES[1] },
        { model: "jug_01", x: 22.4, z: -5.76, y: DRESSER_SHELVES[2], turn: -20 },

        // The work table: a basket of onions and sweet potatoes, a bowl, a board, a pot underneath.
        { model: "wicker_basket_01", x: 17.9, z: -0.85, y: WORK_TOP, turn: 10 },
        { model: "yellow_onion", x: 17.82, z: -0.86, y: WORK_TOP + 0.012 },
        { model: "yellow_onion", x: 17.95, z: -0.8, y: WORK_TOP + 0.012, turn: 120 },
        { model: "sweet_potato", x: 17.98, z: -0.92, y: WORK_TOP + 0.04, turn: 60, lay: true },
        { model: "wooden_bowl_01", x: 16.9, z: -1.25, y: WORK_TOP },
        { model: "wooden_cutting_board", x: 16.05, z: -0.82, y: WORK_TOP, turn: -12 },
        { model: "sweet_potato", x: 16.0, z: -0.8, y: WORK_TOP + 0.041 + 0.03, turn: 100, lay: true },
        { model: "wooden_spoon", x: 16.35, z: -0.95, y: WORK_TOP, turn: 75 },
        { model: "brass_pot_01", x: 15.9, z: -1.3, y: WORK_TOP },
        { model: "brass_pot_02", x: 16.3, z: -1.0, y: POT_BOARD, turn: 30 },
        { model: "jug_01", x: 17.6, z: -1.1, y: POT_BOARD, turn: 160 },

        // The range's mantel shelf.
        { model: "brass_pot_01", x: RANGE_MANTEL_X, z: -1.7, y: RANGE_MANTEL_TOP },
        { model: "metal_jug", x: RANGE_MANTEL_X, z: -0.2, y: RANGE_MANTEL_TOP, turn: -90 },
        { model: "wooden_candlestick", x: RANGE_MANTEL_X, z: -0.6, y: RANGE_MANTEL_TOP },

        // The west worktop and the south one, a lamp left burning on it; a crate by the pantry.
        { model: "brass_pot_02", x: 11.92, z: 1.75, y: WORK_TOP, turn: 90 },
        { model: "metal_jug", x: 11.88, z: 0.25, y: WORK_TOP, turn: 60 },
        { model: "wooden_bowl_01", x: 11.95, z: 0.85, y: WORK_TOP },
        { model: "brass_pan_01", x: 20.2, z: 4.12, y: WORK_TOP, turn: 75 },
        { model: "sweet_potato", x: 19.4, z: 4.05, y: WORK_TOP + 0.03, turn: 20, lay: true },
        { model: "sweet_potato", x: 19.5, z: 4.15, y: WORK_TOP + 0.03, turn: -40, lay: true },
        { model: "jug_01", x: 18.95, z: 4.15, y: WORK_TOP, turn: 200 },
        { model: "vintage_oil_lamp", x: 21.9, z: 4.15, y: WORK_TOP },
        { model: "wooden_crate_01", x: 15.2, z: 4.19, turn: 180, draws: "kitchen-crate-south" },
      ],
      builds: [
        { kind: "workTable", x: 17, z: -1, lengthM: 3, widthM: 1.2, heightM: WORK_TOP, draws: "kitchen-island" },
        { kind: "panRack", x: 17, z: -1, lengthM: 2.2, widthM: 0.5, heightM: 2.15, seed: 3 },
        // The stove task's range in its chimney recess; the game draws the burners, flames and knobs.
        { kind: "kitchenRange", x: 22.55, z: -1, turn: -90, widthM: 1.6, backM: 0.35, tiles: "long_white_tiles_laid", wall: "worn_cracked_plaster", material: "dark_wood", draws: "kitchen-range", station: "task-stove" },
        { kind: "kitchenCounter", x: 13.21, z: -5.59, lengthM: 3.2, depthM: 0.62, heightM: WORK_TOP, sinkX: 0.7, draws: "kitchen-sink" },
        { kind: "kitchenCounter", x: 11.91, z: 0.9, turn: 90, lengthM: 3.0, depthM: 0.62, heightM: WORK_TOP, draws: "kitchen-counter-west" },
        { kind: "kitchenCounter", x: 20.75, z: 4.09, turn: 180, lengthM: 4.29, depthM: 0.62, heightM: WORK_TOP, draws: "kitchen-worktop" },
        ...KITCHEN_LANTERNS.map(([x, z]): DressingBuild => ({ kind: "chain", x, z, bottomM: LANTERN_CHAIN_BOTTOM })),
      ],
      lights: [
        // Inside the hanging lanterns.
        ...KITCHEN_LANTERNS.map(([x, z]): DressingLight => ({ x, z, y: LANTERN_CHAIN_BOTTOM - 0.15, kelvin: 2300, watts: 60, radius: 0.04 })),
        // The oil lamp on the south worktop, the candle on the range's mantel.
        { x: 21.9, z: 4.15, y: WORK_TOP + 0.45, kelvin: 2300, watts: 30, radius: 0.05 },
        { x: RANGE_MANTEL_X, z: -0.6, y: RANGE_MANTEL_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
      ],
    },
    {
      // The ballroom, its last dance never finished: music still on the stands, the band's chairs
      // pushed back, chairs round the walls for those who sat out. Gold damask above dark panelling,
      // a parquet dance floor laid on the diagonal, two chandeliers.
      room: "Ballroom",
      wall: "damask_gold",
      wainscot: { material: "dark_wood", heightM: 0.9 },
      floor: "diagonal_parquet",
      ceiling: "worn_cracked_plaster",
      props: [
        ...BALLROOM_CHANDELIERS.map(([x, z]): DressingProp => ({ model: "Chandelier_03", x, z, y: BALLROOM_CHANDELIER_Y, scale: 0.85 })),
        // The band's chairs behind their music stands, pushed back as they left.
        { model: "dining_chair_02", x: -18.2, z: -19.3, y: STAGE_TOP, turn: -6, maxTris: CHAIR_TRIS },
        { model: "dining_chair_02", x: -17.0, z: -19.32, y: STAGE_TOP, turn: 4, maxTris: CHAIR_TRIS },
        { model: "dining_chair_02", x: -15.8, z: -19.28, y: STAGE_TOP, turn: 9, maxTris: CHAIR_TRIS },
        // A vase on the piano, a candle on the jewellery box's cabinet.
        { model: "brass_vase_01", x: PIANO_LID_X, z: -13.5, y: PIANO_LID_TOP },
        { model: "wooden_candlestick", x: -22.62, z: -19.0, y: JEWEL_CABINET_TOP },
        // Plants in the corners.
        { model: "potted_plant_01", x: -21.0, z: -19.35, turn: 20, draws: "ballroom-plant-northwest" },
        { model: "potted_plant_02", x: -12.15, z: -19.35, turn: 130, draws: "ballroom-plant-northeast" },
        { model: "potted_plant_02", x: -22.35, z: -6.65, turn: 250, draws: "ballroom-plant-southwest" },
        { model: "potted_plant_01", x: -12.15, z: -6.65, turn: 75, draws: "ballroom-plant-southeast" },
        // Supper tables round the dance floor, as the guests left them: chairs pushed back, a glass
        // or a bottle still out, the candles never lit again.
        ...chairs("ballroom-table-southwest", -20.0, -9.2, ["w", "e"], 7),
        ...chairs("ballroom-table-southeast", -14.6, -9.2, ["w", "e"], 8),
        ...chairs("ballroom-table-northwest", -20.0, -16.6, ["w", "e"], 9),
        ...chairs("ballroom-table-northeast", -14.4, -16.6, ["w", "e"], 10),
        { model: "brass_candleholders", x: -20.0, z: -9.25, y: CLOTH_TOP, turn: 30 },
        { model: "brass_goblets", x: -14.45, z: -9.0, y: CLOTH_TOP, turn: -20 },
        { model: "wooden_candlestick", x: -14.75, z: -9.35, y: CLOTH_TOP },
        { model: "wine_bottles_01", x: -20.1, z: -16.5, y: CLOTH_TOP, turn: 60 },
        { model: "wooden_candlestick", x: -19.8, z: -16.85, y: CLOTH_TOP },
        { model: "brass_candleholders", x: -14.4, z: -16.6, y: CLOTH_TOP, turn: 120 },
        // The refreshment table on the west wall: tea things, goblets, bottles, a candelabrum.
        { model: "brass_candleholders", x: BALLROOM_WEST_FACE + 0.42, z: -11.7, y: REFRESH_TOP, turn: 90 },
        { model: "tea_set_01", x: BALLROOM_WEST_FACE + 0.4, z: -11.1, y: REFRESH_TOP, turn: 90, maxTris: 12000 },
        { model: "brass_goblets", x: BALLROOM_WEST_FACE + 0.42, z: -10.55, y: REFRESH_TOP, turn: 80 },
        { model: "wine_bottles_01", x: BALLROOM_WEST_FACE + 0.4, z: -10.2, y: REFRESH_TOP, turn: 90 },
        // A chair knocked over in the middle of the floor, the last dance broken off.
        { model: "dining_chair_02", x: -17.3, z: -11.0, lay: true, turn: 8, maxTris: CHAIR_TRIS, draws: "ballroom-fallen-chair" },
        // Somewhere to sit out a dance: a sofa by the east wall, an ottoman by the west.
        { model: "Sofa_01", x: BALLROOM_EAST_FACE - 0.37, z: -8.1, turn: -90, draws: "ballroom-sofa" },
        { model: "Ottoman_01", x: BALLROOM_WEST_FACE + 0.31, z: -15.0, turn: 90, draws: "ballroom-ottoman" },
      ],
      builds: [
        { kind: "bandstand", x: -17, z: -18.9, widthM: 4, depthM: 2, heightM: STAGE_TOP, material: "dark_wood", backdrop: "crepe_satin", seed: 4, stands: [[-1.2, -0.25], [0, -0.25], [1.2, -0.25]], draws: "ballroom-stage" },
        // The piano task's piano; the game draws its keys and the card on its music desk.
        { kind: "uprightPiano", x: -22.55, z: -13, turn: 90, backM: 0.35, material: "dark_wood", draws: "ballroom-piano", station: "task-piano" },
        { kind: "jewelCabinet", x: -22.55, z: -19.39, turn: 90, widthM: 1.0, backM: 0.35, frontM: 0.2, material: "dark_wood", draws: "ballroom-jewel-cabinet", station: "relic-ballroom" },
        { kind: "clothedTable", x: -20.0, z: -9.2, diameterM: 1.2, heightM: 0.76, seed: 7, draws: "ballroom-table-southwest" },
        { kind: "clothedTable", x: -14.6, z: -9.2, diameterM: 1.2, heightM: 0.76, seed: 8, draws: "ballroom-table-southeast" },
        { kind: "clothedTable", x: -20.0, z: -16.6, diameterM: 1.2, heightM: 0.76, seed: 9, draws: "ballroom-table-northwest" },
        { kind: "clothedTable", x: -14.4, z: -16.6, diameterM: 1.2, heightM: 0.76, seed: 10, draws: "ballroom-table-northeast" },
        { kind: "banquetTable", x: BALLROOM_WEST_FACE + 0.4, z: -11, lengthM: 1.8, widthM: 0.8, heightM: REFRESH_TOP, turn: 90, material: "dark_wood", draws: "ballroom-refreshments" },
        // Tall candelabra either side of the bandstand, burnt out.
        { kind: "floorCandelabra", x: -19.45, z: -18.55, turn: 10, draws: "ballroom-candelabra-west" },
        { kind: "floorCandelabra", x: -14.55, z: -18.55, turn: -15, draws: "ballroom-candelabra-east" },
        // Music dropped from the stands and kicked across the floor, and a lady's fan.
        { kind: "scatteredPages", x: -16.9, z: -13.3, count: 6, spreadM: 0.7, seed: 3 },
        { kind: "scatteredPages", x: -17.4, z: -17.6, count: 3, spreadM: 0.35, seed: 5 },
        { kind: "foldingFan", x: -18.7, z: -12.2, turn: 35 },
        // Gilt chairs round the walls, their backs just off the panelling.
        { kind: "chairRow", x: -20.1, z: -6.35, turn: 180, lengthM: 3.0, count: 5, draws: "ballroom-chairs-south-west" },
        { kind: "chairRow", x: -14.7, z: -6.35, turn: 180, lengthM: 3.0, count: 5, draws: "ballroom-chairs-south-east" },
        { kind: "chairRow", x: -11.85, z: -12.6, turn: -90, lengthM: 2.4, count: 4, draws: "ballroom-chairs-east" },
        // Pier mirrors over the chairs and between them, and on the west wall.
        ...[-20.1, -17.4, -14.7].map((x): DressingBuild => ({ kind: "pierMirror", x, z: BALLROOM_SOUTH_FACE, turn: 180, ...PIER_MIRROR })),
        { kind: "pierMirror", x: BALLROOM_EAST_FACE, z: -12.6, turn: -90, ...PIER_MIRROR },
        { kind: "pierMirror", x: BALLROOM_WEST_FACE, z: -16.3, turn: 90, ...PIER_MIRROR },
        ...SCONCES_SOUTH.map((x): DressingBuild => ({ kind: "wallSconce", x, z: BALLROOM_SOUTH_FACE, turn: 180, y: SCONCE_Y })),
        ...SCONCES_WEST.map((z): DressingBuild => ({ kind: "wallSconce", x: BALLROOM_WEST_FACE, z, turn: 90, y: SCONCE_Y })),
      ],
      lights: [
        // Among the chandeliers' candles.
        ...BALLROOM_CHANDELIERS.map(([x, z]): DressingLight => ({ x, z, y: BALLROOM_CHANDELIER_Y + 0.25, kelvin: 2700, watts: 55, radius: 0.25 })),
        // The sconces' candles, a pair to each.
        ...SCONCES_SOUTH.map((x): DressingLight => ({ x, z: BALLROOM_SOUTH_FACE - SCONCE_OUT, y: SCONCE_Y + 0.25, kelvin: 1900, watts: 10, radius: 0.06 })),
        ...SCONCES_WEST.map((z): DressingLight => ({ x: BALLROOM_WEST_FACE + SCONCE_OUT, z, y: SCONCE_Y + 0.25, kelvin: 1900, watts: 10, radius: 0.06 })),
        // The piano's two candles (build_room.py upright_piano: out 0.44, 0.63 either side, flames at 1.17).
        { x: -22.55 + 0.44, z: -13.63, y: 1.17, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -22.55 + 0.44, z: -12.37, y: 1.17, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -22.62, z: -19.0, y: JEWEL_CABINET_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
      ],
    },
    {
      // The servants' hall behind the kitchen: their supper left on the long table, the bell board
      // that called them to every room, linen stacked for the morning. Green distemper to shoulder
      // height, flagstones underfoot; through its door, the fuse room with the hotel's fuse board,
      // and a scullery sink by the drain.
      room: "Service Room",
      wall: "worn_cracked_plaster",
      wainscot: { material: "painted_plaster_green", heightM: 1.2, trim: "dark_wood" },
      floor: "rectangular_paving",
      ceiling: "worn_cracked_plaster",
      props: [
        ...SERVICE_LANTERNS.map(([x, z]): DressingProp => ({ model: "Lantern_01", x, z, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 })),
        // Supper on the servants' table.
        { model: "jug_01", x: 14.2, z: -11.35, y: SERVANTS_TABLE_TOP, turn: 40 },
        { model: "wooden_bowl_01", x: 14.7, z: -11.75, y: SERVANTS_TABLE_TOP },
        { model: "wooden_bowl_01", x: 15.6, z: -11.25, y: SERVANTS_TABLE_TOP },
        { model: "wooden_spoon", x: 15.85, z: -11.3, y: SERVANTS_TABLE_TOP, turn: 60 },
        { model: "wooden_candlestick", x: 15.1, z: -11.5, y: SERVANTS_TABLE_TOP },
        { model: "metal_jug", x: 16.0, z: -11.7, y: SERVANTS_TABLE_TOP, turn: -30 },
        // The dresser on the west wall, its shelves of jugs and bowls.
        { model: "painted_wooden_cabinet_02", x: SERVICE_DRESSER_X, z: -12.3, turn: 90, draws: "service-dresser" },
        { model: "wooden_bowl_01", x: SERVICE_DRESSER_X + 0.08, z: -12.57, y: DRESSER_TOP },
        { model: "jug_01", x: SERVICE_DRESSER_X + 0.08, z: -12.05, y: DRESSER_TOP, turn: 110 },
        { model: "metal_jug", x: SERVICE_DRESSER_X - 0.23, z: -12.55, y: DRESSER_SHELVES[0], turn: 90 },
        { model: "jug_01", x: SERVICE_DRESSER_X - 0.23, z: -12.1, y: DRESSER_SHELVES[0], turn: 70 },
        { model: "wooden_bowl_01", x: SERVICE_DRESSER_X - 0.23, z: -12.3, y: DRESSER_SHELVES[1] },
        { model: "jug_01", x: SERVICE_DRESSER_X - 0.23, z: -12.3, y: DRESSER_SHELVES[2], turn: 100 },
        // A candle on the sideboard beside the salt jar.
        { model: "wooden_candlestick", x: 16.0, z: -6.4, y: SERVICE_SIDEBOARD_TOP },
        // The fuse room: crates in the corner, the electrician's lamp and torch on the workbench.
        { model: "wooden_crate_02", x: 12.45, z: -21.635, draws: "service-fuse-crates" },
        { model: "wooden_crate_01", x: 12.5, z: -21.66, y: 0.46, turn: 6 },
        { model: "vintage_oil_lamp", x: 16.62, z: -18.85, y: FUSE_BENCH_TOP },
        { model: "vintage_flashlight", x: 16.55, z: -18.2, y: FUSE_BENCH_TOP, turn: 35 },
        { model: "metal_jug", x: 16.7, z: -17.95, y: FUSE_BENCH_TOP },
        // The scullery: a bucket by the sink, a stool, baskets against the stair wall.
        { model: "wooden_bucket_01", x: 18.1, z: -21.6, turn: 25 },
        { model: "wooden_stool_02", x: 17.75, z: -19.6, turn: 15 },
        { model: "wicker_basket_01", x: 20.05, z: -15.9, turn: -20, draws: "service-baskets" },
        // Added for more life: the staff telephone by the bell board, the painted cupboard with
        // crocks on it, chairs at the table's ends, a broom by the back stairs.
        { model: "vintage_telephone_wall_clock", x: 17.4, z: SERVICE_SOUTH_FACE - 0.095, y: 1.15, turn: 180 },
        { model: "painted_wooden_cabinet", x: 18.6, z: -6.415, turn: 180, draws: "service-cupboard-south" },
        { model: "jug_01", x: 18.25, z: -6.45, y: KITCHEN_CABINET_TOP, turn: 20 },
        { model: "wooden_bowl_01", x: 18.85, z: -6.4, y: KITCHEN_CABINET_TOP },
        { model: "dining_chair_02", x: 13.35, z: -11.5, turn: 87, maxTris: CHAIR_TRIS, draws: "service-chair-west" },
        { model: "dining_chair_02", x: 16.65, z: -11.5, turn: -95, maxTris: CHAIR_TRIS, draws: "service-chair-east" },
        { model: "wooden_broom", x: 22.83, z: -6.6, turn: -90, draws: "service-broom" },
      ],
      builds: [
        { kind: "linenShelves", x: 11.85, z: -9, turn: 90, widthM: 2, depthM: 0.5, heightM: 2, seed: 5, draws: "service-shelf" },
        { kind: "workTable", x: 15, z: -11.5, lengthM: 2.4, widthM: 0.9, heightM: SERVANTS_TABLE_TOP, draws: "service-table" },
        { kind: "bench", x: 15, z: -12.22, lengthM: 2.0, widthM: 0.32, heightM: 0.45, draws: "service-bench-north" },
        { kind: "bench", x: 15, z: -10.78, lengthM: 2.0, widthM: 0.32, heightM: 0.45, draws: "service-bench-south" },
        { kind: "workTable", x: 15.5, z: -6.375, lengthM: 1.4, widthM: 0.55, heightM: SERVICE_SIDEBOARD_TOP, top: "dark_wood", draws: "service-sideboard" },
        // The bell board that called the staff to each room (the Bellboy's).
        {
          kind: "bellBoard",
          x: 15.5,
          z: SERVICE_SOUTH_FACE,
          turn: 180,
          y: 1.75,
          widthM: 1.8,
          heightM: 0.75,
          labels: ["ROOM 1", "ROOM 2", "ROOM 3", "ROOM 4", "BRIDAL", "NURSERY", "LIBRARY", "BALLROOM", "RESTAURANT", "RECEPTION"],
        },
        // The Blackout's fuse box.
        { kind: "fuseBoard", x: SERVICE_WEST_FACE, z: -20, turn: 90, y: 0.95, widthM: 0.9, heightM: 1.0, draws: "service-fuse-board", station: "fuseBox" },
        { kind: "workTable", x: 16.6, z: -18.4, turn: 90, lengthM: 1.4, widthM: 0.6, heightM: FUSE_BENCH_TOP, draws: "service-fuse-bench" },
        { kind: "kitchenCounter", x: 21.72, z: -21.59, lengthM: 2.3, depthM: 0.62, heightM: 0.9, sinkX: 0.3, draws: "service-sink" },
        ...SERVICE_LANTERNS.map(([x, z]): DressingBuild => ({ kind: "chain", x, z, bottomM: LANTERN_CHAIN_BOTTOM })),
        // The bells' batteries under the bell board, the store shelves by the back stairs.
        { kind: "batteryRack", x: 13.2, z: -6.325, turn: 180, widthM: 1.4, depthM: 0.45, heightM: 1.1, draws: "service-batteries" },
        { kind: "storeShelves", x: 20.175, z: -11.3, turn: -90, widthM: 1.2, depthM: 0.45, heightM: 2.0, seed: 2, draws: "service-stores" },
        // The fuse room's electrics: the dynamo, a battery rack, the tool board over a cable drum, a ladder.
        { kind: "dynamo", x: 14.1, z: -20.3, draws: "service-dynamo" },
        { kind: "batteryRack", x: 14.25, z: -21.675, widthM: 1.6, depthM: 0.45, heightM: 1.1, draws: "service-fuse-batteries" },
        { kind: "toolBoard", x: 12.6, z: -17.105, turn: 180, y: 1.0, widthM: 1.1, heightM: 0.9 },
        { kind: "cableDrum", x: 12.0, z: -17.7, turn: 180, diameterM: 0.7, widthM: 0.45, draws: "service-cable-drum" },
        { kind: "ladder", x: 16.575, z: -20, turn: -90, heightM: 2.6, depthM: 0.65, draws: "service-ladder" },
        { kind: "storeShelves", x: 17.325, z: -20.5, turn: 90, widthM: 1.6, depthM: 0.45, heightM: 2.0, seed: 7, draws: "service-scullery-shelves" },
      ],
      lights: [
        ...SERVICE_LANTERNS.map(([x, z]): DressingLight => ({ x, z, y: LANTERN_CHAIN_BOTTOM - 0.15, kelvin: 2300, watts: 65, radius: 0.04 })),
        // The candles on the table and sideboard, the lamp on the workbench.
        { x: 15.1, z: -11.5, y: SERVANTS_TABLE_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 16.0, z: -6.4, y: SERVICE_SIDEBOARD_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: 16.62, z: -18.85, y: FUSE_BENCH_TOP + 0.45, kelvin: 2300, watts: 25, radius: 0.05 },
      ],
    },
    {
      room: "Garden Courtyard",
      wall: "castle_brick_02_red",
      floor: "grass_ground",
      ceiling: "worn_cracked_plaster",
      facade: { heightM: 5.95, windowEveryM: 3.2 },
      moon: { sky: [0.016, 0.022, 0.044], color: [0.62, 0.72, 1.0], strength: 0.2, elevation: 38, toward: [-0.5, -0.8] },
      props: [
        ...COURTYARD_LAMPS.map(({ x, z, turn, nx, nz }): DressingProp => ({ model: "street_lamp_02", x: x + nx * (LAMP_DEPTH / 2), z: z + nz * (LAMP_DEPTH / 2), y: LAMP_BASE_Y, turn, maxTris: 5000, glow: LAMP_GLOW })),
        ...COURTYARD_SHRUBS.map(([x, z, plant, turn]): DressingProp => ({ model: "shrub_02", part: `shrub_02_${plant}`, x, z, turn, scale: 0.42, maxTris: 1500 })),
        // A dead rose left in the raised bed between the pits, and the spade stuck in beside one.
        { model: "shrub_02", part: "shrub_02_b", x: 5, z: -8.9, y: RAISED_BED_TOP, turn: 70, scale: 0.25, maxTris: 1200 },
        { model: "rusted_spade_01", x: 5.15, z: -11.1, y: RAISED_BED_TOP - 0.25, turn: 30 },
        ...COURTYARD_NETTLES.map(([x, z, y, plant, turn]): DressingProp => ({ model: "nettle_plant", part: `nettle_plant_${plant}`, x, z, y, turn, scale: 2, maxTris: 600 })),
        // The potting bench: pots on its shelf, a watering can and a stack of pots beside it.
        { model: "planter_pot_clay", x: -8.62, z: -6.45, y: 0.16 },
        { model: "planter_pot_clay", x: -8.6, z: -5.95, y: 0.16, turn: 70 },
        { model: "watering_can_metal_01", x: -8.2, z: -7.2, turn: 200 },
        { model: "planter_pot_clay", x: -8.4, z: -8.0 },
        { model: "planter_pot_clay", x: -8.4, z: -8.0, y: 0.19, turn: 40 },
        { model: "planter_pot_clay", x: 7.7, z: -12.75, turn: 120 },
      ],
      builds: [
        { kind: "fountain", x: 0, z: -6, diameterM: 3, rimM: 0.55, draws: "courtyard-fountain" },
        // Flagstones from door to door through the fountain's square, and out to the potting bench and the seat.
        {
          kind: "paving",
          rects: [
            [-0.8, 0.8, -3.4, 1.9],
            [-2.6, 2.6, -8.6, -3.4],
            [-0.8, 0.8, -13.9, -8.6],
            [-8.9, -2.6, -6.75, -5.25],
            [2.6, 3.75, -6.9, -5.1],
          ],
        },
        {
          kind: "leafBed",
          rects: [
            [-8.9, -8.1, -4.3, 1.3],
            [8.1, 8.9, -4.3, 1.3],
            [8.1, 8.9, -9.6, -5.2],
            [-8.4, -3.4, -13.9, -13.1],
            [6.3, 8.5, -13.9, -13.1],
          ],
          drawsAll: ["courtyard-roses-west", "courtyard-roses-east", "courtyard-roses-east-mid", "courtyard-roses-north", "courtyard-roses-north-east"],
        },
        {
          kind: "raisedBed",
          x: 5,
          z: -10,
          turn: 90,
          lengthM: 6.4,
          widthM: 1.1,
          heightM: 0.5,
          pits: [2.2, 0, -2.2],
          pitM: 0.72,
          drawsAll: ["courtyard-bed-1", "courtyard-bed-2", "courtyard-bed-3", "relic-courtyard-1", "relic-courtyard-2", "relic-courtyard-3"],
        },
        // The roses: stations.ts roses() lays its pump at -0.62, the vase at 0.28 and the bucket at 0.6.
        { kind: "pottingBench", x: -8.65, z: -6, turn: 90, lengthM: 1.5, widthM: 0.5, heightM: 0.75, pumpX: -0.62, bucketX: 0.6, vaseX: 0.28, vaseM: 0.3, station: "task-roses", draws: "courtyard-potting-bench" },
        { kind: "gardenBench", x: -4.5, z: 1.625, turn: 180, lengthM: 1.5, draws: "courtyard-seat-west" },
        { kind: "gardenBench", x: 4.5, z: 1.625, turn: 180, lengthM: 1.5, draws: "courtyard-seat-east" },
        { kind: "gardenBench", x: 3.3, z: -6, turn: -90, lengthM: 1.5, draws: "courtyard-seat-fountain" },
        ...[
          [-2.9, -3.1],
          [2.9, -3.1],
          [-2.9, -8.9],
          [2.9, -8.9],
        ].map(([x, z], i): DressingBuild => ({ kind: "urn", x: x!, z: z!, heightM: 1.05, draws: `courtyard-urn-${i + 1}` })),
      ],
      lights: COURTYARD_LAMPS.map(({ x, z, nx, nz }): DressingLight => ({ x: x + nx * LAMP_BULB_OUT, z: z + nz * LAMP_BULB_OUT, y: LAMP_BASE_Y + LAMP_LIGHT_UP, kelvin: 2400, watts: 70, radius: 0.03 })),
    },
    {
      // The corridors round the courtyard, one space built and lit together: the hotel's spine,
      // where every chase runs. A wine runner over dark boards, grey damask over square-panelled
      // wood, portraits and consoles between the doors; candles in brass sconces, some burnt out,
      // so the way round goes from pool of light to dark and back.
      room: "Front Corridor",
      alsoRooms: ["West Corridor", "East Corridor", "North Corridor"],
      probes: [
        { x: 0, z: 3.25 },
        { x: -10.25, z: -6 },
        { x: 10.25, z: -6 },
        { x: 0, z: -15.25 },
      ],
      wall: "floral_jacquard",
      wainscot: { material: "dark_paneled_wood", heightM: 1.2, trim: "dark_wood" },
      floor: "dark_wood",
      ceiling: "worn_cracked_plaster",
      rugs: [
        { material: "velour_velvet_wine", x: 0, z: 3.25, sizeX: 21.8, sizeZ: RUNNER_W },
        { material: "velour_velvet_wine", x: 0, z: -15.25, sizeX: 21.8, sizeZ: RUNNER_W },
        { material: "velour_velvet_wine", x: -10.25, z: -6, sizeX: RUNNER_W, sizeZ: 17.48 },
        { material: "velour_velvet_wine", x: 10.25, z: -6, sizeX: RUNNER_W, sizeZ: 17.48 },
      ],
      props: [
        ...CORRIDOR_LANTERNS.map(([x, z]): DressingProp => ({ model: "lantern_chandelier_01", x, z, y: CORRIDOR_CEILING - LANTERN_H })),
        // Front Corridor: a console each side of the Main Hall's door, a picture over each; a chair
        // and a little table on the courtyard side; plants at the ends.
        { model: "ClassicConsole_01", x: -3.5, z: FRONT_SOUTH_FACE - 0.295, turn: 180, draws: "front-console-west" },
        { model: "brass_vase_02", x: -4.0, z: FRONT_SOUTH_FACE - 0.3, y: CONSOLE_TOP },
        { model: "mantel_clock_01", x: -3.2, z: FRONT_SOUTH_FACE - 0.27, y: CONSOLE_TOP, turn: 180 },
        { model: "hanging_picture_frame_01", x: -3.5, z: FRONT_SOUTH_FACE - 0.01, y: 1.95, turn: 180 },
        { model: "ClassicConsole_01", x: 4.5, z: FRONT_SOUTH_FACE - 0.295, turn: 180, draws: "front-console-east" },
        { model: "vintage_oil_lamp", x: 4.0, z: FRONT_SOUTH_FACE - 0.3, y: CONSOLE_TOP },
        { model: "antique_ceramic_vase_01", x: 5.0, z: FRONT_SOUTH_FACE - 0.3, y: CONSOLE_TOP, turn: 30 },
        { model: "hanging_picture_frame_03", x: 4.5, z: FRONT_SOUTH_FACE - 0.016, y: 1.9, turn: 180, scale: 1.4 },
        { model: "side_table_01", x: 2.1, z: FRONT_NORTH_FACE + 0.235, turn: 10, draws: "front-side-table" },
        { model: "standing_picture_frame_01", x: 2.15, z: FRONT_NORTH_FACE + 0.22, y: 0.551, turn: 160 },
        { model: "GreenChair_01", x: 3.0, z: FRONT_NORTH_FACE + 0.39, turn: -8, draws: "front-chair" },
        { model: "potted_plant_02", x: -8.3, z: FRONT_NORTH_FACE + 0.43, turn: 200, draws: "front-plant-west" },
        { model: "potted_plant_02", x: 8.3, z: FRONT_NORTH_FACE + 0.43, turn: 15, draws: "front-plant-east" },
        // The founders' portraits at either end, looking down the corridor.
        { model: "fancy_picture_frame_02", x: WEST_WEST_FACE + 0.07, z: 3.25, y: 1.9, turn: 90, scale: 1.5 },
        { model: "fancy_picture_frame_02", x: EAST_EAST_FACE - 0.07, z: 3.25, y: 1.9, turn: -90, scale: 1.5 },
        // West Corridor: a sofa between the Library's and the Ballroom's doors under a painting; a
        // vase on a stand across from it; a tall plant by the north corner.
        { model: "Sofa_01", x: WEST_WEST_FACE + 0.37, z: -6, turn: 90, draws: "west-sofa" },
        { model: "fancy_picture_frame_01", x: WEST_WEST_FACE + 0.012, z: -6, y: 1.9, turn: 90, scale: 1.4 },
        { model: "side_table_tall_01", x: WEST_EAST_FACE - 0.2, z: -3.5, draws: "west-stand" },
        { model: "antique_ceramic_vase_01", x: WEST_EAST_FACE - 0.2, z: -3.5, y: TALL_SIDE_TOP, turn: 120 },
        { model: "hanging_picture_frame_03", x: WEST_EAST_FACE - 0.016, z: -3.5, y: 1.85, turn: -90 },
        { model: "potted_plant_01", x: WEST_EAST_FACE - 0.33, z: -13.4, turn: 60, draws: "west-plant" },
        // East Corridor: a commode under a portrait by the Kitchen's door, a guest's luggage never
        // collected, a rocking chair turned a little from the wall.
        { model: "GothicCommode_01", x: EAST_EAST_FACE - 0.295, z: -6.5, turn: -90, draws: "east-commode" },
        { model: "brass_vase_01", x: EAST_EAST_FACE - 0.3, z: -6.85, y: COMMODE_TOP },
        { model: "standing_picture_frame_01", x: EAST_EAST_FACE - 0.25, z: -6.2, y: COMMODE_TOP, turn: -70 },
        { model: "fancy_picture_frame_02", x: EAST_EAST_FACE - 0.045, z: -6.5, y: 2.05, turn: -90 },
        { model: "vintage_suitcase", x: EAST_EAST_FACE - 0.135, z: -10.5, turn: -90, draws: "east-suitcase" },
        { model: "Rockingchair_01", x: EAST_WEST_FACE + 0.38, z: -3.5, turn: 78, draws: "east-rocking-chair" },
        { model: "fancy_picture_frame_01", x: EAST_WEST_FACE + 0.012, z: -6, y: 1.9, turn: 90, scale: 1.2 },
        { model: "potted_plant_02", x: EAST_EAST_FACE - 0.43, z: -13.4, turn: -100, draws: "east-plant" },
        // North Corridor: a console under a portrait, a bust on its stand, chairs either side of the
        // courtyard door, tall plants at the ends.
        { model: "ClassicConsole_01", x: 5, z: NORTH_NORTH_FACE + 0.295, draws: "north-console" },
        { model: "vintage_oil_lamp", x: 5.5, z: NORTH_NORTH_FACE + 0.3, y: CONSOLE_TOP },
        { model: "brass_vase_02", x: 4.45, z: NORTH_NORTH_FACE + 0.3, y: CONSOLE_TOP },
        { model: "hanging_picture_frame_01", x: 5, z: NORTH_NORTH_FACE + 0.01, y: 1.95 },
        { model: "side_table_tall_01", x: -7.5, z: NORTH_NORTH_FACE + 0.2, draws: "north-stand" },
        { model: "marble_bust_01", x: -7.5, z: NORTH_NORTH_FACE + 0.2, y: TALL_SIDE_TOP, turn: 15 },
        { model: "GreenChair_01", x: -2.5, z: NORTH_SOUTH_FACE - 0.39, turn: 186, draws: "north-chair-west" },
        { model: "GreenChair_01", x: 2.5, z: NORTH_SOUTH_FACE - 0.39, turn: 172, draws: "north-chair-east" },
        { model: "fancy_picture_frame_01", x: 0, z: NORTH_NORTH_FACE + 0.012, y: 1.9, scale: 1.2 },
        { model: "potted_plant_01", x: -9.6, z: NORTH_NORTH_FACE + 0.33, turn: 140, draws: "north-plant-west" },
        { model: "potted_plant_01", x: 9.6, z: NORTH_NORTH_FACE + 0.33, turn: -30, draws: "north-plant-east" },
      ],
      builds: CORRIDOR_SCONCES.map(([x, z, dir, lit]): DressingBuild => ({ kind: "wallSconce", x, z, turn: SCONCE_TURN[dir], y: SCONCE_Y, lit })),
      lights: [
        // One light in each candle's flame, so its glowing bulb is the flame itself.
        ...CORRIDOR_SCONCES.filter(([, , , lit]) => lit).flatMap(([x, z, dir]) => {
          const [ox, oz] = SCONCE_DIR[dir];
          return [-1, 1].map((side): DressingLight => ({
            x: x + ox * SCONCE_OUT + Math.abs(oz) * side * SCONCE_CANDLE_SIDE,
            z: z + oz * SCONCE_OUT + Math.abs(ox) * side * SCONCE_CANDLE_SIDE,
            y: SCONCE_Y + SCONCE_FLAME_UP,
            kelvin: 1900,
            watts: 18,
            radius: 0.012,
          }));
        }),
        ...CORRIDOR_LANTERNS.filter(([, , lit]) => lit).map(([x, z]): DressingLight => ({ x, z, y: CORRIDOR_CEILING - 0.5, kelvin: 2500, watts: 90, radius: 0.08 })),
        // The oil lamps on the front and north consoles.
        { x: 4.0, z: FRONT_SOUTH_FACE - 0.3, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 40, radius: 0.05 },
        { x: 5.5, z: NORTH_NORTH_FACE + 0.3, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 40, radius: 0.05 },
      ],
    },
  ],
  // Every door's look (owner, 2026-11-12: rusty, dressed doors, a different design per room).
  doors: {
    "hall-front": { style: "hall" },
    "reception-front": { style: "reception" },
    "reception-office": { style: "reception" },
    "reception-luggage": { style: "reception" },
    "restaurant-front": { style: "restaurant" },
    "restaurant-bar": { style: "restaurant" },
    "library-west": { style: "library" },
    "library-study": { style: "library" },
    "ballroom-west": { style: "ballroom" },
    "ballroom-north": { style: "ballroom" },
    "kitchen-restaurant": { style: "service" },
    "kitchen-east": { style: "service" },
    "service-north": { style: "service" },
    "service-fuse": { style: "service" },
    "laundry-corridor": { style: "service" },
    "laundry-north": { style: "service" },
    "courtyard-front": { style: "courtyard" },
    "courtyard-north": { style: "courtyard" },
    "guest1-corridor": { style: "guest", number: 1 },
    "guest2-corridor": { style: "guest", number: 2 },
    "guest3-corridor": { style: "guest", number: 3 },
    "guest4-corridor": { style: "guest", number: 4 },
    "bridal-corridor": { style: "bridal" },
    "nursery-corridor": { style: "nursery" },
    "staff-corridor": { style: "staff" },
    "passage-wine": { style: "cellar" },
    "passage-storage": { style: "cellar" },
    "wine-ritual": { style: "cellar" },
    "storage-ritual": { style: "cellar" },
    "relic-door": { style: "relic" },
  },
};
