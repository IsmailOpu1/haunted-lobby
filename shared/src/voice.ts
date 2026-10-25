import { config } from "./config.ts";

// Voice rules (GDD Section 13). The server measures loudness from the real audio, so a
// player cannot fake being quiet; these pure functions turn loudness and distance into
// "how loud do others hear you" and "can the ghost hear you".

export type VoiceLevel = "silent" | "whisper" | "normal" | "shout";

/** Loudness of 16-bit audio samples in dBFS (0 = loudest possible, about -90 = silence). */
export function rmsDbfs(samples: Int16Array): number {
  if (samples.length === 0) return -Infinity;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]! / 32768;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** Whisper, normal or shout, relative to this player's own normal speaking level. */
export function classifyVoice(dbfs: number, normalDbfs: number): VoiceLevel {
  const v = config.voice;
  if (!(dbfs > v.silenceDbfs)) return "silent";
  if (dbfs <= normalDbfs - v.whisperBelowNormalDb) return "whisper";
  if (dbfs >= normalDbfs + v.shoutAboveNormalDb) return "shout";
  return "normal";
}

/** How far other players can hear this level (GDD Section 13 table). */
export function playerHearRangeM(level: VoiceLevel): number {
  return level === "silent" ? 0 : config.voice.playerHearM[level];
}

/** How far the ghost can hear this level (GDD Section 13 table). */
export function ghostHearRangeM(level: VoiceLevel): number {
  return level === "silent" ? 0 : config.voice.ghostHearM[level];
}

/**
 * Volume from 0 to 1 that a listener hears a speaker at: full volume close by, fading to
 * silence at the edge of the level's range, halved when a wall is in between.
 */
export function voiceVolume(distanceM: number, level: VoiceLevel, wallBetween: boolean): number {
  const range = playerHearRangeM(level);
  if (range <= 0 || distanceM >= range) return 0;
  // Full volume for the first two thirds of a whisper's short range (2 of 3 m).
  const full = Math.min(config.voice.fullVolumeWithinM, (range * 2) / 3);
  const volume = distanceM <= full ? 1 : 1 - (distanceM - full) / (range - full);
  return wallBetween ? volume * config.voice.wallVolumeMult : volume;
}

const LEVEL_ORDER: VoiceLevel[] = ["silent", "whisper", "normal", "shout"];

/** The louder of two levels. */
export function louderLevel(a: VoiceLevel, b: VoiceLevel): VoiceLevel {
  return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;
}

/**
 * The level used for how far your voice carries to other players: the loudest level you
 * used in the last levelHoldSec. When you have not spoken at all lately, "normal", so the
 * first word you say is not lost while the server catches up.
 */
export function speakingLevel(recent: VoiceLevel[]): VoiceLevel {
  let level: VoiceLevel = "silent";
  for (const l of recent) level = louderLevel(level, l);
  return level === "silent" ? "normal" : level;
}

/**
 * How much to amplify a player's voice for others so quiet mics sound as clear as loud ones.
 * Based on their mic check; 1 (no change) before they have done it.
 */
export function playbackBoost(normalDbfs: number | null): number {
  if (normalDbfs === null) return 1;
  const boost = 10 ** ((config.voice.playbackTargetDbfs - normalDbfs) / 20);
  return Math.max(1, Math.min(config.voice.maxPlaybackBoost, boost));
}

/**
 * The mic check: from loudness samples taken while the player read a sentence, the player's
 * "normal". Uses the median of the voiced samples so pauses and one loud word do not count.
 * Returns null if there was not enough talking.
 */
export function calibrateNormal(samplesDbfs: number[], sampleSec: number): number | null {
  const voiced = samplesDbfs.filter((d) => d > config.voice.silenceDbfs).sort((a, b) => a - b);
  if (voiced.length * sampleSec < config.voice.micCheckMinVoicedSec) return null;
  return voiced[Math.floor(voiced.length / 2)]!;
}
