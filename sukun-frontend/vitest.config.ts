import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Deterministic unit tests for the Task 1 authentication/session and API
 * foundation. No network, no real backend, no browser automation — every test
 * here drives a stubbed `fetch` or a mounted `AuthProvider`.
 *
 * Kept separate from `next build`: `npm run build` and `npm test` share no
 * config, so a test-only dependency can never reach the production bundle.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
