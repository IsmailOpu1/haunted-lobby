import { describe, expect, it } from "vitest";
import { awards, matchLog, NightRecord, SKIP_VOTE, timeline, type Cast } from "./nightRecord.ts";

// A scripted night: Bo is possessed, slams a door near Ana, is photographed with the demon face,
// and survives a meeting where the team votes Cy out. Ana places two relics and revives Cy.
function night() {
  const cast: Cast = new Map([
    ["a", { name: "Ana", role: "investigator" }],
    ["b", { name: "Bo", role: "possessed" }],
    ["c", { name: "Cy", role: "investigator" }],
    ["d", { name: "Di", role: "investigator" }],
  ]);
  const r = new NightRecord();
  r.add({ t: 70, kind: "power", power: "slamDoor", by: "b", investigatorNear: true });
  r.add({ t: 80, kind: "photo", by: "d", caughtPossessed: true });
  r.add({ t: 100, kind: "downed", who: "c" });
  r.add({ t: 110, kind: "revive", by: "a", who: "c" });
  r.add({ t: 150, kind: "relicPlaced", by: "a" });
  r.add({ t: 200, kind: "downed", who: "c" });
  r.add({
    t: 250,
    kind: "meeting",
    caller: "d",
    via: "bell",
    votes: [
      { voter: "a", target: "c" },
      { voter: "b", target: "c" },
      { voter: "d", target: SKIP_VOTE },
    ],
    removed: "c",
  });
  r.add({ t: 262, kind: "death", who: "c", cause: "voted out" });
  r.add({ t: 300, kind: "relicPlaced", by: "a" });
  r.once({ t: 300, kind: "basementOpen" });
  r.once({ t: 310, kind: "basementOpen" });
  r.shout("d", 4);
  r.shout("b", 0.5);
  return { cast, r };
}

describe("the night's record (GDD 19, PRD 10.6)", () => {
  it("the timeline lists powers, meetings with their votes, and deaths", () => {
    const { cast, r } = night();
    const lines = timeline(r, cast, false);
    expect(lines.map((l) => l.time)).toEqual(["1:10", "4:10", "4:22"]);
    expect(lines[0]!.text).toBe("Bo slammed a door");
    expect(lines[1]!.text).toBe("Di rang the bell. Votes: Ana → Cy, Bo → Cy, Di → Skip. Cy removed");
    expect(lines[2]!.text).toBe("Cy was voted out");
    // Anonymous voting shows only the count.
    expect(timeline(r, cast, true)[1]!.text).toContain("Votes: Cy 2, Skip 1.");
  });

  it("gives each award to who earned it, and leaves out the rest", () => {
    const { cast, r } = night();
    const got = Object.fromEntries(awards(r, cast).map((a) => [a.title, a.names]));
    expect(got).toEqual({
      "Best Liar": ["Bo"],
      "Sharp Eye": ["Di"],
      Hero: ["Ana"],
      "Relic Runner": ["Ana"],
      "Loudest Screamer": ["Di"],
      "Ghost Bait": ["Cy"],
    });
    // A possessed who was voted for is no Best Liar.
    r.add({ t: 400, kind: "meeting", caller: "a", via: "body", votes: [{ voter: "a", target: "b" }], removed: null });
    expect(awards(r, cast).some((a) => a.title === "Best Liar")).toBe(false);
  });

  it("the match log has every PRD 10.6 field and no names", () => {
    const { cast, r } = night();
    const log = matchLog(
      r,
      cast,
      { settingsCode: "STD-15-PA", settings: { lengthMin: 15 }, map: "marrow-hotel", winner: "investigators", reason: "ritual", durationSec: 640, ritualProgress: 100 },
      true,
    );
    for (const key of [
      "settingsCode", "settings", "map", "players", "possessed", "winner", "reason", "durationSec",
      "relicsPlacedAt", "basementOpenAt", "tasksFullAt", "ritualStartAt", "ritualProgress",
      "powers", "photos", "meetings", "deaths", "rematch",
    ]) expect(log).toHaveProperty(key);
    expect(log).toMatchObject({ players: 4, possessed: 1, relicsPlacedAt: [150, 300], basementOpenAt: 300, tasksFullAt: null, rematch: true });
    expect(log.powers).toEqual([{ type: "slamDoor", t: 70, investigatorWithin15m: true }]);
    expect(log.meetings[0]).toMatchObject({ callerRole: "investigator", via: "bell", outcome: "removed investigator" });
    expect(log.meetings[0]!.votes).toContainEqual({ voter: "possessed 1", target: "investigator 2" });
    expect(log.deaths).toEqual([{ t: 262, cause: "voted out", role: "investigator" }]);
    const text = JSON.stringify(log);
    for (const name of ["Ana", "Bo", "Cy", "Di"]) expect(text).not.toContain(name);
  });
});
