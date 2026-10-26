// Who wins the match (GDD Section 18).

export type Team = "investigators" | "possessed";
export type EndReason = "ritual" | "dawn" | "outnumbered" | "allDead";

export interface MatchSituation {
  ritualComplete: boolean;
  /** Dawn has come, after any overtime. */
  dawn: boolean;
  /** Investigators not dead (downed still counts as living). */
  livingInvestigators: number;
  livingPossessed: number;
}

export interface MatchResult {
  winner: Team;
  reason: EndReason;
}

/** The result, or null while the match goes on. A ritual that finishes at the moment of dawn wins. */
export function matchResult(s: MatchSituation): MatchResult | null {
  if (s.ritualComplete) return { winner: "investigators", reason: "ritual" };
  if (s.livingInvestigators === 0) return { winner: "possessed", reason: "allDead" };
  if (s.livingPossessed >= s.livingInvestigators) return { winner: "possessed", reason: "outnumbered" };
  if (s.dawn) return { winner: "possessed", reason: "dawn" };
  return null;
}
