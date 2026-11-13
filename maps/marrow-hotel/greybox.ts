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

/** Restaurant dining: a round clothed table and the chairs on the named sides of it. */
const DINING_TABLE_M = 1.2;
const DINING_TABLE_TOP = 0.76;
/** From the table's middle to a chair's middle: the seat tucked a little under the cloth. */
const CHAIR_OUT_M = 0.78;
function diningTable(id: string, x: number, z: number, sides: ("n" | "s" | "w" | "e")[], room = "Restaurant") {
  const at = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] } as const;
  return [
    piece(id, "table", room, x, z, DINING_TABLE_M, DINING_TABLE_M, DINING_TABLE_TOP),
    ...sides.map((s) => {
      const [dx, dz] = at[s];
      // A dining chair is 0.43 wide and 0.58 deep (dining_chair_02), facing the table.
      return piece(`${id}-chair-${s}`, "chair", room, x + dx * CHAIR_OUT_M, z + dz * CHAIR_OUT_M, dx ? 0.58 : 0.43, dx ? 0.43 : 0.58, 0.97);
    }),
  ];
}

/** A group of places to search (GDD 26.5): the relic hides in one of them, the rest are empty. */
function relicGroup(id: string, label: string, room: string, minigame: RelicSpotDef["minigame"], places: [number, number][]): RelicSpotDef {
  const [x, z] = places[0]!;
  return { id, label, room, minigame, x, z, places: places.map(([px, pz], i) => ({ id: `${id}-${i + 1}`, x: px, z: pz })) };
}

/** The courtyard's raised flower bed: its three places to dig, one to each length of it. */
const COURTYARD_DIG: [number, number][] = [
  [5, -12.2],
  [5, -10],
  [5, -7.8],
];
/** Stone urns at the corners of the fountain's paved square. */
const COURTYARD_URNS: [number, number][] = [
  [-2.9, -3.1],
  [2.9, -3.1],
  [-2.9, -8.9],
  [2.9, -8.9],
];

export const marrowHotelGreybox = buildMap({
  id: "marrow-hotel-greybox",
  name: "Marrow Hotel (grey box)",
  wallHeightM: WALL,
  wallThicknessM: 0.2,
  relicNames: ["the Founder's Ring", "the Silver Bell", "the Music Box", "the Wedding Portrait", "the Brass Key"],
  // Who the ghost may have been, and what each clue task shows for them (GDD 26.13).
  suspects: [
    { id: "bride", icon: "👰", name: "the Bride", belonging: "the Wedding Portrait", clues: { mirror: "a face in a veil", portraits: "a woman in a wedding dress", switchboard: "a call from the Bridal Suite" } },
    { id: "bellboy", icon: "🛎️", name: "the Bellboy", belonging: "the Silver Bell", clues: { mirror: "a face under a pillbox cap", portraits: "a boy in a bellboy's uniform", switchboard: "a call from the Staff Quarters" } },
    { id: "founder", icon: "🎩", name: "the Founder", belonging: "the Founder's Ring", clues: { mirror: "a face under a top hat", portraits: "an old man with a ring", switchboard: "a call from the Library" } },
    { id: "child", icon: "🎀", name: "the Child", belonging: "the Music Box", clues: { mirror: "a small face with ribbons", portraits: "a girl holding a music box", switchboard: "a call from the Nursery" } },
  ],
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
        // Big rooms have walled-off parts with an inner door (GDD 26.15): behind the Reception's
        // desk hall, the back office with the switchboard and the luggage room; the Founder's
        // study off the Library.
        { name: "Reception", minX: -17, maxX: -9, minZ: 4.5, maxZ: 18.5 },
        { name: "Reception", part: "back office", minX: -23, maxX: -17, minZ: 11.5, maxZ: 18.5 },
        { name: "Reception", part: "luggage room", minX: -23, maxX: -17, minZ: 4.5, maxZ: 11.5 },
        { name: "Library", minX: -17, maxX: -11.5, minZ: -6, maxZ: 4.5 },
        { name: "Library", minX: -23, maxX: -17, minZ: 0, maxZ: 4.5 },
        { name: "Library", part: "study", minX: -23, maxX: -17, minZ: -6, maxZ: 0 },
        { name: "Ballroom", minX: -23, maxX: -11.5, minZ: -20, maxZ: -6 },
        // The Restaurant's bar in its south-east corner, and the Service Room's fuse room. (A
        // hotel kitchen is big; it is filled with counters instead.)
        { name: "Restaurant", minX: 9, maxX: 23, minZ: 4.5, maxZ: 13.5 },
        { name: "Restaurant", minX: 9, maxX: 17, minZ: 13.5, maxZ: 18.5 },
        { name: "Restaurant", part: "bar", minX: 17, maxX: 23, minZ: 13.5, maxZ: 18.5 },
        { name: "Kitchen", minX: 11.5, maxX: 23, minZ: -6, maxZ: 4.5 },
        // The Service Room wraps around the back stairs along its east wall.
        { name: "Service Room", minX: 11.5, maxX: 20.5, minZ: -17, maxZ: -6 },
        { name: "Service Room", minX: 17, maxX: 20.5, minZ: -22, maxZ: -17 },
        { name: "Service Room", part: "fuse room", minX: 11.5, maxX: 17, minZ: -22, maxZ: -17 },
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
        // Inner doors, between the parts of a room.
        { id: "reception-office", x: -17, z: 15, width: 1.2, axis: "z" },
        { id: "reception-luggage", x: -17, z: 8, width: 1.2, axis: "z" },
        { id: "library-study", x: -18.5, z: 0, width: 1.2, axis: "x" },
        { id: "restaurant-bar", x: 20, z: 13.5, width: 1.2, axis: "x" },
        { id: "service-fuse", x: 14.5, z: -17, width: 1.2, axis: "x" },
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
        // The Main Hall, dressed (Phase 8, GDD 26.15): two dining tables end to end make the meeting
        // table; seating groups flank the front door, consoles stand either side of the clock.
        piece("hall-meeting-table", "table", "Main Hall", 0, 11, 4.5, 1.4, 0.88),
        against("hall-sofa-west", "sofa", "Main Hall", -4.2, 4.5, "s", 2.73, 0.93, 1.1),
        piece("hall-coffee-west", "table", "Main Hall", -4.2, 6.5, 1.54, 0.97, 0.52),
        piece("hall-armchair-west", "chair", "Main Hall", -6, 6.6, 0.77, 0.85, 1.06),
        against("hall-sofa-east", "sofa", "Main Hall", 4.2, 4.5, "s", 1.57, 0.66, 0.8),
        piece("hall-coffee-east", "table", "Main Hall", 4.2, 6.5, 1.44, 1.44, 0.56),
        piece("hall-chair-east", "chair", "Main Hall", 5.9, 6.5, 0.66, 0.67, 1.06),
        piece("hall-ottoman", "chair", "Main Hall", 2.75, 6.5, 0.62, 0.89, 0.62),
        piece("hall-side-east", "table", "Main Hall", 5.75, 4.85, 0.55, 0.45, 0.55),
        against("hall-console-west", "counter", "Main Hall", -2, 18.5, "n", 1.54, 0.59, 0.95),
        against("hall-console-east", "counter", "Main Hall", 2, 18.5, "n", 1.54, 0.59, 0.95),
        piece("hall-side-southeast", "table", "Main Hall", 5.8, 17.9, 0.55, 0.45, 0.55),
        piece("hall-plant-door-west", "plant", "Main Hall", -1.95, 5.05, 0.6, 0.6, 0.84),
        piece("hall-plant-door-east", "plant", "Main Hall", 1.95, 5.05, 0.6, 0.6, 0.84),
        piece("hall-plant-southwest", "plant", "Main Hall", -5.8, 17.8, 0.6, 0.6, 1.35),
        { ...against("hall-salt-cabinet", "counter", "Main Hall", -7.75, 8, "n", 0.9, 0.42, 0.79), of: "jar-hall" },
        against("hall-luggage", "crates", "Main Hall", 7.75, 18.5, "n", 1.61, 0.3, 0.57),
        // The meeting bell's pedestal (the map's bell, below).
        { ...piece("hall-bell-stand", "table", "Main Hall", 0, 8.5, 0.4, 0.4, 1.03), of: "bell" },
        // The grandfather clock's case (task-clock below), its back to the south wall.
        { ...against("hall-clock-case", "shelf", "Main Hall", 0, 18.5, "n", 0.63, 0.43, 2.19), of: "task-clock" },
        // The Reception, dressed: the counter near the back wall with the key rack behind it, two
        // pillars framing it, a waiting group by the east wall.
        piece("reception-desk", "counter", "Reception", -13.5, 15.5, 4, 1, 1.1),
        against("reception-keys", "shelf", "Reception", -13.5, 18.5, "n", 1.8, 0.3, 2.1),
        against("reception-commode", "counter", "Reception", -11, 18.5, "n", 1.2, 0.58, 1.21),
        piece("reception-pillar-west", "pillar", "Reception", -15, 12.5, 0.5, 0.5, 3),
        piece("reception-pillar-east", "pillar", "Reception", -12, 12.5, 0.5, 0.5, 3),
        against("reception-sofa", "sofa", "Reception", -9, 9, "w", 1.81, 0.82, 0.71),
        against("reception-side-north", "table", "Reception", -9, 7.6, "w", 0.38, 0.38, 0.76),
        against("reception-side-south", "table", "Reception", -9, 10.4, "w", 0.38, 0.38, 0.76),
        piece("reception-coffee", "table", "Reception", -10.65, 9, 0.97, 1.54, 0.52),
        piece("reception-armchair-north", "chair", "Reception", -11.95, 8.4, 0.77, 0.85, 1.06),
        piece("reception-armchair-south", "chair", "Reception", -11.95, 9.6, 0.77, 0.85, 1.06),
        piece("reception-plant-northwest", "plant", "Reception", -16.5, 5.05, 0.6, 0.6, 1.35),
        piece("reception-plant-east", "plant", "Reception", -9.45, 13.2, 0.6, 0.6, 0.84),
        // The back office: a writing desk and chair, a filing cabinet, a shelf of ledgers.
        against("office-desk", "table", "Reception", -20, 11.5, "s", 1.33, 0.56, 0.83),
        piece("office-chair", "chair", "Reception", -20, 12.75, 0.43, 0.58, 0.97),
        against("office-files", "shelf", "Reception", -17, 12.7, "w", 1.2, 0.5, 1.25),
        { ...against("office-salt-cabinet", "counter", "Reception", -22.43, 18.5, "n", 0.9, 0.42, 0.79), of: "jar-reception" },
        against("office-ledgers", "shelf", "Reception", -19.5, 18.5, "n", 1.37, 0.58, 2.06),
        // The switchboard's cabinet (task-switchboard below), from the west wall to its desk's front.
        { ...against("office-switchboard", "shelf", "Reception", -23, 14, "e", 1.24, 0.95, 1.9), of: "task-switchboard" },
        // The luggage room: shelves along the north wall, a steamer trunk, a crate, the trolley.
        against("luggage-shelf-west", "shelf", "Reception", -21.4, 4.5, "s", 1.4, 0.6, 1.6),
        against("luggage-shelf-east", "shelf", "Reception", -19.6, 4.5, "s", 1.4, 0.6, 1.6),
        against("luggage-trunk", "crates", "Reception", -21.3, 11.5, "n", 0.96, 0.52, 0.62),
        against("luggage-crate", "crates", "Reception", -23, 6.4, "e", 1.17, 0.53, 0.46),
        against("luggage-trolley", "crates", "Reception", -18.3, 11.5, "n", 1, 0.6, 1.75),
        against("luggage-cases", "crates", "Reception", -19.9, 11.5, "n", 1.61, 0.3, 0.57),
        // The Library, dressed: bookcases line the walls, a long reading table under the chandelier,
        // the card catalogue on the north wall, two armchairs over a game of chess.
        against("library-books-east-north", "shelf", "Library", -11.5, -4.6, "w", 2.2, 0.42, 2.5),
        against("library-books-east", "shelf", "Library", -11.5, 0.35, "w", 2.2, 0.42, 2.5),
        against("library-books-east-south", "shelf", "Library", -11.5, 2.65, "w", 2.2, 0.42, 2.5),
        against("library-books-south-west", "shelf", "Library", -15.65, 4.5, "n", 2.3, 0.42, 2.5),
        against("library-books-south-east", "shelf", "Library", -13.25, 4.5, "n", 2.3, 0.42, 2.5),
        against("library-catalogue", "shelf", "Library", -15.9, -6, "s", 1.72, 1.01, 1.09),
        piece("library-table", "table", "Library", -14.6, -1.6, 1.1, 2.8, 0.78),
        piece("library-chair-west-north", "chair", "Library", -15.4, -2.4, 0.58, 0.43, 0.97),
        piece("library-chair-west-south", "chair", "Library", -15.4, -0.8, 0.58, 0.43, 0.97),
        piece("library-chair-east-north", "chair", "Library", -13.8, -2.4, 0.58, 0.43, 0.97),
        piece("library-chair-east-south", "chair", "Library", -13.8, -0.8, 0.58, 0.43, 0.97),
        piece("library-armchair-west", "chair", "Library", -15.6, 2.3, 0.85, 0.77, 1.06),
        piece("library-chess-table", "table", "Library", -14.6, 2.3, 0.45, 0.55, 0.55),
        piece("library-armchair-east", "chair", "Library", -13.6, 2.3, 0.85, 0.77, 1.06),
        // The west bay: a rocking chair by a lamp, a glazed cabinet, the jewellery box's cabinet.
        against("library-nightstand", "table", "Library", -23, 0.65, "e", 0.57, 0.42, 0.7),
        piece("library-rocking-chair", "chair", "Library", -21.6, 1.6, 0.85, 0.85, 0.99),
        against("library-display-cabinet", "shelf", "Library", -19.6, 4.5, "n", 2.02, 0.67, 2.24),
        { ...against("library-jewel-cabinet", "counter", "Library", -23, 3.5, "e", 1.0, 0.55, 0.85), of: "relic-library" },
        // The Founder's study: the fireplace (task-letter below), his desk, an armchair by the fire.
        { ...against("study-fireplace", "shelf", "Library", -23, -1, "e", 1.8, 0.78, 3), of: "task-letter" },
        piece("study-desk", "table", "Library", -19.4, -3.4, 1.5, 0.8, 0.78),
        piece("study-chair", "chair", "Library", -19.4, -4.25, 0.67, 0.66, 1.06),
        piece("study-armchair", "chair", "Library", -21.0, -2.5, 0.85, 0.85, 1.06),
        against("study-books", "shelf", "Library", -19.6, -6, "s", 2.0, 0.42, 2.5),
        against("study-nightstand", "table", "Library", -17, -2.2, "w", 0.57, 0.42, 0.7),
        // The Garden Courtyard, dressed: the fountain in a paved square, the potting bench (the
        // roses) on the west wall, the raised flower bed (the relic) east of the fountain in three
        // lengths, one to each place to dig, garden seats, urns, and dead rose bushes in beds by the walls.
        piece("courtyard-fountain", "fountain", "Garden Courtyard", 0, -6, 3, 3, 0.8),
        { ...against("courtyard-potting-bench", "counter", "Garden Courtyard", -9, -6, "e", 1.5, 0.5, 0.95), of: "task-roses" },
        ...COURTYARD_DIG.map(([x, z], i) => ({ ...piece(`courtyard-bed-${i + 1}`, "counter", "Garden Courtyard", x, z, 1.1, 2.0, 0.5), of: `relic-courtyard-${i + 1}` })),
        against("courtyard-seat-west", "bench", "Garden Courtyard", -4.5, 2, "n", 1.5, 0.55, 0.86),
        against("courtyard-seat-east", "bench", "Garden Courtyard", 4.5, 2, "n", 1.5, 0.55, 0.86),
        piece("courtyard-seat-fountain", "bench", "Garden Courtyard", 3.3, -6, 0.55, 1.5, 0.86),
        ...COURTYARD_URNS.map(([x, z], i) => piece(`courtyard-urn-${i + 1}`, "urn", "Garden Courtyard", x, z, 0.46, 0.46, 1.05)),
        against("courtyard-roses-west", "counter", "Garden Courtyard", -9, -1.5, "e", 5.6, 0.8, 1.1),
        against("courtyard-roses-east", "counter", "Garden Courtyard", 9, -1.5, "w", 5.6, 0.8, 1.1),
        against("courtyard-roses-east-mid", "counter", "Garden Courtyard", 9, -7.4, "w", 4.4, 0.8, 1.1),
        against("courtyard-roses-north", "counter", "Garden Courtyard", -5.9, -14, "s", 5.0, 0.8, 1.1),
        against("courtyard-roses-north-east", "counter", "Garden Courtyard", 7.4, -14, "s", 2.2, 0.8, 1.1),
        // The corridor ring, dressed: shallow pieces only, along the walls and clear of every door
        // and curtain, so a chase still has about 1.5 m or more everywhere (GDD 21.1).
        against("front-console-west", "counter", "Front Corridor", -3.5, 4.5, "n", 1.54, 0.59, 0.95),
        against("front-console-east", "counter", "Front Corridor", 4.5, 4.5, "n", 1.54, 0.59, 0.95),
        against("front-side-table", "table", "Front Corridor", 2.1, 2, "s", 0.55, 0.45, 0.55),
        against("front-chair", "chair", "Front Corridor", 3.0, 2, "s", 0.67, 0.66, 1.06),
        against("front-plant-west", "plant", "Front Corridor", -8.3, 2, "s", 0.6, 0.6, 0.84),
        against("front-plant-east", "plant", "Front Corridor", 8.3, 2, "s", 0.6, 0.6, 0.84),
        against("west-sofa", "sofa", "West Corridor", -11.5, -6, "e", 1.57, 0.66, 0.8),
        against("west-stand", "table", "West Corridor", -9, -3.5, "w", 0.38, 0.38, 0.76),
        against("west-plant", "plant", "West Corridor", -9, -13.4, "w", 0.6, 0.6, 1.35),
        against("east-commode", "counter", "East Corridor", 11.5, -6.5, "w", 1.2, 0.58, 1.21),
        against("east-suitcase", "crates", "East Corridor", 11.5, -10.5, "w", 1.61, 0.24, 0.57),
        against("east-rocking-chair", "chair", "East Corridor", 9, -3.5, "e", 0.71, 0.83, 1.0),
        against("east-plant", "plant", "East Corridor", 11.5, -13.4, "w", 0.6, 0.6, 0.84),
        against("north-console", "counter", "North Corridor", 5, -16.5, "s", 1.54, 0.59, 0.95),
        against("north-stand", "table", "North Corridor", -7.5, -16.5, "s", 0.38, 0.38, 0.76),
        against("north-chair-west", "chair", "North Corridor", -2.5, -14, "n", 0.67, 0.66, 1.06),
        against("north-chair-east", "chair", "North Corridor", 2.5, -14, "n", 0.67, 0.66, 1.06),
        against("north-plant-west", "plant", "North Corridor", -9.6, -16.5, "s", 0.6, 0.6, 1.35),
        against("north-plant-east", "plant", "North Corridor", 9.6, -16.5, "s", 0.6, 0.6, 1.35),
        // The Restaurant, dressed: round tables under long cloths with chairs drawn up, the lit
        // candelabra's table between them, a serving console on the west wall, the sideboard the
        // salt jar stands on in the south bay.
        ...diningTable("restaurant-table-1", 12.2, 7.9, ["n", "s", "w", "e"]),
        ...diningTable("restaurant-table-2", 19.6, 7.9, ["n", "s", "w", "e"]),
        ...diningTable("restaurant-table-3", 12.2, 11.2, ["n", "s", "w", "e"]),
        ...diningTable("restaurant-table-4", 19.2, 11.0, ["n", "s", "w", "e"]),
        ...diningTable("restaurant-table-5", 11.4, 15.8, ["w", "e"]),
        ...diningTable("restaurant-table-6", 14.9, 15.8, ["w", "e"]),
        { ...piece("restaurant-candelabra", "table", "Restaurant", 16, 12, 0.9, 0.9, 0.75), of: "task-candelabra" },
        against("restaurant-console", "counter", "Restaurant", 9, 9.6, "e", 1.54, 0.59, 0.95),
        { ...against("restaurant-sideboard", "counter", "Restaurant", 13, 18.5, "n", 1.6, 0.6, 0.79), of: "jar-restaurant" },
        piece("restaurant-plant-northeast", "plant", "Restaurant", 22.45, 5.05, 0.6, 0.6, 1.35),
        piece("restaurant-plant-southwest", "plant", "Restaurant", 9.55, 17.95, 0.6, 0.6, 0.84),
        // The bar: the counter with stools on the drinkers' side, the back bar of bottles behind it,
        // the jewellery box's cabinet in the corner, a table for two, barrels by the walls.
        piece("bar-counter", "counter", "Restaurant", 21.0, 15.4, 0.6, 2.8, 1.05),
        piece("bar-stool-north", "chair", "Restaurant", 20.25, 15.0, 0.48, 0.48, 0.75),
        piece("bar-stool-middle", "chair", "Restaurant", 20.25, 15.8, 0.48, 0.48, 0.75),
        piece("bar-stool-south", "chair", "Restaurant", 20.25, 16.6, 0.48, 0.48, 0.75),
        against("bar-back", "shelf", "Restaurant", 23, 15.25, "w", 3.2, 0.45, 2.4),
        { ...against("bar-jewel-cabinet", "counter", "Restaurant", 23, 17.85, "w", 1.1, 0.55, 0.85), of: "relic-restaurant" },
        piece("bar-table", "table", "Restaurant", 18.1, 16.0, 0.8, 0.8, 0.75),
        piece("bar-chair-north", "chair", "Restaurant", 18.1, 15.3, 0.43, 0.58, 0.97),
        piece("bar-chair-south", "chair", "Restaurant", 18.1, 16.7, 0.43, 0.58, 0.97),
        piece("bar-barrel-north", "crates", "Restaurant", 17.55, 14.05, 0.76, 0.76, 0.87),
        piece("bar-barrel-south", "crates", "Restaurant", 17.55, 17.95, 0.76, 0.76, 0.87),
        // The Kitchen, dressed: the work table under its pan rack, the range in its chimney recess on
        // the east wall, the sink counter and cupboards along the north wall, worktops on the west
        // and south, the dresser in the north-east corner.
        piece("kitchen-island", "counter", "Kitchen", 17, -1, 3, 1.2, 0.9),
        { ...against("kitchen-range", "counter", "Kitchen", 23, -1, "w", 2.1, 0.7, 0.9), of: "task-stove" },
        against("kitchen-sink", "counter", "Kitchen", 13.21, -6, "s", 3.2, 0.62, 0.9),
        against("kitchen-cabinet", "shelf", "Kitchen", 15.42, -6, "s", 1.2, 0.62, 1.18),
        against("kitchen-crate-north", "crates", "Kitchen", 16.5, -6, "s", 0.83, 0.41, 0.35),
        against("kitchen-crock", "crates", "Kitchen", 20.6, -6, "s", 0.66, 0.5, 0.37),
        against("kitchen-dresser", "shelf", "Kitchen", 22.39, -6, "s", 1.0, 0.73, 2.57),
        against("kitchen-counter-west", "counter", "Kitchen", 11.5, 0.9, "e", 3.0, 0.62, 0.9),
        against("kitchen-worktop", "counter", "Kitchen", 20.75, 4.5, "n", 4.29, 0.62, 0.9),
        against("kitchen-crate-south", "crates", "Kitchen", 15.2, 4.5, "n", 0.83, 0.41, 0.35),
        // The Ballroom, dressed: the bandstand on the north wall, the piano (task-piano below) and
        // the jewellery box's cabinet on the west wall, gilt chairs along the walls, plants in corners.
        against("ballroom-stage", "stage", "Ballroom", -17, -20, "s", 4, 2, 0.5),
        // The piano's case out to its keys' front edge, so nobody stands in its keyboard.
        { ...against("ballroom-piano", "shelf", "Ballroom", -23, -13, "e", 1.5, 0.93, 1.29), of: "task-piano" },
        { ...against("ballroom-jewel-cabinet", "counter", "Ballroom", -23, -19.39, "e", 1.0, 0.55, 0.85), of: "relic-ballroom" },
        against("ballroom-chairs-south-west", "chair", "Ballroom", -20.1, -6, "n", 3.0, 0.45, 0.9),
        against("ballroom-chairs-south-east", "chair", "Ballroom", -14.7, -6, "n", 3.0, 0.45, 0.9),
        against("ballroom-chairs-east", "chair", "Ballroom", -11.5, -12.6, "w", 2.4, 0.45, 0.9),
        piece("ballroom-plant-northwest", "plant", "Ballroom", -21.0, -19.35, 0.6, 0.6, 1.35),
        piece("ballroom-plant-northeast", "plant", "Ballroom", -12.15, -19.35, 0.6, 0.6, 0.84),
        piece("ballroom-plant-southwest", "plant", "Ballroom", -22.35, -6.65, 0.6, 0.6, 0.84),
        piece("ballroom-plant-southeast", "plant", "Ballroom", -12.15, -6.65, 0.6, 0.6, 1.35),
        // The ball's supper tables at the edges of the dance floor, its middle left clear.
        ...diningTable("ballroom-table-southwest", -20.0, -9.2, ["w", "e"], "Ballroom"),
        ...diningTable("ballroom-table-southeast", -14.6, -9.2, ["w", "e"], "Ballroom"),
        ...diningTable("ballroom-table-northwest", -20.0, -16.6, ["w", "e"], "Ballroom"),
        ...diningTable("ballroom-table-northeast", -14.4, -16.6, ["w", "e"], "Ballroom"),
        against("ballroom-refreshments", "table", "Ballroom", -23, -11, "e", 1.8, 0.8, 0.76),
        piece("ballroom-candelabra-west", "lamp", "Ballroom", -19.45, -18.55, 0.44, 0.44, 1.83),
        piece("ballroom-candelabra-east", "lamp", "Ballroom", -14.55, -18.55, 0.44, 0.44, 1.83),
        piece("ballroom-fallen-chair", "chair", "Ballroom", -17.3, -11.0, 0.5, 1.0, 0.6),
        against("ballroom-sofa", "sofa", "Ballroom", -11.5, -8.1, "w", 1.57, 0.66, 0.8),
        against("ballroom-ottoman", "chair", "Ballroom", -23, -15.0, "e", 0.89, 0.62, 0.62),
        // The Service Room, dressed: the servants' table with its benches under the bell board's
        // room, the linen press and the dresser on the west wall, the sideboard the salt jar stands
        // on under the bell board, the fuse board (the map's fuse box) and a workbench in the fuse
        // room, the scullery sink by the drain.
        against("service-shelf", "shelf", "Service Room", 11.5, -9, "e", 2, 0.5, 2),
        against("service-dresser", "shelf", "Service Room", 11.5, -12.3, "e", 1.0, 0.73, 2.57),
        piece("service-table", "table", "Service Room", 15, -11.5, 2.4, 0.9, 0.76),
        piece("service-bench-north", "chair", "Service Room", 15, -12.22, 2.0, 0.32, 0.45),
        piece("service-bench-south", "chair", "Service Room", 15, -10.78, 2.0, 0.32, 0.45),
        { ...against("service-sideboard", "counter", "Service Room", 15.5, -6, "n", 1.4, 0.55, 0.79), of: "jar-service" },
        { ...against("service-fuse-board", "shelf", "Service Room", 11.5, -20, "e", 0.9, 0.22, 2.1), of: "fuse box" },
        against("service-fuse-bench", "table", "Service Room", 17, -18.4, "w", 1.4, 0.6, 0.85),
        against("service-fuse-crates", "crates", "Service Room", 12.45, -22, "s", 1.17, 0.53, 0.81),
        against("service-sink", "counter", "Service Room", 21.72, -22, "s", 2.3, 0.62, 0.9),
        piece("service-baskets", "crates", "Service Room", 20.05, -15.9, 0.5, 0.5, 0.5),
        // More for the hall: the bells' batteries and a painted cupboard on the south wall, chairs at
        // the table's ends, store shelves by the back stairs, a broom in the corner by them.
        against("service-batteries", "shelf", "Service Room", 13.2, -6, "n", 1.4, 0.45, 1.1),
        against("service-cupboard-south", "shelf", "Service Room", 18.6, -6, "n", 1.19, 0.62, 1.18),
        piece("service-chair-west", "chair", "Service Room", 13.35, -11.5, 0.58, 0.43, 0.97),
        piece("service-chair-east", "chair", "Service Room", 16.65, -11.5, 0.58, 0.43, 0.97),
        against("service-stores", "shelf", "Service Room", 20.5, -11.3, "w", 1.2, 0.45, 2.0),
        against("service-broom", "crates", "Service Room", 23, -6.6, "w", 0.5, 0.15, 1.45),
        // The fuse room: the dynamo, the battery rack on the north wall, a cable drum under the
        // tool board, a ladder against the east wall; store shelves in the scullery.
        piece("service-dynamo", "crates", "Service Room", 14.1, -20.3, 1.5, 0.76, 0.95),
        against("service-fuse-batteries", "shelf", "Service Room", 14.25, -22, "s", 1.6, 0.45, 1.1),
        piece("service-cable-drum", "crates", "Service Room", 12.0, -17.7, 0.45, 0.7, 0.7),
        against("service-ladder", "shelf", "Service Room", 17, -20, "w", 0.5, 0.65, 2.6),
        against("service-scullery-shelves", "shelf", "Service Room", 17, -20.5, "e", 1.6, 0.45, 2.0),
      ],
      saltJars: [
        // On the side cabinet in the back office's corner.
        { id: "jar-reception", x: -22.43, z: 18.1 },
        // On the side cabinet in the nook under the cellar stairs, where everyone starts.
        { id: "jar-hall", x: -7.75, z: 7.6 },
        { id: "jar-restaurant", x: 13, z: 17.9 },
        // On the sideboard under the bell board.
        { id: "jar-service", x: 15.5, z: -6.375 },
      ],
      tasks: [
        // The guest book with the time to set lies on the meeting table.
        // At the clock model's own centre (its case stands flush with the wall: 18.5 - 0.1 wall - 0.213
        // half its depth + 0.025, the model's centre behind its footprint's middle).
        task("task-clock", "Set the grandfather clock", "Main Hall", "clock", 0, 18.207, true, false, { x: 1.2, z: 11, heightM: 0.88 }),
        task("task-switchboard", "Repair the switchboard", "Reception", "switchboard", -22.2, 14),
        task("task-letter", "Burn the cursed letter", "Library", "letter", -22.3, -1, true),
        // At the piano's own place, its case flush with the west wall (22.9 is the wall's face).
        task("task-piano", "Tune the piano", "Ballroom", "piano", -22.55, -13, false, true),
        // On the potting bench against the courtyard's west wall (its pump and pail on the bench).
        task("task-roses", "Water the dead roses", "Garden Courtyard", "roses", -8.65, -6),
        task("task-candelabra", "Light the candelabra", "Restaurant", "candelabra", 16, 12, true),
        task("task-stove", "Turn off the stove", "Kitchen", "stove", 22.55, -1),
      ],
      relicSpots: [
        // On its cabinet against the west wall (22.9 is the wall's face; the cabinet is 0.55 deep).
        relic("relic-library", LOCKBOX, "Library", "lockbox", -22.55, 3.5),
        relic("relic-ballroom", LOCKBOX, "Ballroom", "lockbox", -22.55, -19.39),
        relicGroup("relic-courtyard", "Dig in the flower bed", "Garden Courtyard", "dig", COURTYARD_DIG),
        // On its cabinet in the bar's corner, behind the counter (the cabinet stands 0.35 deep behind it).
        relic("relic-restaurant", LOCKBOX, "Restaurant", "lockbox", 22.55, 17.85),
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
      // At the fuse board's front, on the fuse room's west wall.
      fuseBox: { x: 11.85, z: -20 },
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
        // Oversized rooms walled off (GDD 26.15): each guest room is a bedroom of 56 m² by its
        // corridor door with a bathroom of about 12 m² behind an inner door; the rest of the old
        // room is walled off, never entered and never dressed.
        { name: "Guest Room 1", minX: -17, maxX: -9, minZ: 4.5, maxZ: 11.5 },
        { name: "Guest Room 1", part: "bathroom", minX: -20.5, maxX: -17, minZ: 4.5, maxZ: 8 },
        { name: "Guest Room 2", minX: -19.5, maxX: -11.5, minZ: -5, maxZ: 2 },
        { name: "Guest Room 2", part: "bathroom", minX: -23, maxX: -19.5, minZ: -5, maxZ: -1.5 },
        { name: "Guest Room 3", minX: -19.5, maxX: -11.5, minZ: -14, maxZ: -7 },
        { name: "Guest Room 3", part: "bathroom", minX: -23, maxX: -19.5, minZ: -14, maxZ: -10.5 },
        { name: "Guest Room 4", minX: 9, maxX: 17, minZ: 4.5, maxZ: 11.5 },
        { name: "Guest Room 4", part: "bathroom", minX: 17, maxX: 20.5, minZ: 4.5, maxZ: 8 },
        { name: "Staff Quarters", minX: 11.5, maxX: 23, minZ: -6, maxZ: 4.5 },
        // The Laundry, cut to about 86 m²: a strip by its two corridor doors and the wash room
        // along the south wall, which keeps the corner the back stairs come up into.
        { name: "Laundry", minX: 11.5, maxX: 20.5, minZ: -22, maxZ: -16.5 },
        { name: "Laundry", minX: 20.5, maxX: 23, minZ: -22, maxZ: -16.5 },
        { name: "Laundry", minX: 11.5, maxX: 14.5, minZ: -16.5, maxZ: -9 },
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
        // Inner doors, each guest bedroom into its bathroom.
        { id: "guest1-bath", x: -17, z: 6.25, width: 1, axis: "z" },
        { id: "guest2-bath", x: -19.5, z: -3.25, width: 1, axis: "z" },
        { id: "guest3-bath", x: -19.5, z: -12.25, width: 1, axis: "z" },
        { id: "guest4-bath", x: 17, z: 6.25, width: 1, axis: "z" },
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
        hide("guest1-wardrobe-west", "wardrobe", -17, 10, "e"),
        hide("guest1-wardrobe-south", "wardrobe", -9, 7.5, "w"),
        hide("guest2-wardrobe", "wardrobe", -19.5, -0.3, "e"),
        hide("guest2-cupboard", "cupboard", -16, 2, "n"),
        hide("guest3-wardrobe", "wardrobe", -19.5, -8.5, "e"),
        hide("guest3-curtain", "curtain", -14, -14, "s"),
        hide("guest4-wardrobe-east", "wardrobe", 17, 9.2, "w"),
        hide("guest4-wardrobe-south", "wardrobe", 14.8, 11.5, "n"),
        hide("staff-wardrobe", "wardrobe", 16, 4.5, "n"),
        hide("staff-cupboard", "cupboard", 23, -1, "w"),
        hide("laundry-cupboard", "cupboard", 18, -16.5, "n"),
        hide("laundry-wardrobe", "wardrobe", 15, -22, "s"),
      ],
      furniture: [
        against("bridal-bed", "bed", "Bridal Suite", -6.5, 18.5, "n", 1.95, 2.3, 0.6),
        against("guest1-bed", "bed", "Guest Room 1", -12.5, 11.5, "n", 1.5, 2.05, 0.6),
        against("guest2-bed", "bed", "Guest Room 2", -16.45, -5, "s", 0.95, 2.05, 0.6),
        against("guest3-bed", "bed", "Guest Room 3", -16.5, -14, "s", 1.45, 2.05, 0.6),
        against("guest4-bed", "bed", "Guest Room 4", 12, 11.5, "n", 1.65, 2.2, 0.6),
        against("staff-bunk", "bed", "Staff Quarters", 19, -6, "s", 2, 1, 1.6),
        against("laundry-tubs", "counter", "Laundry", 14.5, -12.5, "w", 2, 0.8, 0.9),
        // The dressed rooms upstairs: a body for each piece of furniture you would otherwise walk through.
        { ...against("bridal-jewel-cabinet", "counter", "Bridal Suite", -4.5, 18.5, "n", 0.8, 0.8, 0.85), of: "relic-bridal" },
        { ...against("guest2-jewel-cabinet", "counter", "Guest Room 2", -19.5, 1.3, "e", 0.9, 0.8, 0.85), of: "relic-guest2" },
        { ...against("guest4-jewel-cabinet", "counter", "Guest Room 4", 17, 10.8, "w", 0.9, 0.8, 0.85), of: "relic-guest4" },
piece("bridal-classic-nightstand-1", "table", "Bridal Suite", -7.75, 18.18, 0.568, 0.424, 0.7),
        piece("bridal-classic-nightstand-2", "table", "Bridal Suite", -5.25, 18.18, 0.568, 0.424, 0.7),
        piece("bridal-vintage-suitcase-1", "counter", "Bridal Suite", -6.5, 15.709, 1.608, 0.239, 0.568),
        piece("bridal-sofa-1", "sofa", "Bridal Suite", -8.421, 9.6, 0.925, 2.731, 1.118),
        piece("bridal-gothic-coffee-table-1", "table", "Bridal Suite", -6.8, 9.601, 1.443, 1.443, 0.559),
        piece("bridal-sofa-2", "sofa", "Bridal Suite", -4.968, 9.6, 0.658, 1.571, 0.797),
        piece("bridal-classic-console-1", "counter", "Bridal Suite", -1.6, 4.862, 1.543, 0.589, 0.949),
        piece("bridal-floor-candelabra-1", "plant", "Bridal Suite", -8.35, 15.6, 0.479, 0.479, 1.5),
        piece("nursery-old-bed-frame-1", "bed", "Nursery", 1.116, 15.2, 2.001, 0.905, 1.2),
        piece("nursery-treasure-chest-1", "counter", "Nursery", 1.9, 18.13, 0.959, 0.523, 0.619),
        piece("nursery-side-table-1", "table", "Nursery", 1.6, 6.8, 0.55, 0.45, 0.551),
        piece("nursery-painted-wooden-cabinet-1", "counter", "Nursery", 5.991, 6.2, 0.722, 0.997, 2.569),
        piece("nursery-rockingchair-1", "chair", "Nursery", 4.046, 10.531, 0.914, 0.875, 0.995),
        piece("guest1-classic-nightstand-1", "table", "Guest Room 1", -13.57, 11.18, 0.568, 0.424, 0.7),
        piece("guest1-classic-nightstand-2", "table", "Guest Room 1", -11.43, 11.18, 0.568, 0.424, 0.7),
        piece("guest1-gothic-commode-1", "counter", "Guest Room 1", -14.6, 4.902, 1.201, 0.581, 1.212),
        piece("guest1-green-chair-1", "chair", "Guest Room 1", -15.84, 7.577, 0.775, 0.778, 1.059),
        piece("guest1-roll-top-bath-1", "counter", "Guest Room 1", -19.52, 7.505, 1.7, 0.77, 0.63),
        piece("guest1-pedestal-basin-1", "counter", "Guest Room 1", -20.14, 5.9, 0.5, 0.72, 0.84),
        piece("guest1-high-tank-toilet-1", "chair", "Guest Room 1", -18.3, 4.865, 0.4, 0.51, 0.42),
        piece("guest2-painted-wooden-nightstand-1", "table", "Guest Room 2", -15.4, -4.631, 0.505, 0.508, 0.616),
        piece("guest2-painted-wooden-cabinet-1", "counter", "Guest Room 2", -11.941, -3.9, 0.616, 1.195, 1.182),
        piece("guest2-rockingchair-1", "chair", "Guest Room 2", -12.544, 1.006, 0.926, 0.926, 0.995),
        piece("guest2-wooden-bucket-1", "plant", "Guest Room 2", -22.45, -1.999, 0.367, 0.342, 0.55),
        piece("guest2-roll-top-bath-1", "counter", "Guest Room 2", -22.505, -3.25, 0.77, 1.7, 0.63),
        piece("guest2-high-tank-toilet-1", "chair", "Guest Room 2", -20.75, -4.635, 0.4, 0.51, 0.42),
        piece("guest2-pedestal-basin-1", "counter", "Guest Room 2", -21.3, -1.86, 0.72, 0.5, 0.84),
        piece("guest3-side-table-1", "table", "Guest Room 3", -17.55, -13.665, 0.55, 0.45, 0.551),
        piece("guest3-side-table-2", "table", "Guest Room 3", -15.45, -13.665, 0.55, 0.45, 0.551),
        piece("guest3-dining-chair-1", "chair", "Guest Room 3", -15, -8.193, 0.434, 0.576, 0.973),
        piece("guest3-arm-chair-1", "chair", "Guest Room 3", -12.376, -7.976, 0.969, 0.969, 1.065),
        piece("guest3-pedestal-desk-1", "table", "Guest Room 3", -15, -7.465, 1.3, 0.7, 0.78),
        piece("guest3-roll-top-bath-1", "counter", "Guest Room 3", -21.25, -13.505, 1.7, 0.77, 0.63),
        piece("guest3-pedestal-basin-1", "counter", "Guest Room 3", -22.64, -11.6, 0.5, 0.72, 0.84),
        piece("guest3-high-tank-toilet-1", "chair", "Guest Room 3", -21.6, -10.865, 0.4, 0.51, 0.42),
        piece("guest4-side-table-tall-1", "table", "Guest Room 4", 11, 11.198, 0.384, 0.384, 0.761),
        piece("guest4-side-table-tall-2", "table", "Guest Room 4", 13, 11.198, 0.384, 0.384, 0.761),
        piece("guest4-ottoman-1", "sofa", "Guest Room 4", 12, 8.851, 0.885, 0.621, 0.624),
        piece("guest4-classic-console-1", "counter", "Guest Room 4", 9.362, 8, 0.589, 1.543, 0.949),
        piece("guest4-round-wooden-table-1", "table", "Guest Room 4", 15.495, 5.6, 0.59, 0.796, 0.746),
        piece("guest4-dining-chair-1", "chair", "Guest Room 4", 14.707, 5.6, 0.576, 0.434, 0.973),
        piece("guest4-roll-top-bath-1", "counter", "Guest Room 4", 20.005, 6.25, 0.77, 1.7, 0.63),
        piece("guest4-high-tank-toilet-1", "chair", "Guest Room 4", 18.3, 4.865, 0.4, 0.51, 0.42),
        piece("guest4-pedestal-basin-1", "counter", "Guest Room 4", 18.5, 7.64, 0.72, 0.5, 0.84),
        piece("staff-painted-wooden-nightstand-1", "table", "Staff Quarters", 17.3, -5.636, 0.505, 0.508, 0.616),
        piece("staff-wooden-bucket-1", "plant", "Staff Quarters", 12, 3.851, 0.406, 0.395, 0.55),
        piece("staff-bunk-bed-1", "bed", "Staff Quarters", 15.6, -5.395, 2, 1, 1.6),
        piece("staff-work-table-1", "table", "Staff Quarters", 17.3, -0.5, 1.8, 0.8, 0.76),
        piece("staff-bench-1", "sofa", "Staff Quarters", 17.3, -1.25, 1.6, 0.3, 0.45),
        piece("staff-bench-2", "sofa", "Staff Quarters", 17.3, 0.25, 1.6, 0.3, 0.45),
        piece("laundry-wooden-bucket-1", "plant", "Laundry", 18.051, -21.549, 0.416, 0.408, 0.55),
        piece("laundry-wooden-bucket-2", "plant", "Laundry", 13.75, -13.999, 0.393, 0.38, 0.55),
        piece("laundry-mangle-1", "counter", "Laundry", 15.795, -16.925, 0.99, 0.68, 1.55),
        piece("laundry-work-table-1", "table", "Laundry", 11.955, -12.6, 0.7, 1.6, 0.8),
        // The upstairs corridors, dressed: shallow pieces along the walls, clear of every door and
        // curtain, as below.
        against("upper-console", "counter", "Upper Corridor", -2.3, 4.5, "n", 1.54, 0.59, 0.95),
        against("upper-side-table", "table", "Upper Corridor", 3.85, 2, "s", 0.55, 0.45, 0.55),
        against("upper-chair", "chair", "Upper Corridor", 4.65, 2, "s", 0.67, 0.66, 1.06),
        against("upper-plant-west", "plant", "Upper Corridor", -4.2, 2, "s", 0.6, 0.6, 1.35),
        against("upper-plant-east", "plant", "Upper Corridor", 7.8, 2, "s", 0.6, 0.6, 0.84),
        against("upper-east-cabinet", "counter", "Upper Corridor", 11.5, -5.75, "w", 2.02, 0.67, 2.2),
        against("upper-east-armchair", "chair", "Upper Corridor", 9, -3.4, "e", 0.85, 0.77, 1.06),
        against("guest-west-plant", "plant", "Guest Corridor", -11.5, 1.0, "e", 0.6, 0.6, 1.35),
        against("guest-west-bench", "sofa", "Guest Corridor", -11.5, -5.6, "e", 1.6, 0.4, 0.45),
        against("guest-north-console", "counter", "Guest Corridor", 6.5, -16.5, "s", 1.54, 0.59, 0.95),
        against("guest-north-chair", "chair", "Guest Corridor", 3.3, -14, "n", 0.67, 0.66, 1.06),
        against("guest-north-plant-east", "plant", "Guest Corridor", 8.6, -16.5, "s", 0.6, 0.6, 0.84),
        // The shutters' sill and the portraits' wall: the tasks are used from in front of them.
        { ...against("upper-shutters", "counter", "Upper Corridor", 0, 2, "s", 2.23, 0.12, 0.85), of: "task-shutters" },
        { ...against("guest-portraits", "counter", "Guest Corridor", -9, -6, "w", 2.0, 0.1, 0.1), of: "task-portraits" },
        against("guest-north-plant-west", "plant", "Guest Corridor", -10.6, -16.5, "s", 0.6, 0.6, 1.35),
        ...[-7.5, -5, -2.5].map((x, k) => ({ ...against(`guest-corridor-pot-${k + 1}`, "counter", "Guest Corridor", x, -16.5, "s", 0.86, 0.86, 0.5), of: `relic-guest-corridor-${k + 1}` })),
      ],
      saltJars: [
        { id: "jar-nursery", x: 0.8, z: 17.8 },
        { id: "jar-guest1", x: -9.8, z: 10.8 },
        { id: "jar-staff", x: 19.5, z: 3.8 },
        { id: "jar-laundry", x: 20, z: -21.5 },
      ],
      tasks: [
        task("task-shutters", "Close the shutters", "Upper Corridor", "shutters", 0, 2.2, true, true),
        task("task-portraits", "Straighten the portraits", "Guest Corridor", "portraits", -9.195, -6, true),
        task("task-mirror", "Clean the mirror", "Bridal Suite", "mirror", -0.7, 12),
        task("task-cradle", "Rock the cradle", "Nursery", "cradle", 3, 12, false, true),
        task("task-sheets", "Fold the bedsheets", "Guest Room 1", "sheets", -13, 7.5),
        task("task-trunk", "Seal the old trunk", "Staff Quarters", "trunk", 22.53, 3.3),
        task("task-boiler", "Turn the boiler valve", "Laundry", "boiler", 12.2, -20),
      ],
      relicSpots: [
        relic("relic-bridal", LOCKBOX, "Bridal Suite", "lockbox", -4.5, 17.8),
        relicGroup("relic-nursery", "Dig in the plant pot", "Nursery", "dig", [[8.3, 17.8], [8.3, 15.5], [6, 17.8]]),
        relic("relic-guest2", LOCKBOX, "Guest Room 2", "lockbox", -18.85, 1.3),
        relic("relic-guest4", LOCKBOX, "Guest Room 4", "lockbox", 16.35, 10.8),
        relic("relic-laundry", "Reach into the drain", "Laundry", "drain", 17, -21.3),
        relicGroup("relic-guest-corridor", "Dig in the plant pot", "Guest Corridor", "dig", [[-7.5, -15.965], [-5, -15.965], [-2.5, -15.965]]),
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
        // The Ritual Room, cut to 200 m² (GDD 26.15): the strip along its two doorways; the south
        // of the old room is walled off, never entered and never dressed.
        { name: "Ritual Room", minX: -18, maxX: 2, minZ: -20, maxZ: -10 },
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
        hide("ritual-wardrobe-west", "wardrobe", -18, -16.5, "e"),
        hide("ritual-wardrobe-east", "wardrobe", 2, -16.5, "w"),
      ],
      furniture: [
        against("wine-racks", "shelf", "Wine Cellar", -11.5, -10, "s", 3, 0.6, 2),
        piece("storage-crates", "crates", "Storage", -2, -5, 1.4, 1.4, 1),
        piece("ritual-altar", "altar", "Ritual Room", -8, -15.5, 1.6, 1, 1),
        // The basement, dressed: a body for each piece of furniture you would otherwise walk through.
        piece("stairwell-crate", "crates", "Stairwell", -10.475, 7.69, 0.83, 0.41, 0.35),
        piece("stairwell-bucket", "plant", "Stairwell", -4.905, 7.595, 0.37, 0.37, 0.55),
        piece("passage-barrel", "plant", "Cellar Passage", -7.3, -9.505, 0.76, 0.76, 0.87),
        piece("passage-crate", "crates", "Cellar Passage", -8.35, -9.675, 0.83, 0.41, 0.35),
        ...[-13.3, -12.45, -11.6].map((x, k) => piece(`wine-cask-${k + 1}`, "plant", "Wine Cellar", x, 1.505, 0.76, 0.76, 0.87)),
        piece("wine-cask-4", "plant", "Wine Cellar", -9.495, -8.6, 0.76, 0.76, 0.87),
        piece("wine-cask-5", "plant", "Wine Cellar", -9.495, -7.75, 0.76, 0.76, 0.87),
        piece("wine-rack-north", "shelf", "Wine Cellar", -14.35, -9.595, 2.5, 0.6, 2),
        piece("wine-rack-west-wall", "shelf", "Wine Cellar", -19.595, -7.0, 0.6, 3, 2),
        piece("wine-table", "table", "Wine Cellar", -15, -3, 1.6, 0.8, 0.78),
        piece("wine-rack-middle", "shelf", "Wine Cellar", -11.8, -4.0, 2.5, 1.2, 1.6),
        piece("wine-chair-1", "chair", "Wine Cellar", -15.4, -2.25, 0.43, 0.58, 0.97),
        piece("wine-chair-2", "chair", "Wine Cellar", -14.3, -3.95, 0.5, 0.6, 0.97),
        piece("storage-cabinet", "counter", "Storage", -4.0, -9.337, 1.72, 1.117, 2.36),
        piece("storage-drawers", "counter", "Storage", -3.5, 1.391, 1.715, 1.007, 1.09),
        piece("storage-chest", "counter", "Storage", 2.9, -9.633, 0.96, 0.52, 0.62),
        piece("storage-bed-frame", "bed", "Storage", -5.94, -2.748, 0.905, 2.0, 1.2),
        piece("storage-crates-east", "crates", "Storage", 2.2, -4.6, 1.17, 0.53, 0.81),
        piece("storage-shelves-west", "shelf", "Storage", -6.17, -6.0, 0.45, 2.4, 2.0),
        piece("storage-shelves-east", "shelf", "Storage", 3.67, -7.0, 0.45, 2.0, 2.0),
        piece("ritual-candelabra-west", "plant", "Ritual Room", -9.15, -16.75, 0.44, 0.44, 1.5),
        piece("ritual-candelabra-east", "plant", "Ritual Room", -6.85, -16.75, 0.44, 0.44, 1.5),
        piece("ritual-bench-west", "sofa", "Ritual Room", -14.6, -15.5, 0.4, 2.4, 0.45),
        piece("ritual-bench-east", "sofa", "Ritual Room", -1.4, -15.5, 0.4, 2.4, 0.45),
      ],
      altar: { x: -8, z: -15.5 },
    },
  ],
});
