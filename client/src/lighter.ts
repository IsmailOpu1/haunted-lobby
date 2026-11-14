import { MeshoptSimplifier } from "meshoptimizer";

// Lighter copies of the most detailed pieces, for Low quality (dressedRooms.ts). Working them out
// took the hotel about ten seconds while it loaded, so it is done on a thread of its own
// (lighterWorker.ts), and only once Low is chosen.

/**
 * On Low quality, a piece this detailed or more (triangles) is drawn from a lighter copy: the
 * free models are made for close-ups (a candlestick of 20,000 triangles), and a laptop can't draw
 * the hotel's millions. The copy keeps about this share of the triangles, and its surface stays
 * within this share of the piece's size of the original (1% of a 20 cm candlestick is 2 mm).
 */
export const LOW_DETAIL_MIN_TRIANGLES = 1500;
const LOW_DETAIL_SHARE = 0.25;
const LOW_DETAIL_ERROR = 0.01;
/** A lighter copy is only kept if it saves at least this share of the triangles. */
const LOW_DETAIL_WORTH = 0.3;

/** One piece's corners (x, y, z each), their normals, and its triangles (three corners each). */
export interface LighterPiece {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface LighterJob {
  id: number;
  pieces: LighterPiece[];
}

/** For each piece of the job, the triangles its lighter copy keeps, or null for none. */
export interface LighterDone {
  id: number;
  kept: (Uint32Array | null)[];
}

/**
 * The triangles a lighter copy of a piece keeps (corners numbered as in the piece), or null if the
 * piece is light already or simplifying would not save enough. Wait for MeshoptSimplifier.ready first.
 */
export function lighterTriangles(piece: LighterPiece): Uint32Array | null {
  const { positions, normals, indices } = piece;
  if (!MeshoptSimplifier.supported || indices.length / 3 < LOW_DETAIL_MIN_TRIANGLES) return null;
  const target = Math.floor((indices.length * LOW_DETAIL_SHARE) / 3) * 3;
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, normals, 3, [0.5, 0.5, 0.5], null, target, LOW_DETAIL_ERROR);
  if (kept.length > indices.length * (1 - LOW_DETAIL_WORTH) || kept.length === 0) return null;
  return kept;
}
