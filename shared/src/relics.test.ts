import { describe, expect, it } from "vitest";
import type { RelicSpotDef } from "./map.ts";
import { pickRelicSpots } from "./relics.ts";

const spot = (id: string, x: number, z: number): RelicSpotDef => ({ id, label: id, room: "Room", minigame: "dig", x, z });

describe("relic spot selection (GDD 10)", () => {
  // A big map: a 5 x 5 grid of spots 10 m apart.
  const grid: RelicSpotDef[] = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) grid.push(spot(`s${i}${j}`, i * 10, j * 10));

  it("picks the requested number of different spots, at least 20 m apart", () => {
    for (let run = 0; run < 50; run++) {
      const picked = pickRelicSpots(grid, 3, 20);
      expect(new Set(picked.map((s) => s.id)).size).toBe(3);
      for (const a of picked) for (const b of picked) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(20);
    }
  });

  it("picks different spots in different matches", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 30; run++) seen.add(pickRelicSpots(grid, 3, 20).map((s) => s.id).sort().join());
    expect(seen.size).toBeGreaterThan(5);
  });

  it("on a map too small for the rule, still picks spots as far apart as it can", () => {
    // A line of spots 0, 1, 2, ... 9 m: no three are 20 m apart. The best spreads (like 0, 4, 9)
    // have a smallest gap of 4 m.
    const line = Array.from({ length: 10 }, (_, i) => spot(`l${i}`, i, 0));
    for (let run = 0; run < 20; run++) {
      const picked = pickRelicSpots(line, 3, 20);
      expect(picked).toHaveLength(3);
      const xs = picked.map((s) => s.x).sort((a, b) => a - b);
      expect(Math.min(xs[1]! - xs[0]!, xs[2]! - xs[1]!)).toBe(4);
    }
  });

  it("never asks for more spots than the map has", () => {
    expect(pickRelicSpots(grid.slice(0, 2), 3, 0)).toHaveLength(2);
  });
});
