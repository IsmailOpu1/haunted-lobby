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
