import type { TaskStationDef } from "./map.ts";

// Task assignment (GDD Section 9): each player gets tasks in different areas, so the team
// has to spread out. Tasks are dealt like cards (GDD 26.5): no task repeats while others are
// still free, and a visible task goes to one player only, so its result proves who did it.

/**
 * Picks up to `count` stations, each in a different room, in random order. `taken` counts how
 * many other players already have each station: the least-taken are picked first, and a visible
 * station someone already has only if nothing else is left.
 */
export function assignTasks(
  stations: TaskStationDef[],
  count: number,
  random: () => number = Math.random,
  taken: ReadonlyMap<string, number> = new Map(),
): TaskStationDef[] {
  const shuffled = [...stations];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  // A stable sort keeps the shuffle's order among equals.
  const cost = (s: TaskStationDef) => {
    const n = taken.get(s.id) ?? 0;
    return s.visible && n > 0 ? Infinity : n;
  };
  shuffled.sort((a, b) => cost(a) - cost(b));
  const rooms = new Set<string>();
  const picked: TaskStationDef[] = [];
  for (const station of shuffled) {
    if (picked.length >= count) break;
    if (rooms.has(station.room)) continue;
    rooms.add(station.room);
    picked.push(station);
  }
  return picked;
}

/** How many players have each station, from their task lists. */
export function takenTasks(lists: Iterable<{ stationId: string }[]>): Map<string, number> {
  const taken = new Map<string, number>();
  for (const list of lists) for (const t of list) taken.set(t.stationId, (taken.get(t.stationId) ?? 0) + 1);
  return taken;
}
