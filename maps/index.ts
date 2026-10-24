import type { MapData } from "@haunted/shared";
import { marrowHotelGreybox } from "./marrow-hotel/greybox.ts";

export { marrowHotelGreybox };

/** The map used until the lobby map setting exists (Phase 7). */
export const defaultMap: MapData = marrowHotelGreybox;
