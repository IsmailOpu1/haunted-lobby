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
// Upstairs, Guest Room 1 (map coordinates as built): its wall faces, and the tall Gothic chest's top.
const GUEST_CEILING = 2.95;
const GUEST1_NORTH_FACE = 4.605;
const GUEST1_SOUTH_FACE = 11.395;
const GUEST1_BATH_SOUTH_FACE = 7.895;
const GUEST1_BATH_WEST_FACE = -20.395;
const GOTHIC_COMMODE_TOP = 1.212;
// Guest Room 2 (upper floor, x -19.5 to -11.5, z -5 to 2; its bathroom x -23 to -19.5, z -5 to -1.5).
const GUEST2_NORTH_FACE = -4.895;
const GUEST2_SOUTH_FACE = 1.895;
const GUEST2_EAST_FACE = -11.605;
const GUEST2_BATH_WEST_FACE = -22.895;
const GUEST2_BATH_SOUTH_FACE = -1.605;
const IRON_BED_SPRINGS = 0.496;
const PAINTED_NIGHTSTAND_TOP = 0.616;
// Guest Room 3 (upper floor, x -19.5 to -11.5, z -14 to -7; its bathroom x -23 to -19.5, z -14 to -10.5).
const GUEST3_NORTH_FACE = -13.895;
const GUEST3_SOUTH_FACE = -7.105;
const GUEST3_BATH_WEST_FACE = -22.895;
const GUEST3_BATH_SOUTH_FACE = -10.605;
const BRASS_BED_SPRINGS = 0.42;
const SIDE_TABLE_TOP = 0.551;
// Guest Room 4 (upper floor, x 9 to 17, z 4.5 to 11.5; its bathroom x 17 to 20.5, z 4.5 to 8).
const GUEST4_WEST_FACE = 9.105;
const GUEST4_SOUTH_FACE = 11.395;
const GUEST4_BATH_NORTH_FACE = 4.605;
const GUEST4_BATH_SOUTH_FACE = 7.895;
const GUEST4_BATH_EAST_FACE = 20.395;
const FOUR_POSTER_BOARDS = 0.5;
// The Bridal Suite (upper floor, x -9 to 0, z 4.5 to 18.5).
const BRIDAL_WEST_FACE = -8.895;
const BRIDAL_NORTH_FACE = 4.605;
const BRIDAL_SOUTH_FACE = 18.395;
const GOTHIC_COFFEE_TOP = 0.559;
// The Nursery (upper floor, x 0 to 6.5, z 4.5 to 18.5, and an alcove x 6.5 to 9, z 14 to 18.5).
const NURSERY_WEST_FACE = 0.105;
const NURSERY_EAST_FACE = 6.395;
const NURSERY_SOUTH_FACE = 18.395;
// The Staff Quarters (upper floor, x 11.5 to 23, z -6 to 4.5).
const STAFF_NORTH_FACE = -5.895;
const STAFF_EAST_FACE = 22.895;
const STAFF_SOUTH_FACE = 4.395;
const BUNK_LOWER = 0.32;
const BUNK_UPPER = 1.12;
// The Laundry (upper floor): the wash room x 11.5 to 23, z -22 to -16.5 (the back stairs come up into
// its east end), and a strip x 11.5 to 14.5 down to z -9 by the corridor doors.
const LAUNDRY_WEST_FACE = 11.605;
const LAUNDRY_NORTH_FACE = -21.895;
const LAUNDRY_WASH_SOUTH_FACE = -16.605;
const LAUNDRY_STRIP_EAST_FACE = 14.395;
const LAUNDRY_EAST_FACE = 22.895;
// The upstairs corridors: the front (z 2 to 4.5), the landing (x 6.5 to 9, z 4.5 to 8), the east
// side (x 9 to 11.5), the west side (x -11.5 to -9) and the north (z -16.5 to -14).
const UPPER_NORTH_FACE = 2.105;
const UPPER_SOUTH_FACE = 4.395;
const LANDING_EAST_FACE = 8.895;
const UPPER_EAST_WEST_FACE = 9.105;
const UPPER_EAST_EAST_FACE = 11.395;
const GUEST_WEST_WEST_FACE = -11.395;
const GUEST_WEST_EAST_FACE = -9.105;
const GUEST_NORTH_FACE = -16.395;
const GUEST_SOUTH_FACE = -14.105;
const GUEST_PLANTER_Z = -15.965;
const UPPER_SCONCES: [number, number, keyof typeof SCONCE_TURN, boolean][] = [
  // The front: along the rooms' side and the courtyard side, clear of the doors and the windows.
  [-6.8, UPPER_SOUTH_FACE, "n", true],
  [-1.0, UPPER_SOUTH_FACE, "n", true],
  [2.2, UPPER_SOUTH_FACE, "n", false],
  [5.6, UPPER_SOUTH_FACE, "n", true],
  [-2.7, UPPER_NORTH_FACE, "s", true],
  [2.6, UPPER_NORTH_FACE, "s", true],
  [8.4, UPPER_NORTH_FACE, "s", false],
  // The landing.
  [LANDING_EAST_FACE, 7.3, "w", true],
  // The east side: either side of the cabinet, a dead one at the far end; the courtyard side.
  [UPPER_EAST_EAST_FACE, -3.6, "w", true],
  [UPPER_EAST_EAST_FACE, -7.9, "w", true],
  [UPPER_EAST_EAST_FACE, -12.5, "w", false],
  [UPPER_EAST_WEST_FACE, -0.8, "e", true],
  [UPPER_EAST_WEST_FACE, -10.8, "e", true],
  // The west side: either side of the bench and the portraits.
  [GUEST_WEST_WEST_FACE, -3.9, "e", true],
  [GUEST_WEST_WEST_FACE, -7.3, "e", true],
  [GUEST_WEST_WEST_FACE, -12.6, "e", true],
  [GUEST_WEST_EAST_FACE, -3.6, "w", true],
  [GUEST_WEST_EAST_FACE, -8.5, "w", false],
  // The north: over the planters, either side of the console, and the courtyard side.
  [-6.25, GUEST_NORTH_FACE, "s", true],
  [-3.75, GUEST_NORTH_FACE, "s", true],
  [1.0, GUEST_NORTH_FACE, "s", true],
  [7.6, GUEST_NORTH_FACE, "s", true],
  [-7.0, GUEST_SOUTH_FACE, "n", true],
  [7.0, GUEST_SOUTH_FACE, "n", false],
];
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
/** A lit sconce's light, split between its two candle flames (so no glowing ball hangs between them). */
const sconceFlames = (x: number, z: number, dir: keyof typeof SCONCE_DIR, watts: number): DressingLight[] => {
  const [ox, oz] = SCONCE_DIR[dir];
  return [-1, 1].map((side) => ({
    x: x + ox * SCONCE_OUT + Math.abs(oz) * side * SCONCE_CANDLE_SIDE,
    z: z + oz * SCONCE_OUT + Math.abs(ox) * side * SCONCE_CANDLE_SIDE,
    y: SCONCE_Y + SCONCE_FLAME_UP,
    kelvin: 1900,
    watts: watts / 2,
    radius: 0.012,
  }));
};
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

// The basement (3 m down): the room side of each wall.
const STAIRWELL_WEST_FACE = -10.895;
const STAIRWELL_EAST_FACE = -4.605;
const STAIRWELL_SOUTH_FACE = 7.895;
const PASSAGE_WEST_FACE = -8.895;
const PASSAGE_EAST_FACE = -6.605;
const PASSAGE_NORTH_FACE = -9.895;
const WINE_WEST_FACE = -19.895;
const WINE_EAST_FACE = -9.105;
const WINE_NORTH_FACE = -9.895;
const WINE_SOUTH_FACE = 1.895;
const WINE_TABLE_TOP = 0.78;
const STORAGE_WEST_FACE = -6.395;
const STORAGE_EAST_FACE = 3.895;
const STORAGE_NORTH_FACE = -9.895;
const STORAGE_SOUTH_FACE = 1.895;
/** Church candles on the floor just outside the ritual circle (4 m round the altar): x, z, how many lit. */
const RITUAL_CANDLES: [number, number, number][] = [
  [-3.6, -15.5, 3],
  [-12.4, -15.5, 2],
  [-5.8, -11.69, 0],
  [-10.2, -11.69, 3],
  [-5.8, -19.31, 2],
  [-10.2, -19.31, 0],
];

/** brass_candleholders is three candlesticks in a row; the tall one (its candle tip 0.81 m up) stands
 *  0.4 m along the model's own x: 0.3225 m from the middle of the footprint (-0.449 to 0.604), where
 *  the room builder centres a model. Where its flame is for a model at (x, z) turned by turn degrees. */
const TALL_CANDLE_OUT_M = 0.3225;
const tallCandle = (x: number, z: number, turn: number, y: number) => ({
  x: x + TALL_CANDLE_OUT_M * Math.cos((turn * Math.PI) / 180),
  z: z - TALL_CANDLE_OUT_M * Math.sin((turn * Math.PI) / 180),
  y: y + 0.83,
});

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
        // The side cabinet the salt jar stands on, in the nook under the cellar stairs (the game draws the jar).
        { kind: "sideboard", x: -7.75, z: 7.6, turn: 180, widthM: 0.9, backM: 7.895 - 7.6, frontM: 0.12, heightM: SIDEBOARD_TOP, material: "dark_wood", draws: "hall-salt-cabinet" },
      ],
      lights: [
        // Oil lamps on the consoles and the east side table: warm pools at the walls.
        { x: -2.5, z: 18.1, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 35, radius: 0.05 },
        { x: 2.55, z: 18.1, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 35, radius: 0.05 },
        { x: 5.75, z: 4.85, y: SIDE_TOP + 0.45, kelvin: 2300, watts: 30, radius: 0.05 },
        // Candles on the meeting table and the west coffee table.
        { ...tallCandle(-1.1, 11, 8, MEETING_TOP + RUNNER_M), kelvin: 1900, watts: 6, radius: 0.03 },
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
        // The side cabinet the salt jar stands on, in the office's north-west corner (the game draws the jar).
        { kind: "sideboard", x: -22.43, z: 18.1, turn: 180, widthM: 0.9, backM: 18.395 - 18.1, frontM: 0.12, heightM: SIDEBOARD_TOP, material: "dark_wood", draws: "office-salt-cabinet" },
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
        { ...tallCandle(12.2, 7.9, 15, CLOTH_TOP), kelvin: 1900, watts: 6, radius: 0.03 },
        { ...tallCandle(19.2, 11.0, 100, CLOTH_TOP), kelvin: 1900, watts: 6, radius: 0.03 },
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
        ...SCONCES_SOUTH.map((x): DressingBuild => ({ kind: "wallSconce", x, z: BALLROOM_SOUTH_FACE, turn: 180, y: SCONCE_Y, lit: true })),
        ...SCONCES_WEST.map((z): DressingBuild => ({ kind: "wallSconce", x: BALLROOM_WEST_FACE, z, turn: 90, y: SCONCE_Y, lit: true })),
      ],
      lights: [
        // Among the chandeliers' candles.
        ...BALLROOM_CHANDELIERS.map(([x, z]): DressingLight => ({ x, z, y: BALLROOM_CHANDELIER_Y + 0.25, kelvin: 2700, watts: 55, radius: 0.25 })),
        // The sconces' candles, a pair to each.
        ...SCONCES_SOUTH.flatMap((x) => sconceFlames(x, BALLROOM_SOUTH_FACE, "n", 10)),
        ...SCONCES_WEST.flatMap((z) => sconceFlames(BALLROOM_WEST_FACE, z, "e", 10)),
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
    {
      // Guest Room 1, upstairs (map coordinates of the upper floor as built, x -17 to -9): a Gothic
      // bedroom in moss damask, the carved bed made up as if someone were expected, and its bathroom
      // behind the west door with a roll-top bath, a high-tank closet and a basin on a pedestal.
      room: "Guest Room 1",
      wall: "damask_moss",
      wainscot: { material: "dark_wood", heightM: 0.95 },
      floor: "dark_wood",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "dirty_carpet", x: -12.5, z: 9.4, sizeX: 3, sizeZ: 2.8 }],
      props: [
        // The bed against the south wall, a nightstand each side.
        { model: "GothicBed_01", x: -12.5, z: GUEST1_SOUTH_FACE - 1.02, draws: "guest1-bed" },
        { model: "ClassicNightstand_01", x: -13.57, z: GUEST1_SOUTH_FACE - 0.215, turn: 180, draws: "guest1-classic-nightstand-1" },
        { model: "ClassicNightstand_01", x: -11.43, z: GUEST1_SOUTH_FACE - 0.215, turn: 180, draws: "guest1-classic-nightstand-2" },
        { model: "vintage_oil_lamp", x: -11.43, z: GUEST1_SOUTH_FACE - 0.22, y: NIGHTSTAND_TOP },
        { model: "wooden_candlestick", x: -13.5, z: GUEST1_SOUTH_FACE - 0.25, y: NIGHTSTAND_TOP },
        // A tall chest on the north wall, a mirror over it, candles on it.
        { model: "GothicCommode_01", x: -14.6, z: GUEST1_NORTH_FACE + 0.295, draws: "guest1-gothic-commode-1" },
        { model: "ornate_mirror_01", x: -14.6, z: GUEST1_NORTH_FACE + 0.015, y: 1.75 },
        { model: "wooden_candlestick", x: -15.0, z: GUEST1_NORTH_FACE + 0.3, y: GOTHIC_COMMODE_TOP },
        { model: "wooden_candlestick", x: -14.2, z: GUEST1_NORTH_FACE + 0.3, y: GOTHIC_COMMODE_TOP },
        // A chair turned toward the bed, the chandelier over the middle of the room.
        { model: "GreenChair_01", x: -15.8, z: 7.6, turn: 60, draws: "guest1-green-chair-1" },
        { model: "Chandelier_02", x: -13, z: 8, y: GUEST_CEILING - 0.85 },
        // The bathroom: a jug by the basin.
        { model: "jug_01", x: -20.2, z: 6.75, turn: 40 },
      ],
      builds: [
        // The bedsheets task's table; the game draws the sheet on it.
        { kind: "workTable", x: -13, z: 7.5, lengthM: 1.2, widthM: 0.7, heightM: 0.75, top: "dark_wood", material: "dark_wood", draws: "task-sheets" },
        // The bathroom.
        { kind: "rollTopBath", x: -19.52, z: GUEST1_BATH_SOUTH_FACE - 0.39, turn: 180, draws: "guest1-roll-top-bath-1" },
        { kind: "pedestalBasin", x: GUEST1_BATH_WEST_FACE + 0.275, z: 5.9, turn: 90, draws: "guest1-pedestal-basin-1" },
        { kind: "highTankToilet", x: -18.3, z: GUEST1_NORTH_FACE + 0.345, draws: "guest1-high-tank-toilet-1" },
        { kind: "wallSconce", x: -19.55, z: GUEST1_NORTH_FACE, y: 1.75, lit: true },
        // The side cabinet the salt jar stands on (the game draws the jar).
        { kind: "sideboard", x: -9.8, z: 10.8, turn: 180, widthM: 0.9, backM: GUEST1_SOUTH_FACE - 10.8, frontM: 0.12, heightM: SIDEBOARD_TOP, material: "dark_wood" },
      ],
      lights: [
        { x: -13, z: 8, y: GUEST_CEILING - 0.6, kelvin: 2400, watts: 60, radius: 0.08 },
        { x: -11.43, z: GUEST1_SOUTH_FACE - 0.22, y: NIGHTSTAND_TOP + 0.45, kelvin: 2300, watts: 25, radius: 0.05 },
        { x: -13.5, z: GUEST1_SOUTH_FACE - 0.25, y: NIGHTSTAND_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -15.0, z: GUEST1_NORTH_FACE + 0.3, y: GOTHIC_COMMODE_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        { x: -14.2, z: GUEST1_NORTH_FACE + 0.3, y: GOTHIC_COMMODE_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        ...sconceFlames(-19.55, GUEST1_NORTH_FACE, "s", 6),
      ],
    },
    {
      // Guest Room 2, upstairs: the cheaper twin room. Faded rose paper, bare scrubbed boards, two
      // white iron bedsteads either side of a painted nightstand (one made up, one with its blanket
      // still folded), a painted cupboard by the door, and a cream-painted bath next door.
      room: "Guest Room 2",
      wall: "wallpaper_rose",
      woodwork: "dark_wood",
      floor: "scrubbed_wood",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "terlenka", x: -15.4, z: -2.3, sizeX: 2.4, sizeZ: 1.2 }],
      props: [
        // The beds, heads to the north wall, the nightstand between them.
        { model: "old_bed_frame", x: -16.45, z: GUEST2_NORTH_FACE + 1.008, draws: "guest2-bed" },
        { model: "old_bed_frame", x: -14.35, z: GUEST2_NORTH_FACE + 1.008 },
        { model: "painted_wooden_nightstand", x: -15.4, z: GUEST2_NORTH_FACE + 0.259, draws: "guest2-painted-wooden-nightstand-1" },
        { model: "wooden_candlestick", x: -15.5, z: GUEST2_NORTH_FACE + 0.24, y: PAINTED_NIGHTSTAND_TOP },
        { model: "round_spectacles", x: -15.25, z: GUEST2_NORTH_FACE + 0.33, y: PAINTED_NIGHTSTAND_TOP, turn: 20 },
        { model: "hanging_picture_frame_01", x: -15.4, z: GUEST2_NORTH_FACE + 0.01, y: 1.3 },
        // A painted cupboard on the east wall beside the door, a jug on it.
        { model: "painted_wooden_cabinet", x: GUEST2_EAST_FACE - 0.31, z: -3.9, turn: -90, draws: "guest2-painted-wooden-cabinet-1" },
        { model: "metal_jug", x: GUEST2_EAST_FACE - 0.3, z: -3.6, y: 1.182, turn: 30 },
        // A rocking chair in the corner, turned to the beds; a plain chandelier.
        { model: "Rockingchair_01", x: -12.5, z: 1.05, turn: 225, draws: "guest2-rockingchair-1" },
        { model: "Chandelier_01", x: -15.4, z: -1.4, y: GUEST_CEILING - 0.8 },
        // The bathroom: a bucket by the bath.
        { model: "wooden_bucket_01", x: -22.45, z: -2.0, draws: "guest2-wooden-bucket-1" },
      ],
      builds: [
        // The jewellery box (relic-guest2) on a cabinet in the south-west corner.
        { kind: "jewelCabinet", x: -18.85, z: 1.3, turn: 90, widthM: 0.9, backM: -18.85 - (-19.395), frontM: 0.2, material: "dark_wood", draws: "guest2-jewel-cabinet", station: "relic-guest2" },
        { kind: "mattress", x: -16.45, z: GUEST2_NORTH_FACE + 1.008, y: IRON_BED_SPRINGS, lengthM: 1.78, widthM: 0.82, blanket: "velour_velvet_wine" },
        { kind: "mattress", x: -14.35, z: GUEST2_NORTH_FACE + 1.008, y: IRON_BED_SPRINGS, lengthM: 1.78, widthM: 0.82, blanket: "velour_velvet_wine", folded: true },
        // The bathroom: the bath along the west wall, the closet on the north, the basin on the south.
        { kind: "rollTopBath", x: GUEST2_BATH_WEST_FACE + 0.39, z: -3.25, turn: 90, paint: [0.3, 0.26, 0.19], draws: "guest2-roll-top-bath-1" },
        { kind: "highTankToilet", x: -20.75, z: GUEST2_NORTH_FACE + 0.345, material: "scrubbed_wood", draws: "guest2-high-tank-toilet-1" },
        { kind: "pedestalBasin", x: -21.3, z: GUEST2_BATH_SOUTH_FACE - 0.275, turn: 180, tiles: "marble_01", draws: "guest2-pedestal-basin-1" },
        { kind: "wallSconce", x: -20.25, z: GUEST2_BATH_SOUTH_FACE, y: 1.75, turn: 180, lit: true },
      ],
      lights: [
        { x: -15.4, z: -1.4, y: GUEST_CEILING - 0.55, kelvin: 2400, watts: 40, radius: 0.08 },
        { x: -15.5, z: GUEST2_NORTH_FACE + 0.24, y: PAINTED_NIGHTSTAND_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        ...sconceFlames(-20.25, GUEST2_BATH_SOUTH_FACE, "n", 6),
      ],
    },
    {
      // Guest Room 3, upstairs: the writer's room. Faded blue damask over dark panelling, a
      // herringbone floor, a brass bedstead under an old-gold satin quilt, a pedestal desk against the
      // south wall with its lamp still lit, an armchair by the door, and an oxblood bath next door.
      room: "Guest Room 3",
      wall: "damask_blue",
      wainscot: { material: "dark_paneled_wood", heightM: 1.0, trim: "dark_wood" },
      floor: "herringbone_parquet",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "carpet_wine", x: -16.5, z: -11.6, sizeX: 2.6, sizeZ: 2.0 }],
      props: [
        // A small table each side of the bed: a candle on one, a clock on the other.
        { model: "side_table_01", x: -17.55, z: GUEST3_NORTH_FACE + 0.23, draws: "guest3-side-table-1" },
        { model: "side_table_01", x: -15.45, z: GUEST3_NORTH_FACE + 0.23, draws: "guest3-side-table-2" },
        { model: "wooden_candlestick", x: -17.55, z: GUEST3_NORTH_FACE + 0.23, y: SIDE_TABLE_TOP },
        { model: "mantel_clock_01", x: -15.45, z: GUEST3_NORTH_FACE + 0.2, y: SIDE_TABLE_TOP },
        // The desk's chair, its lamp and a framed photograph.
        { model: "dining_chair_02", x: -15.0, z: -8.15, draws: "guest3-dining-chair-1" },
        { model: "vintage_oil_lamp", x: -15.45, z: GUEST3_SOUTH_FACE - 0.25, y: STUDY_DESK_TOP },
        { model: "standing_picture_frame_01", x: -14.55, z: GUEST3_SOUTH_FACE - 0.18, y: STUDY_DESK_TOP, turn: 160 },
        // An armchair by the corridor door, turned to the room; a lantern chandelier.
        { model: "ArmChair_01", x: -12.4, z: -8.0, turn: 225, draws: "guest3-arm-chair-1" },
        { model: "lantern_chandelier_01", x: -15.5, z: -10.5, y: GUEST_CEILING - 0.88 },
        // The bathroom: a mirror over the basin.
        { model: "ornate_mirror_01", x: GUEST3_BATH_WEST_FACE + 0.015, z: -11.6, y: 1.75, turn: 90 },
      ],
      builds: [
        { kind: "brassBed", x: -16.5, z: GUEST3_NORTH_FACE + 1.01, widthM: 1.42, lengthM: 2.0, springsY: BRASS_BED_SPRINGS, draws: "guest3-bed" },
        { kind: "mattress", x: -16.5, z: GUEST3_NORTH_FACE + 1.01, y: BRASS_BED_SPRINGS, lengthM: 1.88, widthM: 1.3, blanket: "damask_gold" },
        { kind: "pedestalDesk", x: -15.0, z: GUEST3_SOUTH_FACE - 0.36, lengthM: 1.3, widthM: 0.7, heightM: STUDY_DESK_TOP, material: "dark_wood", draws: "guest3-pedestal-desk-1" },
        // The bathroom: the bath along the north wall, the basin on the west, the closet on the south.
        { kind: "rollTopBath", x: -21.25, z: GUEST3_NORTH_FACE + 0.39, paint: [0.045, 0.008, 0.006], draws: "guest3-roll-top-bath-1" },
        { kind: "pedestalBasin", x: GUEST3_BATH_WEST_FACE + 0.275, z: -11.6, turn: 90, tiles: "floor_tiles_06", draws: "guest3-pedestal-basin-1" },
        { kind: "highTankToilet", x: -21.6, z: GUEST3_BATH_SOUTH_FACE - 0.345, turn: 180, draws: "guest3-high-tank-toilet-1" },
        { kind: "wallSconce", x: -20.35, z: GUEST3_BATH_SOUTH_FACE, y: 1.75, turn: 180, lit: true },
      ],
      lights: [
        { x: -15.5, z: -10.5, y: GUEST_CEILING - 0.45, kelvin: 2400, watts: 40, radius: 0.08 },
        { x: -15.45, z: GUEST3_SOUTH_FACE - 0.25, y: STUDY_DESK_TOP + 0.45, kelvin: 2300, watts: 25, radius: 0.05 },
        { x: -17.55, z: GUEST3_NORTH_FACE + 0.23, y: SIDE_TABLE_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        ...sconceFlames(-20.35, GUEST3_BATH_SOUTH_FACE, "n", 6),
      ],
    },
    {
      // Guest Room 4, upstairs on the east: the widow's room. Plum silk on the walls, a diagonal
      // parquet, a four-poster hung with plum velvet against the south wall, a dressing table with a
      // tall glass and candles on the west wall, a small round tea table by the bathroom door.
      room: "Guest Room 4",
      wall: "silk_plum",
      woodwork: "door_walnut",
      floor: "diagonal_parquet",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "floral_jacquard", x: 12, z: 8.3, sizeX: 2.6, sizeZ: 1.8 }],
      props: [
        // Tall tables either side of the bed: a candle on one, a brass vase on the other.
        { model: "side_table_tall_01", x: 11.0, z: GUEST4_SOUTH_FACE - 0.197, draws: "guest4-side-table-tall-1" },
        { model: "side_table_tall_01", x: 13.0, z: GUEST4_SOUTH_FACE - 0.197, draws: "guest4-side-table-tall-2" },
        { model: "wooden_candlestick", x: 11.0, z: GUEST4_SOUTH_FACE - 0.2, y: TALL_SIDE_TOP },
        { model: "brass_vase_01", x: 13.0, z: GUEST4_SOUTH_FACE - 0.2, y: TALL_SIDE_TOP },
        // A stool at the foot of the bed.
        { model: "Ottoman_01", x: 12, z: 8.85, draws: "guest4-ottoman-1" },
        // The dressing table on the west wall, its candelabra; the tall glass over it is a build.
        { model: "ClassicConsole_01", x: GUEST4_WEST_FACE + 0.3, z: 8.0, turn: 90, draws: "guest4-classic-console-1" },
        { model: "brass_candleholders", x: GUEST4_WEST_FACE + 0.3, z: 8.0, y: CONSOLE_TOP, turn: 90 },
        // A round tea table with a chair, a photograph in a frame on it.
        { model: "round_wooden_table_02", x: 15.6, z: 5.6, draws: "guest4-round-wooden-table-1" },
        { model: "dining_chair_02", x: 14.75, z: 5.6, turn: 90, draws: "guest4-dining-chair-1" },
        { model: "standing_picture_frame_01", x: 15.65, z: 5.5, y: 0.746, turn: 200 },
        // The chandelier.
        { model: "Chandelier_03", x: 12.8, z: 7.6, y: GUEST_CEILING - 0.885, scale: 0.85 },
      ],
      builds: [
        // The jewellery box (relic-guest4) on a cabinet in the south-east corner.
        { kind: "jewelCabinet", x: 16.35, z: 10.8, turn: -90, widthM: 0.9, backM: 16.895 - 16.35, frontM: 0.2, material: "dark_wood", draws: "guest4-jewel-cabinet", station: "relic-guest4" },
        { kind: "fourPoster", x: 12, z: GUEST4_SOUTH_FACE - 1.06, turn: 180, widthM: 1.5, lengthM: 2.1, springsY: FOUR_POSTER_BOARDS, heightM: 2.3, drapes: "velvet_plum", draws: "guest4-bed" },
        { kind: "mattress", x: 12, z: GUEST4_SOUTH_FACE - 1.06, turn: 180, y: FOUR_POSTER_BOARDS, lengthM: 1.98, widthM: 1.36, blanket: "velvet_plum" },
        { kind: "pierMirror", x: GUEST4_WEST_FACE, z: 8.0, turn: 90, y: 1.05, widthM: 0.8, heightM: 1.2 },
        // The bathroom: the bath along the east wall, the closet on the north, the basin on the south.
        { kind: "rollTopBath", x: GUEST4_BATH_EAST_FACE - 0.39, z: 6.25, turn: -90, paint: [0.07, 0.05, 0.025], draws: "guest4-roll-top-bath-1" },
        { kind: "highTankToilet", x: 18.3, z: GUEST4_BATH_NORTH_FACE + 0.345, draws: "guest4-high-tank-toilet-1" },
        { kind: "pedestalBasin", x: 18.5, z: GUEST4_BATH_SOUTH_FACE - 0.275, turn: 180, tiles: "terracotta_floor_tiles", draws: "guest4-pedestal-basin-1" },
        { kind: "wallSconce", x: 19.4, z: GUEST4_BATH_NORTH_FACE, y: 1.75, lit: true },
      ],
      lights: [
        { x: 12.8, z: 7.6, y: GUEST_CEILING - 0.45, kelvin: 2400, watts: 40, radius: 0.08 },
        { ...tallCandle(GUEST4_WEST_FACE + 0.3, 8.0, 90, CONSOLE_TOP), kelvin: 1900, watts: 6, radius: 0.03 },
        { x: 11.0, z: GUEST4_SOUTH_FACE - 0.2, y: TALL_SIDE_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
        ...sconceFlames(19.4, GUEST4_BATH_NORTH_FACE, "s", 6),
      ],
    },
    {
      // The Bridal Suite, upstairs over the Main Hall: the room the Bride never left. Faded ivory silk
      // over pale panelling, a pale four-poster hung in ivory satin, her dressing table and glass, her trunk still at its
      // foot and a fan dropped by it, a cold candelabra, her portrait on the wall; at the corridor end
      // a sitting room with a tea set laid and never poured.
      room: "Bridal Suite",
      wall: "satin_ivory",
      wainscot: { material: "scrubbed_wood", heightM: 0.95, trim: "dark_wood" },
      floor: "dark_wood",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "dirty_carpet", x: -6.6, z: 9.6, sizeX: 3.2, sizeZ: 2.6 }],
      props: [
        // Nightstands either side of the bed: dried flowers on one, a candle on the other.
        { model: "ClassicNightstand_01", x: -7.75, z: BRIDAL_SOUTH_FACE - 0.215, turn: 180, draws: "bridal-classic-nightstand-1" },
        { model: "ClassicNightstand_01", x: -5.25, z: BRIDAL_SOUTH_FACE - 0.215, turn: 180, draws: "bridal-classic-nightstand-2" },
        { model: "antique_ceramic_vase_01", x: -7.75, z: BRIDAL_SOUTH_FACE - 0.22, y: NIGHTSTAND_TOP },
        { model: "wooden_candlestick", x: -5.25, z: BRIDAL_SOUTH_FACE - 0.25, y: NIGHTSTAND_TOP },
        // Her trunk at the foot of the bed; her portrait on the west wall.
        { model: "vintage_suitcase", x: -6.5, z: 15.7, turn: 180, draws: "bridal-vintage-suitcase-1" },
        { model: "fancy_picture_frame_02", x: BRIDAL_WEST_FACE + 0.045, z: 14.6, y: 1.35, turn: 90 },
        // The sitting room: a long sofa on the west wall, a smaller one facing it, a table between.
        { model: "sofa_03", x: BRIDAL_WEST_FACE + 0.475, z: 9.6, turn: 90, draws: "bridal-sofa-1" },
        { model: "gothic_coffee_table", x: -6.8, z: 9.6, draws: "bridal-gothic-coffee-table-1" },
        { model: "tea_set_01", x: -6.8, z: 9.6, y: GOTHIC_COFFEE_TOP, turn: 90 },
        { model: "Sofa_01", x: -5.0, z: 9.6, turn: -90, draws: "bridal-sofa-2" },
        // A console on the north wall with a candelabra and a vase.
        { model: "ClassicConsole_01", x: -1.6, z: BRIDAL_NORTH_FACE + 0.3, draws: "bridal-classic-console-1" },
        { model: "brass_candleholders", x: -1.85, z: BRIDAL_NORTH_FACE + 0.3, y: CONSOLE_TOP, turn: 4 },
        { model: "antique_ceramic_vase_01", x: -0.95, z: BRIDAL_NORTH_FACE + 0.3, y: CONSOLE_TOP },
        // Two chandeliers: over the sitting room and between the bed and the mirror.
        { model: "Chandelier_02", x: -6.6, z: 9.6, y: GUEST_CEILING - 0.85 },
        { model: "Chandelier_02", x: -3.4, z: 14.6, y: GUEST_CEILING - 0.85 },
      ],
      builds: [
        // The jewellery box (relic-bridal) on its own small cabinet against the south wall.
        { kind: "jewelCabinet", x: -4.5, z: 17.8, turn: 180, widthM: 0.8, backM: BRIDAL_SOUTH_FACE - 17.8, frontM: 0.2, material: "scrubbed_wood", draws: "bridal-jewel-cabinet", station: "relic-bridal" },
        { kind: "fourPoster", x: -6.5, z: BRIDAL_SOUTH_FACE - 1.11, turn: 180, widthM: 1.8, lengthM: 2.2, springsY: FOUR_POSTER_BOARDS, heightM: 2.35, drapes: "satin_ivory", material: "scrubbed_wood", draws: "bridal-bed" },
        // Her dressing table and swing glass on the east wall: the "Clean the mirror" task.
        { kind: "dressingTable", x: -0.7, z: 12, turn: -90, material: "scrubbed_wood", draws: "task-mirror" },
        { kind: "mattress", x: -6.5, z: BRIDAL_SOUTH_FACE - 1.11, turn: 180, y: FOUR_POSTER_BOARDS, lengthM: 2.08, widthM: 1.66, blanket: "terlenka" },
        { kind: "floorCandelabra", x: -8.35, z: 15.6, turn: 20, draws: "bridal-floor-candelabra-1" },
        { kind: "foldingFan", x: -5.55, z: 15.25, turn: 50 },
      ],
      lights: [
        { x: -6.6, z: 9.6, y: GUEST_CEILING - 0.6, kelvin: 2400, watts: 45, radius: 0.08 },
        { x: -3.4, z: 14.6, y: GUEST_CEILING - 0.6, kelvin: 2400, watts: 40, radius: 0.08 },
        { ...tallCandle(-1.85, BRIDAL_NORTH_FACE + 0.3, 4, CONSOLE_TOP), kelvin: 1900, watts: 6, radius: 0.03 },
        { x: -5.25, z: BRIDAL_SOUTH_FACE - 0.25, y: NIGHTSTAND_TOP + 0.24, kelvin: 1900, watts: 3, radius: 0.02 },
      ],
    },
    {
      // The Nursery, upstairs over the Main Hall: primrose paper over green-painted boarding, a
      // herringbone floor, the cradle on a blue rug in the middle (the game draws and rocks it), the
      // nanny's iron bed against the west wall, a toy chest, a child's table and stools, a tall painted
      // dresser, and three green planter boxes in the alcove where the plants died.
      room: "Nursery",
      wall: "wallpaper_primrose",
      wainscot: { material: "door_paint_green", heightM: 0.9, trim: "dark_wood" },
      floor: "herringbone_parquet",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "carpet_blue", x: 3, z: 12, sizeX: 3.2, sizeZ: 2.6 }],
      props: [
        // The nanny's bed, its head to the west wall; a basket beside it; a picture over it.
        { model: "old_bed_frame", x: NURSERY_WEST_FACE + 1.008, z: 15.2, turn: 90, draws: "nursery-old-bed-frame-1" },
        { model: "wicker_basket_01", x: 1.2, z: 16.05, turn: 15 },
        { model: "hanging_picture_frame_03", x: NURSERY_WEST_FACE + 0.02, z: 15.2, y: 1.35, turn: 90 },
        // A toy chest on the south wall, the oil lamp on it.
        { model: "treasure_chest", x: 1.9, z: NURSERY_SOUTH_FACE - 0.265, turn: 180, draws: "nursery-treasure-chest-1" },
        { model: "vintage_oil_lamp", x: 1.55, z: NURSERY_SOUTH_FACE - 0.27, y: 0.619 },
        // A child's table and two stools by the door end.
        { model: "side_table_01", x: 1.6, z: 6.8, draws: "nursery-side-table-1" },
        { model: "wooden_stool_02", x: 1.6, z: 6.25 },
        { model: "wooden_stool_02", x: 1.6, z: 7.35, turn: 20 },
        { model: "wooden_bowl_01", x: 1.6, z: 6.8, y: SIDE_TABLE_TOP },
        // A tall painted dresser on the east wall, a rocking chair turned toward the cradle.
        { model: "painted_wooden_cabinet_02", x: NURSERY_EAST_FACE - 0.365, z: 6.2, turn: -90, draws: "nursery-painted-wooden-cabinet-1" },
        { model: "Rockingchair_01", x: 4.1, z: 10.5, turn: 300, draws: "nursery-rockingchair-1" },
        { model: "Chandelier_01", x: 3.2, z: 9.5, y: GUEST_CEILING - 0.8 },
      ],
      builds: [
        { kind: "mattress", x: NURSERY_WEST_FACE + 1.008, z: 15.2, turn: 90, y: IRON_BED_SPRINGS, lengthM: 1.78, widthM: 0.82, blanket: "floral_jacquard" },
        // The planter boxes the relic may be buried in.
        { kind: "planter", x: 8.3, z: 17.8, drawsAll: ["relic-nursery-1", "relic-nursery-1:pot"] },
        { kind: "planter", x: 8.3, z: 15.5, drawsAll: ["relic-nursery-2", "relic-nursery-2:pot"] },
        { kind: "planter", x: 6, z: 17.8, drawsAll: ["relic-nursery-3", "relic-nursery-3:pot"] },
        { kind: "wallSconce", x: 7.75, z: NURSERY_SOUTH_FACE, y: 1.75, turn: 180, lit: true },
        // The low painted cupboard the salt jar stands on (the game draws the jar).
        { kind: "sideboard", x: 0.8, z: 17.8, turn: 180, widthM: 0.9, backM: NURSERY_SOUTH_FACE - 17.8, frontM: 0.12, heightM: SIDEBOARD_TOP, material: "door_paint_green" },
      ],
      lights: [
        { x: 3.2, z: 9.5, y: GUEST_CEILING - 0.55, kelvin: 2400, watts: 40, radius: 0.08 },
        { x: 1.55, z: NURSERY_SOUTH_FACE - 0.27, y: 0.619 + 0.45, kelvin: 2300, watts: 20, radius: 0.05 },
        ...sconceFlames(7.75, NURSERY_SOUTH_FACE, "n", 6),
      ],
    },
    {
      // The Staff Quarters, upstairs at the back: buff limewash over brown-painted boarding, plain
      // pine boards underfoot, two wooden bunks on the north wall with a washstand between, the
      // servants' deal table and benches under a lantern, a cupboard for the salt jar, and the old
      // steamer trunk in the corner (the game draws the trunk and its lid).
      room: "Staff Quarters",
      wall: "limewash_buff",
      wainscot: { material: "door_paint_brown", heightM: 1.1, trim: "dark_wood" },
      floor: "rough_pine_door",
      ceiling: "worn_cracked_plaster",
      rugs: [{ material: "dirty_carpet", x: 17.3, z: -3.7, sizeX: 3.4, sizeZ: 1.2 }],
      props: [
        // The washstand between the bunks: a jug and a bowl on it.
        { model: "painted_wooden_nightstand", x: 17.3, z: STAFF_NORTH_FACE + 0.254, draws: "staff-painted-wooden-nightstand-1" },
        { model: "jug_01", x: 17.18, z: STAFF_NORTH_FACE + 0.27, y: PAINTED_NIGHTSTAND_TOP, turn: 200 },
        { model: "wooden_bowl_01", x: 17.42, z: STAFF_NORTH_FACE + 0.3, y: PAINTED_NIGHTSTAND_TOP },
        // The lantern on the table, the light over it.
        { model: "Lantern_01", x: 17.6, z: -0.6, y: 0.76 },
        { model: "lantern_chandelier_01", x: 17.3, z: -0.5, y: GUEST_CEILING - LANTERN_H },
        // A bucket and a basket by the door; a candlestick on the cupboard.
        { model: "wooden_bucket_01", x: 12.0, z: 3.85, turn: 25, draws: "staff-wooden-bucket-1" },
        { model: "wicker_basket_01", x: 12.6, z: 4.0, turn: -10 },
        { model: "wooden_candlestick", x: 19.05, z: STAFF_SOUTH_FACE - 0.25, y: SIDEBOARD_TOP },
      ],
      builds: [
        // The bunks: the east one is the hiding spot's bed; a mattress on each deck, pillows to the west.
        { kind: "bunkBed", x: 19, z: STAFF_NORTH_FACE + 0.5, lengthM: 2, depthM: 1, heightM: 1.6, draws: "staff-bunk" },
        { kind: "bunkBed", x: 15.6, z: STAFF_NORTH_FACE + 0.5, lengthM: 2, depthM: 1, heightM: 1.6, draws: "staff-bunk-bed-1" },
        { kind: "mattress", x: 19, z: STAFF_NORTH_FACE + 0.5, turn: 90, y: BUNK_LOWER, lengthM: 1.84, widthM: 0.84, blanket: "wool_grey" },
        { kind: "mattress", x: 19, z: STAFF_NORTH_FACE + 0.5, turn: 90, y: BUNK_UPPER, lengthM: 1.84, widthM: 0.84, blanket: "wool_grey" },
        { kind: "mattress", x: 15.6, z: STAFF_NORTH_FACE + 0.5, turn: 90, y: BUNK_LOWER, lengthM: 1.84, widthM: 0.84, blanket: "wool_grey" },
        { kind: "mattress", x: 15.6, z: STAFF_NORTH_FACE + 0.5, turn: 90, y: BUNK_UPPER, lengthM: 1.84, widthM: 0.84, blanket: "wool_grey", folded: true },
        // The servants' table and its benches.
        { kind: "workTable", x: 17.3, z: -0.5, lengthM: 1.8, widthM: 0.8, heightM: 0.76, top: "scrubbed_wood", material: "dark_wood", draws: "staff-work-table-1" },
        { kind: "bench", x: 17.3, z: -1.25, lengthM: 1.6, widthM: 0.3, heightM: 0.45, draws: "staff-bench-1" },
        { kind: "bench", x: 17.3, z: 0.25, lengthM: 1.6, widthM: 0.3, heightM: 0.45, draws: "staff-bench-2" },
        // The cupboard the salt jar stands on (the game draws the jar).
        { kind: "sideboard", x: 19.5, z: 3.8, turn: 180, widthM: 1.1, backM: STAFF_SOUTH_FACE - 3.8, frontM: 0.12, heightM: SIDEBOARD_TOP, material: "scrubbed_wood" },
        { kind: "wallSconce", x: STAFF_EAST_FACE, z: -3.2, y: 1.75, turn: -90, lit: true },
      ],
      lights: [
        { x: 17.3, z: -0.5, y: GUEST_CEILING - 0.6, kelvin: 2400, watts: 35, radius: 0.08 },
        { x: 17.6, z: -0.6, y: 0.76 + 0.15, kelvin: 2000, watts: 12, radius: 0.04 },
        ...sconceFlames(STAFF_EAST_FACE, -3.2, "w", 6),
      ],
    },
    {
      // The Laundry, upstairs at the back: tiled to the ceiling, green glazed tiles under white, a
      // brick floor, the riveted boiler on the west wall (the game turns its valve), the sump in the
      // floor by the north wall (the game draws its water), a mangle, an airer of sheets overhead, and
      // the wash tubs in the strip by the corridor doors.
      room: "Laundry",
      wall: "long_white_tiles_laid",
      wainscot: { material: "long_green_tiles_laid", heightM: 1.2 },
      floor: "castle_brick_02_red",
      ceiling: "worn_cracked_plaster",
      props: [
        // Buckets by the sump and the tubs, baskets of washing on the floor and the folding table.
        { model: "wooden_bucket_01", x: 18.05, z: -21.55, turn: 30, draws: "laundry-wooden-bucket-1" },
        { model: "wooden_bucket_01", x: 13.75, z: -14.0, turn: -20, draws: "laundry-wooden-bucket-2" },
        { model: "wicker_basket_01", x: 12.0, z: -13.3, y: 0.8, turn: 80 },
        { model: "wicker_basket_01", x: 12.2, z: -11.1, turn: 15 },
        { model: "wicker_basket_01", x: 19.0, z: -17.2, turn: -25 },
        // The lanterns on their chains.
        { model: "Lantern_01", x: 15.5, z: -19.3, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 },
        { model: "Lantern_01", x: 13.0, z: -12.6, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 },
        // A candle on the cupboard by the salt jar.
        { model: "wooden_candlestick", x: 20.3, z: LAUNDRY_NORTH_FACE + 0.25, y: SIDEBOARD_TOP },
      ],
      builds: [
        // The boiler task's boiler; the game draws the red valve wheel and the gauge's dial.
        { kind: "boiler", x: 12.2, z: -20, turn: 90, backM: 12.2 - LAUNDRY_WEST_FACE, station: "task-boiler" },
        // The drain relic spot's sump; the game draws the water.
        { kind: "sump", x: 17, z: -21.3, station: "relic-laundry" },
        // The cupboard the salt jar stands on (the game draws the jar).
        { kind: "sideboard", x: 20, z: -21.5, widthM: 0.9, backM: -21.5 - LAUNDRY_NORTH_FACE, frontM: 0.12, heightM: SIDEBOARD_TOP, material: "door_paint_blue" },
        // The mangle against the south wall, clear of the cupboard; the airer over the middle.
        { kind: "mangle", x: 15.9, z: LAUNDRY_WASH_SOUTH_FACE - 0.32, turn: 180, draws: "laundry-mangle-1" },
        { kind: "airer", x: 17.6, z: -19.3, lengthM: 2.4, y: 2.2, cloth: "linen_grey" },
        // The wash tubs on the strip's east wall: a scrubbed counter with a deep sink.
        { kind: "kitchenCounter", x: LAUNDRY_STRIP_EAST_FACE - 0.4, z: -12.5, turn: -90, lengthM: 2, depthM: 0.8, heightM: 0.9, sinkX: 0, top: "scrubbed_wood", material: "door_paint_blue", draws: "laundry-tubs" },
        // The folding table between the corridor doors.
        { kind: "workTable", x: LAUNDRY_WEST_FACE + 0.35, z: -12.6, turn: 90, lengthM: 1.6, widthM: 0.7, heightM: 0.8, top: "scrubbed_wood", material: "dark_wood", draws: "laundry-work-table-1" },
        { kind: "chain", x: 15.5, z: -19.3, bottomM: LANTERN_CHAIN_BOTTOM },
        { kind: "chain", x: 13.0, z: -12.6, bottomM: LANTERN_CHAIN_BOTTOM },
        { kind: "wallSconce", x: LAUNDRY_EAST_FACE, z: -19.6, y: 1.75, turn: -90, lit: true },
      ],
      lights: [
        // Just under each lantern (inside its glass the light is shut in).
        { x: 15.5, z: -19.3, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H - 0.03, kelvin: 2300, watts: 30, radius: 0.04 },
        { x: 13.0, z: -12.6, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H - 0.03, kelvin: 2300, watts: 25, radius: 0.04 },
        ...sconceFlames(LAUNDRY_EAST_FACE, -19.6, "w", 6),
      ],
    },
    {
      // The upstairs corridors, one space built and lit together: sage damask over charcoal-painted
      // panelling, a blue runner on dark boards, the shuttered windows over the courtyard, the
      // crooked portraits, planters on the north side where the relic may be buried, and candles
      // in sconces, a few burnt out.
      room: "Upper Corridor",
      alsoRooms: ["Guest Corridor"],
      probes: [
        { x: 0, z: 3.25 },
        { x: 10.25, z: -6 },
        { x: -10.25, z: -6 },
        { x: 0, z: -15.25 },
        { x: 7.75, z: 6.25 },
      ],
      wall: "damask_sage",
      wainscot: { material: "door_paint_charcoal", heightM: 1.0, trim: "dark_wood" },
      floor: "dark_wood",
      ceiling: "worn_cracked_plaster",
      rugs: [
        { material: "carpet_blue", x: 0, z: 3.25, sizeX: 21.8, sizeZ: RUNNER_W },
        { material: "carpet_blue", x: 0, z: -15.25, sizeX: 21.8, sizeZ: RUNNER_W },
        { material: "carpet_blue", x: -10.25, z: -6, sizeX: RUNNER_W, sizeZ: 17.48 },
        { material: "carpet_blue", x: 10.25, z: -6, sizeX: RUNNER_W, sizeZ: 17.48 },
      ],
      props: [
        // Upper Corridor, the front: a console between the Bridal Suite's and the Nursery's doors with
        // a picture over it; a chair and a little table on the courtyard side; plants.
        { model: "ClassicConsole_01", x: -2.3, z: UPPER_SOUTH_FACE - 0.295, turn: 180, draws: "upper-console" },
        { model: "vintage_oil_lamp", x: -2.75, z: UPPER_SOUTH_FACE - 0.3, y: CONSOLE_TOP },
        { model: "brass_candleholders", x: -1.9, z: UPPER_SOUTH_FACE - 0.28, y: CONSOLE_TOP, turn: 180 },
        { model: "fancy_picture_frame_01", x: -2.3, z: UPPER_SOUTH_FACE - 0.012, y: 1.95, turn: 180, scale: 1.2 },
        { model: "side_table_01", x: 3.85, z: UPPER_NORTH_FACE + 0.23, draws: "upper-side-table" },
        { model: "wooden_candlestick", x: 3.85, z: UPPER_NORTH_FACE + 0.23, y: SIDE_TABLE_TOP },
        { model: "GreenChair_01", x: 4.65, z: UPPER_NORTH_FACE + 0.39, turn: -12, draws: "upper-chair" },
        { model: "potted_plant_01", x: -4.2, z: UPPER_NORTH_FACE + 0.37, turn: 70, draws: "upper-plant-west" },
        { model: "potted_plant_02", x: 7.8, z: UPPER_NORTH_FACE + 0.43, turn: 200, draws: "upper-plant-east" },
        // The landing at the top of the grand stairs: a painting facing the stairs.
        { model: "fancy_picture_frame_02", x: LANDING_EAST_FACE - 0.07, z: 6.25, y: 1.8, turn: -90, scale: 1.3 },
        // Upper Corridor, the east side: a tall cabinet between the Staff Quarters' and the Laundry's
        // doors, an armchair across from it on the courtyard side.
        { model: "vintage_cabinet_01", x: UPPER_EAST_EAST_FACE - 0.278, z: -5.75, turn: -90, draws: "upper-east-cabinet" },
        { model: "ArmChair_01", x: UPPER_EAST_WEST_FACE + 0.417, z: -3.4, turn: 90, draws: "upper-east-armchair" },
        // Guest Corridor, the west side: a hall bench facing the portraits, a plant by the corner.
        { model: "potted_plant_01", x: GUEST_WEST_WEST_FACE + 0.37, z: 1.0, turn: 20, draws: "guest-west-plant" },
        { model: "hanging_picture_frame_03", x: GUEST_WEST_WEST_FACE + 0.016, z: -5.6, y: 1.85, turn: 90 },
        // Guest Corridor, the north side: a console under a picture, a chair across, plants at the ends.
        { model: "ClassicConsole_01", x: 6.5, z: GUEST_NORTH_FACE + 0.295, draws: "guest-north-console" },
        { model: "brass_vase_01", x: 6.1, z: GUEST_NORTH_FACE + 0.3, y: CONSOLE_TOP },
        { model: "mantel_clock_01", x: 6.9, z: GUEST_NORTH_FACE + 0.27, y: CONSOLE_TOP },
        { model: "hanging_picture_frame_01", x: 6.5, z: GUEST_NORTH_FACE + 0.01, y: 1.95 },
        { model: "GreenChair_01", x: 3.3, z: GUEST_SOUTH_FACE - 0.39, turn: 176, draws: "guest-north-chair" },
        { model: "potted_plant_02", x: 8.6, z: GUEST_NORTH_FACE + 0.43, turn: -40, draws: "guest-north-plant-east" },
        { model: "potted_plant_01", x: -10.6, z: GUEST_NORTH_FACE + 0.33, turn: 130, draws: "guest-north-plant-west" },
      ],
      builds: [
        // The shutters task's windows over the courtyard; the game hangs the shutters on them.
        { kind: "shutterWindows", x: 0, z: 2.2, backM: 2.2 - UPPER_NORTH_FACE, station: "task-shutters", draws: "upper-shutters" },
        // The picture rail the portraits task's three frames hang from (the game draws the frames).
        { kind: "pictureRail", x: GUEST_WEST_EAST_FACE, z: -6, turn: -90, lengthM: 6.4, y: 2.45, hooks: [-0.75, 0, 0.75], hookY: 1.9, outM: 0.03, draws: "guest-portraits" },
        { kind: "bench", x: GUEST_WEST_WEST_FACE + 0.21, z: -5.6, turn: 90, lengthM: 1.6, widthM: 0.4, heightM: 0.45, material: "dark_wood", draws: "guest-west-bench" },
        // The planter boxes the relic may be buried in.
        ...([1, 2, 3] as const).map((n, k): DressingBuild => ({
          kind: "planter",
          x: [-7.5, -5, -2.5][k]!,
          z: GUEST_PLANTER_Z,
          material: "dark_wood",
          drawsAll: [`relic-guest-corridor-${n}`, `relic-guest-corridor-${n}:pot`, `guest-corridor-pot-${n}`],
        })),
        ...UPPER_SCONCES.map(([x, z, dir, lit]): DressingBuild => ({ kind: "wallSconce", x, z, turn: SCONCE_TURN[dir], y: SCONCE_Y, lit })),
      ],
      lights: [
        ...UPPER_SCONCES.filter(([, , , lit]) => lit).flatMap(([x, z, dir]) => {
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
        // The oil lamp on the front console.
        { x: -2.75, z: UPPER_SOUTH_FACE - 0.3, y: CONSOLE_TOP + 0.45, kelvin: 2300, watts: 40, radius: 0.05 },
      ],
    },
    {
      // The Stairwell at the foot of the cellar stairs and the Cellar Passage beyond the relic door,
      // one space built and lit together: bare old brick, flagstones, a lantern on a chain over the
      // landing, candles in sconces down the passage, a barrel and crates left at its end.
      room: "Stairwell",
      alsoRooms: ["Cellar Passage"],
      probes: [
        { x: -7.75, z: 5 },
        { x: -7.75, z: -1 },
        { x: -7.75, z: -7 },
      ],
      wall: "castle_brick_02_red",
      woodwork: "cellar_oak",
      floor: "cellar_flags",
      ceiling: "worn_cracked_plaster",
      props: [
        { model: "Lantern_01", x: -7.75, z: 4.6, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 },
        // A crate and a bucket in the corners either side of the stairs' foot.
        { model: "wooden_crate_01", x: STAIRWELL_WEST_FACE + 0.42, z: STAIRWELL_SOUTH_FACE - 0.21, turn: 180, draws: "stairwell-crate" },
        { model: "wooden_bucket_01", x: STAIRWELL_EAST_FACE - 0.3, z: STAIRWELL_SOUTH_FACE - 0.3, turn: 40, draws: "stairwell-bucket" },
        // The passage's far end: a barrel with a crate of bottles beside it.
        { model: "wine_barrel_01", x: -7.3, z: PASSAGE_NORTH_FACE + 0.39, turn: 15, draws: "passage-barrel" },
        { model: "wooden_crate_01", x: -8.35, z: PASSAGE_NORTH_FACE + 0.22, draws: "passage-crate" },
        { model: "wine_bottles_01", x: -8.35, z: PASSAGE_NORTH_FACE + 0.22, y: 0.342 },
      ],
      builds: [
        { kind: "chain", x: -7.75, z: 4.6, bottomM: LANTERN_CHAIN_BOTTOM },
        { kind: "wallSconce", x: STAIRWELL_EAST_FACE, z: 3.2, turn: SCONCE_TURN.w, y: SCONCE_Y, lit: true },
        { kind: "wallSconce", x: PASSAGE_EAST_FACE, z: -3.6, turn: SCONCE_TURN.w, y: SCONCE_Y, lit: true },
        { kind: "wallSconce", x: PASSAGE_WEST_FACE, z: -8.6, turn: SCONCE_TURN.e, y: SCONCE_Y, lit: false },
      ],
      lights: [
        { x: -7.75, z: 4.6, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H - 0.03, kelvin: 2300, watts: 25, radius: 0.04 },
        ...([[STAIRWELL_EAST_FACE, 3.2], [PASSAGE_EAST_FACE, -3.6]] as const).flatMap(([x, z]) =>
          [-1, 1].map((side): DressingLight => ({ x: x - SCONCE_OUT, z: z + side * SCONCE_CANDLE_SIDE, y: SCONCE_Y + SCONCE_FLAME_UP, kelvin: 1900, watts: 14, radius: 0.012 })),
        ),
      ],
    },
    {
      // The Wine Cellar: dark brick walls and a brick vault, a brick floor, racks of dusty bottles on
      // the north and west walls, casks along the south wall, and a tasting table under a lantern
      // where someone left glasses and a candle.
      room: "Wine Cellar",
      wall: "cellar_brick",
      woodwork: "cellar_oak",
      floor: "castle_brick_02_red",
      ceiling: "cellar_brick",
      props: [
        // The casks along the south wall, and two by the east wall.
        ...[-13.3, -12.45, -11.6].map((x, k): DressingProp => ({ model: "wine_barrel_01", x, z: WINE_SOUTH_FACE - 0.39, turn: 30 + k * 50, draws: `wine-cask-${k + 1}` })),
        { model: "wine_barrel_01", x: WINE_EAST_FACE - 0.39, z: -8.6, turn: 75, draws: "wine-cask-4" },
        { model: "wine_barrel_01", x: WINE_EAST_FACE - 0.39, z: -7.75, turn: 140, draws: "wine-cask-5" },
        // The tasting table: a row of bottles, the goblets, a jug and a candle.
        { model: "wine_bottles_01", x: -15.3, z: -3.15, y: WINE_TABLE_TOP },
        { model: "brass_goblets", x: -14.5, z: -2.9, y: WINE_TABLE_TOP, turn: 200 },
        { model: "metal_jug", x: -14.6, z: -3.2, y: WINE_TABLE_TOP },
        { model: "wooden_candlestick", x: -15.65, z: -2.85, y: WINE_TABLE_TOP },
        { model: "dining_chair_02", x: -15.4, z: -2.25, turn: 180, draws: "wine-chair-1" },
        { model: "dining_chair_02", x: -14.3, z: -3.95, turn: 20, draws: "wine-chair-2" },
        { model: "Lantern_01", x: -15.0, z: -3.0, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 },
        { model: "Lantern_01", x: -12.0, z: -6.4, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 },
      ],
      builds: [
        { kind: "wineRack", x: -11.5, z: WINE_NORTH_FACE + 0.3, widthM: 3, depthM: 0.6, heightM: 2, seed: 3, draws: "wine-racks" },
        { kind: "wineRack", x: -14.35, z: WINE_NORTH_FACE + 0.3, widthM: 2.5, depthM: 0.6, heightM: 2, seed: 8, draws: "wine-rack-north" },
        { kind: "wineRack", x: WINE_WEST_FACE + 0.3, z: -7.0, turn: 90, widthM: 3, depthM: 0.6, heightM: 2, seed: 13, draws: "wine-rack-west-wall" },
        // A pair of racks back to back in the middle of the floor, under the second lantern.
        { kind: "wineRack", x: -11.8, z: -4.3, turn: 180, widthM: 2.5, depthM: 0.6, heightM: 1.6, seed: 21, draws: "wine-rack-middle" },
        { kind: "wineRack", x: -11.8, z: -3.7, widthM: 2.5, depthM: 0.6, heightM: 1.6, seed: 22 },
        { kind: "workTable", x: -15.0, z: -3.0, lengthM: 1.6, widthM: 0.8, heightM: WINE_TABLE_TOP, top: "cellar_oak", material: "cellar_oak", draws: "wine-table" },
        { kind: "chain", x: -15.0, z: -3.0, bottomM: LANTERN_CHAIN_BOTTOM },
        { kind: "chain", x: -12.0, z: -6.4, bottomM: LANTERN_CHAIN_BOTTOM },
      ],
      lights: [
        { x: -15.0, z: -3.0, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H - 0.03, kelvin: 2300, watts: 25, radius: 0.04 },
        { x: -12.0, z: -6.4, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H - 0.03, kelvin: 2300, watts: 22, radius: 0.04 },
      ],
    },
    {
      // Storage: pine boarding to shoulder height under old brick, shelves of forgotten spares down
      // both side walls, a stack of crates in the middle, a hulking cabinet and a chest of drawers
      // put down here when the rooms upstairs were refurnished, a sea chest in the corner.
      room: "Storage",
      wall: "cellar_brick",
      wainscot: { material: "rough_pine_door", heightM: 1.2, trim: "dark_wood" },
      floor: "cellar_flags",
      ceiling: "worn_cracked_plaster",
      props: [
        { model: "wooden_crate_02", x: -2.27, z: -5.0, draws: "storage-crates" },
        { model: "wooden_crate_02", x: -1.73, z: -5.0, turn: 180 },
        { model: "wooden_crate_01", x: -2.0, z: -5.25, y: 0.454, turn: 8 },
        { model: "wooden_crate_01", x: -1.95, z: -4.72, y: 0.454, turn: -6 },
        { model: "GothicCabinet_01", x: -4.0, z: STORAGE_NORTH_FACE + 0.457, draws: "storage-cabinet" },
        { model: "vintage_wooden_drawer_01", x: -3.5, z: STORAGE_SOUTH_FACE - 0.44, turn: 180, draws: "storage-drawers" },
        { model: "vintage_suitcase", x: -3.5, z: STORAGE_SOUTH_FACE - 0.3, y: 1.09, turn: 184 },
        { model: "treasure_chest", x: 2.9, z: STORAGE_NORTH_FACE + 0.262, draws: "storage-chest" },
        // An old bed frame stood against the west wall, a second stack of crates with a marble bust on it.
        { model: "old_bed_frame", x: STORAGE_WEST_FACE + 0.455, z: -2.75, draws: "storage-bed-frame" },
        { model: "wooden_crate_02", x: 2.2, z: -4.6, turn: 90, draws: "storage-crates-east" },
        { model: "wooden_crate_01", x: 2.15, z: -4.6, y: 0.454, turn: 96 },
        { model: "marble_bust_01", x: 2.15, z: -4.6, y: 0.804, turn: -70 },
        { model: "Lantern_01", x: -1.0, z: -2.0, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H + 0.008 },
      ],
      builds: [
        { kind: "storeShelves", x: STORAGE_WEST_FACE + 0.225, z: -6.0, turn: 90, widthM: 2.4, depthM: 0.45, heightM: 2.0, seed: 4, material: "cellar_oak", draws: "storage-shelves-west" },
        { kind: "storeShelves", x: STORAGE_EAST_FACE - 0.225, z: -7.0, turn: -90, widthM: 2.0, depthM: 0.45, heightM: 2.0, seed: 9, material: "cellar_oak", draws: "storage-shelves-east" },
        { kind: "chain", x: -1.0, z: -2.0, bottomM: LANTERN_CHAIN_BOTTOM },
        { kind: "wallSconce", x: STORAGE_EAST_FACE, z: -4.4, turn: SCONCE_TURN.w, y: SCONCE_Y, lit: true },
      ],
      lights: [
        { x: -1.0, z: -2.0, y: LANTERN_CHAIN_BOTTOM - LANTERN_SMALL_H - 0.03, kelvin: 2300, watts: 25, radius: 0.04 },
        ...[-1, 1].map((side): DressingLight => ({ x: STORAGE_EAST_FACE - SCONCE_OUT, z: -4.4 + side * SCONCE_CANDLE_SIDE, y: SCONCE_Y + SCONCE_FLAME_UP, kelvin: 1900, watts: 14, radius: 0.012 })),
      ],
    },
    {
      // The Ritual Room: soot-black brick and dark flags, the stone altar with two tall candelabras
      // behind it, clusters of church candles on the floor round the circle (the game draws the
      // circle), plain benches either side facing the altar, and chains hanging from the vault.
      room: "Ritual Room",
      wall: "soot_brick",
      woodwork: "dark_wood",
      floor: "ritual_flags",
      ceiling: "soot_brick",
      props: [],
      builds: [
        { kind: "stoneAltar", x: -8, z: -15.5, lengthM: 1.6, depthM: 1.0, heightM: 1.0, draws: "ritual-altar" },
        { kind: "floorCandelabra", x: -9.15, z: -16.75, turn: 15, lit: true, draws: "ritual-candelabra-west" },
        { kind: "floorCandelabra", x: -6.85, z: -16.75, turn: -20, lit: true, draws: "ritual-candelabra-east" },
        ...RITUAL_CANDLES.map(([x, z, lit], k): DressingBuild => ({ kind: "floorCandles", x, z, count: 5 + (k % 3), lit, seed: 40 + k })),
        { kind: "bench", x: -14.6, z: -15.5, turn: 90, lengthM: 2.4, widthM: 0.4, heightM: 0.45, material: "dark_wood", draws: "ritual-bench-west" },
        { kind: "bench", x: -1.4, z: -15.5, turn: 90, lengthM: 2.4, widthM: 0.4, heightM: 0.45, material: "dark_wood", draws: "ritual-bench-east" },
        { kind: "chain", x: -14.0, z: -12.2, bottomM: 1.7 },
        { kind: "chain", x: -1.8, z: -18.6, bottomM: 1.9 },
        { kind: "chain", x: -3.2, z: -11.6, bottomM: 2.1 },
      ],
      lights: [
        ...[-9.15, -6.85].map((x): DressingLight => ({ x, z: -16.75, y: 1.75, kelvin: 1850, watts: 22, radius: 0.15 })),
        ...RITUAL_CANDLES.filter(([, , lit]) => lit > 0).map(([x, z, lit]): DressingLight => ({ x, z, y: 0.35, kelvin: 1800, watts: 4 * lit, radius: 0.08, bulb: false })),
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
    // Each guest bedroom's door into its bathroom (GDD 26.15): the same worn four-panel, no number.
    "guest1-bath": { style: "guest" },
    "guest2-bath": { style: "guest" },
    "guest3-bath": { style: "guest" },
    "guest4-bath": { style: "guest" },
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
