import { beforeAll, describe, expect, it } from "vitest";
import { crossStairs, initPhysics, levelOf, PhysicsWorld, toWorld, worldDistance } from "@haunted/shared";
import { twoFloorTestMap as map } from "@haunted/maps";
import { Ghost, type GhostWorld } from "./sim/ghost.ts";
import { NavMap } from "./sim/navmap.ts";

// Floors and stairs (levels.ts) on a tiny two-floor map: a hall downstairs, stairs going north
// from z 0 to z -6 at x 2..4, and a landing upstairs (simulation x = real x + 30).

beforeAll(async () => {
  await initPhysics();
});

describe("floors and stairs", () => {
  it("places each floor at its real height and position", () => {
    expect(toWorld(map, 0, 3)).toEqual({ x: 0, y: 0, z: 3 });
    expect(toWorld(map, 30, -9)).toEqual({ x: 0, y: 3, z: -9 });
    expect(levelOf(map, 30, -9).id).toBe("upper");
  });

  it("rises along the stairs, and both halves meet in the middle", () => {
    expect(toWorld(map, 3, -1.5).y).toBeCloseTo(0.75);
    const below = toWorld(map, 3, -2.99); // lower floor's area, just under the middle
    const above = toWorld(map, 33, -3.01); // upper floor's area, just over the middle
    expect(below.y).toBeCloseTo(1.5, 1);
    expect(above.y).toBeCloseTo(1.5, 1);
    expect(above.x).toBeCloseTo(below.x);
    expect(above.z - below.z).toBeCloseTo(-0.02, 3);
  });

  it("moves a walker to the other floor's area when it passes the middle step", () => {
    expect(crossStairs(map, { x: 3, z: -2.9 }, { x: 3, z: -3.1 })).toEqual({ x: 33, z: -3.1 });
    expect(crossStairs(map, { x: 33, z: -3.1 }, { x: 33, z: -2.9 })).toEqual({ x: 3, z: -2.9 });
    // Anywhere else, nothing happens.
    expect(crossStairs(map, { x: 0, z: 3 }, { x: 0, z: 2.9 })).toEqual({ x: 0, z: 2.9 });
    expect(crossStairs(map, { x: 33, z: -4 }, { x: 33, z: -4.1 })).toEqual({ x: 33, z: -4.1 });
  });

  it("measures real distances through floors", () => {
    // A spot on the landing and a spot in the hall: 3 m up and 12 m apart.
    expect(worldDistance(map, { x: 33, z: -9 }, { x: 3, z: 3 })).toBeCloseTo(Math.hypot(3, 12));
  });

  it("lets a player walk up the stairs to the landing, and back down", () => {
    const physics = new PhysicsWorld(map);
    const { collide } = physics.addBody();
    let p = { x: 3, z: 3 };
    const step = (dz: number) => {
      for (let i = 0; i < 400; i++) p = collide(p, { x: 0, z: dz });
    };
    step(-0.05); // north: up the stairs and into the landing, until its far wall stops us
    expect(levelOf(map, p.x, p.z).id).toBe("upper");
    expect(toWorld(map, p.x, p.z).z).toBeLessThan(-10);
    step(0.05); // south: back down into the hall
    expect(levelOf(map, p.x, p.z).id).toBe("ground");
    expect(p.z).toBeGreaterThan(5);
  });

  it("keeps players inside the stairwell's walls", () => {
    const physics = new PhysicsWorld(map);
    const { collide } = physics.addBody();
    let p = { x: 3, z: -1.5 };
    for (let i = 0; i < 100; i++) p = collide(p, { x: 0.05, z: 0 });
    expect(p.x).toBeLessThan(4);
  });

  it("never sees through a floor", () => {
    const physics = new PhysicsWorld(map);
    expect(physics.lineOfSight({ x: 3, z: 3 }, { x: 33, z: -9 }, 1.5)).toBe(false);
    expect(physics.lineOfSight({ x: 0, z: 3 }, { x: 4, z: 3 }, 1.5)).toBe(true);
  });

  it("gives the ghost a route between floors through the stairs", async () => {
    const nav = await NavMap.create(map);
    const up = nav.path({ x: -4, z: 4 }, { x: 28, z: -10 });
    expect(up.length).toBeGreaterThan(0);
    const jump = up.findIndex((p) => p.jump);
    expect(jump).toBeGreaterThan(0);
    expect(levelOf(map, up[jump - 1]!.x, up[jump - 1]!.z).id).toBe("ground");
    expect(levelOf(map, up[jump]!.x, up[jump]!.z).id).toBe("upper");
    // The jump is between two points in the same real place.
    expect(worldDistance(map, up[jump - 1]!, up[jump]!)).toBeLessThan(0.7);
    expect(up.at(-1)).toMatchObject({ x: expect.closeTo(28, 1), z: expect.closeTo(-10, 1) });

    const down = nav.path({ x: 28, z: -10 }, { x: -4, z: 4 });
    expect(down.some((p) => p.jump)).toBe(true);
    expect(levelOf(map, down.at(-1)!.x, down.at(-1)!.z).id).toBe("ground");
  });

  it("walks the ghost up the stairs without skipping ground", async () => {
    const nav = await NavMap.create(map);
    const physics = new PhysicsWorld(map);
    const world: GhostWorld = {
      players: () => [],
      lineOfSight: (a, b, h) => physics.lineOfSight(a, b, h),
      distance: (a, b) => worldDistance(map, a, b),
      doors: [],
      isDoorOpen: () => true,
      openDoor: () => {},
      hidingSpots: [],
      takeNoises: () => [],
      hit: () => {},
      huntEvent: () => {},
      ritualAt: () => null,
      takeSaltAt: () => false,
      speedMult: () => 1,
    };
    const ghost = new Ghost(nav, world, { x: -4, z: 4 });
    const g = ghost as any; // drive its private movement directly
    g.setGoal({ x: 28, z: -10 });
    const SPEED = 2;
    const DT = 1 / 20;
    let last = toWorld(map, ghost.x, ghost.z);
    for (let i = 0; i < 400 && !g.moveAlongPath(DT, SPEED); i++) {
      const now = toWorld(map, ghost.x, ghost.z);
      expect(Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z)).toBeLessThan(SPEED * DT + 0.7);
      last = now;
    }
    expect(levelOf(map, ghost.x, ghost.z).id).toBe("upper");
    expect(Math.hypot(ghost.x - 28, ghost.z + 10)).toBeLessThan(0.5);
  });
});
