import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { clockTime, inPhotoFrame } from "./camera.ts";

describe("the Spirit Camera's frame (GDD 15.2)", () => {
  const cam = { x: 0, z: 0, yaw: 0 }; // looking toward -z

  it("puts a player straight ahead in the middle, and one to the right on the right", () => {
    expect(inPhotoFrame(cam, { x: 0, z: -5 })).toEqual({ frameX: 0, dist: 5 });
    expect(inPhotoFrame(cam, { x: 1, z: -5 })!.frameX).toBeGreaterThan(0);
    expect(inPhotoFrame(cam, { x: -1, z: -5 })!.frameX).toBeLessThan(0);
  });

  it("leaves out anyone behind, beside, or beyond the capture range", () => {
    expect(inPhotoFrame(cam, { x: 0, z: 5 })).toBeNull();
    expect(inPhotoFrame(cam, { x: 5, z: -1 })).toBeNull();
    expect(inPhotoFrame(cam, { x: 0, z: -(config.camera.captureRangeM + 0.1) })).toBeNull();
  });

  it("turns with the camera", () => {
    // Turned a quarter left, the camera looks toward -x.
    expect(inPhotoFrame({ x: 0, z: 0, yaw: Math.PI / 2 }, { x: -4, z: 0 })!.frameX).toBeCloseTo(0);
  });

  it("writes the time like the clock", () => {
    expect(clockTime(310)).toBe("5:10");
    expect(clockTime(65.9)).toBe("1:05");
  });
});
