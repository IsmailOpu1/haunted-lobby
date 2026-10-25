import { Server, WebSocketTransport } from "colyseus";
import { ROOM_NAME } from "@haunted/shared";
import { HauntedRoom } from "./HauntedRoom.ts";
import { voiceHealth } from "./voice/status.ts";

/** Builds the game server without starting it, so tests can run it on any port. */
export function createGameServer() {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    express: (app) => {
      // Used by the deploy guide to check the server is reachable, and whether voice is set up.
      app.get("/health", (_req, res) => {
        res.json({ ok: true, voice: voiceHealth() });
      });
    },
  });
  server.define(ROOM_NAME, HauntedRoom);
  return server;
}
