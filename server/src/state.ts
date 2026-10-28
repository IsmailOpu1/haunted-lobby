import { schema, t, type SchemaType } from "@colyseus/schema";

// Shared state that every client in the room receives.
// Private data (roles, cooldowns, curse glow) must never be added here (PRD Section 10.3).
// The ghost is not here either: its position goes only to nearby players as a message.

export const Player = schema({
  name: t.string(),
  x: t.float32(),
  z: t.float32(),
  yaw: t.float32(),
  pitch: t.float32(),
  crouching: t.boolean(),
  flashlightOn: t.boolean(),
  // Movement prediction (only meaningful to the owning client, but not secret).
  stamina: t.float32(),
  regenWait: t.float32(),
  lastSeq: t.uint32(),
  // Health (GDD Section 7): "alive", "downed" or "dead".
  health: t.string(),
  bleedLeft: t.float32(),
  // Hiding (GDD Section 6): the hiding spot id, or "" when not hidden.
  hidingSpot: t.string(),
  holdingBreath: t.boolean(),
  breathCooldown: t.float32(),
  // The timed action being held (PlayerAction) and its progress from 0 to 1.
  action: t.string(),
  actionProgress: t.float32(),
  // Items (GDD Section 8).
  salt: t.uint8(),
  cameraShots: t.uint8(),
  // The relic this player carries (a key of GameState.relics), or "" (GDD Section 10).
  relic: t.string(),
  // Meetings (GDD 16): voted in this meeting (not for whom), and a body that is no longer there
  // (reported, or a player voted out).
  voted: t.boolean(),
  bodyGone: t.boolean(),
  /** Bell rings left this match (GDD 16.1). */
  bellUses: t.uint8(),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Door = schema({
  open: t.boolean(),
  /** Slammed and locked by a possessed player (GDD 14.2). */
  locked: t.boolean(),
}, "Door");
export type Door = SchemaType<typeof Door>;

export const SaltLine = schema({
  x: t.float32(),
  z: t.float32(),
  yaw: t.float32(),
}, "SaltLine");
export type SaltLine = SchemaType<typeof SaltLine>;

export const SaltJar = schema({
  taken: t.boolean(),
}, "SaltJar");
export type SaltJar = SchemaType<typeof SaltJar>;

/** A task station's visible result (GDD 9: lit candles stay lit). */
export const TaskStation = schema({
  done: t.boolean(),
}, "TaskStation");
export type TaskStation = SchemaType<typeof TaskStation>;

/** A relic as everyone sees it on Tab (GDD 10). Where it is stays on the server. */
export const Relic = schema({
  name: t.string(),
  status: t.string(),
  /** Who carries it, or who carried it last. */
  carrier: t.string(),
}, "Relic");
export type Relic = SchemaType<typeof Relic>;

/** A place to search for a relic (GDD 26.5). Searched places stay disturbed for everyone. */
export const SearchPlace = schema({
  searched: t.boolean(),
}, "SearchPlace");
export type SearchPlace = SchemaType<typeof SearchPlace>;

export const GameState = schema({
  players: t.map(Player),
  doors: t.map(Door),
  saltLines: t.map(SaltLine),
  saltJars: t.map(SaltJar),
  stations: t.map(TaskStation),
  relics: t.map(Relic),
  searchPlaces: t.map(SearchPlace),
  // The team task bar (GDD 9). Only real tasks count.
  tasksDone: t.uint16(),
  tasksTotal: t.uint16(),
  /** Stage (shared Stage): waiting, countdown, intro or night. */
  stage: t.string(),
  /** Seconds left in the countdown or the intro. */
  stageLeft: t.float32(),
  /** The host's session id: the room's creator, or whoever has waited longest after them (GDD 5). */
  host: t.string(),
  // Night clock (GDD Section 4.2).
  nightTime: t.float32(),
  nightLength: t.float32(),
  part: t.string(),
  /** Up to 30 s past dawn while a ritual with enough players in the circle finishes (GDD 4). */
  overtime: t.boolean(),
  // The ritual (GDD 11). Ready once the basement is open and the task bar is full.
  ritualReady: t.boolean(),
  ritualStarted: t.boolean(),
  /** 0 to 100. */
  ritualProgress: t.float32(),
  /** Living, standing players in the circle, and how many it needs. */
  circleCount: t.uint8(),
  circleNeeded: t.uint8(),
  /** Every light is out until someone fixes the fuse box or it comes back by itself (GDD 14.2). */
  blackout: t.boolean(),
  /** The meeting's step (shared MeetingStep), "" when there is none, and seconds left in it (GDD 16). */
  meeting: t.string(),
  meetingLeft: t.float32(),
  /** Who called it, and the body they reported ("" for the bell). */
  meetingCaller: t.string(),
  meetingBody: t.string(),
  /** Black flames on the altar: seconds left to put them out, or 0 (GDD 11). */
  taintLeft: t.float32(),
  /** "" while the match goes on, then "investigators" or "possessed" (GDD 18). */
  winner: t.string(),
  endReason: t.string(),
}, "GameState");
export type GameState = SchemaType<typeof GameState>;
