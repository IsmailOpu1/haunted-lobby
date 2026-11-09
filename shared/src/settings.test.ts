import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { changeSettings, presetOf, presetSettings, SETTING_KEYS, SETTING_OPTIONS, settingsCode, standardSettings } from "./settings.ts";

const MAP = "marrow-hotel";

describe("lobby settings (GDD 20)", () => {
  it("Standard is every default in config.ts", () => {
    const s = standardSettings(MAP);
    expect(s.lengthMin).toBe(config.match.lengthMin);
    expect(s.relics).toBe(config.relics.count);
    expect(s.tasksPerPlayer).toBe(config.tasks.perPlayer);
    expect(presetOf(s)).toBe("standard");
    expect(settingsCode(s)).toBe(`STD-${config.match.lengthMin}-PA`);
  });

  it("every preset uses only listed options and is recognised as itself", () => {
    for (const name of ["standard", "beginner", "hardcore"] as const) {
      const s = presetSettings(name, MAP);
      for (const k of SETTING_KEYS) if (k !== "map") expect(SETTING_OPTIONS[k] as readonly unknown[]).toContain(s[k]);
      expect(presetOf(s)).toBe(name);
    }
    expect(presetSettings("beginner", MAP)).toMatchObject({ lengthMin: 20, difficulty: "easy", tasksPerPlayer: 2, cameraShots: 2, saltPerPlayer: 3, discussionSec: 90 });
    expect(presetSettings("hardcore", MAP)).toMatchObject({ lengthMin: 10, difficulty: "hard", tasksPerPlayer: 4, saltPerPlayer: 1, revealRole: false, anonymousVoting: true });
    expect(settingsCode(presetSettings("hardcore", MAP))).toBe("HRD-10-PA");
  });

  it("any change to a preset makes it Custom, and the code shows minutes and possessed", () => {
    const s = changeSettings(standardSettings(MAP), { lengthMin: 12, possessed: 1 }, [MAP])!;
    expect(presetOf(s)).toBe("custom");
    expect(settingsCode(s)).toBe("CUS-12-P1");
    // Changing it back is Standard again.
    expect(presetOf(changeSettings(s, { lengthMin: config.match.lengthMin, possessed: "auto" }, [MAP])!)).toBe("standard");
  });

  it("refuses values that are not listed, unknown settings and unknown maps", () => {
    const s = standardSettings(MAP);
    expect(changeSettings(s, { lengthMin: 13 }, [MAP])).toBeNull();
    expect(changeSettings(s, { possessed: 3 }, [MAP])).toBeNull();
    expect(changeSettings(s, { ghostSpeed: 9 }, [MAP])).toBeNull();
    expect(changeSettings(s, { map: "elsewhere" }, [MAP])).toBeNull();
    expect(changeSettings(s, "lengthMin", [MAP])).toBeNull();
    expect(changeSettings(s, { blackout: "yes" }, [MAP])).toBeNull();
  });
});
