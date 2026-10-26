import { config } from "./config.ts";

// The ritual at the altar (GDD Section 11).

/** How many players must stand in the circle for a match of this size. */
export function circleNeeded(playerCount: number): number {
  const table = config.ritual.circleMinByPlayers as Record<number, number>;
  // Test rooms can have fewer than the minimum players; use the smallest listed count.
  const clamped = Math.max(config.players.min, Math.min(config.players.max, playerCount));
  return table[clamped] ?? table[config.players.min]!;
}

/**
 * How fast ritual progress changes, in percent per second. With enough players in the circle
 * it fills in `ritualSec`, 25% faster for each extra player (up to 50%). Below the minimum it
 * drains slowly instead.
 */
export function ritualRatePct(inCircle: number, needed: number, ritualSec: number): number {
  if (inCircle < needed) return -config.ritual.drainPctPerSec;
  const bonusPct = Math.min((inCircle - needed) * config.ritual.extraPlayerSpeedPct, config.ritual.maxSpeedBonusPct);
  return (100 / ritualSec) * (1 + bonusPct / 100);
}
