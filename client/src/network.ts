import { Client, type Room } from "@colyseus/sdk";
import { normalizeRoomCode, ROOM_NAME, type JoinOptions } from "@haunted/shared";

// In development the server runs on port 2567 of the same machine that serves the page,
// so a second computer on the same Wi-Fi can open http://<this-pc-ip>:5173 and connect.
// In production, set VITE_SERVER_URL (for example wss://game.example.com).
function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.hostname}:2567`;
}

const client = new Client(serverUrl());

export function createRoom(options: JoinOptions): Promise<Room> {
  return client.create(ROOM_NAME, options);
}

export function joinRoom(code: string, options: JoinOptions): Promise<Room> {
  return client.joinById(normalizeRoomCode(code), options);
}
