import { beforeAll, describe, expect, it } from "vitest";
import { config, doorBox, furnitureBox, hidingSpotBox, levelOf, nearestRoom, roomAt, searchPlaces, wallBox, wallFaces, type FloorBox, type MapData } from "@haunted/shared";
import { marrowHotelGreybox } from "@haunted/maps";
import { NavMap, pathLength } from "./sim/navmap.ts";

// Map data checks. E does one thing at a time (revive > salt jar > task > hide > door), so
// interactive things must not sit so close together that E picks the wrong one.

const maps = [marrowHotelGreybox];
const reach = Math.max(config.salt.jarRangeM, config.tasks.useRangeM, config.interact.hideRangeM, config.relics.useRangeM);

describe.each(maps.map((m) => [m.name, m] as const))("%s", (_name, map) => {
  const points = [
    ...map.saltJars.map((j) => ({ id: j.id, x: j.x, z: j.z })),
    ...map.tasks.map((t) => ({ id: t.id, x: t.x, z: t.z })),
    ...map.relicSpots.flatMap((r) => searchPlaces(r).map((p) => ({ id: p.id, x: p.x, z: p.z }))),
    ...map.hidingSpots.map((h) => ({ id: h.id, x: h.exit.x, z: h.exit.z })),
    ...(map.bell ? [{ id: "bell", ...map.bell }] : []),
    ...(map.fuseBox ? [{ id: "fuse box", ...map.fuseBox }] : []),
  ];

  it("keeps salt jars, task stations and hiding spots far enough apart for E", () => {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!;
        const b = points[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} and ${b.id}`).toBeGreaterThan(reach);
      }
    }
  });

  it("keeps salt jars and task stations out of door reach, so E can still open the door", () => {
    // Jars and tasks win over doors; a spot within reach of both would block the door.
    for (const p of points.filter((p) => !map.hidingSpots.some((h) => h.id === p.id))) {
      for (const d of map.doors) {
        expect(Math.hypot(p.x - d.x, p.z - d.z), `${p.id} and door ${d.id}`).toBeGreaterThan(reach + config.interact.rangeM);
      }
    }
  });

  it("keeps hiding spots away from doors, so E at a door opens it instead of hiding", () => {
    for (const h of map.hidingSpots) {
      for (const d of map.doors) {
        expect(Math.hypot(h.exit.x - d.x, h.exit.z - d.z), `${h.id} and door ${d.id}`).toBeGreaterThan(config.interact.hideRangeM + 0.5);
      }
    }
  });

  it("puts every task station inside the room it names", () => {
    for (const t of map.tasks) expect(roomAt(map, t.x, t.z)?.name, t.id).toBe(t.room);
  });

  it("puts relic spots inside their rooms, never in the Main Hall, with a name for every relic", () => {
    for (const r of map.relicSpots) {
      for (const p of searchPlaces(r)) expect(roomAt(map, p.x, p.z)?.name, p.id).toBe(r.room);
      expect(r.room, r.id).not.toBe("Main Hall");
      // A group (GDD 26.5) has 3 or 4 places, so the whisper must be followed to the right one.
      if (r.places) expect(r.places.length, r.id).toBeGreaterThanOrEqual(3);
      if (r.places) expect(r.places.length, r.id).toBeLessThanOrEqual(4);
    }
    expect(map.relicSpots.length).toBeGreaterThanOrEqual(Math.max(...config.relics.options));
    expect(map.relicNames.length).toBeGreaterThanOrEqual(Math.max(...config.relics.options));
  });

  it("has one salt jar per possible player", () => {
    expect(map.saltJars).toHaveLength(config.players.max);
  });

  it("leaves everything you walk to or use clear of walls and furniture", () => {
    const solid: { id: string; box: FloorBox }[] = [
      ...map.walls.map((w, i) => ({ id: `wall ${i} (${w.join(", ")})`, box: wallBox(w, map.wallThicknessM) })),
      ...map.furniture.map((f) => ({ id: f.id, box: furnitureBox(f) })),
      ...map.hidingSpots.map((h) => ({ id: h.id, box: hidingSpotBox(h) })),
    ];
    const r = config.body.radiusM;
    const clear = [...points, ...map.spawns.map((s, i) => ({ id: `spawn ${i}`, ...s })), ...(map.ghostStart ? [{ id: "ghost start", ...map.ghostStart }] : [])];
    for (const p of clear) {
      expect(roomAt(map, p.x, p.z), `${p.id} is in a room`).toBeDefined();
      for (const s of solid) {
        const inside = Math.abs(p.x - s.box.x) < s.box.sizeX / 2 + r && Math.abs(p.z - s.box.z) < s.box.sizeZ / 2 + r;
        expect(inside, `${p.id} is clear of ${s.id}`).toBe(false);
      }
    }
  });

  it("keeps furniture and hiding spots out of doorways", () => {
    for (const d of map.doors) {
      const gap = doorBox(d, 2.4); // the door and a body's width on each side
      for (const b of [...map.furniture.map((f) => ({ id: f.id, box: furnitureBox(f) })), ...map.hidingSpots.map((h) => ({ id: h.id, box: hidingSpotBox(h) }))]) {
        const overlap = Math.abs(gap.x - b.box.x) < (gap.sizeX + b.box.sizeX) / 2 && Math.abs(gap.z - b.box.z) < (gap.sizeZ + b.box.sizeZ) / 2;
        expect(overlap, `${b.id} blocks door ${d.id}`).toBe(false);
      }
    }
  });
});

// GDD 21.1: size rules for every full map. (The two-floor test map is not a full map.)
describe.each([marrowHotelGreybox].map((m) => [m.name, m] as const))("%s follows the map size rules (GDD 21.1)", (_name, map) => {
  const isCorridor = (name: string) => /Corridor|Passage/.test(name);
  const names = [...new Set(map.rooms.map((r) => r.name))];
  const rooms = names.filter((n) => !isCorridor(n));
  const levelName = (x: number, z: number) => levelOf(map, x, z).id;
  const basement = map.levels.reduce((low, l) => (l.y < low.y ? l : low)).id;

  /** The room graph: rooms joined by doors, archways between rooms and stairs. */
  function links(): { id: string; a: string; b: string }[] {
    const out: { id: string; a: string; b: string }[] = [];
    const across = (id: string, x: number, z: number, axis: "x" | "z") => {
      const [dx, dz] = axis === "x" ? [0, 0.3] : [0.3, 0];
      const a = roomAt(map, x - dx, z - dz)?.name;
      const b = roomAt(map, x + dx, z + dz)?.name;
      if (a && b && a !== b) out.push({ id, a, b });
    };
    for (const d of map.doors) across(d.id, d.x, d.z, d.axis);
    // Openings are walls that are missing: find them as gaps between differently named rooms.
    for (const r of map.rooms) {
      for (const s of map.rooms) {
        if (r.name === s.name) continue;
        if (Math.abs(r.maxZ - s.minZ) < 1e-6 && r.minX < s.maxX && s.minX < r.maxX) {
          const x0 = Math.max(r.minX, s.minX);
          const x1 = Math.min(r.maxX, s.maxX);
          for (let x = x0 + 0.25; x < x1; x += 0.5) {
            const walled = map.walls.some(([ax, az, bx, bz]) => az === bz && Math.abs(az - r.maxZ) < 1e-6 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx));
            const door = map.doors.some((d) => d.axis === "x" && Math.abs(d.z - r.maxZ) < 1e-6 && Math.abs(d.x - x) < d.width / 2);
            if (!walled && !door) {
              out.push({ id: `opening ${r.name}/${s.name}`, a: r.name, b: s.name });
              break;
            }
          }
        }
        if (Math.abs(r.maxX - s.minX) < 1e-6 && r.minZ < s.maxZ && s.minZ < r.maxZ) {
          const z0 = Math.max(r.minZ, s.minZ);
          const z1 = Math.min(r.maxZ, s.maxZ);
          for (let z = z0 + 0.25; z < z1; z += 0.5) {
            const walled = map.walls.some(([ax, az, bx, bz]) => ax === bx && Math.abs(ax - r.maxX) < 1e-6 && z >= Math.min(az, bz) && z <= Math.max(az, bz));
            const door = map.doors.some((d) => d.axis === "z" && Math.abs(d.x - r.maxX) < 1e-6 && Math.abs(d.z - z) < d.width / 2);
            if (!walled && !door) {
              out.push({ id: `opening ${r.name}/${s.name}`, a: r.name, b: s.name });
              break;
            }
          }
        }
      }
    }
    for (const s of map.stairs) {
      const lower = map.levels.find((l) => l.id === s.lower)!;
      const upper = map.levels.find((l) => l.id === s.upper)!;
      const u = { "+x": [1, 0], "-x": [-1, 0], "+z": [0, 1], "-z": [0, -1] }[s.dir];
      const bottom = roomAt(map, s.x - u[0]! * 0.5, s.z - u[1]! * 0.5)?.name;
      const topX = s.x + u[0]! * (s.lengthM + 0.5) + lower.shiftX - upper.shiftX;
      const topZ = s.z + u[1]! * (s.lengthM + 0.5) + lower.shiftZ - upper.shiftZ;
      const top = roomAt(map, topX, topZ)?.name;
      expect(bottom, `room at the bottom of ${s.id}`).toBeDefined();
      expect(top, `room at the top of ${s.id}`).toBeDefined();
      out.push({ id: s.id, a: bottom!, b: top! });
    }
    return out;
  }

  function reachable(from: string, edges: { a: string; b: string }[]): Set<string> {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length > 0) {
      const n = queue.shift()!;
      for (const e of edges) {
        const next = e.a === n ? e.b : e.b === n ? e.a : null;
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  }

  it("has 3 floors and about 20 rooms", () => {
    expect(map.levels).toHaveLength(3);
    expect(rooms.length).toBeGreaterThanOrEqual(18);
    expect(rooms.length).toBeLessThanOrEqual(24);
  });

  it("makes rooms at least 4 m × 4 m and corridors about 2.5 m wide", () => {
    for (const name of rooms) {
      const big = map.rooms.some((r) => r.name === name && r.maxX - r.minX >= 4 && r.maxZ - r.minZ >= 4);
      expect(big, name).toBe(true);
    }
    for (const r of map.rooms.filter((r) => isCorridor(r.name))) {
      expect(Math.min(r.maxX - r.minX, r.maxZ - r.minZ), r.name).toBeGreaterThanOrEqual(2);
      expect(Math.min(r.maxX - r.minX, r.maxZ - r.minZ), r.name).toBeLessThanOrEqual(3);
    }
  });

  it("gives every room a colour, different from the rooms next to it (GDD 26.10)", () => {
    const names = new Set(map.rooms.map((r) => r.name));
    for (const name of names) expect(map.roomColors?.[name], name).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(map.roomColors ?? {}).filter((name) => !names.has(name))).toEqual([]);
    const faces = wallFaces(map);
    const line = (f: (typeof faces)[number]) => (f.axis === "x" ? f.z : f.x);
    const along = (f: (typeof faces)[number]) => (f.axis === "x" ? f.x : f.z);
    for (const a of faces) {
      for (const b of faces) {
        const facingEachOther = a.axis === b.axis && a.facing === 1 && b.facing === -1 && Math.abs(line(a) - line(b)) < 1e-3;
        const overlap = Math.abs(along(a) - along(b)) < (a.length + b.length) / 2 - 1e-3;
        if (facingEachOther && overlap) expect(map.roomColors?.[a.room], `${a.room} next to ${b.room}`).not.toBe(map.roomColors?.[b.room]);
      }
    }
  });

  it("colours every wall on at least one side", () => {
    const faces = wallFaces(map);
    for (const [x1, z1, x2, z2] of map.walls) {
      const alongX = z1 === z2;
      const covered = faces
        .filter((f) => f.axis === (alongX ? "x" : "z") && Math.abs((alongX ? f.z : f.x) - (alongX ? z1 : x1)) < 1e-3)
        .filter((f) => {
          const mid = alongX ? f.x : f.z;
          return mid >= Math.min(alongX ? x1 : z1, alongX ? x2 : z2) && mid <= Math.max(alongX ? x1 : z1, alongX ? x2 : z2);
        })
        .reduce((sum, f) => sum + f.length, 0);
      expect(covered, `wall ${x1},${z1} to ${x2},${z2}`).toBeGreaterThanOrEqual(Math.hypot(x2 - x1, z2 - z1) - 1e-3);
    }
  });

  it("gives every room 2 hiding spots and every corridor segment 1", () => {
    const at = map.hidingSpots.map((h) => ({ room: roomAt(map, h.exit.x, h.exit.z), id: h.id }));
    for (const name of rooms) expect(at.filter((h) => h.room?.name === name).length, name).toBeGreaterThanOrEqual(2);
    // A segment is one straight run: a corridor rectangle at least 5 m long.
    for (const r of map.rooms.filter((r) => isCorridor(r.name) && Math.max(r.maxX - r.minX, r.maxZ - r.minZ) >= 5)) {
      expect(at.filter((h) => h.room === r).length, `${r.name} ${r.minX},${r.minZ}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("has 14 tasks, about 12 relic spots, 8 salt jar spots, a bell and a fuse box", () => {
    expect(map.tasks).toHaveLength(14);
    expect(map.relicSpots.length).toBeGreaterThanOrEqual(10);
    expect(map.relicSpots.length).toBeLessThanOrEqual(14);
    expect(map.saltJars).toHaveLength(8);
    expect(map.bell && roomAt(map, map.bell.x, map.bell.z)?.name).toBe("Main Hall");
    expect(map.fuseBox && roomAt(map, map.fuseBox.x, map.fuseBox.z)).toBeDefined();
    expect(new Set(map.tasks.map((t) => t.room)).size, "one task per room").toBe(14);
  });

  it("keeps tasks, relic spots and the sleeping ghost out of the basement", () => {
    for (const t of map.tasks) expect(levelName(t.x, t.z), t.id).not.toBe(basement);
    for (const r of map.relicSpots) expect(levelName(r.x, r.z), r.id).not.toBe(basement);
    // The ghost starts outside the locked area too, and away from the spawn.
    expect(map.ghostStart).toBeDefined();
    expect(levelName(map.ghostStart!.x, map.ghostStart!.z)).not.toBe(basement);
    expect(Math.hypot(map.ghostStart!.x - map.spawns[0]!.x, map.ghostStart!.z - map.spawns[0]!.z)).toBeGreaterThan(config.ghost.interestRangeM);
  });

  it("puts the Ritual Room in the basement, behind the relic door, with 2 doorways", () => {
    const ritual = map.rooms.filter((r) => r.name === "Ritual Room");
    expect(ritual.length).toBeGreaterThan(0);
    expect(levelName(ritual[0]!.minX, ritual[0]!.minZ)).toBe(basement);
    expect(map.altar && roomAt(map, map.altar.x, map.altar.z)?.name).toBe("Ritual Room");
    // The altar's circle fits inside the room.
    const room = roomAt(map, map.altar!.x, map.altar!.z)!;
    const r = config.ritual.circleRadiusM;
    expect(map.altar!.x - r).toBeGreaterThan(room.minX);
    expect(map.altar!.x + r).toBeLessThan(room.maxX);
    expect(map.altar!.z - r).toBeGreaterThan(room.minZ);
    expect(map.altar!.z + r).toBeLessThan(room.maxZ);

    const edges = links();
    expect(edges.filter((e) => e.a === "Ritual Room" || e.b === "Ritual Room")).toHaveLength(2);
    expect(map.doors.some((d) => d.id === map.relicDoor)).toBe(true);
    const spawnRoom = roomAt(map, map.spawns[0]!.x, map.spawns[0]!.z)!.name;
    expect(reachable(spawnRoom, edges).has("Ritual Room")).toBe(true);
    expect(reachable(spawnRoom, edges.filter((e) => e.id !== map.relicDoor)).has("Ritual Room")).toBe(false);
  });

  it("joins the main areas by at least 2 routes, so one blocked door or corridor never cuts them off", () => {
    const edges = links();
    const hubs = names.filter((n) => n === "Main Hall" || n === "Garden Courtyard" || (isCorridor(n) && !map.rooms.some((r) => r.name === n && levelName(r.minX, r.minZ) === basement)));
    expect(hubs.length).toBeGreaterThan(4);
    for (const cut of edges) {
      const left = reachable(hubs[0]!, edges.filter((e) => e !== cut));
      for (const hub of hubs) expect(left.has(hub), `without ${cut.id}, ${hub} is cut off`).toBe(true);
    }
  });

  it("keeps doors simple: corridors join rooms, and no room is a maze of doors (GDD 26.11)", () => {
    const ways = links().filter((e) => !map.stairs.some((s) => s.id === e.id));
    // Where real buildings join two rooms directly: a kitchen and its dining room, and the
    // Ritual Room's two doorways (GDD 21.1).
    const roomToRoom = new Set(["Kitchen/Restaurant", "Ritual Room/Wine Cellar", "Ritual Room/Storage"]);
    for (const room of rooms) {
      const mine = ways.filter((e) => e.a === room || e.b === room);
      const others = mine.map((e) => (e.a === room ? e.b : e.a));
      expect(mine.length, `${room} has ${mine.length} ways in`).toBeLessThanOrEqual(2);
      expect(new Set(others).size, `${room} has two ways into the same place`).toBe(others.length);
      for (const other of others.filter((o) => !isCorridor(o))) {
        expect(roomToRoom.has([room, other].sort().join("/")), `${room} opens straight into ${other}`).toBe(true);
      }
    }
    // A few big rooms have two ways through, so a chase can loop instead of ending in a dead end.
    const loops = rooms.filter((room) => ways.filter((e) => e.a === room || e.b === room).length === 2);
    expect(loops.length).toBeGreaterThanOrEqual(3);
  });

  describe("walking", () => {
    let nav: NavMap;
    beforeAll(async () => {
      nav = await NavMap.create(map);
    }, 60_000);

    it("reaches every room, and takes 35 to 60 seconds to walk from one end to the other", () => {
      // One point per room: the middle of its biggest rectangle.
      const centers = names.map((name) => {
        const r = map.rooms.filter((r) => r.name === name).reduce((a, b) => ((b.maxX - b.minX) * (b.maxZ - b.minZ) > (a.maxX - a.minX) * (a.maxZ - a.minZ) ? b : a));
        return { name, ...nav.closest({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }) };
      });
      let longest = { from: "", to: "", m: 0 };
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const a = centers[i]!;
          const b = centers[j]!;
          const path = nav.path(a, b);
          expect(path.length, `${a.name} to ${b.name}`).toBeGreaterThan(0);
          const m = pathLength(a, path);
          if (m > longest.m) longest = { from: a.name, to: b.name, m };
        }
      }
      const seconds = longest.m / config.movement.walk;
      expect(seconds, `${longest.from} to ${longest.to}: ${longest.m.toFixed(0)} m`).toBeGreaterThanOrEqual(35); // 45 before walking got faster (GDD 26.5, 2026-10-29)
      expect(seconds, `${longest.from} to ${longest.to}: ${longest.m.toFixed(0)} m`).toBeLessThanOrEqual(60);
    });
  });
  it("keeps the ghost's walking out of the basement while the relic door is locked (GDD 10)", async () => {
    const locked = await NavMap.create(map, [map.relicDoor!]);
    const open = await NavMap.create(map);
    const from = map.ghostStart!;
    const altar = locked.closest(map.altar!);
    expect(locked.path(from, altar)).toEqual([]);
    expect(open.path(from, altar).length).toBeGreaterThan(0);
    // The stairwell in front of the door is still open to it.
    const stairwell = map.rooms.find((r) => r.name === "Stairwell")!;
    expect(locked.path(from, locked.closest({ x: (stairwell.minX + stairwell.maxX) / 2, z: (stairwell.minZ + stairwell.maxZ) / 2 })).length).toBeGreaterThan(0);
    // Wandering never picks a spot it cannot reach.
    const beyond = new Set(["Cellar Passage", "Wine Cellar", "Storage", "Ritual Room"]);
    for (let i = 0; i < 200; i++) {
      const p = locked.randomPoint(from);
      expect(beyond.has(roomAt(map, p.x, p.z)?.name ?? ""), `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBe(false);
    }
  }, 30000);
  it("finds a room for every doorway and flight of stairs, so the Bellboy's bell always rings in a room (GDD 12.5)", () => {
    for (const d of map.doors) {
      const r = nearestRoom(map, d.x, d.z);
      expect(Math.hypot(Math.max(r.minX - d.x, 0, d.x - r.maxX), Math.max(r.minZ - d.z, 0, d.z - r.maxZ)), d.id).toBeLessThan(0.2);
    }
    for (const s of map.stairs) expect(levelOf(map, nearestRoom(map, s.x, s.z).minX + 0.1, s.z).id, s.id).toBe(levelOf(map, s.x, s.z).id);
  });
});
