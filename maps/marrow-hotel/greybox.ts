import type { MapData } from "@haunted/shared";

/**
 * Phase 1 grey box of the Marrow Hotel ground floor (GDD Section 21.2):
 * the Main Hall, a corridor, the Restaurant and the Kitchen.
 * The full 3-level layout comes in Phase 5.
 *
 *            Restaurant | Corridor | Kitchen
 *   z = -14  +----------+----+-----+--------+
 *            |          |    |     |        |
 *            |          D    |     D        |   D = door
 *            |          |    |     +--------+  z = -6
 *   z = -4   +----------+    |
 *                            |
 *   z = 0          +------D--+--------+
 *                  |    Main Hall     |
 *   z = 12         +------------------+
 *               x = -8               x = 8
 */
export const marrowHotelGreybox: MapData = {
  id: "marrow-hotel-greybox",
  name: "Marrow Hotel (grey box)",
  wallHeightM: 3,
  wallThicknessM: 0.2,
  walls: [
    // Main Hall: x -8..8, z 0..12. Doorway to the corridor at x -0.75..0.75.
    [-8, 12, 8, 12],
    [-8, 0, -8, 12],
    [8, 0, 8, 12],
    [-8, 0, -0.75, 0],
    [0.75, 0, 8, 0],
    // Corridor: x -1.25..1.25, z -14..0. Doorways west (Restaurant) and east (Kitchen).
    [-1.25, -14, 1.25, -14],
    [-1.25, -14, -1.25, -9.75],
    [-1.25, -8.25, -1.25, 0],
    [1.25, -14, 1.25, -10.75],
    [1.25, -9.25, 1.25, 0],
    // Restaurant: x -13..-1.25, z -14..-4 (east wall is the corridor's west wall).
    [-13, -14, -1.25, -14],
    [-13, -14, -13, -4],
    [-13, -4, -1.25, -4],
    // Kitchen: x 1.25..9.25, z -14..-6 (west wall is the corridor's east wall).
    [1.25, -14, 9.25, -14],
    [9.25, -14, 9.25, -6],
    [1.25, -6, 9.25, -6],
  ],
  doors: [
    { id: "hall-corridor", x: 0, z: 0, width: 1.5, axis: "x" },
    { id: "corridor-restaurant", x: -1.25, z: -9, width: 1.5, axis: "z" },
    { id: "corridor-kitchen", x: 1.25, z: -10, width: 1.5, axis: "z" },
  ],
  rooms: [
    { name: "Main Hall", minX: -8, maxX: 8, minZ: 0, maxZ: 12 },
    { name: "Corridor", minX: -1.25, maxX: 1.25, minZ: -14, maxZ: 0 },
    { name: "Restaurant", minX: -13, maxX: -1.25, minZ: -14, maxZ: -4 },
    { name: "Kitchen", minX: 1.25, maxX: 9.25, minZ: -14, maxZ: -6 },
  ],
  // At least 2 per room and 1 per corridor segment (GDD Section 21.1). Placed against walls.
  hidingSpots: [
    { id: "hall-wardrobe-west", kind: "wardrobe", x: -7.6, z: 3, sizeX: 0.6, sizeZ: 1.2, exit: { x: -6.7, z: 3 } },
    { id: "hall-wardrobe-east", kind: "wardrobe", x: 7.6, z: 10, sizeX: 0.6, sizeZ: 1.2, exit: { x: 6.7, z: 10 } },
    { id: "corridor-curtain", kind: "curtain", x: 0.95, z: -4, sizeX: 0.4, sizeZ: 1.0, exit: { x: 0.1, z: -4 } },
    { id: "restaurant-cupboard", kind: "cupboard", x: -12.6, z: -12, sizeX: 0.6, sizeZ: 1.2, exit: { x: -11.7, z: -12 } },
    { id: "restaurant-curtain", kind: "curtain", x: -7, z: -4.3, sizeX: 1.2, sizeZ: 0.4, exit: { x: -7, z: -5.2 } },
    { id: "kitchen-pantry", kind: "cupboard", x: 8.85, z: -12, sizeX: 0.6, sizeZ: 1.2, exit: { x: 7.95, z: -12 } },
    { id: "kitchen-cupboard", kind: "cupboard", x: 5, z: -13.6, sizeX: 1.2, sizeZ: 0.6, exit: { x: 5, z: -12.7 } },
  ],
  // 8 salt jars (one per possible player), spread over every room of the grey box.
  saltJars: [
    { id: "jar-hall-1", x: -6.5, z: 11 },
    { id: "jar-hall-2", x: 6.5, z: 1.5 },
    { id: "jar-hall-3", x: 4, z: 11.2 },
    { id: "jar-corridor", x: -0.8, z: -13 },
    { id: "jar-restaurant-1", x: -12, z: -5 },
    { id: "jar-restaurant-2", x: -3, z: -13 },
    { id: "jar-kitchen-1", x: 8.5, z: -7 },
    { id: "jar-kitchen-2", x: 3.3, z: -13.3 },
  ],
  // Tasks from the GDD Section 9 list, plus the Corridor's portraits. Until the full map
  // (Phase 5) gives each task its own room, several share a grey-box room.
  tasks: [
    { id: "task-candelabra", name: "Light the candelabra", room: "Restaurant", minigame: "candelabra", x: -7, z: -9, visible: true, noisy: false },
    { id: "task-letter", name: "Burn the cursed letter", room: "Restaurant", minigame: "letter", x: -12.4, z: -9, visible: true, noisy: false },
    { id: "task-mirror", name: "Clean the mirror", room: "Restaurant", minigame: "mirror", x: -7, z: -13.4, visible: false, noisy: false },
    { id: "task-roses", name: "Water the dead roses", room: "Restaurant", minigame: "roses", x: -5, z: -11.5, visible: false, noisy: false },
    { id: "task-stove", name: "Turn off the stove", room: "Kitchen", minigame: "stove", x: 5.25, z: -6.7, visible: false, noisy: false },
    { id: "task-boiler", name: "Turn the boiler valve", room: "Kitchen", minigame: "boiler", x: 8.6, z: -10, visible: false, noisy: false },
    { id: "task-trunk", name: "Seal the old trunk", room: "Kitchen", minigame: "trunk", x: 5.25, z: -9.8, visible: false, noisy: false },
    { id: "task-clock", name: "Wind the grandfather clock", room: "Main Hall", minigame: "clock", x: 0, z: 11.5, visible: true, noisy: false },
    { id: "task-piano", name: "Tune the piano", room: "Main Hall", minigame: "piano", x: -7.2, z: 7, visible: false, noisy: true },
    { id: "task-cradle", name: "Rock the cradle", room: "Main Hall", minigame: "cradle", x: 7.2, z: 6, visible: false, noisy: true },
    { id: "task-switchboard", name: "Repair the switchboard", room: "Main Hall", minigame: "switchboard", x: -7.4, z: 1, visible: false, noisy: false },
    { id: "task-sheets", name: "Fold the bedsheets", room: "Main Hall", minigame: "sheets", x: -3, z: 11.5, visible: false, noisy: false },
    { id: "task-shutters", name: "Close the shutters", room: "Main Hall", minigame: "shutters", x: 7.4, z: 3.2, visible: true, noisy: false },
    { id: "task-portraits", name: "Straighten the portraits", room: "Corridor", minigame: "portraits", x: 0.85, z: -13.6, visible: true, noisy: false },
  ],
  // Relic hiding places (never the Main Hall). The full map has about 12 (GDD 21.1).
  relicSpots: [
    { id: "relic-planter", label: "Dig in the planter", room: "Restaurant", minigame: "dig", x: -10, z: -13.5 },
    { id: "relic-sideboard", label: "Open the jewellery box", room: "Restaurant", minigame: "lockbox", x: -4, z: -4.6 },
    { id: "relic-drain", label: "Reach into the drain", room: "Kitchen", minigame: "drain", x: 3, z: -6.6 },
    { id: "relic-shelf", label: "Open the jewellery box", room: "Kitchen", minigame: "lockbox", x: 7, z: -13.4 },
    { id: "relic-palm", label: "Dig in the plant pot", room: "Corridor", minigame: "dig", x: 0.75, z: -5.6 },
  ],
  relicNames: ["the Founder's Ring", "the Silver Bell", "the Music Box", "the Wedding Portrait", "the Brass Key"],
  spawns: [
    { x: -3, z: 6 },
    { x: 3, z: 6 },
    { x: -3, z: 9 },
    { x: 3, z: 9 },
    { x: -5, z: 7.5 },
    { x: 5, z: 7.5 },
    { x: -1, z: 10 },
    { x: 1, z: 10 },
  ],
};
