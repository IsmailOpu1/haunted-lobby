import { describe, expect, it } from "vitest";
import type { TaskStationDef } from "./map.ts";
import { assignTasks } from "./tasks.ts";

const station = (id: string, room: string): TaskStationDef => ({ id, name: id, room, minigame: "stove", x: 0, z: 0, visible: false, noisy: false });

describe("task assignment (GDD 9)", () => {
  const stations = [station("a", "Hall"), station("b", "Hall"), station("c", "Kitchen"), station("d", "Library"), station("e", "Attic")];

  it("gives the requested number of tasks, each in a different room", () => {
    for (let i = 0; i < 50; i++) {
      const picked = assignTasks(stations, 3);
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((s) => s.room)).size).toBe(3);
    }
  });

  it("gives fewer when there are not enough rooms", () => {
    expect(assignTasks(stations, 10)).toHaveLength(4);
  });

  it("varies between players", () => {
    const sets = new Set<string>();
    for (let i = 0; i < 30; i++) sets.add(assignTasks(stations, 3).map((s) => s.id).sort().join());
    expect(sets.size).toBeGreaterThan(1);
  });
});
