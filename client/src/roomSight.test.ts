import { describe, expect, it } from "vitest";
import { marrowHotelGreybox as map } from "@haunted/maps";
import { levelOf, roomAt } from "@haunted/shared";
import { clear, RoomSight } from "./roomSight.ts";

const sight = new RoomSight(map);
const world = (x: number, z: number) => {
  const l = levelOf(map, x, z);
  return { x: x + l.shiftX, y: l.y, z: z + l.shiftZ };
};

describe("which rooms might be seen", () => {
  it("a wall stops the view; a line beside it does not", () => {
    const walls = [0, -1, 0, 1];
    expect(clear(walls, -1, 0, 1, 0)).toBe(false);
    expect(clear(walls, -1, 2, 1, 2)).toBe(true);
  });

  it("you always see the room you stand in, and through every doorway the room beyond", () => {
    for (const door of map.doors) {
      const [nx, nz] = door.axis === "x" ? [0, 1] : [1, 0];
      for (const side of [-1, 1]) {
        const from = { x: door.x + nx * side * 0.6, z: door.z + nz * side * 0.6 };
        const to = roomAt(map, door.x - nx * side * 0.6, door.z - nz * side * 0.6);
        const here = roomAt(map, from.x, from.z);
        if (!to || !here) continue;
        const w = world(from.x, from.z);
        const seen = sight.seen(w.x, w.y, w.z);
        expect(seen, `${door.id} from ${here.name}`).not.toBeNull();
        expect(seen!.has(here.name), `${here.name} itself`).toBe(true);
        expect(seen!.has(to.name), `${to.name} through ${door.id}`).toBe(true);
      }
    }
  });

  it("leaves out rooms behind walls, so it saves drawing", () => {
    // From the middle of each room, some room on its floor is hidden.
    let hiddenSomewhere = 0;
    for (const room of map.rooms) {
      const w = world((room.minX + room.maxX) / 2, (room.minZ + room.maxZ) / 2);
      const seen = sight.seen(w.x, w.y, w.z)!;
      const sameFloor = new Set(map.rooms.filter((r) => levelOf(map, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2).y === w.y).map((r) => r.name));
      if (seen.size < sameFloor.size) hiddenSomewhere++;
    }
    expect(hiddenSomewhere).toBeGreaterThan(map.rooms.length / 2);
  });

  it("is quick enough to work out every frame", () => {
    const spots = map.rooms.map((r) => world((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2));
    const start = performance.now();
    for (const s of spots) sight.seen(s.x, s.y, s.z);
    const perCheckMs = (performance.now() - start) / spots.length;
    // About 0.5 ms on the owner's PC; the margin keeps a busy machine from failing it.
    expect(perCheckMs).toBeLessThan(10);
  });
});
