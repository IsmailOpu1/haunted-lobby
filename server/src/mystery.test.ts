import { describe, expect, it } from "vitest";
import { marrowHotelGreybox as map } from "@haunted/maps";
import { altarStands, assignTasks, clueLabel, clueStations, config, dealClueTasks, otherSuspect, pickMystery, takenTasks, type DealtPlayer } from "@haunted/shared";

describe("who was the ghost? (GDD 26.13)", () => {
  it("the hotel's clue tasks are the mirror, the portraits and the switchboard", () => {
    expect(clueStations(map).map((s) => s.minigame).sort()).toEqual(["mirror", "portraits", "switchboard"]);
    expect(clueLabel(map, "task-mirror", "bride")).toBe("a face in a veil");
  });

  it("the ghost's own belonging is always one of the relics", () => {
    for (let i = 0; i < 50; i++) {
      const m = pickMystery(map, config.relics.count)!;
      expect(m.relicNames).toHaveLength(config.relics.count);
      expect(m.relicNames).toContain(m.ghost.belonging);
      expect(new Set(m.relicNames).size).toBe(m.relicNames.length);
      // In the pilot, every relic belongs to a suspect.
      for (const n of m.relicNames) expect(map.suspects!.some((s) => s.belonging === n)).toBe(true);
    }
  });

  it("each night can have any suspect as the ghost", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(pickMystery(map, 3)!.ghost.id);
    expect(seen.size).toBe(map.suspects!.length);
  });

  it("Alter a clue always picks someone else", () => {
    for (let i = 0; i < 30; i++) expect(otherSuspect(map, "bride")).not.toBe("bride");
  });

  it("deals every clue task to investigators, spread out, and none to the possessed", () => {
    const clueIds = clueStations(map).map((s) => s.id);
    const spread: number[] = [];
    for (let n = 3; n <= 8; n++) {
      for (let round = 0; round < 20; round++) {
        const players: DealtPlayer[] = [];
        for (let i = 0; i < n; i++) {
          const tasks = assignTasks(map.tasks, config.tasks.perPlayer, Math.random, takenTasks(players.map((p) => p.tasks))).map((t) => ({ stationId: t.id, done: false }));
          players.push({ investigator: i !== 0, tasks });
        }
        const counts = players.map((p) => p.tasks.length);
        dealClueTasks(players, map.tasks, clueIds);
        for (const id of clueIds) expect(players.some((p) => p.investigator && p.tasks.some((t) => t.stationId === id))).toBe(true);
        expect(players[0]!.tasks.some((t) => clueIds.includes(t.stationId))).toBe(false);
        // Lists keep their length and one task per room.
        players.forEach((p, i) => {
          expect(p.tasks.length).toBe(counts[i]);
          const rooms = p.tasks.map((t) => map.tasks.find((s) => s.id === t.stationId)!.room);
          expect(new Set(rooms).size).toBe(rooms.length);
        });
        // With 3 or more investigators, each has at most one, almost always.
        if (n >= 4) {
          for (const p of players.filter((p) => p.investigator)) spread.push(p.tasks.filter((t) => clueIds.includes(t.stationId)).length);
        }
      }
    }
    expect(Math.max(...spread)).toBeLessThanOrEqual(2);
    expect(spread.filter((c) => c > 1).length / spread.length).toBeLessThan(0.05);
  });

  it("stands the relics in a row on the altar", () => {
    const stands = altarStands({ x: 10, z: 5 }, 3);
    expect(stands.map((s) => s.x)).toEqual([10 - config.mystery.standSpacingM, 10, 10 + config.mystery.standSpacingM]);
  });
});
