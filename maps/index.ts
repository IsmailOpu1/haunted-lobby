import type { MapData, MapDressing } from "@haunted/shared";
import { marrowHotelDressing } from "./marrow-hotel/dressing.ts";
import { marrowHotelGreybox } from "./marrow-hotel/greybox.ts";
import { oneFloorTestMap } from "./test/one-floor.ts";
import { twoFloorTestMap } from "./test/two-floors.ts";

export { marrowHotelGreybox, oneFloorTestMap, twoFloorTestMap };

/** The map used until the lobby map setting exists (Phase 7). */
export const defaultMap: MapData = marrowHotelGreybox;

/** How each map looks (Phase 8), by map id. A map without one is drawn as grey boxes. */
export const dressings: Record<string, MapDressing> = { [marrowHotelDressing.mapId]: marrowHotelDressing };
