import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Listen on the local network so a second computer on the same Wi-Fi can join.
    host: true,
    port: 5173,
  },
});
