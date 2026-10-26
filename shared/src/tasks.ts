import type { TaskStationDef } from "./map.ts";

// Task assignment (GDD Section 9): each player gets tasks in different areas, so the team
// has to spread out.

/** Picks up to `count` stations, each in a different room, in random order. */
export function assignTasks(stations: TaskStationDef[], count: number, random: () => number = Math.random): TaskStationDef[] {
  const shuffled = [...stations];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
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
