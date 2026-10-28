// Names and payloads of messages between client and server.

import type { EndReason, Team } from "./result.ts";

export const ROOM_NAME = "haunted";

export interface JoinOptions {
  name: string;
}

export interface RosterEntry {
  sessionId: string;
  name: string;
}

/** Messages the server sends to clients. */
export type Role = "investigator" | "possessed";

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
  /** The ghost's service bell rang in a room (the Bellboy, GDD 12.5). Everyone hears it, from the room's middle. */
  bellRing: { x: number; z: number };
  /** The match is over (GDD 18): who won, why, and every player's role, now shown to all (GDD 19). */
  matchEnd: { winner: Team; reason: EndReason; roles: { name: string; role: Role }[] };
  /** How to join the voice room, or disabled when this server has no voice keys. */
  voice: { url: string; token: string } | { disabled: true };
  /**
   * How loud you hear each speaker right now: [volume 0..1, muffled 1 if through a wall,
   * boost for a quiet mic]. Sent 4 times a second. Speakers not listed are out of range.
   */
  voiceMix: Record<string, [number, number, number]>;
  /** Result of your mic check: your normal level, or why it failed. */
  micCheck: { ok: true; normalDbfs: number } | { ok: false; reason: string };
  /** Your microphone stopped (or came back). While lost, the ghost hears you as talking normally. */
  micLost: { lost: boolean };
  /** A camera flash went off near you (GDD 15.2: visible within 15 m). */
  flash: { x: number; z: number; by: string };
  /** Your photo was taken. It develops by the next meeting; nobody sees it before then. */
  photoTaken: { shotsLeft: number };
  /**
   * Your role, sent only to you when the countdown ends (GDD 4.1). partners: the other possessed
   * players' names, if you are possessed and Possessed know each other is on.
   */
  role: { role: Role; partners: string[] };
  /** The host's Start was refused (too few players). */
  startRefused: { reason: string };
  /** Test shortcut (debug servers only): the ghost was sent away or brought back. */
  debugGhost: { paused: boolean };
  /** Your task list (private). Sent on request and whenever it changes. */
  tasks: { list: TaskEntry[] };
  /** Open this task's minigame (you pressed E at its station). */
  taskOpen: { stationId: string; minigame: import("./map.ts").MinigameKind; title: string };
  /** Close the minigame: finished, cancelled (you moved, were downed, or quit), or a search found nothing. */
  taskClosed: { stationId: string; reason: "done" | "cancelled" | "empty" };
  /** The place you are searching holds the relic: keep going to take it (GDD 26.5). */
  searchFound: { stationId: string };
  /** Someone near you botched a noisy task: the baby cried or a wrong note rang out. */
  taskNoise: { x: number; z: number; minigame: import("./map.ts").MinigameKind };
  /**
   * Relics near you (sent nearUpdateHz times a second): hidden ones within whisper range, so
   * you can hear them, and dropped ones within sight. Positions are never sent from farther.
   */
  relicsNear: { list: RelicNear[] };
  /** A relic hit the floor near you. */
  relicDrop: { x: number; z: number };
}

export interface RelicNear {
  id: string;
  x: number;
  z: number;
  /** Hidden in a spot (spotId set) or lying on the floor. */
  hidden: boolean;
  spotId: string;
}

/** What everyone sees about a relic on Tab (GDD 10). Never where it is. */
export type RelicStatus = "hidden" | "carried" | "dropped" | "placed";

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
  /** Start the mic check: the server listens for micCheckSec to learn your normal volume. */
  micCheck: undefined;
  /**
   * Ask for your voice pass (answered with a "voice" message). The client sends this once its
   * message handlers are ready, so the answer can never arrive before it is listening.
   */
  voiceRequest: undefined;
  /** Pour a salt line in front of you (1 s, standing still). */
  pourSalt: undefined;
  /** Send me my task list (answered with "tasks"). Sent once the client is listening. */
  tasksRequest: undefined;
  /** I finished the minigame of the task I started with E. */
  taskDone: { stationId: string };
  /** I closed the minigame without finishing. */
  taskCancel: undefined;
  /** My noisy minigame went wrong (the baby cried, a wrong note). The ghost may hear it. */
  taskNoise: undefined;
  /** Drop the relic I carry (G). */
  dropRelic: undefined;
  /** Take a Spirit Camera photo in the direction you are looking. */
  photo: undefined;
  /** The host starts the night: a countdown, then roles and the intro (GDD 5, 4.1). */
  start: undefined;
}

/**
 * Where the room is (GDD 4.1 and 5): waiting for the host to start, counting down, showing
 * everyone their role, then the night itself.
 */
export type Stage = "waiting" | "countdown" | "intro" | "night";

/** Player health (GDD Section 7). */
export type Health = "alive" | "downed" | "dead";

/** A timed action a player is doing (holding E, pouring salt, or a task minigame). */
export type PlayerAction = "" | "revive" | "hide" | "unhide" | "salt" | "task" | "placeRelic";

/** One of your tasks, as only you see it. The possessed's are fake: doing them moves no bar (GDD 9). */
export interface TaskEntry {
  stationId: string;
  name: string;
  room: string;
  done: boolean;
}
