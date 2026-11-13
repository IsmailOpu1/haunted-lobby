import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, KeyBindings, keyName } from "./keys.ts";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("remappable keys (GDD 23)", () => {
  it("starts with the default keys and treats left and right Shift alike", () => {
    const k = new KeyBindings(memory());
    expect(k.code("use")).toBe(DEFAULT_KEYS.use);
    expect(k.is("ShiftRight", "run")).toBe(true);
  });
  it("swaps keys so no action is left without one, and remembers the change", () => {
    const store = memory();
    const k = new KeyBindings(store);
    expect(k.set("use", "KeyF")).toBe(true);
    expect(k.set("drop", "KeyF")).toBe(true);
    expect(k.code("drop")).toBe("KeyF");
    expect(k.code("use")).toBe("KeyG");
    expect(new KeyBindings(store).code("drop")).toBe("KeyF");
  });
  it("refuses Esc and the debug keys", () => {
    const k = new KeyBindings(memory());
    expect(k.set("use", "Escape")).toBe(false);
    expect(k.code("use")).toBe("KeyE");
  });
  it("names keys and rewrites hints with the player's keys, once each", () => {
    const k = new KeyBindings(memory());
    k.set("use", "ShiftLeft");
    k.set("run", "KeyQ");
    expect(k.hint("Hold E  Hide")).toBe("Hold Shift  Hide");
    expect(k.hint("Hidden. Hold Shift to hold your breath, hold E to step out.")).toBe("Hidden. Hold Q to hold your breath, hold Shift to step out.");
    expect(k.hint("E  Pick up salt")).toBe("Shift  Pick up salt");
    expect(keyName("Digit2")).toBe("2");
    expect(keyName("Space")).toBe("Space");
  });
  it("ignores a damaged save", () => {
    const store = memory();
    store.setItem("keyBindings", "{not json");
    expect(new KeyBindings(store).code("use")).toBe("KeyE");
  });
});
