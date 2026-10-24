import { describe, expect, it } from "vitest";
import { config } from "./config.ts";

// Guards against typos when numbers are tuned: the tables that depend on player count
// must cover every allowed player count, and the possessed can never exceed the max.
describe("config", () => {
  const counts: number[] = [];
  for (let n = config.players.min; n <= config.players.max; n++) counts.push(n);

  it("has per-player-count values for every allowed player count", () => {
    for (const n of counts) {
      expect(config.possessed.autoByPlayers).toHaveProperty(String(n));
      expect(config.possessed.maxByPlayers).toHaveProperty(String(n));
      expect(config.ritual.circleMinByPlayers).toHaveProperty(String(n));
      expect(config.ghost.playerCountIntervalMult).toHaveProperty(String(n));
    }
  });

  it("never auto-assigns more possessed than the max", () => {
    for (const n of counts) {
      const key = n as keyof typeof config.possessed.autoByPlayers;
      expect(config.possessed.autoByPlayers[key]).toBeLessThanOrEqual(config.possessed.maxByPlayers[key]);
    }
  });

  it("uses the defaults inside each option list", () => {
    expect(config.match.lengthOptionsMin).toContain(config.match.lengthMin);
    expect(config.camera.shotOptions).toContain(config.camera.shotsPerPlayer);
    expect(config.salt.options).toContain(config.salt.perPlayer);
    expect(config.tasks.options).toContain(config.tasks.perPlayer);
    expect(config.relics.options).toContain(config.relics.count);
    expect(config.ritual.options).toContain(config.ritual.baseSec);
  });
});
