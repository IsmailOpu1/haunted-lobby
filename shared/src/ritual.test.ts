import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { circleNeeded, ritualRatePct } from "./ritual.ts";

describe("the ritual (GDD 11)", () => {
  it("needs 2 players in the circle, or 3 in 7 or 8 player matches", () => {
    expect([4, 5, 6, 7, 8].map(circleNeeded)).toEqual([2, 2, 2, 3, 3]);
    // Test rooms with fewer players use the smallest match size.
    expect(circleNeeded(1)).toBe(2);
  });

  it("takes 45 s at the minimum, 25% faster per extra player up to 50%, and drains 1% a second below it", () => {
    const sec = config.ritual.baseSec;
    expect(100 / ritualRatePct(2, 2, sec)).toBeCloseTo(45);
    expect(ritualRatePct(3, 2, sec)).toBeCloseTo((100 / 45) * 1.25);
    expect(ritualRatePct(4, 2, sec)).toBeCloseTo((100 / 45) * 1.5);
    expect(ritualRatePct(8, 2, sec)).toBeCloseTo((100 / 45) * 1.5);
    expect(ritualRatePct(1, 2, sec)).toBe(-1);
    expect(ritualRatePct(2, 3, sec)).toBe(-1);
  });
});
