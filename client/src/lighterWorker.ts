import { MeshoptSimplifier } from "meshoptimizer";
import { type LighterDone, type LighterJob, lighterTriangles } from "./lighter.ts";

// Works out the lighter copies (lighter.ts) away from the game's own thread, so it never stops.

self.onmessage = async (event: MessageEvent<LighterJob>) => {
  await MeshoptSimplifier.ready;
  const { id, pieces } = event.data;
  const kept = pieces.map(lighterTriangles);
  const done: LighterDone = { id, kept };
  (self as unknown as Worker).postMessage(done, kept.filter((k): k is Uint32Array => k !== null).map((k) => k.buffer));
};
