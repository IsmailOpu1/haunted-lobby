// Who is possessed (GDD Sections 3 and 19).

import { config } from "./config.ts";

/** The lobby's "Number of possessed" setting (GDD 20.2). */
export type PossessedSetting = "auto" | 1 | 2;

/**
 * How many players are possessed: the Auto column of GDD 3, or the setting, never above the
 * table's max. Fewer players than the game allows (debug servers only) have none.
 */
export function possessedCount(players: number, setting: PossessedSetting = "auto"): number {
  const { min, max } = config.players;
  if (players < min) return 0;
  const n = Math.min(players, max) as keyof typeof config.possessed.autoByPlayers;
  const auto = config.possessed.autoByPlayers[n];
  const most = config.possessed.maxByPlayers[n];
  return Math.min(setting === "auto" ? auto : setting, most);
}

/**
 * Picks the possessed for a match (GDD 19, fair rotation). Each player's weight is
 * 1 / (1 + times already possessed this session), and the picks come from the players possessed
 * the fewest times first, so nobody is possessed twice before everyone has been once.
 */
export function pickPossessed(ids: readonly string[], timesPossessed: ReadonlyMap<string, number>, count: number, random: () => number = Math.random): string[] {
  const left = [...ids];
  const picked: string[] = [];
  const times = (id: string) => timesPossessed.get(id) ?? 0;
  while (picked.length < count && left.length > 0) {
    const fewest = Math.min(...left.map(times));
    const pool = left.filter((id) => times(id) === fewest);
    const weight = (id: string) => config.rotation.baseWeight / (1 + times(id));
    let roll = random() * pool.reduce((sum, id) => sum + weight(id), 0);
    let choice = pool[pool.length - 1]!;
    for (const id of pool) {
      roll -= weight(id);
      if (roll < 0) {
        choice = id;
        break;
      }
    }
    picked.push(choice);
    left.splice(left.indexOf(choice), 1);
  }
  return picked;
}
