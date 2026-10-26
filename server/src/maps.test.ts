import { describe, expect, it } from "vitest";
import { config, roomAt } from "@haunted/shared";
import { marrowHotelGreybox } from "@haunted/maps";

// Map data checks. E does one thing at a time (revive > salt jar > task > hide > door), so
// interactive things must not sit so close together that E picks the wrong one.

const maps = [marrowHotelGreybox];
const reach = Math.max(config.salt.jarRangeM, config.tasks.useRangeM, config.interact.hideRangeM);

describe.each(maps.map((m) => [m.name, m] as const))("%s", (_name, map) => {
  const points = [
    ...map.saltJars.map((j) => ({ id: j.id, x: j.x, z: j.z })),
    ...map.tasks.map((t) => ({ id: t.id, x: t.x, z: t.z })),
    ...map.hidingSpots.map((h) => ({ id: h.id, x: h.exit.x, z: h.exit.z })),
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

  it("puts every task station inside the room it names", () => {
    for (const t of map.tasks) expect(roomAt(map, t.x, t.z)?.name, t.id).toBe(t.room);
  });

  it("has one salt jar per possible player", () => {
    expect(map.saltJars).toHaveLength(config.players.max);
  });
});
