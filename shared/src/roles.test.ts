import { describe, expect, it } from "vitest";
import { pickPossessed, possessedCount } from "./roles.ts";

describe("how many are possessed (GDD 3)", () => {
  it("follows the Auto column and never goes above the max", () => {
    expect([4, 5, 6, 7, 8].map((n) => possessedCount(n))).toEqual([1, 1, 1, 2, 2]);
    expect([4, 5, 6, 7, 8].map((n) => possessedCount(n, 2))).toEqual([1, 1, 2, 2, 2]);
    expect(possessedCount(8, 1)).toBe(1);
  });

  it("has none below the player minimum (debug servers only)", () => {
    expect([1, 2, 3].map((n) => possessedCount(n))).toEqual([0, 0, 0]);
  });
});

describe("fair rotation (GDD 19)", () => {
  it("never possesses anyone twice before everyone has been once, over 10 rounds", () => {
    for (const players of [4, 5, 6]) {
      const ids = Array.from({ length: players }, (_, i) => `p${i}`);
      const times = new Map<string, number>();
      for (let round = 0; round < 10; round++) {
        const [who] = pickPossessed(ids, times, 1);
        const before = Math.min(...ids.map((id) => times.get(id) ?? 0));
        // Only someone at the fewest count can be picked.
        expect(times.get(who!) ?? 0).toBe(before);
        times.set(who!, (times.get(who!) ?? 0) + 1);
      }
      const counts = ids.map((id) => times.get(id) ?? 0);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it("picks different players when two are possessed", () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickPossessed(["a", "b", "c", "d", "e", "f", "g"], new Map(), 2);
      expect(new Set(picked).size).toBe(2);
    }
  });

  it("gives everyone at the fewest count an even chance", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const [who] = pickPossessed(["a", "b", "c", "d"], new Map([["a", 1]]), 1);
      seen.set(who!, (seen.get(who!) ?? 0) + 1);
    }
    expect(seen.get("a")).toBeUndefined();
    for (const id of ["b", "c", "d"]) expect(seen.get(id)!).toBeGreaterThan(550);
  });
});
