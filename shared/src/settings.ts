// Lobby settings and presets (GDD 20). The defaults and every option come from config.ts;
// the host picks among them, and the server checks each change with changeSettings.

import { config } from "./config.ts";
import type { GhostDifficulty } from "./night.ts";
import type { CooldownSpeed } from "./powers.ts";
import type { PossessedSetting } from "./roles.ts";

export type CircleSetting = "auto" | 2 | 3;
export type PresetName = keyof typeof config.settings.presets | "custom";

export interface MatchSettings {
  // Basic tab
  map: string;
  lengthMin: number;
  possessed: PossessedSetting;
  difficulty: GhostDifficulty;
  // Advanced tab: objectives
  relics: number;
  tasksPerPlayer: number;
  ritualSec: number;
  circle: CircleSetting;
  // Possessed
  knowEachOther: boolean;
  cooldownSpeed: CooldownSpeed;
  blackout: boolean;
  // Items
  cameraShots: number;
  saltPerPlayer: number;
  // Meetings
  bellUses: number;
  evidenceSec: number;
  discussionSec: number;
  voteSec: number;
  revealRole: boolean;
  anonymousVoting: boolean;
  // Voice
  ghostHearsMic: boolean;
  // The dead
  wispTasks: boolean;
  ouija: boolean;
  /** Who was the ghost? (GDD 26.13, 26.14). */
  mystery: boolean;
}

/** The choices for each setting, in the order the lobby shows them. Maps come from the server. */
export const SETTING_OPTIONS: { [K in keyof MatchSettings]: readonly MatchSettings[K][] } = {
  map: [],
  lengthMin: config.match.lengthOptionsMin,
  possessed: config.settings.possessedOptions as readonly PossessedSetting[],
  difficulty: config.settings.difficultyOptions as readonly GhostDifficulty[],
  relics: config.relics.options,
  tasksPerPlayer: config.tasks.options,
  ritualSec: config.ritual.options,
  circle: config.settings.circleOptions as readonly CircleSetting[],
  knowEachOther: [true, false],
  cooldownSpeed: config.settings.cooldownSpeedOptions as readonly CooldownSpeed[],
  blackout: [true, false],
  cameraShots: config.camera.shotOptions,
  saltPerPlayer: config.salt.options,
  bellUses: config.meetings.bellOptions,
  evidenceSec: config.meetings.evidenceOptions,
  discussionSec: config.meetings.discussionOptions,
  voteSec: config.meetings.voteOptions,
  revealRole: [true, false],
  anonymousVoting: [true, false],
  ghostHearsMic: [true, false],
  wispTasks: [true, false],
  ouija: [true, false],
  mystery: [true, false],
};

export const SETTING_KEYS = Object.keys(SETTING_OPTIONS) as (keyof MatchSettings)[];

/** Standard: every default from config.ts. */
export function standardSettings(map: string): MatchSettings {
  return {
    map,
    lengthMin: config.match.lengthMin,
    possessed: "auto",
    difficulty: "normal",
    relics: config.relics.count,
    tasksPerPlayer: config.tasks.perPlayer,
    ritualSec: config.ritual.baseSec,
    circle: "auto",
    knowEachOther: config.possessed.knowEachOther,
    cooldownSpeed: "normal",
    blackout: true,
    cameraShots: config.camera.shotsPerPlayer,
    saltPerPlayer: config.salt.perPlayer,
    bellUses: config.meetings.bellUsesPerPlayer,
    evidenceSec: config.meetings.evidenceSec,
    discussionSec: config.meetings.discussionSec,
    voteSec: config.meetings.voteSec,
    revealRole: config.meetings.revealRole,
    anonymousVoting: config.meetings.anonymousVoting,
    ghostHearsMic: true,
    wispTasks: config.wisps.canDoTasks,
    ouija: config.wisps.ouija,
    mystery: true,
  };
}

/** A preset's settings, keeping the map (GDD 20.1). */
export function presetSettings(preset: Exclude<PresetName, "custom">, map: string): MatchSettings {
  return { ...standardSettings(map), ...(config.settings.presets[preset].changes as Partial<MatchSettings>) };
}

/** Which preset these settings are, or custom once anything differs from one (GDD 20.1). */
export function presetOf(s: MatchSettings): PresetName {
  for (const name of Object.keys(config.settings.presets) as Exclude<PresetName, "custom">[]) {
    const p = presetSettings(name, s.map);
    if (SETTING_KEYS.every((k) => p[k] === s[k])) return name;
  }
  return "custom";
}

/** The short settings code shown in the lobby (GDD 5): preset, minutes, possessed, e.g. STD-15-P1 or CUS-12-PA. */
export function settingsCode(s: MatchSettings): string {
  const preset = presetOf(s);
  const code = preset === "custom" ? config.settings.customCode : config.settings.presets[preset].code;
  return `${code}-${s.lengthMin}-P${s.possessed === "auto" ? "A" : s.possessed}`;
}

/**
 * The settings after the host changes some of them, or null if any value is not one of the
 * listed options, or names a setting that does not exist. maps: the map ids this server has.
 */
export function changeSettings(current: MatchSettings, change: unknown, maps: readonly string[]): MatchSettings | null {
  if (!change || typeof change !== "object" || Array.isArray(change)) return null;
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(change)) {
    if (!(SETTING_KEYS as string[]).includes(key)) return null;
    const options: readonly unknown[] = key === "map" ? maps : SETTING_OPTIONS[key as keyof MatchSettings];
    if (!options.includes(value)) return null;
    next[key] = value;
  }
  return next as unknown as MatchSettings;
}
