import type { MapDressing } from "@haunted/shared";

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
// The room side of the Main Hall's north and south walls (the dressed wall stands 5 mm off the
// grey wall box, tools/art/blender/build_room.py FACE_GAP).
const NORTH_FACE = 4.605;
const SOUTH_FACE = 18.395;

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
  ],
};
