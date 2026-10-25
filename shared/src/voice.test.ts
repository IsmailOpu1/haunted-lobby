import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import {
  calibrateNormal,
  classifyVoice,
  ghostHearRangeM,
  playbackBoost,
  playerHearRangeM,
  rmsDbfs,
  speakingLevel,
  voiceVolume,
} from "./voice.ts";

describe("loudness", () => {
  it("measures a full-scale square wave at 0 dBFS and silence as -Infinity", () => {
    expect(rmsDbfs(new Int16Array(480).fill(32767))).toBeCloseTo(0, 1);
    expect(rmsDbfs(new Int16Array(480))).toBe(-Infinity);
  });

  it("measures a tenth of full scale at about -20 dBFS", () => {
    expect(rmsDbfs(new Int16Array(480).fill(3277))).toBeCloseTo(-20, 0);
  });
});

describe("voice levels relative to your normal (GDD 13)", () => {
  const normal = -30;
  it("classifies whisper, normal and shout", () => {
    expect(classifyVoice(normal - config.voice.whisperBelowNormalDb - 1, normal)).toBe("whisper");
    expect(classifyVoice(normal, normal)).toBe("normal");
    expect(classifyVoice(normal + config.voice.shoutAboveNormalDb + 1, normal)).toBe("shout");
  });

  it("treats very quiet sound as silence", () => {
    expect(classifyVoice(config.voice.silenceDbfs - 5, normal)).toBe("silent");
    expect(classifyVoice(-Infinity, normal)).toBe("silent");
  });

  it("uses the GDD hearing ranges for players and the ghost", () => {
    expect(playerHearRangeM("whisper")).toBe(3);
    expect(playerHearRangeM("normal")).toBe(15);
    expect(playerHearRangeM("shout")).toBe(25);
    expect(ghostHearRangeM("whisper")).toBe(0);
    expect(ghostHearRangeM("normal")).toBe(6);
    expect(ghostHearRangeM("shout")).toBe(20);
  });
});

describe("voice volume", () => {
  it("is full close by and fades to silence at the edge of the range", () => {
    expect(voiceVolume(1, "normal", false)).toBe(1);
    expect(voiceVolume(9, "normal", false)).toBeCloseTo(0.5, 5);
    expect(voiceVolume(15, "normal", false)).toBe(0);
    expect(voiceVolume(4, "whisper", false)).toBe(0);
    expect(voiceVolume(2, "whisper", false)).toBe(1); // a whisper is clear up close
    expect(voiceVolume(2.5, "whisper", false)).toBeCloseTo(0.5, 5);
    expect(voiceVolume(20, "shout", false)).toBeGreaterThan(0);
  });

  it("is halved through a wall, and silent when not talking", () => {
    expect(voiceVolume(1, "normal", true)).toBe(config.voice.wallVolumeMult);
    expect(voiceVolume(1, "silent", false)).toBe(0);
  });
});

describe("keeping the talking level between words", () => {
  it("uses the loudest recent level, and normal after a long silence", () => {
    expect(speakingLevel(["silent", "whisper", "silent"])).toBe("whisper");
    expect(speakingLevel(["normal", "silent", "shout", "silent"])).toBe("shout");
    expect(speakingLevel(["silent", "silent"])).toBe("normal");
  });
});

describe("boosting quiet mics", () => {
  it("raises a quiet mic toward the target, never lowers, and caps the boost", () => {
    expect(playbackBoost(null)).toBe(1);
    expect(playbackBoost(config.voice.playbackTargetDbfs)).toBeCloseTo(1, 5);
    expect(playbackBoost(config.voice.playbackTargetDbfs - 6)).toBeCloseTo(2, 1);
    expect(playbackBoost(-10)).toBe(1);
    expect(playbackBoost(-80)).toBe(config.voice.maxPlaybackBoost);
  });
});

describe("mic check", () => {
  it("takes the median of the talking parts", () => {
    const samples = [-90, -90, -32, -30, -28, -29, -31, -10, -90];
    expect(calibrateNormal(samples, 0.25)).toBe(-29);
  });

  it("fails when the player barely spoke", () => {
    expect(calibrateNormal([-90, -90, -30, -90], 0.25)).toBeNull();
  });
});
