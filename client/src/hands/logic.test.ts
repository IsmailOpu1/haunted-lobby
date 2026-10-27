import { describe, expect, it } from "vitest";
import { config } from "@haunted/shared";
import type { TaskSoundKind } from "../minigames/types.ts";
import { BoilerLogic, CandelabraLogic, ClockLogic, DigLogic, LetterLogic, MatchLogic, PortraitsLogic, RosesLogic, ShuttersLogic, StoveLogic } from "./logic.ts";

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

describe("clock", () => {
  it("winds when each quarter turn lands on a tick", () => {
    const s = sounds();
    const game = new ClockLogic(s.play);
    const perFrame = hands.clock.pxPerQuarter / (hands.clock.tickSec / DT);
    const t = run(() => game.update(DT, { holding: true, dragX: perFrame }), () => game.done);
    inTaskTime(t);
    expect(s.heard).toContain("tick");
    expect(s.heard).not.toContain("wrong");
  });

  it("slips back when wound faster than the ticks", () => {
    const s = sounds();
    const game = new ClockLogic(s.play);
    const perFrame = (2.3 * hands.clock.pxPerQuarter) / (hands.clock.tickSec / DT);
    run(() => game.update(DT, { holding: true, dragX: perFrame }), () => game.done, config.tasks.maxSec);
    expect(game.done).toBe(false);
    expect(s.heard).toContain("wrong");
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

describe("roses", () => {
  const r = hands.roses;

  it("fills each vase to the line when you stop pouring a little early", () => {
    const game = new RosesLogic(() => {});
    const t = run(
      () => {
        const i = game.water.findIndex((w) => w < r.line);
        // Stop a little before the line: the can rights itself slowly, so water keeps coming.
        const pour = i >= 0 && game.water[i]! < r.line - 0.03;
        game.update(DT, { vase: i >= 0 ? i : null, holding: pour });
      },
      () => game.done,
    );
    inTaskTime(t);
  });

  it("overflows and empties the vase when you pour too long", () => {
    const s = sounds();
    const game = new RosesLogic(s.play);
    run(() => game.update(DT, { vase: 0, holding: true }), () => false, r.fillSec * 1.2);
    expect(game.water[0]).toBeLessThan(r.line);
    expect(s.heard).toContain("splash");
  });
});
