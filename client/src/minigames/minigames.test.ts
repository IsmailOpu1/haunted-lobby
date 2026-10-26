import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@haunted/shared";
import { Boiler } from "./boiler.ts";
import { Candelabra } from "./candelabra.ts";
import { Clock } from "./clock.ts";
import { Cradle } from "./cradle.ts";
import { Letter } from "./letter.ts";
import { Piano } from "./piano.ts";
import { Dig } from "./dig.ts";
import { Drain } from "./drain.ts";
import { Lockbox } from "./lockbox.ts";
import { Mirror } from "./mirror.ts";
import { Portraits } from "./portraits.ts";
import { Roses } from "./roses.ts";
import { Sheets } from "./sheets.ts";
import { Shutters } from "./shutters.ts";
import { Stove } from "./stove.ts";
import { Switchboard } from "./switchboard.ts";
import { Trunk } from "./trunk.ts";
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

// ---------- The Phase 4 additions: seven more tasks and the three relic games ----------

function expectRelicTime(run: Run & { bad: string[] }) {
  if (process.env.SHOW_TIMES) console.log(expect.getState().currentTestName, run.sec.toFixed(1));
  expect(run.bad, "draw got a bad number").toEqual([]);
  // GDD 10: taking a relic takes 10 to 15 s; a quick, perfect player may beat that a little.
  expect(run.sec, "a good player finishes in time").toBeLessThan(config.relics.extractMaxSec + 5);
  expect(run.sec, "the server would refuse this finish").toBeGreaterThan(config.relics.serverMinSec + 0.5);
}

/** A point that moves along a path at a fixed speed. */
function follower(path: Point[], speed: number) {
  let at = { ...path[0]! };
  let i = 1;
  return () => {
    const target = path[Math.min(i, path.length - 1)]!;
    const d = Math.hypot(target.x - at.x, target.y - at.y);
    const step = speed * DT;
    if (d <= step) {
      at = { ...target };
      i++;
    } else {
      at = { x: at.x + ((target.x - at.x) / d) * step, y: at.y + ((target.y - at.y) / d) * step };
    }
    return at;
  };
}

describe.each(SEEDS)("new minigames (seed %i)", (seed) => {
  it("switchboard: plug each cable into its socket, finish in time", () => {
    seedRandom(seed);
    const h = hand({ x: 110, y: 90 });
    const run = play(
      (s) => new Switchboard(s),
      (game) => {
        const held = g(game).held;
        if (held) {
          const socket = g(game).sockets.find((s: { symbol: string }) => s.symbol === held.symbol);
          return h.moveTo(game, { x: 530, y: socket.y });
        }
        const c = g(game).cables.find((c: { seated: boolean }) => !c.seated);
        if (!c) return;
        if (Math.hypot(h.at.x - c.tip.x, h.at.y - c.tip.y) > 1) return h.moveTo(game, c.tip);
        game.pointerDown?.(h.at);
      },
    );
    expectGoodTime(run);
    expect(run.sounds).not.toContain("spark");
  });

  it("mirror: wipe in steady rows, finish in time", () => {
    seedRandom(seed);
    const path: Point[] = [];
    for (let y = 55; y <= 345; y += 40) path.push(...(path.length % 4 === 0 ? [{ x: 150, y }, { x: 490, y }] : [{ x: 490, y }, { x: 150, y }]));
    const next = follower(path, 280);
    const run = play(
      (s) => new Mirror(s),
      (game, t) => {
        if (t === 0) return game.pointerDown?.(path[0]!);
        game.pointerMove?.(next());
      },
    );
    expectGoodTime(run);
  });

  it("trunk: hold the lid, turn every latch, finish in time", () => {
    seedRandom(seed);
    let angle = 0;
    const run = play(
      (s) => new Trunk(s),
      (game) => {
        if (!g(game).shut) {
          if (g(game).holding !== "lid") game.pointerDown?.({ x: 320, y: 150 });
          return;
        }
        const l = g(game).latches.find((l: { turned: number }) => l.turned < 90);
        if (!l) return;
        if (g(game).holding !== l) {
          angle = 0;
          return game.pointerDown?.({ x: l.x, y: 270 - 25 });
        }
        angle += 40 * DT;
        const r = (angle * Math.PI) / 180;
        game.pointerMove?.({ x: l.x + Math.sin(r) * 25, y: 270 - Math.cos(r) * 25 });
      },
    );
    expectGoodTime(run);
    expect(run.sounds).not.toContain("thud");
  });

  it("sheets: drag each corner onto its mark, finish in time", () => {
    seedRandom(seed);
    const h = hand({ x: 540, y: 340 });
    const run = play(
      (s) => new Sheets(s),
      (game) => {
        const corner = g(game).corner as Point;
        if (!g(game).held) {
          if (Math.hypot(h.at.x - corner.x, h.at.y - corner.y) > 1) return h.moveTo(game, corner);
          return game.pointerDown?.(h.at);
        }
        const t = g(game).target() as Point;
        if (Math.hypot(corner.x - t.x, corner.y - t.y) <= 5) return game.pointerUp();
        h.moveTo(game, t);
      },
    );
    expectGoodTime(run);
  });

  it("roses: fill each vase to the line, finish in time", () => {
    seedRandom(seed);
    const r = config.tasks.minigames.roses;
    const aim = (r.line + r.rim) / 2;
    const h = hand({ x: 320, y: 130 });
    const run = play(
      (s) => new Roses(s),
      (game) => {
        const pouring = g(game).held && g(game).stream;
        // Stop early: the water keeps running for lagSec.
        if (pouring) {
          if (pouring.level + r.lagSec / r.fillSec >= aim) game.pointerUp();
          return;
        }
        const v = g(game).vases.find((v: { level: number }) => v.level < r.line);
        if (!v) return;
        const over = { x: v.x, y: 130 };
        if (Math.hypot(h.at.x - over.x, h.at.y - over.y) > 1) return h.moveTo(game, over);
        if (g(game).runOn > 0) return;
        game.pointerDown?.(h.at);
      },
    );
    expectGoodTime(run);
    expect(run.sounds).not.toContain("wrong");
  });

  it("shutters: drag each one shut and hold it, finish in time", () => {
    seedRandom(seed);
    const h = hand({ x: 320, y: 200 });
    const run = play(
      (s) => new Shutters(s),
      (game) => {
        const s = g(game).shutters.find((s: { latched: boolean }) => !s.latched);
        if (!s) return;
        if (g(game).held !== s) {
          const handle = g(game).handle(s) as Point;
          if (Math.hypot(h.at.x - handle.x, h.at.y - handle.y) > 8) return h.moveTo(game, handle);
          return game.pointerDown?.(h.at);
        }
        h.moveTo(game, { x: s.left + 140, y: 200 });
      },
    );
    expectGoodTime(run);
  });

  it("portraits: level each one (and the haunted one twice), finish in time", () => {
    seedRandom(seed);
    const c = config.tasks.minigames.portraits;
    const h = hand({ x: 320, y: 220 });
    const run = play(
      (s) => new Portraits(s),
      (game) => {
        if (g(game).haunt) return; // wait while it swings back
        const held = g(game).held;
        if (held) {
          if (Math.abs(held.tilt) <= 0.5) return game.pointerUp();
          return h.moveTo(game, { x: g(game).grab.x - g(game).grab.tilt / 0.25, y: h.at.y });
        }
        const p = g(game).portraits.find((p: { level: boolean; tilt: number }) => !p.level && Math.abs(p.tilt) > c.levelDeg);
        if (!p) return;
        const centre = g(game).centre(p) as Point;
        if (Math.hypot(h.at.x - centre.x, h.at.y - centre.y) > 1) return h.moveTo(game, centre);
        game.pointerDown?.(h.at);
      },
    );
    expectGoodTime(run);
    expect(run.sounds).toContain("scare");
  });

  it("lockbox: lift each pin into the band, finish in time", () => {
    seedRandom(seed);
    const lb = config.relics.minigames.lockbox;
    const REACT_SEC = 0.3;
    let next = REACT_SEC;
    const run = play(
      (s) => new Lockbox(s),
      (game, t) => {
        if (!g(game).lifting) {
          if (t >= next) game.pointerDown();
          return;
        }
        if (g(game).lift >= (lb.bandMin + lb.bandMax) / 2) {
          game.pointerUp();
          next = t + REACT_SEC;
        }
      },
    );
    expectRelicTime(run);
    expect(run.sounds).not.toContain("wrong");
  });

  it("dig: steady strokes, finish in time", () => {
    seedRandom(seed);
    const next = follower(
      Array.from({ length: 40 }, (_, i) => ({ x: i % 2 ? 480 : 160, y: 260 })),
      HAND_SPEED,
    );
    const run = play(
      (s) => new Dig(s),
      (game, t) => {
        if (t === 0) return game.pointerDown?.({ x: 160, y: 260 });
        game.pointerMove?.(next());
      },
    );
    expectRelicTime(run);
  });

  it("drain: reach the relic, hold still, pull it up, finish in time", () => {
    seedRandom(seed);
    const run = play(
      (s) => new Drain(s),
      (game, t) => {
        if (t === 0) return game.pointerDown?.({ x: 320, y: 60 });
        // This bot already knows where the relic is; a real player has to feel for it.
        if (g(game).pullFrom === null) return game.pointerMove?.(g(game).relic);
        game.pointerMove?.({ x: g(game).hand.x, y: g(game).hand.y - 50 });
      },
    );
    expectRelicTime(run);
  });
});

describe("new minigame mistakes", () => {
  it("switchboard: a wrong socket sparks and throws the cable back", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Switchboard((k) => sounds.push(k));
    const c = g(game).cables[0];
    const wrong = g(game).sockets.find((s: { symbol: string }) => s.symbol !== c.symbol);
    game.pointerDown({ ...c.tip });
    game.pointerMove({ x: 530, y: wrong.y });
    game.update(DT);
    expect(sounds).toContain("spark");
    expect(c.tip).toEqual({ x: 110, y: c.y });
    expect(g(game).held).toBeNull();
  });

  it("switchboard: letting go before it seats drops the cable back", () => {
    const game = new Switchboard(() => {});
    const c = g(game).cables[0];
    const socket = g(game).sockets.find((s: { symbol: string }) => s.symbol === c.symbol);
    game.pointerDown({ ...c.tip });
    game.pointerMove({ x: 530, y: socket.y });
    game.update(config.tasks.minigames.switchboard.seatSec / 2);
    game.pointerUp();
    expect(c.seated).toBe(false);
    expect(c.tip.x).toBe(110);
  });

  it("mirror: a fast wipe only smears", () => {
    const game = new Mirror(() => {});
    game.pointerDown({ x: 150, y: 200 });
    for (let i = 1; i <= 10; i++) {
      game.pointerMove({ x: i % 2 ? 490 : 150, y: 200 });
      game.update(DT);
    }
    expect(g(game).clearPct()).toBe(0);
  });

  it("trunk: leave the latches too long and the lid bursts open", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Trunk((k) => sounds.push(k));
    game.pointerDown({ x: 320, y: 150 });
    for (let t = 0; t < config.tasks.minigames.trunk.pressSec + DT; t += DT) game.update(DT);
    expect(g(game).shut).toBe(true);
    game.pointerUp();
    for (let t = 0; t < config.tasks.minigames.trunk.popSec + DT; t += DT) game.update(DT);
    expect(g(game).shut).toBe(false);
    expect(sounds).toContain("thud");
  });

  it("trunk: letting go of the lid early starts the press again", () => {
    const game = new Trunk(() => {});
    game.pointerDown({ x: 320, y: 150 });
    game.update(1);
    game.pointerUp();
    expect(g(game).pressed).toBe(0);
  });

  it("sheets: letting go short of the mark drops the corner back", () => {
    const game = new Sheets(() => {});
    const start = { ...g(game).corner };
    game.pointerDown(start);
    game.pointerMove({ x: 300, y: start.y });
    game.update(1);
    game.pointerUp();
    expect(g(game).folds).toBe(0);
    expect(g(game).corner).toEqual(start);
  });

  it("sheets: the corner never moves faster than the limit", () => {
    const game = new Sheets(() => {});
    const start = { ...g(game).corner };
    game.pointerDown(start);
    game.pointerMove({ x: 100, y: start.y });
    game.update(0.5);
    expect(start.x - g(game).corner.x).toBeCloseTo(config.tasks.minigames.sheets.dragUnitsPerSec * 0.5, 3);
  });

  it("roses: overflowing a vase empties it", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Roses((k) => sounds.push(k));
    const v = g(game).vases[0];
    game.pointerDown({ x: v.x, y: 130 });
    for (let t = 0; t < config.tasks.minigames.roses.fillSec * 1.2; t += DT) game.update(DT);
    expect(sounds).toContain("wrong");
    expect(v.level).toBeLessThan(config.tasks.minigames.roses.line);
  });

  it("roses: water keeps running after you stop", () => {
    const r = config.tasks.minigames.roses;
    const game = new Roses(() => {});
    const v = g(game).vases[0];
    game.pointerDown({ x: v.x, y: 130 });
    game.update(1);
    game.pointerUp();
    const before = v.level;
    for (let t = 0; t < 1; t += DT) game.update(DT);
    expect(v.level - before).toBeCloseTo(r.lagSec / r.fillSec, 1);
  });

  it("shutters: let go early and the wind throws it open", () => {
    const game = new Shutters(() => {});
    const s = g(game).shutters[0];
    s.open = 0;
    game.pointerDown(g(game).handle(s));
    game.update(config.tasks.minigames.shutters.latchSec / 2);
    game.pointerUp();
    for (let t = 0; t < 1; t += DT) game.update(DT);
    expect(s.latched).toBe(false);
    expect(s.latch).toBe(0);
    expect(s.open).toBeGreaterThan(0.2);
  });

  it("portraits: the haunted one swings back only once", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Portraits((k) => sounds.push(k));
    for (let round = 0; round < 2; round++) {
      for (const p of g(game).portraits) p.tilt = 0;
      for (let t = 0; t < 3; t += DT) game.update(DT);
    }
    expect(sounds.filter((s) => s === "scare")).toHaveLength(1);
    expect(game.done).toBe(true);
  });

  it("lockbox: letting go outside the band drops the pin", () => {
    const sounds: TaskSoundKind[] = [];
    const game = new Lockbox((k) => sounds.push(k));
    game.pointerDown();
    game.update(0.2);
    game.pointerUp();
    expect(g(game).set).toBe(0);
    expect(sounds).toContain("wrong");
  });

  it("lockbox: holding too long pushes the pin past the top", () => {
    const game = new Lockbox(() => {});
    game.pointerDown();
    for (let t = 0; t < config.relics.minigames.lockbox.riseSec + 0.1; t += DT) game.update(DT);
    expect(g(game).lifting).toBe(false);
    expect(g(game).lift).toBe(0);
  });

  it("dig: frantic strokes dig no faster than the limit", () => {
    const game = new Dig(() => {});
    game.pointerDown({ x: 160, y: 260 });
    for (let i = 1; i <= 60; i++) {
      game.pointerMove({ x: i % 2 ? 480 : 160, y: 260 });
      game.update(DT);
    }
    expect(g(game).dug).toBeLessThanOrEqual(config.relics.minigames.dig.maxUnitsPerSec * 60 * DT + 0.01);
  });

  it("drain: letting go while pulling lets the relic slip back", () => {
    const game = new Drain(() => {});
    g(game).hand = { ...g(game).relic };
    game.pointerDown({ ...g(game).relic });
    for (let t = 0; t < config.relics.minigames.drain.grabSec + DT; t += DT) game.update(DT);
    expect(g(game).pullFrom).not.toBeNull();
    game.pointerMove({ x: g(game).hand.x, y: 0 });
    game.update(0.5);
    game.pointerUp();
    expect(g(game).pulled).toBe(0);
    expect(g(game).pullFrom).toBeNull();
  });

  it("drain: moving the hand fast never grips", () => {
    const game = new Drain(() => {});
    const r = g(game).relic;
    g(game).hand = { ...r };
    game.pointerDown(r);
    for (let i = 0; i < 300; i++) {
      game.pointerMove({ x: r.x + (i % 2 ? 40 : -40), y: r.y });
      game.update(DT);
    }
    expect(g(game).grip).toBeLessThan(config.relics.minigames.drain.grabSec);
  });
});
