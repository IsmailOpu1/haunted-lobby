import { beforeAll, describe, expect, it } from "vitest";
import {
  config,
  initPhysics,
  initialMoveState,
  nightPart,
  PhysicsWorld,
  SIM_DT,
  stepMovement,
  type MoveInput,
  type NightPart,
} from "@haunted/shared";
import { marrowHotelGreybox as map } from "@haunted/maps";
import { Ghost, type GhostTarget, type GhostWorld } from "./ghost.ts";
import { NavMap } from "./navmap.ts";

let nav: NavMap;
let physics: PhysicsWorld;

beforeAll(async () => {
  await initPhysics();
  nav = await NavMap.create(map);
  physics = new PhysicsWorld(map);
});

function player(over: Partial<GhostTarget> & { id: string; x: number; z: number }): GhostTarget {
  return { health: "alive", hidingSpot: null, flashlightOn: true, noiseM: 0, immune: false, ...over };
}

/** A test world: fixed players, real walls for line of sight, doors that start closed. */
function makeWorld(players: GhostTarget[]) {
  const open = new Set<string>();
  const log = { hits: [] as string[], events: [] as string[], noises: [] as { x: number; z: number; radiusM: number }[] };
  const world: GhostWorld = {
    players: () => players,
    lineOfSight: (a, b, h) => physics.lineOfSight(a, b, h),
    doors: map.doors,
    isDoorOpen: (id) => open.has(id),
    openDoor: (id) => open.add(id),
    hidingSpots: map.hidingSpots,
    takeNoises: () => log.noises.splice(0),
    hit: (id) => {
      log.hits.push(id);
      const p = players.find((q) => q.id === id);
      if (p) p.health = "downed";
    },
    huntEvent: (phase) => log.events.push(phase),
  };
  return { world, log, open };
}

function run(ghost: Ghost, seconds: number, part: NightPart, each?: () => void) {
  for (let t = 0; t < seconds; t += SIM_DT) {
    ghost.update(SIM_DT, part, 4);
    each?.();
  }
}

describe("night clock (GDD 4.2)", () => {
  it("splits a 12 minute night into quiet, calm, restless, furious and dawn", () => {
    const len = 12 * 60;
    expect(nightPart(30, len)).toBe("quiet");
    expect(nightPart(61, len)).toBe("calm");
    expect(nightPart(4 * 60 + 1, len)).toBe("restless");
    expect(nightPart(8 * 60 + 1, len)).toBe("furious");
    expect(nightPart(len, len)).toBe("dawn");
  });
});

describe("ghost", () => {
  it("sleeps during the quiet part", () => {
    const { world } = makeWorld([player({ id: "a", x: 0, z: 6, noiseM: 16 })]);
    const ghost = new Ghost(nav, world, { x: 0, z: 10 });
    run(ghost, 5, "quiet");
    expect(ghost.state).toBe("asleep");
    expect(Math.hypot(ghost.x - 0, ghost.z - 10)).toBeLessThan(0.5);
  });

  it("hears a running player and goes to investigate", () => {
    const p = player({ id: "a", x: 5, z: 8, noiseM: config.ghost.hearingM.run });
    const { world } = makeWorld([p]);
    const ghost = new Ghost(nav, world, { x: -5, z: 4 });
    run(ghost, 0.1, "calm");
    expect(ghost.state).toBe("investigate");
    const start = Math.hypot(ghost.x - p.x, ghost.z - p.z);
    run(ghost, 2, "calm");
    expect(Math.hypot(ghost.x - p.x, ghost.z - p.z)).toBeLessThan(start - 1.5);
  });

  it("does not hear a crouching player outside 3 m", () => {
    const { world } = makeWorld([player({ id: "a", x: 5, z: 8, noiseM: config.ghost.hearingM.crouch, flashlightOn: false })]);
    const ghost = new Ghost(nav, world, { x: -5, z: 4 });
    ghost.yaw = Math.PI; // facing away (south)
    run(ghost, 0.1, "calm");
    expect(ghost.state).toBe("wander");
  });

  it("cannot see a silent player through a wall", () => {
    // Ghost in the Main Hall facing north, player in the Kitchen behind the wall, flashlight on.
    const { world } = makeWorld([player({ id: "a", x: 5, z: -8, flashlightOn: true })]);
    const ghost = new Ghost(nav, world, { x: 5, z: 2 });
    ghost.yaw = 0;
    run(ghost, 0.05, "calm");
    expect(ghost.state).toBe("wander");
  });

  it("sees a silent player in front of it with a flashlight on", () => {
    const { world } = makeWorld([player({ id: "a", x: 0, z: 2, flashlightOn: true })]);
    const ghost = new Ghost(nav, world, { x: 0, z: 10 });
    ghost.yaw = 0; // facing north, toward the player
    run(ghost, 0.05, "calm");
    expect(ghost.state).toBe("investigate");
  });

  it("warns 2 s before a hunt, then hunts and catches a player standing in the open", () => {
    // Loud enough to be heard anywhere on the map, so the test does not depend on where the ghost wandered.
    const victim = player({ id: "a", x: 3, z: 6, flashlightOn: true, noiseM: 100 });
    const { world, log } = makeWorld([victim]);
    const ghost = new Ghost(nav, world, { x: -5, z: 9 });
    const between = config.ghost.parts.calm.betweenHuntsSec * config.ghost.playerCountIntervalMult[4];
    run(ghost, between - 0.5, "calm");
    expect(log.events).toEqual([]);
    run(ghost, 1, "calm");
    expect(log.events).toEqual(["warning"]);
    run(ghost, config.ghost.preHuntSilenceSec, "calm");
    expect(log.events).toContain("start");
    for (let t = 0; t < 15 && log.hits.length === 0; t += SIM_DT) ghost.update(SIM_DT, "calm", 4);
    expect(log.hits).toEqual(["a"]);
    expect(log.events.at(-1)).toBe("end");
    expect(ghost.state).toBe("retreat");
  });

  it("does not find a silent hidden player it never saw", () => {
    const hidden = player({ id: "a", x: 7.6, z: 10, hidingSpot: "hall-wardrobe-east", flashlightOn: false });
    const { world, log } = makeWorld([hidden]);
    const ghost = new Ghost(nav, world, { x: -5, z: 4 });
    run(ghost, 0.05, "calm");
    (ghost as unknown as { startHunt(s: number): void }).startHunt(config.ghost.parts.calm.huntSec);
    run(ghost, config.ghost.parts.calm.huntSec + 1, "calm");
    expect(log.hits).toEqual([]);
  });

  it("checks the hiding spot next to where it lost a player, and finds them there", () => {
    const p = player({ id: "a", x: 6.7, z: 10, flashlightOn: true, noiseM: config.ghost.hearingM.walk });
    const { world, log } = makeWorld([p]);
    const ghost = new Ghost(nav, world, { x: 0, z: 9 });
    run(ghost, 0.05, "calm");
    (ghost as unknown as { startHunt(s: number): void }).startHunt(config.ghost.parts.calm.huntSec);
    run(ghost, 0.2, "calm"); // sees and hears the player
    // The player slips into the wardrobe right next to them and goes silent.
    p.hidingSpot = "hall-wardrobe-east";
    p.x = 7.6;
    p.noiseM = 0;
    run(ghost, config.ghost.parts.calm.huntSec, "calm");
    expect(log.hits).toEqual(["a"]);
  });

  it("opens closed doors it walks through", () => {
    const { world, open } = makeWorld([]);
    const ghost = new Ghost(nav, world, { x: 0, z: 3 });
    run(ghost, 0.05, "calm");
    (ghost as unknown as { setGoal(p: { x: number; z: number }): void }).setGoal({ x: 0, z: -6 });
    (ghost as unknown as { state: string }).state = "investigate";
    run(ghost, 6, "calm");
    expect(open.has("hall-corridor")).toBe(true);
  });

  it("is gone at dawn", () => {
    const { world } = makeWorld([]);
    const ghost = new Ghost(nav, world, { x: 0, z: 3 });
    run(ghost, 1, "calm");
    run(ghost, 0.05, "dawn");
    expect(ghost.state).toBe("gone");
  });
});

describe("ghost never gets stuck (PRD Phase 2: 20 test runs)", () => {
  it("keeps moving through 20 nights with wandering players", () => {
    const nightSec = 6 * 60; // shortened nights keep the test fast; every part still occurs
    for (let run = 0; run < 20; run++) {
      const bodies = map.spawns.slice(0, 3).map((s, i) => ({
        id: `p${i}`,
        move: initialMoveState(s.x, s.z),
        collide: physics.addBody().collide,
        yaw: Math.random() * Math.PI * 2,
        turnIn: 0,
      }));
      const players = bodies.map((b) => player({ id: b.id, x: b.move.x, z: b.move.z, noiseM: config.ghost.hearingM.walk }));
      const { world } = makeWorld(players);
      // Caught players are not downed here (immune for one tick), so the ghost keeps hunting all night.
      world.hit = (id) => {
        players.find((q) => q.id === id)!.immune = true;
      };
      const ghost = new Ghost(nav, world, nav.randomPoint());

      let lastMoveAt = 0;
      let last = { x: ghost.x, z: ghost.z };
      let longestStill = 0;
      for (let t = 0; t < nightSec; t += SIM_DT) {
        for (const [i, b] of bodies.entries()) {
          b.turnIn -= SIM_DT;
          if (b.turnIn <= 0) {
            b.yaw = Math.random() * Math.PI * 2;
            b.turnIn = 1 + Math.random() * 3;
          }
          const input: MoveInput = { seq: 0, forward: 1, right: 0, run: false, crouch: false, yaw: b.yaw, pitch: 0 };
          b.move = stepMovement(b.move, input, SIM_DT, b.collide);
          players[i]!.x = b.move.x;
          players[i]!.z = b.move.z;
          players[i]!.immune = false;
        }
        ghost.update(SIM_DT, nightPart(t, nightSec), 4);

        const moving = ghost.state === "wander" || ghost.state === "investigate" || ghost.state === "hunt";
        if (!moving || Math.hypot(ghost.x - last.x, ghost.z - last.z) > 0.5) {
          last = { x: ghost.x, z: ghost.z };
          lastMoveAt = t;
        }
        longestStill = Math.max(longestStill, t - lastMoveAt);
      }
      // Pauses (looking around, inspecting a hiding spot) last a few seconds; never 10 s.
      expect(longestStill, `night ${run}`).toBeLessThan(10);
    }
  }, 120000);
});
