import { describe, expect, it } from "vitest";
import { config } from "@haunted/shared";
import type { TaskSoundKind } from "./sounds.ts";
import { BoilerLogic, CandelabraLogic, ClockLogic, clockText, clueTime, CradleLogic, DigLogic, DrainLogic, type FacePoint, type JugAction, type JugPuzzle, LetterLogic, LockboxLogic, MatchLogic, MirrorLogic, PianoLogic, PortraitsLogic, RosesLogic, SheetsLogic, ShuttersLogic, StoveLogic, SwitchboardLogic, TrunkLogic } from "./logic.ts";

// The hands-on tasks (GDD 26.5): each one is played here by a simulated steady player, who
// must finish in the GDD's time, and by careless ones, who must pay for it.

const DT = 1 / 60;
const hands = config.tasks.hands;

function sounds() {
  const heard: TaskSoundKind[] = [];
  return { heard, play: (k: TaskSoundKind) => heard.push(k) };
}

/** Runs until done or the time runs out; returns the seconds taken. */
function run(step: (t: number) => void, done: () => boolean, maxSec = 60): number {
  let t = 0;
  while (!done() && t < maxSec) {
    step(t);
    t += DT;
  }
  return t;
}

describe("candelabra", () => {
  it("needs a sharp flick to strike: a weak one only sparks", () => {
    const s = sounds();
    const game = new CandelabraLogic(s.play);
    // 400 px/s down: too slow even to spark.
    for (let i = 0; i < 10; i++) game.update(DT, { wick: null, holding: true, dragY: 400 * DT, lookSpeed: 0 });
    expect(game.matchLit).toBe(false);
    expect(s.heard).toEqual([]);
    // 900 px/s: sparks.
    for (let i = 0; i < 10; i++) game.update(DT, { wick: null, holding: true, dragY: 900 * DT, lookSpeed: 0 });
    expect(game.matchLit).toBe(false);
    expect(s.heard).toContain("spark");
    // 2000 px/s: strikes.
    for (let i = 0; i < 10; i++) game.update(DT, { wick: null, holding: true, dragY: 2000 * DT, lookSpeed: 0 });
    expect(game.matchLit).toBe(true);
    expect(s.heard).toContain("strike");
  });

  it("lights every wick for a steady player in 10 to 20 seconds", () => {
    const game = new CandelabraLogic(() => {});
    let wick = 0;
    let moving = 0;
    const t = run(
      () => {
        if (!game.matchLit) {
          // Strike a new match.
          game.update(DT, { wick: null, holding: true, dragY: 2000 * DT, lookSpeed: 0 });
          return;
        }
        if (game.lit[wick]) {
          // Carry the flame to the next wick (a slow turn of the view).
          wick += 1;
          moving = 0.3;
        }
        moving -= DT;
        game.update(DT, { wick: moving > 0 ? null : wick, holding: false, dragY: 0, lookSpeed: 1 });
      },
      () => game.done,
    );
    expect(game.done).toBe(true);
    expect(t).toBeGreaterThanOrEqual(config.tasks.minSec);
    expect(t).toBeLessThanOrEqual(config.tasks.maxSec);
  });

  it("blows the match out when you turn too fast, and makes you wait for a new one", () => {
    const s = sounds();
    const game = new CandelabraLogic(s.play);
    for (let i = 0; i < 6; i++) game.update(DT, { wick: null, holding: true, dragY: 2000 * DT, lookSpeed: 0 });
    expect(game.matchLit).toBe(true);
    game.update(DT, { wick: null, holding: false, dragY: 0, lookSpeed: hands.match.outRadPerSec + 1 });
    expect(game.matchLit).toBe(false);
    expect(s.heard).toContain("fizz");
    // Striking straight away does nothing.
    for (let i = 0; i < 6; i++) game.update(DT, { wick: null, holding: true, dragY: 2000 * DT, lookSpeed: 0 });
    expect(game.matchLit).toBe(false);
  });

  it("strikes with a quick flick even when frames come between the mouse moves", () => {
    const game = new CandelabraLogic(() => {});
    // A fast screen draws twice per mouse event: every other frame has no movement.
    for (let i = 0; i < 8; i++) game.update(DT, { wick: null, holding: true, dragY: i % 2 ? 0 : 4000 * DT, lookSpeed: 0 });
    expect(game.matchLit).toBe(true);
  });

  it("lets a wick cool if the flame leaves it before it catches", () => {
    const game = new CandelabraLogic(() => {});
    for (let i = 0; i < 6; i++) game.update(DT, { wick: null, holding: true, dragY: 2000 * DT, lookSpeed: 0 });
    for (let t = 0; t < hands.candelabra.lightSec * 0.8; t += DT) game.update(DT, { wick: 0, holding: false, dragY: 0, lookSpeed: 0 });
    const warm = game.heat[0]!;
    for (let t = 0; t < 0.5; t += DT) game.update(DT, { wick: null, holding: false, dragY: 0, lookSpeed: 0 });
    expect(game.heat[0]).toBeLessThan(warm);
    expect(game.lit[0]).toBe(false);
  });
});

describe("shutters", () => {
  /** A steady player: pulls each shutter shut and holds it, pulling harder in a gust. */
  function steady(game: ShuttersLogic) {
    let held = 0;
    return () => {
      while (held < game.latched.length && game.latched[held]) held += 1;
      if (held >= game.latched.length) return;
      const speed = game.open[held]! > 0 ? 300 : game.gusting ? 200 : 0;
      game.update(DT, { held, dragX: speed * DT });
    };
  }

  it("closes all three for a steady player in 10 to 20 seconds", () => {
    let seed = 0.37;
    const random = () => (seed = (seed * 9301 + 0.4927) % 1);
    const game = new ShuttersLogic(() => {}, () => {}, random);
    const t = run(steady(game), () => game.done);
    expect(game.done).toBe(true);
    expect(t).toBeGreaterThanOrEqual(config.tasks.minSec);
    expect(t).toBeLessThanOrEqual(config.tasks.maxSec);
  });

  it("whistles before a gust, and the gust pulls on the shutter you hold", () => {
    const s = sounds();
    const game = new ShuttersLogic(s.play, () => {}, () => 0);
    // Hold shutter 0 nearly shut without pulling, through the whistle and the gust.
    game.update(DT, { held: 0, dragX: hands.shutters.pxToClose * 0.8 });
    const before = game.open[0]!;
    run(() => game.update(DT, { held: 0, dragX: 0 }), () => game.gusting);
    expect(s.heard).toContain("whistle");
    for (let t = 0; t < 0.5; t += DT) game.update(DT, { held: 0, dragX: 0 });
    expect(game.open[0]).toBeGreaterThan(before);
  });

  it("slams open with a noise when you let go nearly shut", () => {
    const s = sounds();
    let noises = 0;
    const game = new ShuttersLogic(s.play, () => (noises += 1), () => 0.99);
    game.update(DT, { held: 1, dragX: hands.shutters.pxToClose * 0.9 });
    expect(game.open[1]).toBeLessThan(hands.shutters.slamBelow);
    game.update(DT, { held: null, dragX: 0 });
    expect(game.open[1]).toBe(1);
    expect(s.heard).toContain("bang");
    expect(noises).toBe(1);
  });

  it("does not latch until held shut long enough", () => {
    const game = new ShuttersLogic(() => {}, () => {}, () => 0.99);
    game.update(DT, { held: 2, dragX: hands.shutters.pxToClose });
    for (let t = 0; t < hands.shutters.latchSec / 2; t += DT) game.update(DT, { held: 2, dragX: 0 });
    expect(game.latched[2]).toBe(false);
    for (let t = 0; t < hands.shutters.latchSec; t += DT) game.update(DT, { held: 2, dragX: 0 });
    expect(game.latched[2]).toBe(true);
  });
});

describe("stove", () => {
  it("turns off every knob for a steady player in 10 to 20 seconds", () => {
    const game = new StoveLogic(() => {}, () => 0.5);
    let knob = 0;
    const t = run(
      () => {
        if (game.inNotch[knob]) {
          // Wait for the flame to die, then move to the next knob.
          if (game.flame[knob] === 0 && knob < game.angle.length - 1) knob += 1;
          game.update(DT, { held: knob, dragX: 0 });
          return;
        }
        // Turn toward off at 100 degrees a second.
        const px = (-Math.sign(game.angle[knob]!) * 100 * DT) / hands.stove.degPerPx;
        game.update(DT, { held: knob, dragX: px });
      },
      () => game.done,
    );
    expect(game.done).toBe(true);
    expect(t).toBeGreaterThanOrEqual(config.tasks.minSec);
    expect(t).toBeLessThanOrEqual(config.tasks.maxSec);
  });

  it("slips past the notch with a hiss when turned fast", () => {
    const s = sounds();
    const game = new StoveLogic(s.play, () => 0);
    const start = game.angle[0]!;
    const fast = ((hands.stove.catchDegPerSec * 3) * DT) / hands.stove.degPerPx;
    run(() => game.update(DT, { held: 0, dragX: -fast }), () => game.angle[0]! < 0, 10);
    expect(start).toBeGreaterThan(0);
    expect(game.inNotch[0]).toBe(false);
    expect(game.flame[0]).toBe(1);
    expect(s.heard).toContain("hiss");
  });

  it("clicks into the notch when slow, and a firm push takes it out again", () => {
    const s = sounds();
    const game = new StoveLogic(s.play, () => 0);
    const slow = ((hands.stove.catchDegPerSec / 2) * DT) / hands.stove.degPerPx;
    run(() => game.update(DT, { held: 0, dragX: -slow }), () => game.inNotch[0]!, 10);
    expect(s.heard).toContain("click");
    expect(game.angle[0]).toBe(0);
    // A small nudge stays in the notch; a bigger one leaves it.
    game.update(DT, { held: 0, dragX: (hands.stove.detentDeg / 2) / hands.stove.degPerPx });
    expect(game.inNotch[0]).toBe(true);
    game.update(DT, { held: 0, dragX: hands.stove.detentDeg / hands.stove.degPerPx });
    expect(game.inNotch[0]).toBe(false);
    expect(game.flame[0]).toBe(1);
  });
});

describe("digging for a relic", () => {
  const dig = config.relics.hands.dig;

  it("takes a few seconds to search a place at a steady pace", () => {
    const game = new DigLogic(() => {}, () => {});
    const t = run(() => game.update(DT, { onSoil: true, holding: true, dragY: 500 * DT }), () => game.done);
    expect(t).toBeGreaterThan(config.relics.search.serverMinSec);
    expect(t).toBeLessThan(5);
    expect(game.found).toBe(false);
  });

  it("keeps digging once the relic is found, taking 10 to 15 seconds in all", () => {
    const game = new DigLogic(() => {}, () => {});
    let t = run(() => game.update(DT, { onSoil: true, holding: true, dragY: 500 * DT }), () => game.done);
    game.setFound();
    expect(game.done).toBe(false);
    t += run(() => game.update(DT, { onSoil: true, holding: true, dragY: 500 * DT }), () => game.done);
    expect(t).toBeGreaterThanOrEqual(config.relics.extractMinSec);
    expect(t).toBeLessThanOrEqual(config.relics.extractMaxSec);
  });

  it("is no faster when frantic, and throws soil about", () => {
    let noises = 0;
    const game = new DigLogic(() => {}, () => (noises += 1));
    // A second of scooping at 5000 px/s counts little more than a steady second.
    for (let i = 0; i < 60; i++) game.update(DT, { onSoil: true, holding: true, dragY: 5000 * DT });
    const burst = dig.maxPxPerSec * 0.2;
    expect(game.dug).toBeLessThan(burst + dig.maxPxPerSec + (5000 - dig.maxPxPerSec) * dig.fastFactor + 0.01);
    // Noisy from the moment the steady allowance runs out.
    expect(noises).toBeGreaterThan(45);
    // The quickest anyone can search is longer than the server's limit.
    expect(dig.searchPx / dig.maxPxPerSec).toBeGreaterThan(config.relics.search.serverMinSec);
    expect((dig.searchPx + dig.takePx) / dig.maxPxPerSec).toBeGreaterThan(config.relics.serverMinSec);
  });

  it("stays quiet at a steady pace even when mouse moves bunch up between frames", () => {
    let noises = 0;
    const game = new DigLogic(() => {}, () => (noises += 1));
    // 500 px/s, but every other frame gets two frames' worth of movement.
    for (let i = 0; i < 120; i++) game.update(DT, { onSoil: true, holding: true, dragY: i % 2 ? 0 : 1000 * DT });
    expect(noises).toBe(0);
  });

  it("only digs while holding the trowel in the soil and moving down", () => {
    const game = new DigLogic(() => {}, () => {});
    game.update(DT, { onSoil: false, holding: true, dragY: 10 });
    game.update(DT, { onSoil: true, holding: false, dragY: 10 });
    game.update(DT, { onSoil: true, holding: true, dragY: -10 });
    expect(game.dug).toBe(0);
  });
});

/** The GDD's time for a task (10 to 20 s), but no faster than the server accepts. */
function inTaskTime(t: number) {
  expect(t).toBeGreaterThanOrEqual(config.tasks.serverMinSec);
  expect(t).toBeLessThanOrEqual(config.tasks.maxSec);
}

/** Strikes the match in hand: a sharp flick over a few frames. */
function strike(match: MatchLogic) {
  for (let i = 0; i < 6 && !match.lit; i++) match.update(DT, { holding: true, dragY: 2000 * DT, lookSpeed: 0 });
}

describe("letter", () => {
  it("burns when a steady hand keeps the flame under it", () => {
    const game = new LetterLogic(() => {}, () => 0.3);
    const t = run(
      () => {
        if (!game.match.lit && !game.caught) strike(game.match);
        game.update(DT, { under: true, holding: false, dragY: 0, lookSpeed: 0.3 });
      },
      () => game.done,
    );
    inTaskTime(t);
  });

  it("cools when the flame keeps slipping away from the swaying letter", () => {
    const game = new LetterLogic(() => {}, () => 0.3);
    let frame = 0;
    run(
      () => {
        if (!game.match.lit) strike(game.match);
        game.update(DT, { under: frame++ % 60 < 30, holding: false, dragY: 0, lookSpeed: 0.3 });
      },
      () => game.done,
      config.tasks.maxSec,
    );
    expect(game.done).toBe(false);
  });

  it("sways in the draught", () => {
    const game = new LetterLogic(() => {}, () => 0);
    const seen = new Set<number>();
    for (let i = 0; i < 120; i++) {
      game.update(DT, { under: false, holding: false, dragY: 0, lookSpeed: 0 });
      seen.add(Math.round(game.sway * 100));
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(hands.letter.swayM * 100);
  });
});

describe("boiler", () => {
  const b = hands.boiler;
  /** Where the needle settles in the middle of the safe band. */
  const target = ((b.startPressure - (b.safeMin + b.safeMax) / 2) / b.dropFullOpen) * b.maxOpenDeg;

  it("settles in the safe band when the wheel is turned to the right place", () => {
    const game = new BoilerLogic(() => {});
    const t = run(() => game.update(DT, { holding: true, dragX: (target - game.openDeg) / b.degPerPx }), () => game.done);
    inTaskTime(t);
  });

  it("drops out of the band when the valve is thrown wide open", () => {
    const game = new BoilerLogic(() => {});
    run(() => game.update(DT, { holding: true, dragX: 50 }), () => game.done, config.tasks.maxSec);
    expect(game.done).toBe(false);
    expect(game.pressure).toBeLessThan(b.safeMin);
  });
});

describe("portraits", () => {
  /** A steady player: levels each crooked portrait in turn and lets go when it is level. */
  function steady(game: PortraitsLogic) {
    const i = game.level.findIndex((l) => !l);
    const tilt = game.tilt[i]!;
    const held = Math.abs(tilt) > 0.5 ? i : null;
    game.update(DT, { held, dragX: held === null ? 0 : -Math.sign(tilt) * Math.min(Math.abs(tilt), 3) / hands.portraits.degPerPx });
  }

  it("straightens all three, even the haunted one, in the task's time", () => {
    for (const random of [() => 0, () => 0.99, Math.random]) {
      const s = sounds();
      const game = new PortraitsLogic(s.play, random);
      const t = run(() => steady(game), () => game.done);
      inTaskTime(t);
      expect(s.heard).toContain("thud");
    }
  });

  it("does not settle while it hangs crooked", () => {
    const game = new PortraitsLogic(() => {}, () => 0.5);
    for (let i = 0; i < 600; i++) game.update(DT, { held: null, dragX: 0 });
    expect(game.level.some(Boolean)).toBe(false);
  });
});

/** The GDD's time for taking a relic from a single spot, but no faster than the server accepts. */
function inRelicTime(t: number) {
  expect(t).toBeGreaterThanOrEqual(config.relics.serverMinSec);
  expect(t).toBeLessThanOrEqual(config.relics.extractMaxSec);
}

/** A repeatable random number source for a given seed. */
function seeded(seed: number): () => number {
  let x = seed * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** The pixels to move the mouse this frame to move a point toward `to` at `mPerSec`. */
function toward(from: FacePoint, to: FacePoint, mPerSec: number, mPerPx: number) {
  const du = to.u - from.u;
  const dv = to.v - from.v;
  const d = Math.hypot(du, dv);
  const step = Math.min(d, mPerSec * DT);
  if (d === 0) return { dragX: 0, dragY: 0 };
  return { dragX: ((du / d) * step) / mPerPx, dragY: ((-dv / d) * step) / mPerPx };
}

describe("switchboard", () => {
  const sw = hands.switchboard;
  const hooks = [0, 1, 2, 3].map((i) => ({ u: -0.18 + i * 0.12, v: -0.2 }));
  const sockets = [0, 1, 2, 3].map((i) => ({ u: -0.18 + i * 0.12, v: 0.2 }));

  it("plugs every cable into its own socket", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = sounds();
      const game = new SwitchboardLogic(s.play, hooks, sockets, seeded(seed));
      let held: number | null = null;
      let reach = 0;
      const t = run(
        () => {
          const next = game.plugged.findIndex((p) => !p);
          // A moment to reach for the next plug once the last one seated.
          if (held !== next) {
            held = null;
            reach += DT;
            if (reach < 0.4) return game.update(DT, { held: null, dragX: 0, dragY: 0 });
            reach = 0;
            held = next;
          }
          const drag = toward(game.plug[next]!, sockets[game.socketOf[next]!]!, 0.4, sw.mPerPx);
          game.update(DT, { held, ...drag });
        },
        () => game.done,
      );
      inTaskTime(t);
      expect(s.heard).not.toContain("spark");
    }
  });

  it("sparks and throws the plug back from the wrong socket", () => {
    const s = sounds();
    const game = new SwitchboardLogic(s.play, hooks, sockets, seeded(3));
    const wrong = sockets[(game.socketOf[0]! + 1) % 4]!;
    run(() => game.update(DT, { held: 0, ...toward(game.plug[0]!, wrong, 0.4, sw.mPerPx) }), () => s.heard.length > 0, 5);
    expect(s.heard).toEqual(["spark"]);
    expect(game.plug[0]).toEqual(hooks[0]);
    // Still holding the button: the plug stays on its hook until you let go and grab again.
    game.update(DT, { held: 0, dragX: 0, dragY: -100 });
    expect(game.plug[0]).toEqual(hooks[0]);
  });

  it("drops a plug back on its hook when you let go before it seats", () => {
    const game = new SwitchboardLogic(() => {}, hooks, sockets, seeded(2));
    const right = sockets[game.socketOf[1]!]!;
    run(() => game.update(DT, { held: 1, ...toward(game.plug[1]!, right, 0.4, sw.mPerPx) }), () => game.seat > 0, 5);
    game.update(DT, { held: null, dragX: 0, dragY: 0 });
    expect(game.plugged[1]).toBe(false);
    expect(game.plug[1]).toEqual(hooks[1]);
  });
});

describe("mirror", () => {
  const m = hands.mirror;

  /** Wipes in rows from the bottom up at a steady speed. */
  function wiper(speed: number) {
    const rows = [-0.4, -0.25, -0.1, 0.05, 0.2, 0.35, 0.45];
    const path: FacePoint[] = [];
    rows.forEach((v, i) => {
      const left = { u: -0.3, v };
      const right = { u: 0.3, v };
      path.push(...(i % 2 === 0 ? [left, right] : [right, left]));
    });
    let at = 0;
    return (game: MirrorLogic) => {
      const target = path[Math.min(at, path.length - 1)]!;
      const from = game.cloth ?? path[0]!;
      if (game.cloth && Math.hypot(target.u - from.u, target.v - from.v) < 1e-6) at += 1;
      game.update(DT, { grab: path[0]!, holding: true, ...toward(from, target, speed, m.mPerPx) });
    };
  }

  it("comes clean with steady wiping", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = sounds();
      const game = new MirrorLogic(s.play, seeded(seed));
      const wipe = wiper(0.3);
      const t = run(() => wipe(game), () => game.done);
      inTaskTime(t);
      expect(s.heard).not.toContain("scrape");
    }
  });

  it("only smears when you scrub too fast", () => {
    const s = sounds();
    const game = new MirrorLogic(s.play, () => 0.9);
    const wipe = wiper(m.maxMPerSec * 2);
    run(() => wipe(game), () => false, 5);
    expect(game.clearPct).toBeLessThan(10);
    expect(s.heard).toContain("scrape");
  });

  it("sometimes shows a face once it is half clear", () => {
    const s = sounds();
    const game = new MirrorLogic(s.play, () => 0);
    const wipe = wiper(0.3);
    run(() => wipe(game), () => game.done);
    expect(s.heard.filter((k) => k === "scare")).toHaveLength(1);
    const quiet = sounds();
    const plain = new MirrorLogic(quiet.play, () => 0.99);
    const wipe2 = wiper(0.3);
    run(() => wipe2(plain), () => plain.done);
    expect(quiet.heard).not.toContain("scare");
  });
});

describe("trunk", () => {
  const tr = hands.trunk;

  function steady(game: TrunkLogic, rest = { left: 0 }) {
    if (!game.shut) return game.update(DT, { onLid: true, latch: null, dragX: 0, dragY: 400 * DT });
    const next = game.latch.findIndex((l) => l < 90);
    // Half a second to move the hand to the next latch.
    if (rest.left > 0 || (next > 0 && game.latch[next] === 0 && game.popLeft === tr.popSec)) {
      rest.left = rest.left > 0 ? rest.left - DT : 0.5;
      return game.update(DT, { onLid: false, latch: null, dragX: 0, dragY: 0 });
    }
    game.update(DT, { onLid: false, latch: next, dragX: 80 * DT, dragY: 0 });
  }

  it("shuts with the lid held down and every latch turned", () => {
    const s = sounds();
    const game = new TrunkLogic(s.play);
    const rest = { left: 0 };
    const t = run(() => steady(game, rest), () => game.done);
    inTaskTime(t);
    expect(s.heard).not.toContain("thud");
  });

  it("springs open again if you let go of the lid too soon", () => {
    const game = new TrunkLogic(() => {});
    run(() => game.update(DT, { onLid: true, latch: null, dragX: 0, dragY: 400 * DT }), () => false, tr.pressSec / 2);
    run(() => game.update(DT, { onLid: false, latch: null, dragX: 0, dragY: 0 }), () => false, 1);
    expect(game.lid).toBe(1);
    expect(game.shut).toBe(false);
  });

  it("bursts open if you dawdle between latches", () => {
    const s = sounds();
    const game = new TrunkLogic(s.play);
    run(() => steady(game), () => game.shut);
    run(() => game.update(DT, { onLid: false, latch: null, dragX: 0, dragY: 0 }), () => false, tr.popSec + 0.1);
    expect(s.heard).toContain("thud");
    expect(game.shut).toBe(false);
    expect(game.lid).toBe(1);
  });
});

describe("sheets", () => {
  const sh = hands.sheets;

  it("folds three times with steady pulls", () => {
    const s = sounds();
    const game = new SheetsLogic(s.play);
    const t = run(
      () => {
        const px = 200 * DT;
        game.update(DT, { held: true, dragX: game.towardYou ? 0 : -px, dragY: game.towardYou ? px : 0 });
      },
      () => game.done,
    );
    inTaskTime(t);
    expect(s.heard.filter((k) => k === "thud")).toHaveLength(sh.folds);
  });

  it("only folds the way the fold goes, no faster than a steady pull", () => {
    const game = new SheetsLogic(() => {});
    game.update(DT, { held: true, dragX: -1000, dragY: 0 });
    expect(game.progress).toBe(0);
    run(() => game.update(DT, { held: true, dragX: 0, dragY: 1000 }), () => false, 1);
    expect(game.folds).toBe(0);
    expect(game.progress).toBeLessThanOrEqual(sh.maxPerSec * 1.2 + 0.01);
  });

  it("counts mouse movement that arrives unevenly between frames", () => {
    const game = new SheetsLogic(() => {});
    // A steady pull, but the mouse only reports every third frame.
    let k = 0;
    const t = run(() => game.update(DT, { held: true, dragX: 0, dragY: k++ % 3 === 0 ? 3 * 170 * DT : 0 }), () => game.folds > 0, 10);
    expect(t).toBeLessThan(sh.snapAt / sh.maxPerSec + 0.3);
  });

  it("slides back when you let go short of the fold", () => {
    const game = new SheetsLogic(() => {});
    run(() => game.update(DT, { held: true, dragX: 0, dragY: 200 * DT }), () => game.progress > 0.8, 5);
    run(() => game.update(DT, { held: false, dragX: 0, dragY: 0 }), () => false, 1);
    expect(game.progress).toBe(0);
    expect(game.folds).toBe(0);
  });
});

describe("cradle", () => {
  const cr = hands.cradle;

  /** Pushes gently with the swing whenever it gets low. */
  function steady(game: CradleLogic) {
    const push = game.amplitude < 0.2 ? (game.speed >= 0 ? 1 : -1) * 250 * DT : 0;
    game.update(DT, { held: true, dragX: push });
  }

  it("rocks the baby to sleep with gentle pushes in time with the swing", () => {
    const s = sounds();
    let noise = 0;
    const game = new CradleLogic(s.play, () => noise++);
    const t = run(() => steady(game), () => game.done);
    inTaskTime(t);
    expect(noise).toBe(0);
  });

  it("makes the baby cry, which the ghost hears, if you shove it", () => {
    const s = sounds();
    let noise = 0;
    const game = new CradleLogic(s.play, () => noise++);
    run(() => game.update(DT, { held: true, dragX: 2500 * DT }), () => false, 0.3);
    expect(s.heard).toContain("cry");
    expect(noise).toBeGreaterThan(0);
  });

  it("makes the baby cry if it swings too high, and takes calm away", () => {
    let noise = 0;
    const game = new CradleLogic(() => {}, () => noise++);
    run(() => steady(game), () => game.calm > 4);
    const calm = game.calm;
    run(() => game.update(DT, { held: true, dragX: (game.speed >= 0 ? 1 : -1) * 600 * DT }), () => noise > 0, 5);
    expect(noise).toBe(1);
    expect(game.calm).toBeLessThan(calm);
  });

  it("does not calm while it barely swings", () => {
    const game = new CradleLogic(() => {}, () => {});
    run(() => game.update(DT, { held: false, dragX: 0 }), () => false, 5);
    expect(game.calm).toBe(0);
    expect(cr.minAmpRad).toBeGreaterThan(0);
  });
});

describe("lockbox", () => {
  const lb = config.relics.hands.lockbox;

  /** Turns the dial slowly toward the next pin, the way the pins go. */
  function steady(game: LockboxLogic, degPerSec = 60) {
    const right = game.set % 2 === 0;
    game.update(DT, { held: true, dragX: ((right ? 1 : -1) * degPerSec * DT) / lb.degPerPx });
  }

  it("opens with the dial turned slowly right, left, right, left", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = sounds();
      const game = new LockboxLogic(s.play, seeded(seed));
      const t = run(() => steady(game), () => game.done);
      inRelicTime(t);
      expect(s.heard.filter((k) => k === "click")).toHaveLength(lb.pins);
      expect(s.heard).toContain("tick");
    }
  });

  it("is stiff: a wild drag turns it no faster, still sets every pin, and still takes relic time", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const game = new LockboxLogic(() => {}, seeded(seed));
      let last = game.dial;
      const t = run(() => {
        steady(game, lb.maxDegPerSec * 10);
        expect(Math.abs(game.dial - last)).toBeLessThanOrEqual(lb.maxDegPerSec * 0.2 + 1e-9);
        last = game.dial;
      }, () => game.done);
      inRelicTime(t);
    }
  });

  it("will not turn the wrong way past the last pin set", () => {
    const game = new LockboxLogic(() => {}, seeded(2));
    const back = (sign: number) => run(() => game.update(DT, { held: true, dragX: (sign * 60 * DT) / lb.degPerPx }), () => false, 3);
    back(-1);
    expect(game.dial).toBe(0);
    run(() => steady(game), () => game.set === 1);
    back(1); // the second pin is to the left: right is the wrong way now
    expect(game.dial).toBe(game.pins[0]);
  });
});

describe("drain", () => {
  const dr = config.relics.hands.drain;

  it("hides the relic away from the middle, so you must feel about for it", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new DrainLogic(() => {}, seeded(seed));
      const r = Math.hypot(game.relic.u, game.relic.v);
      expect(r).toBeGreaterThanOrEqual(dr.relicMinM);
      expect(r).toBeLessThanOrEqual(dr.sizeM / 2);
    }
  });

  it("is pulled up by following the ripples, holding still and pulling", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = sounds();
      const game = new DrainLogic(s.play, seeded(seed));
      // A moment feeling about before the ripples lead the hand to it.
      let feel = 1.5;
      const t = run(
        () => {
          if (game.gripped) return game.update(DT, { holding: true, dragX: 0, dragY: -150 * DT });
          feel -= DT;
          if (feel > 0) return game.update(DT, { holding: true, dragX: 0, dragY: 0 });
          const near = Math.hypot(game.hand.u - game.relic.u, game.hand.v - game.relic.v) < dr.feelM * 0.5;
          game.update(DT, { holding: true, ...(near ? { dragX: 0, dragY: 0 } : toward(game.hand, game.relic, 0.08, dr.mPerPx)) });
        },
        () => game.done,
      );
      inRelicTime(t);
      expect(s.heard).toContain("splash");
    }
  });

  it("never grips while the hand thrashes about", () => {
    const game = new DrainLogic(() => {}, seeded(1));
    let dir = 1;
    run(
      () => {
        dir = -dir;
        game.update(DT, { holding: true, dragX: dir * 200, dragY: 0 });
      },
      () => false,
      10,
    );
    expect(game.gripped).toBe(false);
  });

  it("lets the relic slip back if you let go while pulling", () => {
    const game = new DrainLogic(() => {}, seeded(2));
    Object.assign(game.hand, game.relic);
    run(() => game.update(DT, { holding: true, dragX: 0, dragY: 0 }), () => game.gripped, 5);
    run(() => game.update(DT, { holding: true, dragX: 0, dragY: -150 * DT }), () => game.pulled > dr.pullPx / 2, 5);
    game.update(DT, { holding: false, dragX: 0, dragY: 0 });
    expect(game.gripped).toBe(false);
    expect(game.pulled).toBe(0);
  });
});

/** A repeatable stand-in for Math.random. */
function seededRandom(seed: number) {
  return () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
}

describe("clock (puzzle)", () => {
  const ck = hands.clock;

  /** Turns the hands the short way to the target at a steady speed, then lets go. */
  function steady(game: ClockLogic, degPerSec = ck.maxDegPerSec) {
    if (game.right) return game.update(DT, { held: false, dragX: 0 });
    const ahead = (((game.target - game.minutes) % 720) + 720) % 720;
    const dir = ahead <= 360 ? 1 : -1;
    const want = Math.min(Math.abs(ahead <= 360 ? ahead : 720 - ahead) * 6, degPerSec * DT);
    game.update(DT, { held: true, dragX: (dir * want) / ck.degPerPx });
  }

  it("starts when its hands are set to the time in the guest book", () => {
    for (const target of [0, 7 * 60 + 15, 11 * 60 + 55, 3 * 60 + 40]) {
      const s = sounds();
      const game = new ClockLogic(s.play, target);
      expect(game.right).toBe(false);
      const t = run(() => steady(game), () => game.done);
      // Finding the time in the book comes first; turning the hands alone takes the server's minimum.
      expect(t).toBeGreaterThanOrEqual(config.tasks.serverMinSec);
      expect(t).toBeLessThanOrEqual(config.tasks.maxSec);
      expect(s.heard).toContain("tick");
      expect(s.heard.at(-1)).toBe("click");
    }
  });

  it("moves the hour hand with the minute hand, as on a real clock", () => {
    const game = new ClockLogic(() => {}, 0);
    // Stopped at six o'clock.
    expect(game.hourDeg).toBeCloseTo(180);
    expect(game.minuteDeg).toBeCloseTo(0);
    run(() => game.update(DT, { held: true, dragX: (ck.maxDegPerSec * DT) / ck.degPerPx }), () => false, 1);
    expect(game.minuteDeg).toBeCloseTo((ck.maxDegPerSec * 1) % 360, 0);
    expect(game.hourDeg).toBeCloseTo(180 + ck.maxDegPerSec / 12, 0);
  });

  it("does not start at the wrong time, nor while you still hold it", () => {
    const game = new ClockLogic(() => {}, 7 * 60 + 15);
    run(() => game.update(DT, { held: false, dragX: 0 }), () => false, 3);
    expect(game.done).toBe(false);
    game.minutes = game.target;
    run(() => game.update(DT, { held: true, dragX: 0 }), () => false, 3);
    expect(game.done).toBe(false);
  });
});

describe("piano (puzzle)", () => {
  const pi = hands.piano;

  /** Listens, then plays the tune back with a little thought between keys. */
  function player(game: PianoLogic, mistakeAt = -1) {
    let wait = 0;
    let presses = 0;
    return () => {
      wait -= DT;
      const ready = game.mode === "play" && wait <= 0 && game.ring === 0;
      let pressed: number | null = null;
      if (ready) {
        pressed = presses++ === mistakeAt ? (game.tune[game.step]! + 1) % pi.keys : game.tune[game.step]!;
        wait = 0.5;
      }
      game.update(DT, { pressed });
    };
  }

  it("plays a tune, then waits for you to play it back, one note longer each round", () => {
    const s = sounds();
    let noise = 0;
    const game = new PianoLogic(s.play, () => noise++, () => 0.3);
    expect(game.mode).toBe("listen");
    const lengths: number[] = [];
    const t = run(
      (() => {
        const step = player(game);
        return () => {
          if (game.mode === "play" && game.step === 0 && lengths.at(-1) !== game.length) lengths.push(game.length);
          step();
        };
      })(),
      () => game.done,
    );
    expect(lengths).toEqual([pi.firstNotes, pi.firstNotes + 1, pi.firstNotes + 2]);
    inTaskTime(t);
    expect(noise).toBe(0);
  });

  it("ignores keys while it plays the tune to you", () => {
    const game = new PianoLogic(() => {}, () => {}, seededRandom(2));
    game.update(DT, { pressed: game.tune[0]! });
    expect(game.mode).toBe("listen");
    expect(game.step).toBe(0);
  });

  it("makes a sour, noisy note for a wrong key and plays the tune again", () => {
    const s = sounds();
    let noise = 0;
    const game = new PianoLogic(s.play, () => noise++, seededRandom(3));
    const step = player(game, 1);
    run(step, () => noise > 0);
    expect(s.heard).toContain("badNote");
    expect(game.mode).toBe("listen");
    expect(game.again).toBe(true);
    expect(game.round).toBe(0);
    run(step, () => game.done);
    expect(game.done).toBe(true);
  });

  it("plays the tune again when you ask", () => {
    const game = new PianoLogic(() => {}, () => {}, seededRandom(4));
    run(() => game.update(DT, { pressed: null }), () => game.mode === "play");
    game.update(DT, { pressed: null, replay: true });
    expect(game.mode).toBe("listen");
  });
});

describe("roses (puzzle)", () => {
  const ro = hands.roses;

  /** The fewest clicks that solve a puzzle (a search over every state), or null if none do. */
  function solve(n: number): JugAction[] | null {
    const puzzle: JugPuzzle = ro.puzzles[n]!;
    const game = () => new RosesLogic(() => {}, () => n / ro.puzzles.length + 0.001);
    const key = (g: RosesLogic) => `${g.water.join(",")}|${g.vase}|${g.inHand}`;
    const all: JugAction[] = [
      ...puzzle.jugs.flatMap((_, j): JugAction[] => [{ kind: "pick", jug: j }, { kind: "pour", jug: j }]),
      { kind: "putDown" },
      { kind: "fill" },
      { kind: "pourVase" },
      { kind: "empty" },
      { kind: "tipVase" },
    ];
    const actions = (g: RosesLogic) => all.filter((a) => g.can(a));
    const replay = (path: JugAction[]) => {
      const g = game();
      for (const a of path) {
        g.act(a);
        g.update(ro.pourSec);
      }
      return g;
    };
    const seen = new Set([key(game())]);
    let frontier: JugAction[][] = [[]];
    for (let depth = 0; depth < 30 && frontier.length; depth++) {
      const next: JugAction[][] = [];
      for (const path of frontier) {
        const g = replay(path);
        if (g.done) return path;
        for (const a of actions(g)) {
          const h = replay([...path, a]);
          if (seen.has(key(h))) continue;
          seen.add(key(h));
          next.push([...path, a]);
        }
      }
      frontier = next;
    }
    return null;
  }

  it("has puzzles that can all be solved, none of them in a click or two", () => {
    for (let n = 0; n < ro.puzzles.length; n++) {
      const path = solve(n);
      expect(path).not.toBeNull();
      // Even someone who knows the answer pours long enough for the server's minimum.
      const pours = path!.filter((a) => a.kind !== "pick" && a.kind !== "putDown").length;
      expect(pours * ro.pourSec + path!.length * 0.4).toBeGreaterThanOrEqual(config.tasks.serverMinSec);
    }
  });

  it("pours all it can: into a jug until it is full, into the vase all of it", () => {
    const s = sounds();
    const game = new RosesLogic(s.play, () => 0);
    const [small, big] = game.puzzle.jugs[0]! < game.puzzle.jugs[1]! ? [0, 1] : [1, 0];
    const act = (a: JugAction) => {
      expect(game.act(a)).toBe(true);
      game.update(ro.pourSec);
    };
    act({ kind: "pick", jug: big });
    act({ kind: "fill" });
    act({ kind: "pour", jug: small });
    expect(game.water[small]).toBe(game.puzzle.jugs[small]);
    expect(game.water[big]).toBe(game.puzzle.jugs[big]! - game.puzzle.jugs[small]!);
    act({ kind: "pourVase" });
    expect(game.vase).toBe(game.puzzle.jugs[big]! - game.puzzle.jugs[small]!);
    expect(s.heard).toContain("splash");
  });

  it("is only done with exactly the right amount; past the line, tip the vase out", () => {
    const game = new RosesLogic(() => {}, () => 0);
    const big = game.puzzle.jugs[0]! > game.puzzle.jugs[1]! ? 0 : 1;
    for (const a of [{ kind: "pick", jug: big }, { kind: "fill" }, { kind: "pourVase" }] as JugAction[]) {
      game.act(a);
      game.update(ro.pourSec);
    }
    expect(game.vase).toBeGreaterThan(game.puzzle.target);
    expect(game.done).toBe(false);
    expect(game.can({ kind: "tipVase" })).toBe(false); // hands full
    game.act({ kind: "putDown" });
    expect(game.act({ kind: "tipVase" })).toBe(true);
    game.update(ro.pourSec);
    expect(game.vase).toBe(0);
  });

  it("does nothing else while a pour is still running", () => {
    const game = new RosesLogic(() => {}, () => 0);
    game.act({ kind: "pick", jug: 0 });
    game.act({ kind: "fill" });
    expect(game.can({ kind: "pourVase" })).toBe(false);
    game.update(ro.pourSec);
    expect(game.can({ kind: "pourVase" })).toBe(true);
  });
});

describe("clue time", () => {
  it("gives every screen the same five-minute mark, never twelve o'clock", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const t = clueTime(`room${i}`, "task-clock");
      expect(t).toBe(clueTime(`room${i}`, "task-clock"));
      expect(t % 5).toBe(0);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(720);
      seen.add(t);
    }
    expect(seen.size).toBeGreaterThan(50);
    expect(clockText(7 * 60 + 5)).toBe("7:05");
    expect(clockText(30)).toBe("12:30");
  });
});
