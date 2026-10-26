import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../config.ts";
import type { MapData } from "../map.ts";
import { initialMoveState, sanitizeInput, SIM_DT, stepMovement, type CollideFn, type MoveInput, type MoveState } from "./movement.ts";
import { initPhysics, PhysicsWorld } from "./physics.ts";

const free: CollideFn = (from, d) => ({ x: from.x + d.x, z: from.z + d.z });

function input(over: Partial<MoveInput> = {}): MoveInput {
  return { seq: 0, forward: 0, right: 0, run: false, crouch: false, yaw: 0, pitch: 0, ...over };
}

function run(state: MoveState, inp: MoveInput, seconds: number, collide: CollideFn = free): MoveState {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) state = stepMovement(state, inp, SIM_DT, collide);
  return state;
}

describe("movement speeds (GDD Section 6)", () => {
  it("walks at walking speed toward -z when facing yaw 0", () => {
    const s = run(initialMoveState(0, 0), input({ forward: 1 }), 1);
    expect(s.z).toBeCloseTo(-config.movement.walk, 5);
    expect(s.x).toBeCloseTo(0, 5);
  });

  it("runs at running speed", () => {
    const s = run(initialMoveState(0, 0), input({ forward: 1, run: true }), 1);
    expect(s.z).toBeCloseTo(-config.movement.run, 5);
  });

  it("crouches at crouching speed, even when holding run", () => {
    const s = run(initialMoveState(0, 0), input({ forward: 1, run: true, crouch: true }), 1);
    expect(s.z).toBeCloseTo(-config.movement.crouch, 5);
    expect(s.crouching).toBe(true);
  });

  it("does not move faster diagonally", () => {
    const s = run(initialMoveState(0, 0), input({ forward: 1, right: 1 }), 1);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(config.movement.walk, 5);
  });

  it("strafes right toward +x when facing yaw 0", () => {
    const s = run(initialMoveState(0, 0), input({ right: 1 }), 1);
    expect(s.x).toBeCloseTo(config.movement.walk, 5);
  });
});

describe("stamina", () => {
  it("lasts staminaSec of running, then drops to walking speed", () => {
    let s = run(initialMoveState(0, 0), input({ forward: 1, run: true }), config.movement.staminaSec);
    expect(s.stamina).toBeCloseTo(0, 5);
    const before = s.z;
    s = run(s, input({ forward: 1, run: true }), 1);
    expect(before - s.z).toBeCloseTo(config.movement.walk, 5);
  });

  it("waits staminaRegenDelaySec, then refills fully in staminaRefillSec", () => {
    let s = run(initialMoveState(0, 0), input({ forward: 1, run: true }), config.movement.staminaSec);
    s = run(s, input(), config.movement.staminaRegenDelaySec);
    expect(s.stamina).toBeCloseTo(0, 5);
    s = run(s, input(), config.movement.staminaRefillSec);
    expect(s.stamina).toBeCloseTo(config.movement.staminaSec, 5);
  });

  it("is not used when holding run while standing still", () => {
    const s = run(initialMoveState(0, 0), input({ run: true }), 2);
    expect(s.stamina).toBe(config.movement.staminaSec);
  });
});

describe("input validation", () => {
  it("accepts a normal input and clamps values", () => {
    const r = sanitizeInput({ seq: 4, forward: 7, right: -3, run: true, crouch: "yes", yaw: 10, pitch: 5 });
    expect(r).toMatchObject({ seq: 4, forward: 1, right: -1, run: true, crouch: false });
    expect(Math.abs(r!.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(r!.pitch).toBeCloseTo(Math.PI / 2);
  });

  it("rejects malformed input", () => {
    expect(sanitizeInput(null)).toBeNull();
    expect(sanitizeInput({ seq: -1, forward: 0, right: 0, yaw: 0, pitch: 0 })).toBeNull();
    expect(sanitizeInput({ seq: 1.5, forward: 0, right: 0, yaw: 0, pitch: 0 })).toBeNull();
    expect(sanitizeInput({ seq: 1, forward: NaN, right: 0, yaw: 0, pitch: 0 })).toBeNull();
  });
});

describe("collision with walls and doors", () => {
  // A wall along x at z = -2 with a door in the middle.
  const map: MapData = {
    id: "test",
    name: "test",
    wallHeightM: 3,
    wallThicknessM: 0.2,
    walls: [
      [-10, -2, -0.75, -2],
      [0.75, -2, 10, -2],
    ],
    doors: [{ id: "d", x: 0, z: -2, width: 1.5, axis: "x" }],
    rooms: [],
    hidingSpots: [],
    saltJars: [],
    spawns: [],
  };

  beforeAll(async () => {
    await initPhysics();
  });

  it("stops at a wall", () => {
    const world = new PhysicsWorld(map);
    const body = world.addBody();
    const s = run(initialMoveState(5, 0), input({ forward: 1 }), 2, body.collide);
    // Wall face is at z = -1.9 and the body radius is 0.3.
    expect(s.z).toBeGreaterThan(-1.65);
    expect(s.z).toBeLessThan(-1.5);
  });

  it("is blocked by a closed door and passes an open one", () => {
    const world = new PhysicsWorld(map);
    const body = world.addBody();
    let s = run(initialMoveState(0, 0), input({ forward: 1 }), 2, body.collide);
    expect(s.z).toBeGreaterThan(-1.65);

    world.setDoorOpen("d", true);
    s = run(s, input({ forward: 1 }), 2, body.collide);
    expect(s.z).toBeLessThan(-4);
  });

  it("does not block on other players", () => {
    const world = new PhysicsWorld(map);
    const a = world.addBody();
    const b = world.addBody();
    b.collide({ x: 5, z: -1 }, { x: 0, z: 0 });
    const s = run(initialMoveState(5, 1), input({ forward: 1 }), 0.5, a.collide);
    // Walked the full distance straight through the other body at (5, -1).
    expect(s.z).toBeCloseTo(1 - config.movement.walk * 0.5, 3);
  });
});
