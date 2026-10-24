import { config } from "./config.ts";

// The night clock (GDD Section 4.2). Quiet is always the first quietSec; the rest of the
// night splits into Calm, Restless and Furious at one third and two thirds of the match.

export type NightPart = "quiet" | "calm" | "restless" | "furious" | "dawn";
export type GhostDifficulty = keyof typeof config.ghost.difficulty;

export function nightPart(elapsedSec: number, lengthSec: number): NightPart {
  if (elapsedSec >= lengthSec) return "dawn";
  if (elapsedSec < config.match.quietSec) return "quiet";
  const [restlessPct, furiousPct] = config.match.partSplitsPct;
  const pct = (elapsedSec / lengthSec) * 100;
  if (pct < restlessPct!) return "calm";
  if (pct < furiousPct!) return "restless";
  return "furious";
}

export interface GhostParams {
  wander: number;
  hunt: number;
  betweenHuntsSec: number;
  huntSec: number;
}

/** Ghost speeds and timings for a part of the night, after difficulty and player-count modifiers. */
export function ghostParams(part: NightPart, difficulty: GhostDifficulty, playerCount: number): GhostParams {
  const g = config.ghost;
  const base = part === "restless" ? g.parts.restless : part === "furious" ? g.parts.furious : g.parts.calm;
  const diff = g.difficulty[difficulty];
  const counts = g.playerCountIntervalMult as Record<number, number>;
  // Test rooms can have fewer than the minimum players; use the smallest listed count.
  const clamped = Math.max(config.players.min, Math.min(config.players.max, playerCount));
  const countMult = counts[clamped] ?? 1;
  return {
    wander: base.wander * diff.speedMult,
    hunt: base.hunt * diff.speedMult,
    betweenHuntsSec: base.betweenHuntsSec * diff.intervalMult * countMult,
    huntSec: base.huntSec,
  };
}
