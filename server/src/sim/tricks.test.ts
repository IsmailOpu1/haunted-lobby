import { describe, expect, it } from "vitest";
import type { BellboyTrickDef, DoorDef } from "@haunted/shared";
import { marrowHotelGreybox } from "@haunted/maps";
import type { GhostState } from "./ghost.ts";
import { createTrick } from "./tricks.ts";

const bellboy: BellboyTrickDef = { kind: "bellboy", ringEverySec: [40, 60], swingEverySec: [25, 45], swingRangeM: 6 };
const doors: DoorDef[] = [
  { id: "near", x: 3, z: 0, width: 1.2, axis: "x" },
  { id: "far", x: 20, z: 0, width: 1.2, axis: "x" },
];

function setup(random = 0) {
  const ghost = { x: 0, z: 0, state: "wander" as GhostState };
  const open = new Set<string>();
  const rings: { x: number; z: number }[] = [];
  const trick = createTrick(bellboy, {
    ghost: () => ghost,
    doors,
    isDoorOpen: (id) => open.has(id),
    swingDoor: (id) => open.add(id),
    ring: (at) => rings.push({ x: at.x, z: at.z }),
    distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    random: () => random,
  })!;
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) trick.update(0.05);
  };
  return { ghost, open, rings, run };
}

describe("the Bellboy (GDD 12.5)", () => {
  it("is the Marrow Hotel's trick, set in its map data", () => {
    expect(marrowHotelGreybox.ghostTrick?.kind).toBe("bellboy");
  });

  it("rings a bell where it is every 40 to 60 s", () => {
    const quick = setup(0);
    quick.run(39.5);
    expect(quick.rings).toEqual([]);
    quick.run(1);
    expect(quick.rings).toEqual([{ x: 0, z: 0 }]);
    const slow = setup(0.999);
    slow.run(59.5);
    expect(slow.rings).toEqual([]);
    slow.run(1);
    expect(slow.rings).toHaveLength(1);
  });

  it("does nothing while asleep, and never rings in the silence before a hunt", () => {
    const s = setup(0);
    s.ghost.state = "asleep";
    s.run(100);
    expect(s.rings).toEqual([]);
    expect(s.open.size).toBe(0);
    s.ghost.state = "prehunt";
    s.run(45);
    expect(s.rings).toEqual([]);
    // It rings as the hunt starts.
    s.ghost.state = "hunt";
    s.run(0.1);
    expect(s.rings).toHaveLength(1);
  });

  it("swings open the nearest closed door within 6 m while wandering, now and then", () => {
    const s = setup(0);
    s.run(24.5);
    expect(s.open.size).toBe(0);
    s.run(1);
    expect([...s.open]).toEqual(["near"]);
    // The far door is out of reach: it waits until it passes one.
    s.run(30);
    expect([...s.open]).toEqual(["near"]);
    s.ghost.x = 18;
    s.run(0.1);
    expect([...s.open]).toEqual(["near", "far"]);
  });

  it("does not swing doors while hunting", () => {
    const s = setup(0);
    s.ghost.state = "hunt";
    s.run(30);
    expect(s.open.size).toBe(0);
  });
});
