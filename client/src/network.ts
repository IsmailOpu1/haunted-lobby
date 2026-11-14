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

// The free online server sleeps when nobody has played for a while and takes up to a minute to
// wake. Knock as soon as the page opens, so it is awake by the time the hotel has loaded.
fetch(`${serverUrl().replace(/^ws/, "http")}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});

export function createRoom(options: JoinOptions): Promise<Room> {
  return client.create(ROOM_NAME, options);
}

export function joinRoom(code: string, options: JoinOptions): Promise<Room> {
  return client.joinById(normalizeRoomCode(code), options);
}

/** Back into a room after reloading the page, within the 60 s the server holds your slot (GDD 18). */
export function reconnectRoom(token: string): Promise<Room> {
  return client.reconnect(token);
}
