import { existsSync, readFileSync } from "node:fs";

// Hard safety guard: `astro dev` under the Cloudflare adapter reads its
// SUPABASE_URL/SUPABASE_KEY from `.dev.vars` (Wrangler's local-secrets file)
// — NOT from `process.env`, and NOT from `.env`/`.env.test.local`. Passing
// env vars to Playwright's webServer has NO effect on this. `.dev.vars`
// points at the HOSTED project by default (per CLAUDE.md's Node/Cloudflare
// split), so without this guard, running this suite would silently sign up
// real throwaway users against production. Refuse to run at all unless
// `.dev.vars` is confirmed to point at a local Supabase stack.
export default function globalSetup(): void {
  if (!existsSync(".dev.vars")) {
    throw new Error(
      "tests/e2e refuses to run: .dev.vars is missing. E2E tests drive `astro dev`, " +
        "which reads Supabase secrets from .dev.vars (not .env, not process.env). " +
        "Point .dev.vars at a LOCAL Supabase stack (`supabase start`) before running " +
        "npm run test:e2e — never the hosted project.",
    );
  }

  const contents = readFileSync(".dev.vars", "utf-8");
  const isLocal = /127\.0\.0\.1|localhost/.test(contents);
  if (!isLocal) {
    throw new Error(
      "tests/e2e refuses to run: .dev.vars does not point at a local Supabase stack " +
        "(no 127.0.0.1/localhost found in SUPABASE_URL). Running against the hosted " +
        "project would create real throwaway users and data. Run `supabase start` and " +
        "point .dev.vars at it (see .env.test.local.example for the values) before " +
        "running npm run test:e2e.",
    );
  }
}
