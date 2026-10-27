// The sounds a task makes (GDD Section 9 and 26.5).

export type TaskSoundKind =
  | "tick"
  | "click"
  | "strike"
  | "fizz"
  | "wrong"
  | "cry"
  | "note"
  | "badNote"
  | "scrape"
  | "splash"
  | "thud"
  | "spark"
  | "scare"
  // A gust of wind coming, a shutter slamming, gas hissing.
  | "whistle"
  | "bang"
  | "hiss";

/** Sounds from a noisy task done badly (GDD 9). The ghost can hear these. */
export const NOISY_SOUNDS: ReadonlySet<TaskSoundKind> = new Set(["cry", "badNote"]);
