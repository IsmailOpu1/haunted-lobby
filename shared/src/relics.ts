import type { RelicSpotDef } from "./map.ts";

// Relic spots for a match (GDD Section 10): random each match, at least minSpacingM apart.

const ATTEMPTS = 200;

type Distance = (a: { x: number; z: number }, b: { x: number; z: number }) => number;
const flat: Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function spacing(spots: RelicSpotDef[], dist: Distance): number {
  let min = Infinity;
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      min = Math.min(min, dist(spots[i]!, spots[j]!));
    }
  }
  return min;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Picks `count` spots, all at least `minSpacingM` apart, at random. When the map is too small
 * for that (the Phase 4 grey box is), it picks the spread with the largest gaps it can find,
 * so relics are still as far apart as possible. `dist` measures between spots: on a map with
 * floors, pass the real 3D distance (shared/levels.ts worldDistance).
 */
export function pickRelicSpots(
  spots: RelicSpotDef[],
  count: number,
  minSpacingM: number,
  random: () => number = Math.random,
  dist: Distance = flat,
): RelicSpotDef[] {
  const n = Math.min(count, spots.length);
  let best: RelicSpotDef[] = [];
  let bestSpacing = -1;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Random order, keeping each spot that is far enough from the ones already kept.
    const picked: RelicSpotDef[] = [];
    for (const spot of shuffled(spots, random)) {
      if (picked.length >= n) break;
      if (picked.every((p) => dist(p, spot) >= minSpacingM)) picked.push(spot);
    }
    if (picked.length === n) return picked;

    // Fallback: start anywhere, then keep adding the spot farthest from those picked.
    const spread = [shuffled(spots, random)[0]!];
    while (spread.length < n) {
      let far: RelicSpotDef | undefined;
      let farDist = -1;
      for (const spot of shuffled(spots, random)) {
        if (spread.includes(spot)) continue;
        const d = Math.min(...spread.map((p) => dist(p, spot)));
        if (d > farDist) {
          farDist = d;
          far = spot;
        }
      }
      spread.push(far!);
    }
    const s = n > 1 ? spacing(spread, dist) : Infinity;
    if (s > bestSpacing) {
      bestSpacing = s;
      best = spread;
    }
  }
  return best;
}
