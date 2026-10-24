import { config } from "./config.ts";

const { codeLength, codeAlphabet } = config.room;

/** A random room code such as "KQXRT" (GDD Section 5: A to Z without O and I). */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < codeLength; i++) {
    code += codeAlphabet[Math.floor(random() * codeAlphabet.length)];
  }
  return code;
}

/** Uppercases and trims what a player typed, so "kqxrt " joins room "KQXRT". */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== codeLength) return false;
  for (const ch of code) {
    if (!codeAlphabet.includes(ch)) return false;
  }
  return true;
}

/** Trims a display name and returns null if it is empty or too long. */
export function cleanPlayerName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (name.length === 0 || name.length > config.room.nameMaxLength) return null;
  return name;
}
