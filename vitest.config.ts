import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
    environment: "node",
    // Enables the server's test-only shortcuts (skip time, get downed). Never set in production.
    env: { HAUNTED_DEBUG: "1" },
  },
});
