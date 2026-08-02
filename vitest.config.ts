import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Integration tests (real database, run via `npm run test:integration`
    // + vitest.integration.config.ts) live alongside unit tests but must not
    // be picked up here — this suite stays hermetic and Docker-independent.
    // Playwright specs under tests/e2e/ (run via `npm run test:e2e`) must
    // also be excluded — they import `@playwright/test`, not `vitest`.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts", "tests/e2e/**"],
  },
});
