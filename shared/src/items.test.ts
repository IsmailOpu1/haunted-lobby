import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { distanceToSaltLine, ghostOnSalt, saltLineEnds, saltLineInFront } from "./items.ts";

describe("salt lines (GDD 8.3)", () => {
  it("lands in front of the player, across their path", () => {
    // Facing north (yaw 0 looks toward -z).
    const line = saltLineInFront(0, 0, 0);
    expect(line.z).toBeCloseTo(-config.salt.placeAheadM, 5);
    const [a, b] = saltLineEnds(line);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(config.salt.lineWidthM, 5);
    expect(a.z).toBeCloseTo(b.z, 5); // runs east-west, across a north-facing path
  });

  it("is triggered by the ghost walking over it, not beside it", () => {
    const line = saltLineInFront(0, 0, 0);
    expect(ghostOnSalt(0.5, line.z, line)).toBe(true);
    expect(ghostOnSalt(0, line.z - 1, line)).toBe(false);
    expect(ghostOnSalt(config.salt.lineWidthM, line.z, line)).toBe(false);
    expect(distanceToSaltLine(0, line.z, line)).toBeCloseTo(0, 5);
  });
});
