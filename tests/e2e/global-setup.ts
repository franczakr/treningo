import { existsSync, readFileSync } from "node:fs";

// Hard safety guard: `astro dev` under the Cloudflare adapter reads its
// SUPABASE_URL/SUPABASE_KEY from `.dev.vars` (Wrangler's local-secrets file)
// — NOT from `process.env`, and NOT from `.env`/`.env.test.local`. Passing
// env vars to Playwright's webServer has NO effect on this. `.dev.vars`
// points at the HOSTED project by default (per CLAUDE.md's Node/Cloudflare
// split), so without this guard, running this suite would silently sign up
// real throwaway users against production. Refuse to run at all unless
// `.dev.vars` is confirmed to point at a local Supabase stack.
// `astro dev`'s Vite dep-optimizer discovers dependencies lazily, per route,
// the first time each route's component tree actually renders — not just at
// server startup (see astro.config.mjs's optimizeDeps comment). Playwright's
// webServer readiness check only confirms the HTTP port answers; it proves
// nothing about any *specific* route having been rendered yet. The first real
// render of each route can land mid dependency re-scan and crash SSR (React
// "Invalid hook call" / "Cannot read properties of null", torn-out island
// markup) — including protected routes (dashboard, training-profile, plan),
// which a plain warm-up GET can't reach because middleware redirects
// unauthenticated requests before their component tree ever renders.
//
// Fix: sign up one throwaway warm-up user here and use its session cookie to
// render every route the real test will hit — public and protected — so each
// route's dependency graph is fully discovered and stable before the actual
// test's requests land on it.
async function warmUpDevServer(): Promise<void> {
  const baseURL = "http://localhost:4321";

  const get = async (path: string, cookie?: string) => {
    const res = await fetch(`${baseURL}${path}`, {
      redirect: "manual",
      headers: cookie ? { cookie } : undefined,
    });
    await res.text();
    return res;
  };

  await get("/");
  await get("/auth/signup");
  await get("/auth/signin");

  const email = `e2e-warmup-${Date.now()}@example.com`;
  const signupRes = await fetch(`${baseURL}/api/auth/signup`, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams({ email, password: "WarmUp123!" }),
  });
  const cookie = signupRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  await get("/auth/confirm-email", cookie);
  await get("/dashboard", cookie);
  await get("/training-profile", cookie);
  await get("/plan", cookie);
}

export default async function globalSetup(): Promise<void> {
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

  await warmUpDevServer();
}
