import type { MapData } from "@haunted/shared";

/**
 * A tiny two-floor map for tests: a hall on the ground floor, a flight of stairs going north,
 * and a landing upstairs. Seen from above, the landing is right over the stairwell's top.
 *
 * Ground floor (simulation = real place)        Upper floor (simulation x = real x + 30)
 *
 *   z = -12                                        +-----------------+
 *                                                  |     Landing     |
 *   z = -6          [ top of stairs ]              +-------+ +-------+
 *                   |   stairs    |                        | |  (top half of the stairs)
 *   z =  0   +------+  (x 2..4)   +---+                    | |
 *            |        Hall            |
 *   z =  6   +------------------------+
 *          x = -6                   x = 6
 */
export const twoFloorTestMap: MapData = {
  id: "test-two-floors",
  name: "Two floors (test)",
  wallHeightM: 3,
  wallThicknessM: 0.2,
  levels: [
    { id: "ground", name: "Ground floor", minX: -15, maxX: 15, minZ: -15, maxZ: 15, y: 0, shiftX: 0, shiftZ: 0 },
    { id: "upper", name: "Upper floor", minX: 15, maxX: 45, minZ: -15, maxZ: 15, y: 3, shiftX: -30, shiftZ: 0 },
  ],
  stairs: [{ id: "stairs", lower: "ground", upper: "upper", x: 3, z: 0, dir: "-z", lengthM: 6, widthM: 2 }],
  walls: [
    // Hall: x -6..6, z 0..6, with the stairwell opening at x 2..4 in its north wall.
    [-6, 6, 6, 6],
    [-6, 0, -6, 6],
    [6, 0, 6, 6],
    [-6, 0, 2, 0],
    [4, 0, 6, 0],
    // Landing (upper floor area): real x -6..6 is simulation x 24..36; z -12..-6, open at the stairs.
    [24, -12, 36, -12],
    [24, -12, 24, -6],
    [36, -12, 36, -6],
    [24, -6, 32, -6],
    [34, -6, 36, -6],
  ],
  doors: [],
  rooms: [
    { name: "Hall", minX: -6, maxX: 6, minZ: 0, maxZ: 6 },
    { name: "Landing", minX: 24, maxX: 36, minZ: -12, maxZ: -6 },
  ],
  hidingSpots: [],
  saltJars: [],
  tasks: [],
  relicSpots: [],
  relicNames: [],
  spawns: [{ x: 0, z: 3 }],
};
