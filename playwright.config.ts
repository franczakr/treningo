import { defineConfig, devices } from "@playwright/test";

// IMPORTANT: `astro dev` (this project's webServer command) runs under the
// Cloudflare adapter, which reads SUPABASE_URL/SUPABASE_KEY from `.dev.vars`
// (Wrangler's local-secrets file) — NOT from `process.env`, NOT from `.env`,
// NOT from anything passed via webServer.env below. `.dev.vars` points at
// the HOSTED project by default (per CLAUDE.md). `globalSetup` below refuses
// to run this suite at all unless `.dev.vars` is confirmed to point at a
// local Supabase stack — do not remove that guard or weaken it.

const PORT = 4321;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    // NEVER reuse an already-running dev server: if one happens to be up
    // (e.g. a developer's own `npm run dev`), it was almost certainly
    // started against .dev.vars pointing at the HOSTED project. Reusing it
    // would silently run this suite's signup/write flows against
    // production. Always spawn our own process — globalSetup has already
    // confirmed .dev.vars is local by the time this starts.
    reuseExistingServer: false,
  },
});
