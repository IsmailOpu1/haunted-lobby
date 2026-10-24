import { Server, WebSocketTransport } from "colyseus";
import { ROOM_NAME } from "@haunted/shared";
import { HauntedRoom } from "./HauntedRoom.ts";

/** Builds the game server without starting it, so tests can run it on any port. */
export function createGameServer() {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    express: (app) => {
      // Used by the deploy guide to check the server is reachable.
      app.get("/health", (_req, res) => {
        res.json({ ok: true });
      });
    },
  });
  server.define(ROOM_NAME, HauntedRoom);
  return server;
}
