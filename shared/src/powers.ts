// The possessed's powers (GDD Section 14).

import { config } from "./config.ts";
import { nightPart } from "./night.ts";

export type PowerKind = "slamDoor" | "summon" | "blackout" | "taint";
export const POWER_KINDS: readonly PowerKind[] = ["slamDoor", "summon", "blackout", "taint"];
export type CooldownSpeed = keyof typeof config.powers.cooldownSpeed;

/** Where the night is, as far as the powers care. */
export interface PowerClock {
  nightTime: number;
  nightLength: number;
  ritualStarted: boolean;
}

/**
 * Whether a power can be used yet (GDD 4.2, 14.2). Slam Door after Quiet, Summon from 2:00,
 * Blackout from Restless but never during the ritual, Taint only during the ritual.
 */
export function powerUnlocked(kind: PowerKind, c: PowerClock): boolean {
  const p = config.powers;
  if (c.nightTime < config.match.quietSec) return false;
  switch (kind) {
    case "slamDoor":
      return c.nightTime >= p.slamDoor.unlockSec;
    case "summon":
      return c.nightTime >= p.summon.unlockSec;
    case "blackout": {
      const part = nightPart(c.nightTime, c.nightLength);
      return !c.ritualStarted && (part === "restless" || part === "furious");
    }
    case "taint":
      return c.ritualStarted;
  }
}

/** A power's cooldown after the lobby's cooldown speed (GDD 14.3). Blackout has none: it is once per match. */
export function powerCooldownSec(kind: PowerKind, speed: CooldownSpeed = "normal"): number {
  const base = kind === "slamDoor" ? config.powers.slamDoor.cooldownSec : kind === "summon" ? config.powers.summon.cooldownSec : kind === "taint" ? config.taint.cooldownSec : 0;
  return base * config.powers.cooldownSpeed[speed];
}

/**
 * Where a Summoned ghost may appear (GDD 14.2): 6 to 10 m from the victim, best behind them.
 * Returns places to try, in order of preference; the caller keeps the first one the ghost can
 * stand on and reach. yaw is the victim's facing (0 looks toward -z).
 */
export function summonSpots(victim: { x: number; z: number; yaw: number }): { x: number; z: number }[] {
  const { spawnMinM, spawnMaxM } = config.powers.summon;
  const behind = Math.atan2(Math.sin(victim.yaw), Math.cos(victim.yaw));
  const spots: { x: number; z: number }[] = [];
  // Straight behind first, then fanning out to either side, until in front.
  const turns = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
  for (const turn of turns) {
    const a = behind + (turn * Math.PI) / 6;
    for (let d = spawnMaxM; d >= spawnMinM; d -= 1) {
      // Facing yaw looks along (-sin, -cos); behind is (+sin, +cos).
      spots.push({ x: victim.x + Math.sin(a) * d, z: victim.z + Math.cos(a) * d });
    }
  }
  return spots;
}
