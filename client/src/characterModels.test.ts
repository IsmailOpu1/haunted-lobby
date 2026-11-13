import { describe, expect, it } from "vitest";
import { config } from "@haunted/shared";
import { chooseClip, MOVING_MPS } from "./characterModels.ts";

const { walk, run, crawl } = config.movement;

describe("which clip a player's body plays", () => {
  it("stands, walks and runs by speed", () => {
    expect(chooseClip("alive", false, 0, false)).toBe("idle");
    expect(chooseClip("alive", false, MOVING_MPS / 2, false)).toBe("idle");
    expect(chooseClip("alive", false, walk, false)).toBe("walk");
    expect(chooseClip("alive", false, run, false)).toBe("run");
  });

  it("crouches still or moving", () => {
    expect(chooseClip("alive", true, 0, false)).toBe("crouch-idle");
    expect(chooseClip("alive", true, config.movement.crouch, false)).toBe("crouch-walk");
  });

  it("a downed player falls first, then lies there or crawls", () => {
    expect(chooseClip("downed", false, 0, false)).toBe("knocked-down");
    expect(chooseClip("downed", false, crawl, false)).toBe("knocked-down");
    expect(chooseClip("downed", false, 0, true)).toBe("downed-idle");
    expect(chooseClip("downed", false, crawl, true)).toBe("crawl");
  });

  it("the dead play the dying clip whatever they were doing", () => {
    expect(chooseClip("dead", true, run, true)).toBe("dying");
  });
});
