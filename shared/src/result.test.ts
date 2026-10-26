import { describe, expect, it } from "vitest";
import { matchResult } from "./result.ts";

const going = { ritualComplete: false, dawn: false, livingInvestigators: 4, livingPossessed: 1 };

describe("winning and losing (GDD 18)", () => {
  it("goes on while nobody has won", () => {
    expect(matchResult(going)).toBeNull();
  });

  it("lets the investigators win when the ritual completes, even at the moment of dawn", () => {
    expect(matchResult({ ...going, ritualComplete: true })).toEqual({ winner: "investigators", reason: "ritual" });
    expect(matchResult({ ...going, ritualComplete: true, dawn: true })).toEqual({ winner: "investigators", reason: "ritual" });
  });

  it("gives the possessed the win at dawn, when they equal the living investigators, or when every investigator is dead", () => {
    expect(matchResult({ ...going, dawn: true })).toEqual({ winner: "possessed", reason: "dawn" });
    expect(matchResult({ ...going, livingInvestigators: 1 })).toEqual({ winner: "possessed", reason: "outnumbered" });
    expect(matchResult({ ...going, livingInvestigators: 0 })).toEqual({ winner: "possessed", reason: "allDead" });
    // With no possessed at all, only the deaths of everyone end it early.
    expect(matchResult({ ...going, livingPossessed: 0, livingInvestigators: 1 })).toBeNull();
    expect(matchResult({ ...going, livingPossessed: 0, livingInvestigators: 0 })).toEqual({ winner: "possessed", reason: "allDead" });
  });
});
