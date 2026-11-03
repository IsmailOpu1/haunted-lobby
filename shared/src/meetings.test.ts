import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { countVotes, meetingBlocked, nextMeetingStep, SKIP } from "./meetings.ts";

const votes = (list: [string, string][]) => new Map(list);

describe("counting votes (GDD 16.3)", () => {
  it("removes the player with the most votes when they beat Skip", () => {
    expect(countVotes(votes([["a", "x"], ["b", "x"], ["c", SKIP], ["d", "y"]])).removed).toBe("x");
  });

  it("removes nobody when the most votes only tie Skip, or two players tie", () => {
    expect(countVotes(votes([["a", "x"], ["b", "x"], ["c", SKIP], ["d", SKIP]])).removed).toBeNull();
    expect(countVotes(votes([["a", "x"], ["b", "y"], ["c", SKIP]])).removed).toBeNull();
    expect(countVotes(votes([])).removed).toBeNull();
  });

  it("counts Skip and each player's votes", () => {
    const r = countVotes(votes([["a", "x"], ["b", SKIP], ["c", SKIP]]));
    expect(r.skip).toBe(2);
    expect(r.tally.get("x")).toBe(1);
  });
});

describe("when a meeting can start (GDD 16.1)", () => {
  const ok = { nightTime: 200, hunting: false, overtime: false, lastMeetingEnd: null };

  it("can start after the first minute, with no hunt, outside overtime", () => {
    expect(meetingBlocked(ok)).toBeNull();
    expect(meetingBlocked({ ...ok, nightTime: config.match.quietSec - 1 })).not.toBeNull();
    expect(meetingBlocked({ ...ok, hunting: true })).not.toBeNull();
    expect(meetingBlocked({ ...ok, overtime: true })).not.toBeNull();
  });

  it("waits minGapSec after the last meeting", () => {
    expect(meetingBlocked({ ...ok, lastMeetingEnd: 200 - config.meetings.minGapSec + 1 })).not.toBeNull();
    expect(meetingBlocked({ ...ok, lastMeetingEnd: 200 - config.meetings.minGapSec })).toBeNull();
  });

  it("runs evidence, discussion, vote, then the result", () => {
    expect([nextMeetingStep("evidence"), nextMeetingStep("discussion"), nextMeetingStep("vote"), nextMeetingStep("result")]).toEqual(["discussion", "vote", "result", ""]);
  });
});
