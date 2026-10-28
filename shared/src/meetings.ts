// Meetings and voting (GDD Section 16).

import { config } from "./config.ts";

/** Where a meeting is: "" when there is none. result shows who was removed before everyone goes back. */
export type MeetingStep = "" | "evidence" | "discussion" | "vote" | "result";

/** A vote for "skip" instead of a player. */
export const SKIP = "skip";
/** The Ouija board's "I don't know" (GDD 17). */
export const OUIJA_UNKNOWN = "unknown";

/** What happens next after each step, and how long a step lasts. */
export function nextMeetingStep(step: MeetingStep): MeetingStep {
  return step === "evidence" ? "discussion" : step === "discussion" ? "vote" : step === "vote" ? "result" : "";
}

export function meetingStepSec(step: MeetingStep): number {
  const m = config.meetings;
  return step === "evidence" ? m.evidenceSec : step === "discussion" ? m.discussionSec : step === "vote" ? m.voteSec : step === "result" ? m.resultSec : 0;
}

/**
 * Counts the votes (voter -> player voted for, or SKIP). The player with the most votes is removed
 * only with more votes than Skip; a tie for the most means nobody is (GDD 16.3).
 */
export function countVotes(votes: Map<string, string>): { removed: string | null; tally: Map<string, number>; skip: number } {
  const tally = new Map<string, number>();
  let skip = 0;
  for (const target of votes.values()) {
    if (target === SKIP) skip++;
    else tally.set(target, (tally.get(target) ?? 0) + 1);
  }
  let top = 0;
  let leaders: string[] = [];
  for (const [id, n] of tally) {
    if (n > top) {
      top = n;
      leaders = [id];
    } else if (n === top) {
      leaders.push(id);
    }
  }
  const removed = leaders.length === 1 && top > skip ? leaders[0]! : null;
  return { removed, tally, skip };
}

export interface MeetingClock {
  nightTime: number;
  /** The ghost is hunting or about to (the silence before a hunt). */
  hunting: boolean;
  overtime: boolean;
  /** Night time the last meeting ended, or null before the first. */
  lastMeetingEnd: number | null;
}

/** Why a meeting cannot start now, or null when it can (GDD 16.1). */
export function meetingBlocked(c: MeetingClock): string | null {
  if (c.nightTime < config.match.quietSec) return "Not in the first minute.";
  if (c.hunting) return "Not while the ghost hunts.";
  if (c.overtime) return "Not in overtime.";
  if (c.lastMeetingEnd !== null && c.nightTime - c.lastMeetingEnd < config.meetings.minGapSec) {
    return `Too soon after the last meeting (${Math.ceil(config.meetings.minGapSec - (c.nightTime - c.lastMeetingEnd))} s).`;
  }
  return null;
}
