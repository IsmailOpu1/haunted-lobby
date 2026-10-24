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
}

export type ServerMessageType = keyof ServerMessages;
