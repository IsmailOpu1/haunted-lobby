import { Room, type Client } from "colyseus";
import {
  cleanPlayerName,
  config,
  generateRoomCode,
  type JoinOptions,
  type RosterEntry,
  type ServerMessages,
} from "@haunted/shared";
import { LobbyState, Player } from "./state.ts";

// Codes in use by rooms on this server process. One process is enough for v1
// (PRD Section 9: one 2 vCPU server holds 5 rooms).
const activeCodes = new Set<string>();

function uniqueRoomCode(): string {
  let code = generateRoomCode();
  while (activeCodes.has(code)) code = generateRoomCode();
  activeCodes.add(code);
  return code;
}

export class HauntedRoom extends Room<{ state: LobbyState }> {
  maxClients = config.players.max;
  state = new LobbyState();

  onCreate() {
    // The 5-letter room code is the Colyseus room id, so friends join with joinById(code).
    this.roomId = uniqueRoomCode();
  }

  onJoin(client: Client, options?: JoinOptions) {
    const name = cleanPlayerName(options?.name);
    if (!name) throw new Error(`Name must be 1 to ${config.room.nameMaxLength} characters`);

    this.state.players.set(client.sessionId, new Player({ name }));
    this.announce("join", name, `${name} joined the room`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.state.players.delete(client.sessionId);
    this.announce("leave", player.name, `${player.name} left the room`);
  }

  onDispose() {
    activeCodes.delete(this.roomId);
  }

  private announce(kind: ServerMessages["system"]["kind"], name: string, text: string) {
    const system: ServerMessages["system"] = { kind, name, text };
    this.broadcast("system", system);

    const players: RosterEntry[] = [];
    this.state.players.forEach((p, sessionId) => players.push({ sessionId, name: p.name }));
    const roster: ServerMessages["roster"] = { players };
    this.broadcast("roster", roster);
  }
}
