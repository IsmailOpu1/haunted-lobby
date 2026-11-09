import { describe, expect, it } from "vitest";
import { CHARACTERS, dealCharacters } from "./characters.ts";
import { config } from "./config.ts";

describe("dealing characters (GDD 26.14)", () => {
  it("gives a full room a different character each", () => {
    const ids = Array.from({ length: config.players.max }, (_, i) => `p${i}`);
    const dealt = dealCharacters(ids, Math.random);
    expect(dealt.size).toBe(ids.length);
    expect(new Set(dealt.values()).size).toBe(ids.length);
    for (const id of dealt.values()) expect(CHARACTERS.some((c) => c.id === id)).toBe(true);
  });

  it("is random: different nights deal differently", () => {
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nights = new Set(Array.from({ length: 20 }, () => [...dealCharacters(["a", "b", "c", "d"], rng).values()].join()));
    expect(nights.size).toBeGreaterThan(10);
  });
});
