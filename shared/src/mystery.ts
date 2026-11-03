// Who was the ghost? The mystery pilot (GDD 26.13, docs/plans/mystery-pilot.md).

import { config } from "./config.ts";
import type { MapData, SuspectDef, TaskStationDef } from "./map.ts";

/** The stations whose task shows a clue: those a suspect has a picture for. */
export function clueStations(map: MapData): TaskStationDef[] {
  const suspects = map.suspects ?? [];
  return map.tasks.filter((t) => suspects.some((s) => s.clues[t.minigame] !== undefined));
}

/** What a clue station shows when it points at this suspect. */
export function clueLabel(map: MapData, stationId: string, suspectId: string): string | undefined {
  const station = map.tasks.find((t) => t.id === stationId);
  const suspect = map.suspects?.find((s) => s.id === suspectId);
  return station && suspect ? suspect.clues[station.minigame] : undefined;
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Tonight's ghost, and the relics' names: the ghost's own belonging is always one of them,
 * the rest belong to other suspects (then the map's other relics if there are too few suspects).
 */
export function pickMystery(map: MapData, relicCount: number, random: () => number = Math.random): { ghost: SuspectDef; relicNames: string[] } | null {
  const suspects = map.suspects ?? [];
  if (suspects.length === 0) return null;
  const ghost = suspects[Math.floor(random() * suspects.length)]!;
  const others = shuffle(suspects.filter((s) => s !== ghost).map((s) => s.belonging), random);
  const spare = map.relicNames.filter((n) => !suspects.some((s) => s.belonging === n));
  const names = [ghost.belonging, ...others, ...spare].slice(0, relicCount);
  return { ghost, relicNames: shuffle(names, random) };
}

/** Another suspect than this one, for Alter a clue. */
export function otherSuspect(map: MapData, suspectId: string, random: () => number = Math.random): string {
  const others = (map.suspects ?? []).filter((s) => s.id !== suspectId);
  return others.length ? others[Math.floor(random() * others.length)]!.id : suspectId;
}

export interface DealtPlayer {
  investigator: boolean;
  tasks: { stationId: string; done: boolean }[];
}

/**
 * Every clue task goes on an investigator's list, spread over the investigators, and none stays
 * with the possessed: they lie by talking or with Alter a clue instead. Each swap keeps one task
 * per room. Changes the lists in place and returns the players whose list changed.
 */
export function dealClueTasks(players: DealtPlayer[], stations: TaskStationDef[], clueIds: string[], random: () => number = Math.random): Set<DealtPlayer> {
  const changed = new Set<DealtPlayer>();
  const byId = new Map(stations.map((s) => [s.id, s]));
  const isClue = (id: string) => clueIds.includes(id);
  const roomOf = (id: string) => byId.get(id)?.room;
  const fitsIn = (list: DealtPlayer["tasks"], skip: number, id: string) => list.every((t, i) => i === skip || (t.stationId !== id && roomOf(t.stationId) !== roomOf(id)));

  // The possessed swap their clue tasks for other (fake) ones, preferring tasks nobody has.
  const held = (id: string) => players.some((p) => p.tasks.some((t) => t.stationId === id));
  for (const p of players.filter((p) => !p.investigator)) {
    for (let i = p.tasks.length - 1; i >= 0; i--) {
      const task = p.tasks[i]!;
      if (task.done || !isClue(task.stationId)) continue;
      const spares = shuffle(stations, random).filter((s) => !isClue(s.id) && fitsIn(p.tasks, i, s.id) && !(s.visible && held(s.id)));
      const spare = spares.find((s) => !held(s.id)) ?? spares[0];
      if (spare) p.tasks[i] = { stationId: spare.id, done: false };
      else p.tasks.splice(i, 1);
      changed.add(p);
    }
  }

  const investigators = shuffle(players.filter((p) => p.investigator), random);
  const clueCount = (p: DealtPlayer) => p.tasks.filter((t) => isClue(t.stationId)).length;
  for (const id of clueIds) {
    if (investigators.some((p) => p.tasks.some((t) => t.stationId === id))) continue;
    // The investigator with the fewest clue tasks takes it in place of an ordinary one.
    for (const p of [...investigators].sort((a, b) => clueCount(a) - clueCount(b))) {
      const candidates = p.tasks.map((t, i) => i).filter((i) => !p.tasks[i]!.done && !isClue(p.tasks[i]!.stationId) && fitsIn(p.tasks, i, id));
      if (candidates.length === 0) continue;
      p.tasks[candidates[Math.floor(random() * candidates.length)]!] = { stationId: id, done: false };
      changed.add(p);
      break;
    }
  }

  // Spread them out: someone dealt two clues swaps one for an ordinary task of someone with none.
  for (const rich of investigators) {
    for (const poor of investigators) {
      if (clueCount(rich) < 2 || clueCount(poor) > 0) continue;
      swap: for (let i = 0; i < rich.tasks.length; i++) {
        const c = rich.tasks[i]!;
        if (c.done || !isClue(c.stationId)) continue;
        for (let j = 0; j < poor.tasks.length; j++) {
          const o = poor.tasks[j]!;
          if (o.done || isClue(o.stationId) || !fitsIn(poor.tasks, j, c.stationId) || !fitsIn(rich.tasks, i, o.stationId)) continue;
          rich.tasks[i] = o;
          poor.tasks[j] = c;
          changed.add(rich).add(poor);
          break swap;
        }
      }
    }
  }
  return changed;
}

/** Where the relics stand on the altar for the offering: a row along x, centred on the altar. */
export function altarStands(altar: { x: number; z: number }, count: number): { x: number; z: number }[] {
  const gap = config.mystery.standSpacingM;
  return Array.from({ length: count }, (_, i) => ({ x: altar.x + (i - (count - 1) / 2) * gap, z: altar.z }));
}
