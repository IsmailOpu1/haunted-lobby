import type { RelicSpotDef, TaskStationDef } from "@haunted/shared";
import { against, buildMap, hide, piece } from "../build.ts";

/**
 * The Marrow Hotel in grey boxes (GDD 21.2): three floors, 20 rooms plus corridors.
 * Coordinates are real places in meters (x east, z south); each floor has its own height.
 * Walls are generated from the rooms (maps/build.ts).
 *
 * Ground floor. A ring of corridors runs around the open-air Garden Courtyard. The Main Hall is
 * south of it, with the grand stairs up (east) and the cellar stairs down (west) inside it.
 * The Service Room has the back stairs up, so there are two ways between floors.
 *
 *   z = -22                                         +----------+--+
 *   z = -20   +-----------+                         | Service  |^ |  back stairs
 *             | Ballroom  |-- North Corridor -------+  Room    |  |
 *   z = -14   |           |W +-----------------+ E  |          +--+
 *   z =  -6   +-----------+e |                 | a  +----------+
 *             | Library   |s |     Garden      | s  | Kitchen  |
 *   z =   2   |           |t |    Courtyard    | t  |          |
 *   z = 4.5   +-----------+- Front Corridor -------------------+
 *             | Reception  |v|   Main Hall    |^|  Restaurant  |   v cellar stairs down
 *   z = 18.5  +------------+-+----------------+-+--------------+   ^ grand stairs up
 *          x = -23        -9                  9               23
 *
 * Upper floor (3 m up): the same corridor ring around the open courtyard. Guest Rooms 1 to 3
 * on the west, the Bridal Suite and Nursery over the Main Hall, Guest Room 4, Staff Quarters
 * and the Laundry on the east. The grand stairs arrive on a landing off the Upper Corridor.
 *
 * Basement (3 m down), under the west of the hotel: the cellar stairs end in the Stairwell,
 * where the relic door (GDD 10) locks off the Cellar Passage, Wine Cellar, Storage and the
 * Ritual Room. The Ritual Room has two doorways (GDD 21.1): one from the Wine Cellar, one
 * from Storage.
 */

const WALL = 3;

/** Simulation areas: each floor sits 100 m east of the one before (shared/levels.ts). */
const GROUND = 0;
const UPPER = 100;
const BASEMENT = 200;

const LOCKBOX = "Open the jewellery box";

function task(id: string, name: string, room: string, minigame: TaskStationDef["minigame"], x: number, z: number, visible = false, noisy = false, clue?: TaskStationDef["clue"]): TaskStationDef {
  return { id, name, room, minigame, x, z, visible, noisy, ...(clue ? { clue } : {}) };
}

function relic(id: string, label: string, room: string, minigame: RelicSpotDef["minigame"], x: number, z: number): RelicSpotDef {
  return { id, label, room, minigame, x, z };
}

/** A group of places to search (GDD 26.5): the relic hides in one of them, the rest are empty. */
function relicGroup(id: string, label: string, room: string, minigame: RelicSpotDef["minigame"], places: [number, number][]): RelicSpotDef {
  const [x, z] = places[0]!;
  return { id, label, room, minigame, x, z, places: places.map(([px, pz], i) => ({ id: `${id}-${i + 1}`, x: px, z: pz })) };
}

export const marrowHotelGreybox = buildMap({
  id: "marrow-hotel-greybox",
  name: "Marrow Hotel (grey box)",
  wallHeightM: WALL,
  wallThicknessM: 0.2,
  relicNames: ["the Founder's Ring", "the Silver Bell", "the Music Box", "the Wedding Portrait", "the Brass Key"],
  relicDoor: "relic-door",
  // The Bellboy (GDD 12.5): rings every 40 to 60 s; how often it swings doors is a Phase 5 choice (GDD 26.9).
  ghostTrick: { kind: "bellboy", ringEverySec: [40, 60], swingEverySec: [25, 45], swingRangeM: 6 },
  // Grey-box colours so rooms look different until the Phase 8 art (GDD 26.10): warm on the
  // ground floor, softer upstairs, cold and dark in the basement. Neighbours never share a colour.
  roomColors: {
    "Main Hall": "#8c6c48",
    "Front Corridor": "#70604a",
    "West Corridor": "#4e5c50",
    "East Corridor": "#5c4e60",
    "North Corridor": "#4e586c",
    "Garden Courtyard": "#3c5638",
    Reception: "#7c4a3a",
    Library: "#4c5c38",
    Ballroom: "#6c4a6c",
    Restaurant: "#3e5c68",
    Kitchen: "#7c7a56",
    "Service Room": "#5a5a6c",
    "Upper Corridor": "#605668",
    "Guest Corridor": "#4e6060",
    "Bridal Suite": "#8c5a68",
    Nursery: "#6a7c8e",
    "Guest Room 1": "#6c5a38",
    "Guest Room 2": "#3a5c4a",
    "Guest Room 3": "#5c3a3a",
    "Guest Room 4": "#4a4a70",
    "Staff Quarters": "#6c6c58",
    Laundry: "#566c6c",
    Stairwell: "#4c4640",
    "Cellar Passage": "#42463a",
    "Wine Cellar": "#4c2a32",
    Storage: "#4c4a38",
    "Ritual Room": "#3c2422",
  },
  stairs: [
    { id: "grand-stairs", lower: "ground", upper: "upper", x: 7.75, z: 14, dir: "-z", lengthM: 6, widthM: 2.5 },
    { id: "back-stairs", lower: "ground", upper: "upper", x: 21.75, z: -10.5, dir: "-z", lengthM: 6, widthM: 2.5 },
    { id: "cellar-stairs", lower: "basement", upper: "ground", x: -7.75, z: 8, dir: "+z", lengthM: 6, widthM: 2.5 },
  ],
  floors: [
    {
      id: "ground",
      name: "Ground floor",
      y: 0,
      offsetX: GROUND,
      rooms: [
        // The Main Hall wraps around the two stairwells along its east and west walls.
        { name: "Main Hall", minX: -6.5, maxX: 6.5, minZ: 4.5, maxZ: 18.5 },
        { name: "Main Hall", minX: -9, maxX: -6.5, minZ: 4.5, maxZ: 8 },
        { name: "Main Hall", minX: -9, maxX: -6.5, minZ: 14, maxZ: 18.5 },
        { name: "Main Hall", minX: 6.5, maxX: 9, minZ: 4.5, maxZ: 8 },
        { name: "Main Hall", minX: 6.5, maxX: 9, minZ: 14, maxZ: 18.5 },
        { name: "Front Corridor", minX: -11.5, maxX: 11.5, minZ: 2, maxZ: 4.5 },
        { name: "West Corridor", minX: -11.5, maxX: -9, minZ: -14, maxZ: 2 },
        { name: "East Corridor", minX: 9, maxX: 11.5, minZ: -14, maxZ: 2 },
        { name: "North Corridor", minX: -11.5, maxX: 11.5, minZ: -16.5, maxZ: -14 },
        { name: "Garden Courtyard", minX: -9, maxX: 9, minZ: -14, maxZ: 2, outdoor: true },
        { name: "Reception", minX: -23, maxX: -9, minZ: 4.5, maxZ: 18.5 },
        { name: "Library", minX: -23, maxX: -11.5, minZ: -6, maxZ: 4.5 },
        { name: "Ballroom", minX: -23, maxX: -11.5, minZ: -20, maxZ: -6 },
        { name: "Restaurant", minX: 9, maxX: 23, minZ: 4.5, maxZ: 18.5 },
        { name: "Kitchen", minX: 11.5, maxX: 23, minZ: -6, maxZ: 4.5 },
        // The Service Room wraps around the back stairs along its east wall.
        { name: "Service Room", minX: 11.5, maxX: 20.5, minZ: -22, maxZ: -6 },
        { name: "Service Room", minX: 20.5, maxX: 23, minZ: -22, maxZ: -16.5 },
        { name: "Service Room", minX: 20.5, maxX: 23, minZ: -10.5, maxZ: -6 },
      ],
      openings: [
        // Where the corridors of the ring meet.
        { x: -10.25, z: 2, width: 2.5, axis: "x" },
        { x: 10.25, z: 2, width: 2.5, axis: "x" },
        { x: -10.25, z: -14, width: 2.5, axis: "x" },
        { x: 10.25, z: -14, width: 2.5, axis: "x" },
      ],
      doors: [
        // Doors follow one rule (GDD 26.11): corridors join rooms. A small room has one door; a big
        // room has two, onto different corridors, so a chase can loop through it. Rooms never open
        // into each other, except the Kitchen into its Restaurant.
        // The Main Hall's grand double door faces the courtyard across the Front Corridor.
        { id: "hall-front", x: 0, z: 4.5, width: 2.5, axis: "x" },
        { id: "reception-front", x: -10.25, z: 4.5, width: 1.5, axis: "x" },
        { id: "restaurant-front", x: 10.25, z: 4.5, width: 1.5, axis: "x" },
        { id: "library-west", x: -11.5, z: -2, width: 1.5, axis: "z" },
        { id: "ballroom-west", x: -11.5, z: -10, width: 1.5, axis: "z" },
        { id: "ballroom-north", x: -11.5, z: -15.25, width: 1.5, axis: "z" },
        { id: "kitchen-restaurant", x: 17, z: 4.5, width: 1.5, axis: "x" },
        { id: "kitchen-east", x: 11.5, z: -2, width: 1.5, axis: "z" },
        { id: "service-north", x: 11.5, z: -15.25, width: 1.5, axis: "z" },
        { id: "courtyard-front", x: 0, z: 2, width: 1.5, axis: "x" },
        { id: "courtyard-north", x: 0, z: -14, width: 1.5, axis: "x" },
      ],
      hidingSpots: [
        hide("hall-wardrobe-west", "wardrobe", -4, 18.5, "n"),
        hide("hall-wardrobe-east", "wardrobe", 4, 18.5, "n"),
        hide("front-curtain", "curtain", -6, 2, "s"),
        hide("west-curtain", "curtain", -9, -12, "w"),
        hide("east-curtain", "curtain", 9, -12, "e"),
        hide("north-curtain", "curtain", -4, -16.5, "s"),
        hide("courtyard-shed-west", "cupboard", -9, -11, "e"),
        hide("courtyard-shed-east", "cupboard", 9, -11, "w"),
        hide("reception-wardrobe", "wardrobe", -23, 9, "e"),
        hide("reception-cupboard", "cupboard", -16, 18.5, "n"),
        hide("library-wardrobe", "wardrobe", -23, -4.5, "e"),
        hide("library-cupboard", "cupboard", -13.5, -6, "s"),
        hide("ballroom-curtain", "curtain", -23, -8, "e"),
        hide("ballroom-wardrobe", "wardrobe", -13.5, -20, "s"),
        hide("restaurant-wardrobe", "wardrobe", 23, 8, "w"),
        hide("restaurant-curtain", "curtain", 19, 18.5, "n"),
        hide("kitchen-cupboard", "cupboard", 23, 3, "w"),
        hide("kitchen-pantry", "cupboard", 13.5, 4.5, "n"),
        hide("service-wardrobe", "wardrobe", 16, -22, "s"),
        hide("service-cupboard", "cupboard", 20.5, -13, "w"),
      ],
      furniture: [
        piece("hall-meeting-table", "table", "Main Hall", 0, 11, 4, 1.6, 0.8),
        piece("reception-desk", "counter", "Reception", -16, 11, 5, 1, 1.1),
        against("library-shelf", "shelf", "Library", -14, 4.5, "n", 3, 0.5, 2.2),
        piece("library-table", "table", "Library", -17, -1, 2.5, 1.2, 0.8),
        piece("courtyard-fountain", "fountain", "Garden Courtyard", 0, -6, 3, 3, 0.8),
        piece("restaurant-table-west", "table", "Restaurant", 12.5, 11, 2, 1.2, 0.8),
        piece("restaurant-table-east", "table", "Restaurant", 20, 11, 2, 1.2, 0.8),
        piece("kitchen-island", "counter", "Kitchen", 17, -1, 3, 1.2, 0.9),
        against("ballroom-stage", "stage", "Ballroom", -17, -20, "s", 4, 2, 0.5),
        against("service-shelf", "shelf", "Service Room", 11.5, -18, "e", 2, 0.5, 2),
      ],
      saltJars: [
        { id: "jar-reception", x: -22.3, z: 18 },
        // In the nook beside the cellar stairs, where everyone starts.
        { id: "jar-hall", x: -7.3, z: 7.2 },
        { id: "jar-restaurant", x: 13, z: 17.9 },
        { id: "jar-service", x: 15, z: -12 },
      ],
      tasks: [
        // The guest book with the time to set lies on the meeting table.
        task("task-clock", "Set the grandfather clock", "Main Hall", "clock", 0, 17.8, true, false, { x: 1.2, z: 11, heightM: 0.8 }),
        task("task-switchboard", "Repair the switchboard", "Reception", "switchboard", -22.2, 14),
        task("task-letter", "Burn the cursed letter", "Library", "letter", -22.3, -1, true),
        task("task-piano", "Tune the piano", "Ballroom", "piano", -21.5, -13, false, true),
        task("task-roses", "Water the dead roses", "Garden Courtyard", "roses", -4, -9),
        task("task-candelabra", "Light the candelabra", "Restaurant", "candelabra", 16, 12, true),
        task("task-stove", "Turn off the stove", "Kitchen", "stove", 22.3, -1),
      ],
      relicSpots: [
        relic("relic-library", LOCKBOX, "Library", "lockbox", -22.3, 3.5),
        relic("relic-ballroom", LOCKBOX, "Ballroom", "lockbox", -22.3, -19.3),
        relicGroup("relic-courtyard", "Dig in the flower bed", "Garden Courtyard", "dig", [[5, -12.2], [5, -10], [5, -7.8]]),
        relic("relic-restaurant", LOCKBOX, "Restaurant", "lockbox", 22.3, 17.8),
        relic("relic-kitchen", "Reach into the drain", "Kitchen", "drain", 19, -5.3),
        relic("relic-service", "Reach into the drain", "Service Room", "drain", 19.5, -21.3),
      ],
      spawns: [
        { x: -3, z: 9.5 },
        { x: 3, z: 9.5 },
        { x: -3, z: 12.5 },
        { x: 3, z: 12.5 },
        { x: -5, z: 11 },
        { x: 5, z: 11 },
        { x: -1, z: 14 },
        { x: 1, z: 14 },
      ],
      bell: { x: 0, z: 8.5 },
      fuseBox: { x: 12.2, z: -20 },
      ghostStart: { x: -17, z: -13 },
    },
    {
      id: "upper",
      name: "Upper floor",
      y: WALL,
      offsetX: UPPER,
      rooms: [
        { name: "Upper Corridor", minX: -11.5, maxX: 11.5, minZ: 2, maxZ: 4.5 },
        { name: "Upper Corridor", minX: 9, maxX: 11.5, minZ: -14, maxZ: 2 },
        // The landing at the top of the grand stairs.
        { name: "Upper Corridor", minX: 6.5, maxX: 9, minZ: 4.5, maxZ: 8 },
        { name: "Guest Corridor", minX: -11.5, maxX: -9, minZ: -14, maxZ: 2 },
        { name: "Guest Corridor", minX: -11.5, maxX: 11.5, minZ: -16.5, maxZ: -14 },
        { name: "Bridal Suite", minX: -9, maxX: 0, minZ: 4.5, maxZ: 18.5 },
        { name: "Nursery", minX: 0, maxX: 6.5, minZ: 4.5, maxZ: 18.5 },
        { name: "Nursery", minX: 6.5, maxX: 9, minZ: 14, maxZ: 18.5 },
        { name: "Guest Room 1", minX: -23, maxX: -9, minZ: 4.5, maxZ: 18.5 },
        { name: "Guest Room 2", minX: -23, maxX: -11.5, minZ: -5, maxZ: 4.5 },
        { name: "Guest Room 3", minX: -23, maxX: -11.5, minZ: -20, maxZ: -5 },
        { name: "Guest Room 4", minX: 9, maxX: 23, minZ: 4.5, maxZ: 18.5 },
        { name: "Staff Quarters", minX: 11.5, maxX: 23, minZ: -6, maxZ: 4.5 },
        { name: "Laundry", minX: 11.5, maxX: 20.5, minZ: -22, maxZ: -6 },
        { name: "Laundry", minX: 20.5, maxX: 23, minZ: -22, maxZ: -16.5 },
        { name: "Laundry", minX: 20.5, maxX: 23, minZ: -10.5, maxZ: -6 },
      ],
      openings: [
        { x: -10.25, z: 2, width: 2.5, axis: "x" },
        { x: 10.25, z: -14, width: 2.5, axis: "x" },
      ],
      doors: [
        { id: "bridal-corridor", x: -4.5, z: 4.5, width: 1.5, axis: "x" },
        { id: "nursery-corridor", x: 4, z: 4.5, width: 1.5, axis: "x" },
        { id: "guest1-corridor", x: -10.25, z: 4.5, width: 1.5, axis: "x" },
        { id: "guest2-corridor", x: -11.5, z: -1.5, width: 1.5, axis: "z" },
        { id: "guest3-corridor", x: -11.5, z: -10, width: 1.5, axis: "z" },
        { id: "guest4-corridor", x: 10.25, z: 4.5, width: 1.5, axis: "x" },
        { id: "staff-corridor", x: 11.5, z: -1.5, width: 1.5, axis: "z" },
        { id: "laundry-corridor", x: 11.5, z: -10, width: 1.5, axis: "z" },
        { id: "laundry-north", x: 11.5, z: -15.25, width: 1.5, axis: "z" },
      ],
      hidingSpots: [
        hide("upper-front-curtain", "curtain", -7, 2, "s"),
        hide("upper-east-curtain", "curtain", 9, -8, "e"),
        hide("guest-west-curtain", "curtain", -9, 0, "w"),
        hide("guest-north-curtain", "curtain", 0, -14, "n"),
        hide("bridal-wardrobe-west", "wardrobe", -9, 7, "e"),
        hide("bridal-wardrobe-south", "wardrobe", -2, 18.5, "n"),
        hide("nursery-wardrobe", "wardrobe", 0, 8.5, "e"),
        hide("nursery-cupboard", "cupboard", 4, 18.5, "n"),
        hide("guest1-wardrobe-west", "wardrobe", -23, 7, "e"),
        hide("guest1-wardrobe-south", "wardrobe", -14, 18.5, "n"),
        hide("guest2-wardrobe", "wardrobe", -23, -3, "e"),
        hide("guest2-cupboard", "cupboard", -16, 4.5, "n"),
        hide("guest3-wardrobe", "wardrobe", -23, -15, "e"),
        hide("guest3-curtain", "curtain", -14, -20, "s"),
        hide("guest4-wardrobe-east", "wardrobe", 23, 8, "w"),
        hide("guest4-wardrobe-south", "wardrobe", 15, 18.5, "n"),
        hide("staff-wardrobe", "wardrobe", 16, 4.5, "n"),
        hide("staff-cupboard", "cupboard", 23, -1, "w"),
        hide("laundry-cupboard", "cupboard", 20.5, -13, "w"),
        hide("laundry-wardrobe", "wardrobe", 15, -22, "s"),
      ],
      furniture: [
        against("bridal-bed", "bed", "Bridal Suite", -6.5, 18.5, "n", 2, 2.2, 0.6),
        against("guest1-bed", "bed", "Guest Room 1", -18, 18.5, "n", 2, 2.2, 0.6),
        against("guest2-bed", "bed", "Guest Room 2", -19, -5, "s", 2, 2.2, 0.6),
        against("guest3-bed", "bed", "Guest Room 3", -19, -20, "s", 2, 2.2, 0.6),
        against("guest4-bed", "bed", "Guest Room 4", 19, 18.5, "n", 2, 2.2, 0.6),
        against("staff-bunk", "bed", "Staff Quarters", 19, -6, "s", 2, 1, 1.6),
        against("laundry-tubs", "counter", "Laundry", 11.5, -7.5, "e", 2, 0.8, 0.9),
      ],
      saltJars: [
        { id: "jar-nursery", x: 0.8, z: 17.8 },
        { id: "jar-guest1", x: -12, z: 17.9 },
        { id: "jar-staff", x: 19.5, z: 3.8 },
        { id: "jar-laundry", x: 15, z: -12 },
      ],
      tasks: [
        task("task-shutters", "Close the shutters", "Upper Corridor", "shutters", 0, 2.7, true, true),
        task("task-portraits", "Straighten the portraits", "Guest Corridor", "portraits", -9.7, -6, true),
        task("task-mirror", "Clean the mirror", "Bridal Suite", "mirror", -0.7, 12),
        task("task-cradle", "Rock the cradle", "Nursery", "cradle", 3, 12, false, true),
        task("task-sheets", "Fold the bedsheets", "Guest Room 1", "sheets", -18, 12),
        task("task-trunk", "Seal the old trunk", "Staff Quarters", "trunk", 22.3, 3.5),
        task("task-boiler", "Turn the boiler valve", "Laundry", "boiler", 12.2, -20),
      ],
      relicSpots: [
        relic("relic-bridal", LOCKBOX, "Bridal Suite", "lockbox", -4.5, 17.8),
        relicGroup("relic-nursery", "Dig in the plant pot", "Nursery", "dig", [[8.3, 17.8], [8.3, 15.5], [6, 17.8]]),
        relic("relic-guest2", LOCKBOX, "Guest Room 2", "lockbox", -22.3, 3.8),
        relic("relic-guest4", LOCKBOX, "Guest Room 4", "lockbox", 22.3, 17.8),
        relic("relic-laundry", "Reach into the drain", "Laundry", "drain", 17, -21.3),
        relicGroup("relic-guest-corridor", "Dig in the plant pot", "Guest Corridor", "dig", [[-7.5, -15.8], [-5, -15.8], [-2.5, -15.8]]),
      ],
    },
    {
      id: "basement",
      name: "Basement",
      y: -WALL,
      offsetX: BASEMENT,
      rooms: [
        { name: "Stairwell", minX: -11, maxX: -4.5, minZ: 2, maxZ: 8 },
        { name: "Cellar Passage", minX: -9, maxX: -6.5, minZ: -10, maxZ: 2 },
        { name: "Wine Cellar", minX: -20, maxX: -9, minZ: -10, maxZ: 2 },
        { name: "Storage", minX: -6.5, maxX: 4, minZ: -10, maxZ: 2 },
        { name: "Ritual Room", minX: -18, maxX: 2, minZ: -27, maxZ: -10 },
      ],
      doors: [
        { id: "relic-door", x: -7.75, z: 2, width: 2.5, axis: "x" },
        { id: "passage-wine", x: -9, z: 0, width: 1.5, axis: "z" },
        { id: "passage-storage", x: -6.5, z: 0, width: 1.5, axis: "z" },
        { id: "wine-ritual", x: -17, z: -10, width: 1.5, axis: "x" },
        { id: "storage-ritual", x: 0.5, z: -10, width: 1.5, axis: "x" },
      ],
      hidingSpots: [
        hide("stairwell-wardrobe", "wardrobe", -11, 5, "e"),
        hide("stairwell-cupboard", "cupboard", -4.5, 5, "w"),
        hide("passage-curtain", "curtain", -9, -6, "e"),
        hide("wine-rack-west", "wardrobe", -20, -2, "e"),
        hide("wine-cupboard", "cupboard", -15, 2, "n"),
        hide("storage-cupboard", "cupboard", 4, -2, "w"),
        hide("storage-wardrobe", "wardrobe", 0, 2, "n"),
        hide("ritual-wardrobe-west", "wardrobe", -18, -24, "e"),
        hide("ritual-wardrobe-east", "wardrobe", 2, -24, "w"),
      ],
      furniture: [
        against("wine-racks", "shelf", "Wine Cellar", -11.5, -10, "s", 3, 0.6, 2),
        piece("storage-crates", "crates", "Storage", -2, -5, 1.4, 1.4, 1),
        piece("ritual-altar", "altar", "Ritual Room", -8, -19, 1.6, 1, 1),
      ],
      altar: { x: -8, z: -19 },
    },
  ],
});
