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
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Door = schema({
  open: t.boolean(),
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

export const GameState = schema({
  players: t.map(Player),
  doors: t.map(Door),
  saltLines: t.map(SaltLine),
  saltJars: t.map(SaltJar),
  // Night clock (GDD Section 4.2).
  nightTime: t.float32(),
  nightLength: t.float32(),
  part: t.string(),
}, "GameState");
export type GameState = SchemaType<typeof GameState>;
