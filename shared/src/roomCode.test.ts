import { describe, expect, it } from "vitest";
import { cleanPlayerName, generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./roomCode.ts";

describe("room codes", () => {
  it("are 5 letters from the allowed alphabet", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it("never contain O or I", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) for (const ch of generateRoomCode()) seen.add(ch);
    expect(seen.has("O")).toBe(false);
    expect(seen.has("I")).toBe(false);
  });

  it("covers both ends of the alphabet", () => {
    expect(generateRoomCode(() => 0)).toBe("AAAAA");
    expect(generateRoomCode(() => 0.9999)).toBe("ZZZZZ");
  });

  it("normalizes typed input", () => {
    expect(normalizeRoomCode("  kqxrt ")).toBe("KQXRT");
  });

  it("rejects bad codes", () => {
    expect(isValidRoomCode("KQXR")).toBe(false);
    expect(isValidRoomCode("KQXRTT")).toBe(false);
    expect(isValidRoomCode("KQXRO")).toBe(false);
    expect(isValidRoomCode("kqxrt")).toBe(false);
  });
});

describe("player names", () => {
  it("trims and accepts normal names", () => {
    expect(cleanPlayerName("  Rafi ")).toBe("Rafi");
  });

  it("rejects empty, too long or non-string names", () => {
    expect(cleanPlayerName("   ")).toBeNull();
    expect(cleanPlayerName("x".repeat(17))).toBeNull();
    expect(cleanPlayerName(42)).toBeNull();
  });
});
