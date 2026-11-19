import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Development only: the room-by-room picture test (game.ts roomTour, docs/plans/engine-port.md step
 * D) posts each picture to /__shot/<name>.png and this saves it in SHOTS_DIR (default
 * ../assets-src/build/room-shots/browser), beside the Unity version's pictures of the same views.
 */
function roomShots(): Plugin {
  return {
    name: "room-shots",
    configureServer(server) {
      server.middlewares.use("/__shot/", (req, res) => {
        const name = decodeURIComponent((req.url ?? "").replace(/^\//, ""));
        if (req.method !== "POST" || !/^[\w .-]+\.png$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const dir = resolve(process.env.SHOTS_DIR ?? join(import.meta.dirname, "../assets-src/build/room-shots/browser"));
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end("saved");
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [roomShots()],
  server: {
    // Listen on the local network so a second computer on the same Wi-Fi can join.
    host: true,
    port: 5173,
  },
});
