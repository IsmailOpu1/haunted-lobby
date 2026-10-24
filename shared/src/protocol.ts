// Names and payloads of messages between client and server.

export const ROOM_NAME = "haunted";

export interface JoinOptions {
  name: string;
}

export interface RosterEntry {
  sessionId: string;
  name: string;
}

/** Messages the server sends to clients. */
export interface ServerMessages {
  /** A line for the lobby log, e.g. "Rafi joined the room". */
  system: { kind: "join" | "leave"; name: string; text: string };
  /** Everyone currently in the room. Sent whenever someone joins or leaves. */
  roster: { players: RosterEntry[] };
  /**
   * Where the ghost is, sent only to players within ghost.interestRangeM (PRD 10.3).
   * null means "out of range or vanished": hide it and stop the flashlight flicker.
   */
  ghost: GhostView | null;
  /** Hunt warning (2 s of silence), hunt start, hunt end (GDD Section 12.1). */
  hunt: { phase: "warning" | "start" | "end" };
  /** The night is over. */
  dawn: Record<string, never>;
}

export interface GhostView {
  x: number;
  z: number;
  yaw: number;
  /** The ghost can be seen only while it hunts. */
  visible: boolean;
}

export type ServerMessageType = keyof ServerMessages;

/** Messages clients send to the server. */
export interface ClientMessages {
  /** One fixed step of movement input (validated with sanitizeInput). */
  input: import("./sim/movement.ts").MoveInput;
  /** Toggle your flashlight. */
  flashlight: undefined;
  /**
   * E pressed (down: true) or released (down: false). The server picks the action:
   * leave a hiding spot, revive a downed teammate, hide, or open/close a door.
   */
  use: { down: boolean };
}

/** Player health (GDD Section 7). */
export type Health = "alive" | "downed" | "dead";

/** A timed action a player is holding E for. */
export type PlayerAction = "" | "revive" | "hide" | "unhide";
