import { describe, expect, it } from "vitest";
import { config, levelOf, type MoveState, SIM_DT, stepMovement, toWorld, wispCollide, wispFloor } from "@haunted/shared";
import { marrowHotelGreybox as map } from "@haunted/maps";

const input = { seq: 1, forward: 1, right: 0, run: true, crouch: false, yaw: 0, pitch: 0 };

describe("how a Wisp moves (GDD 17)", () => {
  it("floats at the Wisp speed, running or not, straight through walls", () => {
    const start: MoveState = { x: 0, z: 9.5, stamina: config.movement.staminaSec, regenWait: 0, crouching: false };
    let s = start;
    // Two seconds north from the Main Hall: through its wall into the corridor beyond.
    for (let i = 0; i < 2 / SIM_DT; i++) s = stepMovement(s, input, SIM_DT, wispCollide(map), "wisp");
    expect(start.z - s.z).toBeCloseTo(config.wisps.speed * 2, 5);
    expect(s.stamina).toBe(config.movement.staminaSec);
  });

  it("never drifts off its floor's area", () => {
    const ground = levelOf(map, 0, 9.5);
    const out = wispCollide(map)({ x: ground.maxX - 0.1, z: 9.5 }, { x: 5, z: 0 });
    expect(out.x).toBe(ground.maxX);
  });

  it("changes floor to the same real spot, and stops at the top and the bottom", () => {
    const here = { x: 0, z: 11 };
    const up = wispFloor(map, here, 1)!;
    expect(levelOf(map, up.x, up.z).id).toBe("upper");
    const a = toWorld(map, here.x, here.z);
    const b = toWorld(map, up.x, up.z);
    expect([b.x, b.z]).toEqual([a.x, a.z]);
    expect(b.y).toBeGreaterThan(a.y);
    expect(wispFloor(map, up, 1)).toBeNull();
    const down = wispFloor(map, here, -1)!;
    expect(toWorld(map, down.x, down.z).y).toBeLessThan(a.y);
  });
});
