import { schema, t, type SchemaType } from "@colyseus/schema";

// Shared state that every client in the room receives.
// Private data (roles, cooldowns, curse glow) must never be added here (PRD Section 10.3).

export const Player = schema({
  name: t.string(),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const LobbyState = schema({
  players: t.map(Player),
}, "LobbyState");
export type LobbyState = SchemaType<typeof LobbyState>;
