---
date: 2026-08-02T23:30:19+02:00
researcher: Claude (10x-research)
git_commit: 328a7a28ed7cdf5e20362bdc0fad5f7477ee6fe1
branch: master
repository: treningo
topic: "Ground test-plan Phase 2 — account isolation (Risk #1)"
tags: [research, codebase, rls, supabase, isolation, vitest, integration-tests]
status: complete
last_updated: 2026-08-02
last_updated_by: Claude (10x-research)
---

# Research: Test-plan Phase 2 — account isolation (Risk #1)

**Date**: 2026-08-02T23:30:19+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: `328a7a28ed7cdf5e20362bdc0fad5f7477ee6fe1`
**Branch**: master
**Repository**: treningo

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` ("Account isolation") for change folder `context/changes/testing-account-isolation/`.

Verify — not blindly accept — the risk response guidance for Risk #1: a signed-in user reaches another account's saved plan or body metrics (age, weight, lifts). Determine whether a local Docker Supabase stack or the hosted-linked project is the right target for "two real authenticated users against a real database," whether Vitest alone can drive this, and whether any automated isolation test already exists.

## Summary

**No automated isolation test exists anywhere in this repo today.** Every prior slice (F-01, S-01/training-profile, S-03/save-plan, S-04/browse-saved-plans) verified isolation manually — two browser/SQL sessions, checked off as a manual Progress item, never automated. `supabase/migrations/README.md:84` explicitly promised "S-01 turns this into an automated test against `profiles`"; S-01 delivered a manual SQL script (`supabase/scripts/verify-profiles-rls.sql`) instead and re-deferred automation to `/10x-e2e`, which never ran. This is now Phase 2's job.

**The architecture is clean for this test.** There is exactly one Supabase client factory in the app (`src/lib/supabase.ts:6-25`), always cookie/session-bound via `@supabase/ssr`'s `createServerClient` — no service-role client exists anywhere (`grep` for `service_role`/`SERVICE_ROLE` across `src/` and `supabase/` returns zero hits). Every read/write service function in `src/lib/services/profile.ts` and `plans.ts` takes an already-constructed `SupabaseClient` as a parameter and applies an explicit `userId` filter in addition to RLS — defense-in-depth is real and consistent, not applied in only some places. Both migrations' RLS policies are deny-by-default, `to authenticated` only, `using (auth.uid() = user_id)`.

**The cheapest layer that actually proves the policy is Vitest + a local Docker Supabase stack — not Playwright/e2e, and not a mocked client.** `supabase/config.toml` is already checked in (`npx supabase init` has already run once); only `supabase start` is needed to bring up a full local Postgres+Auth+PostgREST stack, migrations auto-apply on boot, and it can be destroyed with zero risk to the hosted project. `@supabase/supabase-js`'s `createClient` (not the SSR cookie wrapper) can sign up two real throwaway users against `http://127.0.0.1:54321`, obtain real sessions, and call `getProfile`/`getPlanById`/`getPlans` directly — this exercises the actual RLS mechanism through the actual anon-key + JWT path, with no HTTP layer, browser, or dev server needed. This is strictly cheaper than Playwright, which would still need the same Postgres+RLS backend underneath and would only add browser flake on top for the same signal — a clear violation of test-plan §1 principle #1 if chosen anyway.

**Two real, un-obvious gaps to close before planning:**

1. **Docker is not available in this session's sandbox.** The isolation test can be written now, but running it requires a machine (dev laptop, CI runner) with Docker — `ubuntu-latest` GitHub Actions runners have Docker natively, and Supabase publish a `setup-cli` Action, so CI is achievable, but the test cannot be executed inside this research/planning session for verification. Planning must account for this: `/10x-implement` will need to run `supabase start` itself, or the test needs to be validated by the user's own machine.
2. **`.env` currently points at the hosted project, not local.** Nothing today auto-switches Vitest's environment between local and hosted, and Vitest's `environment: "node"` config from Phase 1 loads no env file at all. A naive test reading `.env` would silently target the hosted database. The isolation suite must read a *separate*, gitignored `.env.test.local` (or equivalent) pointed at `127.0.0.1:54321`, never the default `.env`.

Additionally, the existing `supabase/scripts/verify-profiles-rls.sql` is worth knowing about but is **not a substitute** for the automated test this phase needs: it manipulates `request.jwt.claims` and `role` directly via `set_config`/`set local role`, which requires a privileged/superuser Postgres connection and bypasses the actual GoTrue JWT-issuance and PostgREST-verification path entirely. It proves the *policy logic* is correct assuming `auth.uid()` resolves correctly — it does not prove the *app's real authentication path* delivers a correct `auth.uid()` for a genuinely signed-in user. Phase 2's test should go through real `auth.signUp`/`signInWithPassword`, not GUC simulation, to close that gap.

---

## Detailed Findings

### 1. Client/key architecture — no privileged bypass exists

`src/lib/supabase.ts:6-25` is the **only** Supabase client factory in the app:

```ts
export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: { getAll() {...}, setAll() {...} },
  });
}
```

`grep -rniE "service_role|serviceRole|SERVICE_ROLE"` across `src/` and `supabase/` → zero matches. All 14 call sites across middleware, API routes, and pages import this same factory — no alternate client, no admin/privileged path.

One residual, non-code risk worth naming: `astro.config.mjs:29-35` types `SUPABASE_KEY` as `envField.string({ context: "server", access: "secret", optional: true })` with no distinction from a service-role key — nothing in the schema or `.env.example` prevents an operator from pasting the wrong key in. This is a configuration-discipline risk, not a code-level RLS bypass; not in scope for a Vitest test, but worth a one-line note in the plan's Open Risks.

### 2. Defense-in-depth is consistently applied, not spotty

`src/lib/services/profile.ts`:
- `getProfile(supabase, userId)` — `.eq("user_id", userId).maybeSingle()`
- `upsertProfile(supabase, userId, dto)` — `.upsert({ ...dto, user_id: userId }, ...)`, `user_id` always server-derived

`src/lib/services/plans.ts`:
- `savePlan(supabase, userId, plan, profileSnapshot)` — `user_id` forced into the insert
- `getPlans(supabase, userId)` — `.eq("user_id", userId)` (list read)
- `getPlanById(supabase, userId, planId)` — `.eq("user_id", userId).eq("id", planId).maybeSingle()` (single-item read, returns `null` for foreign/nonexistent id rather than throwing)

Every read/write function takes `userId` as an explicit parameter and filters on it — confirmed for both single-row (profile) and list + single-item (plans) reads. `src/pages/plan/[id].astro:10-19` comments this explicitly: *"an id that isn't theirs (or doesn't exist) resolves to null → redirect to the list."*

### 3. RLS policies — verbatim, both tables

`supabase/migrations/20260627202445_create_profiles.sql:42-67` and `supabase/migrations/20260628105841_create_plans.sql:18-44` — identical shape for both tables: `alter table <t> enable row level security;` then four policies (`select`/`insert`/`update`/`delete`), each `to authenticated`, `using (auth.uid() = user_id)` (`with check` added for insert/update). No `anon` policy exists on either table — anonymous requests match zero rows by construction.

### 4. Route-level behavior on a foreign/missing resource

| Route | On foreign/missing id |
|---|---|
| `src/pages/plan/[id].astro:17-19` | `getPlanById` returns `null` → redirect to `/dashboard` (list page — there is no separate `plans.astro`; the saved-plans list lives on `dashboard.astro`) |
| `src/pages/api/profile.ts` | `getProfile` returns `null` if none saved yet — not a foreign-id case, this is single-profile-per-user |
| `src/pages/dashboard.astro:11-16` | `getPlans` returns `[]` if none — renders "Nie masz jeszcze zapisanych planów." |

No route returns a raw 200 with another user's data on any path checked — the explicit filter always narrows to the caller's own rows first.

### 5. Zero automated isolation tests exist anywhere; full deferral chain

`find . -name "*.test.ts" -o -name "*.spec.ts"` (excluding `node_modules`) → exactly 5 files, all from test-plan Phase 1, none touching RLS/database: `src/lib/utils.test.ts`, `src/lib/schemas/profile.test.ts`, `src/lib/schemas/plan.test.ts`, `src/lib/services/plan-generator.test.ts`, `src/lib/services/plan-validator.test.ts`. No Playwright config anywhere.

Deferral chain, with exact quotes:

1. **F-01 (`data-rls-baseline`, 2026-06-27)** created zero tables and deferred to S-01. `context/archive/2026-06-27-data-rls-baseline/plan.md:31`:
   > "**No automated RLS test harness** — deferred to S-01, which has a real table (`profiles`) to assert deny-by-default against. F-01 covers it via the reviewed template + documented manual SQL check."

   The convention artifact it produced, `supabase/migrations/README.md:84`, ends with an explicit unfulfilled promise:
   > "S-01 turns this into an automated test against `profiles`."

2. **S-01 (`training-profile`, 2026-06-27/28)** did not deliver that automation — it shipped the manual SQL script and re-deferred. `context/archive/2026-06-27-training-profile/plan.md`, "What We're NOT Doing":
   > "**No new test runner** — RLS isolation is verified manually + via a committed SQL script; automated test infra is deferred to the `/10x-e2e` phase."

   Its Manual Progress items (plan.md:409-411) confirm the check was performed by hand:
   > "1.5 Two-session RLS test passes (user B and anon see zero of user A's rows) — 0d22254"

   `context/archive/2026-06-27-training-profile/reviews/impl-review.md` contains zero mentions of RLS or isolation — the automation gap was never flagged as missing by review; it simply lapsed silently.

3. **No later slice ever picked it up.** `context/archive/2026-06-28-gemini-plan-generation/plan.md:85` — "manual (or `/10x-e2e` later)"; `context/archive/2026-06-28-personalized-plan-generation/plan.md:102-103` — "the `/10x-e2e` skill owns that later"; `context/archive/2026-06-28-save-plan/plan.md:303` — manual step "Sign in as a second user; confirm they cannot read the first user's rows (RLS)."; `context/archive/2026-06-29-browse-saved-plans/plan.md:319-320` — same manual pattern, plus the "Critical Implementation Details" defense-in-depth note quoted in §2 above.

### 6. The existing manual-verification script — real prior art, but not a substitute

`supabase/scripts/verify-profiles-rls.sql` (64 lines) implements the README's manual procedure as a transaction that rolls back, leaving no trace. It works by directly manipulating Postgres session state:

```sql
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('myapp.user_a'), 'role', 'authenticated')::text,
  true
);
```

This requires a **privileged Postgres connection** (able to `set local role` and fabricate `request.jwt.claims` directly) — a connection string with enough access to do this is not the anon-key + real-JWT path the app actually uses in production. It proves the *policy predicate* (`auth.uid() = user_id`) is correct given a claimed identity, but does **not** exercise GoTrue's real JWT issuance or PostgREST's real JWT verification — i.e., it cannot catch a bug in *how the app authenticates*, only a bug in *the policy itself*. The risk response guidance's "must challenge" cell ("RLS is enabled ≠ isolation holds... policies can exist and still not be exercised on the path the app actually takes") applies with extra force here: this script is real SQL against a real database, not a mock, but it still sidesteps the actual authentication path. Phase 2's automated test should go through real `auth.signUp`/`signInWithPassword` against a running Supabase Auth (GoTrue) instance, not GUC simulation, to close that specific gap.

### 7. Local Docker Supabase vs. hosted-linked — genuinely separate systems

CLAUDE.md documents two independent workflows:

- **Local dev stack** (`npx supabase init` / `npx supabase start`) — full Postgres + GoTrue + PostgREST via Docker Compose, state in `supabase/config.toml` (already checked in — confirmed present, so only `supabase start` is needed) and Docker volumes.
- **Hosted-linked migrations** (`supabase login` / `db:link` / `db:push`) — touches only `supabase/.temp/` (gitignored) and remote credentials.

`supabase/config.toml` already sets `enable_confirmations = false` and `site_url = "http://127.0.0.1:3000"` — local signup produces an immediately usable session, no email-confirmation step to work around.

Confirmed: the checked-in `.env` currently points at the **hosted** project (`SUPABASE_URL` resolves to a `supabase.co` domain). Nothing today would stop a naive test from hitting hosted by accident — the test setup must explicitly target `http://127.0.0.1:54321` via a separate, gitignored env source, never fall back to `.env`.

Tooling present: `supabase` CLI is already a devDependency (`^2.23.4` in `package.json`; the environment resolved `2.108.0` via `npx`, a version drift worth noting but not blocking). `@supabase/supabase-js@^2.99.1` / `@supabase/ssr@^0.10.3` are already dependencies. `auth.signUp`/`signInWithPassword` are plain GoTrue REST calls — identical behavior against `127.0.0.1:54321` or a hosted domain, no special-casing needed.

**Docker is not available in this research session** (`which docker` → empty) — this doesn't block writing the test, but `/10x-implement` will need an environment with Docker (a dev machine, or CI) to actually run and verify it.

### 8. Vitest alone is sufficient — no Playwright needed

Because `getProfile`/`getPlanById`/`getPlans`/etc. take a plain `SupabaseClient<Database>` as a parameter, a test can construct one directly with `@supabase/supabase-js`'s `createClient` (not the SSR cookie wrapper — that needs a real HTTP request/response cycle this test doesn't have), sign in two real throwaway users, and call these exact service functions. This tests the actual RLS policy through the actual anon-key + JWT path — no Astro dev server, no browser, no Playwright.

`vitest.config.ts` (from Phase 1) is bare: `environment: "node"`, `@/` alias only — no env-file loading. Node 22 (per `.nvmrc`) supports `process.loadEnvFile()` natively; no new dependency (`dotenv`) is needed. The env file read must be separate from `.env` (see §7) — e.g. `.env.test.local`, gitignored, containing the local stack's printed URL/anon key.

### 9. CI is achievable, and should run there per the test plan's own gate

`.github/workflows/ci.yml` runs on `ubuntu-latest`, which has Docker natively. Supabase publishes a `setup-cli` GitHub Action; `supabase start` auto-applies `supabase/migrations/*.sql` on boot. A CI job would add: setup-cli → `supabase start` → run the isolation Vitest file against the printed local URL/anon key → `supabase stop`. This needs **none** of the hosted `SUPABASE_URL`/`SUPABASE_KEY` repository secrets the `build` step already uses — it is fully self-contained, which is a genuine advantage over any test that would need hosted credentials. This satisfies `test-plan.md` §5's gate row: "integration (isolation) — CI — required after §3 Phase 2."

### 10. `guided-plan-flow` — already implemented, does not touch authorization

`context/changes/guided-plan-flow/change.md` shows `status: implemented` (all Progress steps checked off, commits `2cab15f`, `b5e51c0`) — this is not an in-flight risk to Phase 2's test surface. It touches only `src/pages/api/profile.ts` (a `getProfile` read added before `upsertProfile`, purely to pick a redirect target) and `src/components/plan/PlanView.tsx` (a conditional `/plans` link). It explicitly states `upsertProfile`'s signature is unchanged and there is no change to `/api/plan/save`'s contract. **No change to RLS, to how any service function scopes by `user_id`, or to `middleware.ts`'s `PROTECTED_ROUTES`.** Tests written now for Risk #1 will not be invalidated by it.

---

## Code References

- `src/lib/supabase.ts:6-25` — the single Supabase client factory, cookie/session-bound
- `src/middleware.ts:4,18-21` — `PROTECTED_ROUTES` gate; covers `/plan` (and thus `/plan/[id]`) via prefix match
- `src/lib/services/profile.ts:13-14,24-29` — `getProfile`/`upsertProfile`, explicit `userId` filter
- `src/lib/services/plans.ts:21-25,33-38,49-50` — `savePlan`/`getPlans`/`getPlanById`, explicit `userId` filter on every function
- `src/pages/plan/[id].astro:10-19` — foreign/missing id → `null` → redirect to `/dashboard`
- `src/pages/dashboard.astro:11-16` — plans list, empty array on no rows
- `supabase/migrations/20260627202445_create_profiles.sql:42-67` — profiles RLS policies
- `supabase/migrations/20260628105841_create_plans.sql:18-44` — plans RLS policies
- `supabase/scripts/verify-profiles-rls.sql` — existing manual GUC-simulation verification script; not a substitute for an auth-path-real test
- `supabase/config.toml` — already checked in; only `supabase start` needed locally
- `astro.config.mjs:29-35` — `SUPABASE_KEY` env schema, no anon/service-role type distinction
- `vitest.config.ts` — Phase 1's bare config; no env-file loading yet

## Architecture Insights

- **The service layer is the actual isolation boundary the app relies on, and RLS is the backstop** — every service function forces `userId` server-side and filters on it, so even a hypothetical RLS misconfiguration would still be caught by the explicit filter, and vice versa. A test that only checks RLS (e.g., a raw SQL script) or only checks the service filter (e.g., a test with a mocked client) each miss half of this defense-in-depth; the test should exercise both together by calling the real service functions against a real RLS-enabled database.
- **The codebase deliberately holds no service-role key** (per CLAUDE.md and confirmed by the zero `grep` hits) — this is a real architectural constraint, not just a convention note. Any test infrastructure must respect it: no admin/bypass client should be introduced just to make testing easier, or the test stops matching production reality.
- **Prior art exists but under-delivers.** The manual SQL script was a reasonable stopgap given no test runner existed at the time (2026-06-27) — but it is structurally incapable of proving the actual authentication path, only the policy predicate. Now that Phase 1 has a real runner, the honest fix is a new test that goes through real signup/sign-in, not an automation of the existing script.

## Historical Context (from prior changes)

- `context/archive/2026-06-27-data-rls-baseline/plan.md:31` — original RLS-test-harness deferral to S-01.
- `context/archive/2026-06-27-training-profile/plan.md` ("What We're NOT Doing") — re-deferral to `/10x-e2e`; this phase now closes that loop.
- `supabase/migrations/README.md:74-84` — the "Verifying isolation" procedure and its unfulfilled automation promise.
- `context/archive/2026-06-29-browse-saved-plans/plan.md:106-112` — the defense-in-depth pattern (`getPlanById` scoping by `user_id` AND `id`) quoted verbatim in §2 above; this is the pattern the Phase 2 test must exercise for the `plans` table specifically.
- `context/changes/guided-plan-flow/` — implemented, does not intersect this phase's scope (§10 above).

## Related Research

- `context/changes/testing-plan-soundness/research.md` — Phase 1's research (runner bootstrap, plan-soundness, schema parity); establishes that Vitest 4.1.10 with `environment: "node"` is already wired and CI-gated. This phase adds a real-database integration layer on top of that same runner, not a new one.

## Open Questions

None outstanding for planning — all risk-response-guidance cells were verified or corrected above. Two operational constraints for `/10x-plan` to design around (not open questions, but decisions the plan must make explicit): (1) how the isolation test suite loads a local-only env file without ever falling back to the hosted `.env`, and (2) how CI provisions Docker/Supabase CLI for the new gate, since this session's sandbox cannot execute that step itself to demonstrate it directly.
