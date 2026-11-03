import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { powerCooldownSec, powerUnlocked, summonSpots } from "./powers.ts";

// The GDD's power table is written for a 12-minute night.
const night = 12 * 60;
const at = (nightTime: number, ritualStarted = false) => ({ nightTime, nightLength: night, ritualStarted });

describe("when powers unlock (GDD 4.2, 14.2)", () => {
  it("gives none in Quiet", () => {
    for (const kind of ["slamDoor", "summon", "blackout", "taint"] as const) expect(powerUnlocked(kind, at(30, true))).toBe(false);
  });

  it("unlocks Slam Door at 1:00, Summon at 2:00 and Blackout in Restless (4:00 of 12)", () => {
    expect(powerUnlocked("slamDoor", at(61))).toBe(true);
    expect(powerUnlocked("summon", at(100))).toBe(false);
    expect(powerUnlocked("summon", at(121))).toBe(true);
    expect(powerUnlocked("blackout", at(200))).toBe(false);
    expect(powerUnlocked("blackout", at(241))).toBe(true);
    expect(powerUnlocked("blackout", at(600))).toBe(true);
  });

  it("allows Taint only during the ritual, and Blackout never during it", () => {
    expect(powerUnlocked("taint", at(500))).toBe(false);
    expect(powerUnlocked("taint", at(500, true))).toBe(true);
    expect(powerUnlocked("blackout", at(500, true))).toBe(false);
  });
});

describe("cooldowns (GDD 14.2, 14.3)", () => {
  it("scales with the cooldown speed setting", () => {
    expect(powerCooldownSec("slamDoor")).toBe(30);
    expect(powerCooldownSec("summon", "slow")).toBe(75);
    expect(powerCooldownSec("taint", "fast")).toBe(33.75);
  });
});

describe("where a Summoned ghost appears (GDD 14.2)", () => {
  it("tries straight behind the victim first, 6 to 10 m away", () => {
    // Facing -z (yaw 0): behind is +z.
    const spots = summonSpots({ x: 0, z: 0, yaw: 0 });
    expect(spots[0]!.x).toBeCloseTo(0);
    expect(spots[0]!.z).toBeCloseTo(config.powers.summon.spawnMaxM);
    for (const s of spots) {
      const d = Math.hypot(s.x, s.z);
      expect(d).toBeGreaterThanOrEqual(config.powers.summon.spawnMinM - 1e-9);
      expect(d).toBeLessThanOrEqual(config.powers.summon.spawnMaxM + 1e-9);
    }
  });
});
