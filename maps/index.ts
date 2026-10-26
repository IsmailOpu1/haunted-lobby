import type { MapData } from "@haunted/shared";
import { marrowHotelGreybox } from "./marrow-hotel/greybox.ts";
import { twoFloorTestMap } from "./test/two-floors.ts";

export { marrowHotelGreybox, twoFloorTestMap };

/** The map used until the lobby map setting exists (Phase 7). */
export const defaultMap: MapData = marrowHotelGreybox;
