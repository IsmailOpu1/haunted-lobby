import type { BellboyTrickDef, DoorDef, GhostTrickDef } from "@haunted/shared";
import type { GhostState } from "./ghost.ts";
import type { Point } from "./navmap.ts";

// Each map's ghost has one trick (GDD 12.5). Tricks run beside the ghost AI and only use what
// TrickWorld gives them, so a new map adds a trick here and names it in its map data.

export interface TrickWorld {
  ghost(): { x: number; z: number; state: GhostState };
  doors: DoorDef[];
  isDoorOpen(id: string): boolean;
  /** Opens a door by the ghost's trick (the ghost does not hear itself doing it). */
  swingDoor(id: string): void;
  /** A service bell rings in the room at this place. */
  ring(at: Point): void;
  distance(a: Point, b: Point): number;
  random(): number;
}

export interface GhostTrick {
  update(dt: number): void;
}

export function createTrick(def: GhostTrickDef | undefined, world: TrickWorld): GhostTrick | null {
  if (!def) return null;
  switch (def.kind) {
    case "bellboy":
      return new Bellboy(def, world);
  }
}

function between(world: TrickWorld, [min, max]: [number, number]): number {
  return min + world.random() * (max - min);
}

/** The Marrow Hotel ghost: rings service bells and swings doors open. */
class Bellboy implements GhostTrick {
  private ringIn: number;
  private swingIn: number;

  constructor(
    private def: BellboyTrickDef,
    private world: TrickWorld,
  ) {
    this.ringIn = between(world, def.ringEverySec);
    this.swingIn = between(world, def.swingEverySec);
  }

  update(dt: number) {
    const ghost = this.world.ghost();
    if (ghost.state === "asleep" || ghost.state === "gone") return;

    // The bell never breaks the silence before a hunt; it waits and rings as the hunt starts.
    this.ringIn -= dt;
    if (this.ringIn <= 0 && ghost.state !== "prehunt") {
      this.world.ring(ghost);
      this.ringIn = between(this.world, this.def.ringEverySec);
    }

    // Doors swing only while it wanders; once due, the next closed door it passes swings open.
    if (ghost.state !== "wander" && ghost.state !== "investigate") return;
    this.swingIn -= dt;
    if (this.swingIn > 0) return;
    let nearest: { id: string; d: number } | null = null;
    for (const door of this.world.doors) {
      if (this.world.isDoorOpen(door.id)) continue;
      const d = this.world.distance(door, ghost);
      if (d <= this.def.swingRangeM && (!nearest || d < nearest.d)) nearest = { id: door.id, d };
    }
    if (!nearest) return;
    this.world.swingDoor(nearest.id);
    this.swingIn = between(this.world, this.def.swingEverySec);
  }
}
