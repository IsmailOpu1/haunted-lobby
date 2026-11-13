import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { offAxis, recognised } from "./darkness.ts";

const lit = { distM: 6, offAxisRad: 0, flashlightOn: true, clearSight: true, meeting: false };

describe("darkness hides who you are (GDD 22.2)", () => {
  it("shows a player in your beam within the reveal range", () => {
    expect(recognised(lit)).toBe(true);
    expect(recognised({ ...lit, distM: config.flashlight.nameRevealM })).toBe(true);
  });
  it("hides a player beyond the reveal range, outside the beam, behind a wall or with the light off", () => {
    expect(recognised({ ...lit, distM: config.flashlight.nameRevealM + 0.1 })).toBe(false);
    expect(recognised({ ...lit, offAxisRad: Math.PI / 2 })).toBe(false);
    expect(recognised({ ...lit, clearSight: false })).toBe(false);
    expect(recognised({ ...lit, flashlightOn: false })).toBe(false);
  });
  it("always shows a player within dark-vision range, even in the dark and behind you", () => {
    expect(recognised({ distM: config.flashlight.darkVisionM, offAxisRad: Math.PI, flashlightOn: false, clearSight: false, meeting: false })).toBe(true);
  });
  it("shows everyone in a meeting", () => {
    expect(recognised({ distM: 30, offAxisRad: Math.PI, flashlightOn: false, clearSight: false, meeting: true })).toBe(true);
  });
  it("measures the angle off the facing direction (yaw looks along -sin, -cos)", () => {
    expect(offAxis({ x: 0, z: 0 }, 0, { x: 0, z: -5 })).toBeCloseTo(0);
    expect(Math.abs(offAxis({ x: 0, z: 0 }, 0, { x: 0, z: 5 }))).toBeCloseTo(Math.PI);
    expect(Math.abs(offAxis({ x: 0, z: 0 }, 0, { x: 5, z: 0 }))).toBeCloseTo(Math.PI / 2);
  });
});
