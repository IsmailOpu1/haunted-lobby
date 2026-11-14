import { config } from "./config.ts";

/** What one player can tell about another right now (GDD 22.2). */
export interface Sighting {
  /** Distance between the two players in metres. */
  distM: number;
  /** How far the target is from the middle of the viewer's beam, in radians (0 = dead centre). */
  offAxisRad: number;
  /** The viewer's flashlight is on. */
  flashlightOn: boolean;
  /** Nothing solid stands between them. */
  clearSight: boolean;
  /** A meeting is on: everyone's name is shown. */
  meeting: boolean;
}

/**
 * Darkness hides who you are (GDD 22.2): in the dark another player is a nameless shadow. Their
 * character and name show when the viewer's beam is on them within flashlight.nameRevealM, when
 * they are within flashlight.darkVisionM (even in the dark), and always in meetings.
 */
export function recognised(s: Sighting): boolean {
  const f = config.flashlight;
  if (s.meeting) return true;
  if (s.distM <= f.darkVisionM) return true;
  if (!s.flashlightOn || !s.clearSight) return false;
  return s.distM <= f.nameRevealM && Math.abs(s.offAxisRad) <= (f.coneHalfAngleDeg * Math.PI) / 180;
}

/** The angle (radians, -PI..PI) between a facing yaw and the direction to a point. Yaw looks along (-sin, -cos). */
export function offAxis(from: { x: number; z: number }, yaw: number, to: { x: number; z: number }): number {
  const toward = Math.atan2(-(to.x - from.x), -(to.z - from.z));
  const d = toward - yaw;
  return Math.atan2(Math.sin(d), Math.cos(d));
}
