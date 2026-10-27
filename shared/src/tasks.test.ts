import { describe, expect, it } from "vitest";
import type { TaskStationDef } from "./map.ts";
import { assignTasks, takenTasks } from "./tasks.ts";

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

  it("deals like cards: no repeats while other tasks are free, and visible tasks to one player only", () => {
    // 14 stations in 14 rooms, 4 of them visible, as on the Marrow Hotel.
    const many = Array.from({ length: 14 }, (_, i) => ({ ...station(`t${i}`, `Room ${i}`), visible: i < 4 }));
    for (let round = 0; round < 50; round++) {
      const lists: { stationId: string }[][] = [];
      for (let p = 0; p < 8; p++) lists.push(assignTasks(many, 3, Math.random, takenTasks(lists)).map((s) => ({ stationId: s.id })));
      const taken = takenTasks(lists);
      // The first 4 players (12 tasks) never share one.
      expect(new Set(lists.slice(0, 4).flat().map((t) => t.stationId)).size).toBe(12);
      for (const s of many) expect(taken.get(s.id) ?? 0).toBeLessThanOrEqual(s.visible ? 1 : 2);
      expect(lists.every((l) => l.length === 3)).toBe(true);
    }
  });

  it("repeats a visible task only when nothing else is left", () => {
    const two = [{ ...station("v", "Hall"), visible: true }, station("n", "Kitchen")];
    const taken = new Map([["v", 1], ["n", 1]]);
    expect(assignTasks(two, 2, Math.random, taken).map((s) => s.id)).toEqual(["n", "v"]);
  });
});
