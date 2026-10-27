import { describe, expect, it } from "vitest";
import { directionTo } from "./cues.ts";

describe("sound subtitle arrows", () => {
  it("points ahead, right, behind and left of where you face", () => {
    // Facing north (yaw 0, toward -z).
    expect(directionTo(0, 0, 0, 0, -5)).toBeCloseTo(0);
    expect(directionTo(0, 0, 0, 5, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(directionTo(0, 0, 0, 0, 5))).toBeCloseTo(Math.PI);
    expect(directionTo(0, 0, 0, -5, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it("turns with you", () => {
    // Facing west (yaw π/2): north is on your right, south on your left.
    expect(directionTo(0, 0, Math.PI / 2, 0, -5)).toBeCloseTo(Math.PI / 2);
    expect(directionTo(0, 0, Math.PI / 2, 0, 5)).toBeCloseTo(-Math.PI / 2);
    expect(directionTo(0, 0, Math.PI / 2, -5, 0)).toBeCloseTo(0);
  });
});
