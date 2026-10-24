import { schema, t, type SchemaType } from "@colyseus/schema";

// Shared state that every client in the room receives.
// Private data (roles, cooldowns, curse glow) must never be added here (PRD Section 10.3).

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
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Door = schema({
  open: t.boolean(),
}, "Door");
export type Door = SchemaType<typeof Door>;

export const GameState = schema({
  players: t.map(Player),
  doors: t.map(Door),
}, "GameState");
export type GameState = SchemaType<typeof GameState>;
