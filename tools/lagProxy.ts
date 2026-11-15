// A relay that adds lag between players and the game server, and counts what each player receives
// (PRD 9: playable up to 200 ms round trip; under 25 KB/s per player at 8 players).
//
//   npx tsx tools/lagProxy.ts            listens on 2568, relays to localhost:2567, 200 ms round trip
//   RTT_MS=300 LISTEN=2568 TARGET=2567 npx tsx tools/lagProxy.ts
//
// Then point a client at it, e.g. ENDPOINT=ws://localhost:2568 PLAYERS=8 npx tsx tools/playtest.ts win.
// Every few seconds it prints each long-lived connection's download rate from the server.
import net from "node:net";

const rttMs = Number(process.env.RTT_MS ?? 200);
const listen = Number(process.env.LISTEN ?? 2568);
const target = Number(process.env.TARGET ?? 2567);
const REPORT_SEC = 10;
/** Connections shorter than this are page and matchmaking requests, not players. */
const PLAYER_MIN_SEC = 5;

interface Line {
  id: number;
  opened: number;
  down: number;
  downSince: number;
  closed: boolean;
}
const lines: Line[] = [];
let next = 0;

/** Sends each chunk half the round trip later, in order. */
function delayed(from: net.Socket, to: net.Socket, count?: (n: number) => void) {
  from.on("data", (chunk) => {
    count?.(chunk.length);
    setTimeout(() => {
      if (!to.destroyed) to.write(chunk);
    }, rttMs / 2);
  });
  from.on("end", () => setTimeout(() => to.end(), rttMs / 2));
  from.on("error", () => to.destroy());
}

net
  .createServer((player) => {
    const server = net.connect(target, "127.0.0.1");
    const line: Line = { id: ++next, opened: Date.now(), down: 0, downSince: 0, closed: false };
    lines.push(line);
    delayed(player, server);
    delayed(server, player, (n) => (line.down += n));
    const close = () => (line.closed = true);
    player.on("close", close);
    server.on("close", close);
  })
  .listen(listen, () => console.log(`Lag relay: :${listen} -> :${target}, ${rttMs} ms round trip`));

setInterval(() => {
  const now = Date.now();
  const players = lines.filter((l) => !l.closed && now - l.opened > PLAYER_MIN_SEC * 1000);
  if (!players.length) return;
  const rates = players.map((l) => {
    const kbs = (l.down - l.downSince) / 1024 / REPORT_SEC;
    l.downSince = l.down;
    return kbs;
  });
  console.log(`${new Date().toISOString().slice(11, 19)}  ${players.length} players, KB/s from server: ${rates.map((r) => r.toFixed(1)).join(" ")}  (max ${Math.max(...rates).toFixed(1)})`);
}, REPORT_SEC * 1000);
