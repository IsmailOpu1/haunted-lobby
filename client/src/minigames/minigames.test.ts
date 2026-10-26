import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@haunted/shared";
import { Boiler } from "./boiler.ts";
import { Candelabra } from "./candelabra.ts";
import { Clock } from "./clock.ts";
import { Cradle } from "./cradle.ts";
import { Letter } from "./letter.ts";
import { Piano } from "./piano.ts";
import { Stove } from "./stove.ts";
import type { Minigame, Point, TaskSoundKind } from "./types.ts";

// Each minigame is played by a scripted "good player" with human-like limits (the mouse moves
// at most HAND_SPEED, clicks come after a short reaction). A good player must finish inside
// GDD 9's time and never faster than the server accepts (config.tasks.serverMinSec).

const DT = 1 / 60;
const HAND_SPEED = 450; // board units per second, well under the match's blow-out speed
const MAX_SEC = 40;
const SEEDS = [1, 2, 3, 4, 5];

/** Math.random made repeatable, so a failure can be replayed. */
function seedRandom(seed: number) {
  let a = seed;
  vi.spyOn(Math, "random").mockImplementation(() => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

afterEach(() => vi.restoreAllMocks());

/** A canvas context that accepts every call and records any number that is not finite. */
function fakeContext() {
  const bad: string[] = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) bad.push(`${String(prop)}(${args.join(", ")})`);
        return gradient;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, bad };
}

interface Run {
  sec: number;
  sounds: TaskSoundKind[];
}

/**
 * Plays a game: each frame the bot acts, the game updates, and every 0.25 s it is drawn.
 * Returns how long it took (MAX_SEC if never done).
 */
function play<G extends Minigame>(make: (s: (k: TaskSoundKind) => void) => G, bot: (g: G, t: number) => void): Run & { bad: string[] } {
  const sounds: TaskSoundKind[] = [];
  const g = make((k) => sounds.push(k));
  const { ctx, bad } = fakeContext();
  let t = 0;
  let frame = 0;
  while (!g.done && t < MAX_SEC) {
    bot(g, t);
    g.update(DT, t);
    if (frame++ % 15 === 0) g.draw(ctx, t);
    t += DT;
  }
  g.draw(ctx, t);
  return { sec: t, sounds, bad };
}

/** Moves a point toward a target at most HAND_SPEED. */
function toward(from: Point, to: Point): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const step = HAND_SPEED * DT;
  if (d <= step) return { ...to };
  return { x: from.x + ((to.x - from.x) / d) * step, y: from.y + ((to.y - from.y) / d) * step };
}

function expectGoodTime(run: Run & { bad: string[] }) {
  // SHOW_TIMES=1 prints how long each good run took, for tuning the numbers in config.
  if (process.env.SHOW_TIMES) console.log(expect.getState().currentTestName, run.sec.toFixed(1));
  expect(run.bad, "draw got a bad number").toEqual([]);
  expect(run.sec, "a good player finishes in time").toBeLessThan(config.tasks.maxSec + 5);
  expect(run.sec, "the server would refuse this finish").toBeGreaterThan(config.tasks.serverMinSec + 0.5);
}

const g = (x: unknown) => x as any; // reach private state in tests

/** A bot hand that follows a target and fires pointer moves. */
function hand(start: Point) {
  let at = { ...start };
  return {
    get at() {
      return at;
    },
    moveTo(game: Minigame, target: Point) {
      at = toward(at, target);
      game.pointerMove?.(at);
    },
    set(p: Point) {
      at = { ...p };
    },
  };
}

const MATCHBOX = { x: 90, y: 345 };

describe.each(SEEDS)("minigames (seed %i)", (seed) => {
  it("candelabra: strike, light each wick, finish in time", () => {
    seedRandom(seed);
    const h = hand(MATCHBOX);
    const run = play(
      (s) => new Candelabra(s),
      (game, t) => {
        const m = g(game).match;
        if (t === 0) return game.pointerDown?.(h.at);
        if (!m.lit) return;
        const wick = g(game).wicks.find((w: { lit: number }) => w.lit < config.tasks.minigames.candelabra.lightSec);
        if (wick) h.moveTo(game, wick);
      },
    );
    expectGoodTime(run);
    expect(run.sounds).toContain("strike");
  });

  it("stove: turn every knob to off, finish in time", () => {
    seedRandom(seed);
    const run = play(
      (s) => new Stove(s),
      (game) => {
        const knobs = g(game).knobs as { x: number; angle: number; off: boolean }[];
        const k = knobs.find((k) => !k.off);
        if (!k) return;
        if (g(game).held === null) game.pointerDown?.({ x: k.x, y: 280 });
        // Lead the knob by 25 degrees toward the off mark, the short way round.
        const a = k.angle > 180 ? k.angle + 25 : Math.max(0, k.angle - 25);
        const r = (a * Math.PI) / 180;
        game.pointerMove?.({ x: k.x + Math.sin(r) * 60, y: 280 - Math.cos(r) * 60 });
      },
    );
    expectGoodTime(run);
  });

  it("clock: click on every tick, finish in time", () => {
    seedRandom(seed);
    const tick = config.tasks.minigames.clock.tickSec;
    let next = tick + 0.05; // a little after each tick, like a person reacting
    const run = play(
      (s) => new Clock(s),
      (game, t) => {
        if (t < next) return;
        next += tick;
        game.pointerDown();
      },
    );
    expectGoodTime(run);
    expect(run.sounds).not.toContain("wrong");
  });

  it("letter: strike, follow the swaying letter, finish in time", () => {
    seedRandom(seed);
    const h = hand(MATCHBOX);
    const run = play(
      (s) => new Letter(s),
      (game, t) => {
        if (t === 0) return game.pointerDown?.(h.at);
        if (!g(game).match.lit) return;
        h.moveTo(game, { x: g(game).letterX(), y: 70 + 120 + 20 });
      },
    );
    expectGoodTime(run);
  });

  it("cradle: rock with the guide, finish in time without crying", () => {
    seedRandom(seed);
    const run = play(
      (s) => new Cradle(s),
      (game) => game.pointerMove?.({ x: 320 + g(game).guide(), y: 200 }),
    );
    expectGoodTime(run);
    expect(run.sounds).not.toContain("cry");
  });

  it("piano: play every line, finish in time", () => {
    seedRandom(seed);
    const PRESS_SEC = 0.6; // find the symbol, then press
    let next = PRESS_SEC;
    const run = play(
      (s) => new Piano(s),
      (game, t) => {
        if (t < next) return;
        next += PRESS_SEC;
        const w = g(game).keyWidth();
        const key = g(game).sequence[g(game).step];
        game.pointerDown?.({ x: 80 + key * w + w / 2, y: 300 });
      },
    );
    expectGoodTime(run);
    expect(run.sounds).not.toContain("badNote");
  });

  it("boiler: steer the needle into the green, finish in time", () => {
    seedRandom(seed);
    const b = config.tasks.minigames.boiler;
    let angle = 0;
    const run = play(
      (s) => new Boiler(s),
      (game, t) => {
        if (t === 0) game.pointerDown?.({ x: 470, y: 160 });
        // Open while the needle is above the green, close while below, gently.
        const p = g(game).pressure;
        const mid = (b.safeMin + b.safeMax) / 2;
        const dir = p > mid + 0.03 ? 1 : p < mid - 0.03 ? -1 : 0;
        angle += dir * b.turnDegPerSec * 0.9 * DT;
        const r = (angle * Math.PI) / 180;
        game.pointerMove?.({ x: 470 + Math.sin(r) * 70, y: 230 - Math.cos(r) * 70 });
      },
    );
    expectGoodTime(run);
  });
});

describe("minigame mistakes", () => {
  it("candelabra and letter: a fast flick puts the match out", () => {
    for (const make of [(s: (k: TaskSoundKind) => void) => new Candelabra(s), (s: (k: TaskSoundKind) => void) => new Letter(s)]) {
      const sounds: TaskSoundKind[] = [];
      const game = make((k) => sounds.push(k));
      game.pointerDown(MATCHBOX);
      for (let t = 0; t < 1; t += DT) game.update(DT);
      expect(g(game).match.lit).toBe(true);
      // A flick across the whole board in a tenth of a second.
      for (let i = 1; i <= 6; i++) {
        game.pointerMove({ x: 90 + i * 90, y: 345 - i * 40 });
        game.update(DT);
      }
      expect(g(game).match.lit).toBe(false);
      expect(sounds).toContain("fizz");
    }
  });

  it("letter: the heat fades when the flame leaves the letter", () => {
    const game = new Letter(() => {});
    g(game).heat = 3;
    for (let t = 0; t < 2; t += DT) game.update(DT);
    expect(g(game).heat).toBeCloseTo(3 - 2 * config.tasks.minigames.letter.coolPerSec, 1);
  });

  it("stove: a knob never turns faster than the limit", () => {
    const game = new Stove(() => {});
    const k = g(game).knobs[0];
    const start = k.angle;
    game.pointerDown({ x: k.x, y: 280 });
    game.pointerMove({ x: k.x, y: 220 }); // straight up: the off mark
    game.update(0.5);
    const turned = Math.abs(((start - k.angle + 540) % 360) - 180);
    expect(turned).toBeLessThanOrEqual(config.tasks.minigames.stove.turnDegPerSec * 0.5 + 0.01);
  });

  it("clock: a click off the beat slips the key back", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Clock((k) => sounds.push(k));
    g(game).turns = 3;
    const tick = config.tasks.minigames.clock.tickSec;
    for (let t = 0; t < tick * 1.5; t += DT) game.update(DT); // halfway between ticks
    game.pointerDown();
    expect(g(game).turns).toBe(2);
    expect(sounds).toContain("wrong");
  });

  it("clock: clicking twice on the same tick counts once", () => {
    const game = new Clock(() => {});
    const tick = config.tasks.minigames.clock.tickSec;
    for (let t = 0; t < tick + 0.02; t += DT) game.update(DT);
    game.pointerDown();
    game.pointerDown();
    expect(g(game).turns).toBeLessThanOrEqual(1);
  });

  it("cradle: rocking too fast makes the baby cry and costs progress", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Cradle((k) => sounds.push(k));
    g(game).progress = 5;
    for (let i = 0; i < 10; i++) {
      game.pointerMove({ x: i % 2 ? 60 : 580, y: 200 });
      game.update(DT);
    }
    expect(sounds).toContain("cry");
    expect(g(game).progress).toBeLessThan(5);
  });

  it("cradle: holding still in the middle does not fill the bar", () => {
    const game = new Cradle(() => {});
    game.pointerMove({ x: 320, y: 200 });
    for (let t = 0; t < 6; t += DT) game.update(DT);
    expect(g(game).progress).toBe(0);
  });

  it("piano: a wrong key rings out and restarts the line", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Piano((k) => sounds.push(k));
    const w = g(game).keyWidth();
    const press = (key: number) => game.pointerDown({ x: 80 + key * w + w / 2, y: 300 });
    press(g(game).sequence[0]);
    expect(g(game).step).toBe(1);
    const wrong = (g(game).sequence[1] + 1) % g(game).keys.length;
    press(wrong);
    expect(g(game).step).toBe(0);
    expect(sounds).toContain("badNote");
  });

  it("boiler: with the valve shut, the needle stays in the red and never finishes", () => {
    const game = new Boiler(() => {});
    for (let t = 0; t < 20; t += DT) game.update(DT);
    expect(g(game).pressure).toBeGreaterThan(config.tasks.minigames.boiler.safeMax);
    expect(game.done).toBe(false);
  });
});
