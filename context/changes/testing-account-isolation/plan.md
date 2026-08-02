# Account Isolation Integration Tests — Implementation Plan

## Overview

Bootstrap a real-database integration-test layer — local Docker Supabase,
separate from Phase 1's `environment: "node"` unit runner — and prove account
isolation holds for both per-user tables (`profiles`, `plans`): reads, updates,
and deletes across users, plus the anon-sees-nothing and same-user-succeeds
baselines. This closes a loop every prior slice opened and deferred: F-01
promised "S-01 turns this into an automated test," S-01 shipped a manual SQL
script instead and re-deferred to "the `/10x-e2e` phase," and no later slice
ever picked it up. No automated isolation test exists anywhere in this repo
today.

## Current State Analysis

- Exactly one Supabase client factory exists (`src/lib/supabase.ts:6-25`),
  cookie/session-bound via `@supabase/ssr`'s `createServerClient` — no
  service-role client anywhere in the codebase (confirmed by an exhaustive
  grep in research).
- Every read/write service function (`getProfile`, `upsertProfile`,
  `savePlan`, `getPlans`, `getPlanById`) takes a plain `SupabaseClient` as a
  parameter and applies an explicit `userId` filter in addition to RLS —
  defense-in-depth, consistently applied.
- Both migrations' RLS policies are deny-by-default, `to authenticated` only,
  `using (auth.uid() = user_id)` (`with check` for insert/update); no `anon`
  policy on either table (`supabase/migrations/20260627202445_create_profiles.sql:42-67`,
  `supabase/migrations/20260628105841_create_plans.sql:18-44`).
- `supabase/config.toml` is already checked in with `enable_confirmations =
  false` (lines 209, 244) — local signup produces an immediately usable
  session, no email-confirmation step.
- `supabase/scripts/verify-profiles-rls.sql` exists as prior art but
  manipulates `request.jwt.claims`/`role` via raw Postgres GUCs, requiring a
  privileged connection that bypasses real GoTrue JWT issuance/verification.
  It is not a substitute for the test this phase adds.
- The checked-in `.env` points at the **hosted** Supabase project
  (`.env.example` shows `SUPABASE_URL=###` / `SUPABASE_KEY=###`, and research
  confirmed the real `.env` resolves to a `supabase.co` domain) — this
  phase's test must never read that file.
- Phase 1 (`context/changes/testing-plan-soundness/`) already delivered
  Vitest 4.1.10, `vitest.config.ts` (`environment: "node"`, `@/` alias), and
  a CI step (`npm run test`) — all unit-only, zero env-var or database
  dependency.

## Desired End State

- `npm run test:integration` runs a real-database suite proving: user B
  cannot read, update, or delete user A's profile or plan rows (RLS +
  service-layer defense-in-depth both exercised through a real signed-in
  session, not a mock); an anonymous request sees zero rows; a user reading/
  writing their own data still succeeds normally.
- This suite is entirely separate from `npm run test` — the fast unit suite
  from Phase 1 stays exactly as hermetic and fast as it was, unaffected by
  Docker/database availability.
- A new CI job provisions a local Supabase stack (Docker + Supabase CLI) and
  runs the integration suite, gated independently from the existing
  lint/unit/build job.
- `context/foundation/test-plan.md` §6.3 reads as a filled-in cookbook entry
  instead of "TBD — see §3 Phase 2."

### Key Discoveries:

- `src/lib/services/profile.ts` and `src/lib/services/plans.ts` take a
  plain `SupabaseClient<Database>` as a parameter — a test can construct one
  directly with `@supabase/supabase-js`'s `createClient` (not the SSR cookie
  wrapper, which needs a real HTTP request/response cycle this test doesn't
  have) and call these exact functions with two real signed-in users. No
  Playwright, no dev server, no browser.
- Node 22 (`.nvmrc`) has `process.loadEnvFile()` built in — no `dotenv`
  dependency needed to load a local-only env file into a Vitest run.
- Neither `profiles` nor `plans` has any app-level update/delete UI, but both
  tables' RLS policies define `update_own`/`delete_own` — these are
  currently exercised by zero app code and zero tests. This phase tests them
  directly against the Postgrest client, since the guardrail is a database
  policy, not gated by which app code happens to call it today.
- `supabase start` prints the local API URL and anon key to stdout; `supabase
  status -o env` prints the same connection info in `KEY=VALUE` shell-export
  form — either can seed `.env.test.local` locally or `$GITHUB_ENV` in CI.

## What We're NOT Doing

- **Not testing through Playwright or a running dev server.** The isolation
  risk is a database-policy question, not a UI/routing question; Vitest +
  local Supabase exercises the actual mechanism at risk more directly and
  more cheaply. Promoting to e2e here would violate test-plan §1 principle
  #1.
- **Not touching the hosted Supabase project.** Every test user, session,
  and assertion runs against a local, disposable Docker stack; the hosted
  `.env` is never read by this suite.
- **Not automating `supabase/scripts/verify-profiles-rls.sql`.** That script
  bypasses real authentication; this phase's tests go through real
  `auth.signUp` instead, which is a stronger proof, so the old script is left
  as-is (historical reference, not deleted).
- **Not adding plan-editing UI or app-level update/delete endpoints for
  plans/profiles.** The update/delete RLS checks in this phase call the
  Postgrest client directly — this is a test-only action, not new product
  surface. (Matches the PRD non-goal: no manual plan editing in v1.)
- **Not changing `middleware.ts`'s `PROTECTED_ROUTES` or route-level auth
  guards** — those are unrelated to the RLS/service-layer boundary under
  test here.

## Implementation Approach

Four phases, ordered by dependency and cost × signal:

1. Stand up the integration-test infrastructure first — separate Vitest
   config, env loading, a shared test-user helper, the CI job — proven by
   one real smoke test (two real signups against local Supabase, confirming
   distinct sessions), before any risk-bearing assertion is written.
2. `profiles` isolation next: single-row reads plus the update/delete RLS
   policies that currently have zero coverage from any layer.
3. `plans` isolation: list + single-item reads (the two shapes `getPlans`/
   `getPlanById` already handle), plus update/delete RLS on a table with no
   app-level edit path at all.
4. Cookbook update: pure documentation, folding in the pattern just shipped.

## Critical Implementation Details

- **`process.loadEnvFile` must not throw when the file is absent (CI case).**
  In CI, `$GITHUB_ENV` supplies the values directly (exported by the job
  after `supabase start`); there is no `.env.test.local` file on the runner.
  The Vitest `setupFiles` entry must wrap the call in try/catch (or check
  existence first) so CI doesn't fail on a missing file that's only expected
  to exist on a developer's machine.
- **The test client needs `auth: { persistSession: false, autoRefreshToken:
  false }`.** `@supabase/supabase-js`'s default auth storage assumes a
  browser `localStorage`; without disabling persistence, a Node test process
  emits storage warnings/errors. This has nothing to do with RLS — it's
  purely to keep the client usable in `environment: "node"`.
- **Test user emails must be unique per run, not fixed strings.** The local
  Supabase Docker volume persists between `start`/`stop` unless explicitly
  reset, so a fixed email (`test-a@example.com`) would fail with "User
  already registered" on the second run. Generate with `crypto.randomUUID()`
  per test-suite invocation.
- **Phase 1's `vitest.config.ts` needs an explicit exclude.** Vitest's
  default test-file glob matches any path ending in `.test.ts`, which would
  also match this phase's `*.integration.test.ts` files, defeating the
  separate-script/separate-CI-job design from the plan discussion. Add
  `test.exclude` for `**/*.integration.test.ts` to the existing
  `vitest.config.ts` (Phase 1's file) in this phase's first change.

## Phase 1: Integration-test infrastructure bootstrap

### Overview

Stand up everything needed to run a real-database test against local
Supabase, separate from Phase 1's unit runner, and prove the whole chain
works with one real smoke test.

### Changes Required:

#### 1. Exclude integration tests from the unit config

**File**: `vitest.config.ts` (Phase 1's file, modified)

**Intent**: Prevent the fast unit suite from picking up the new
Docker-dependent test files by filename pattern.

**Contract**: Add `test.exclude: ["**/*.integration.test.ts"]` alongside the
existing `environment: "node"`.

#### 2. Integration Vitest config

**File**: `vitest.integration.config.ts` (new, repo root)

**Intent**: A second Vitest config targeting only `*.integration.test.ts`
files, sharing the same `@/` alias, with a `setupFiles` entry that loads the
local-only env file.

**Contract**:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
  },
});
```

#### 3. Env-loading setup file

**File**: `vitest.integration.setup.ts` (new, repo root)

**Intent**: Load `SUPABASE_URL`/`SUPABASE_KEY` for the local stack from a
gitignored, test-only file — never the hosted `.env` — tolerating its
absence in CI where the job exports the values directly.

**Contract**:

```ts
try {
  process.loadEnvFile(".env.test.local");
} catch {
  // Absent in CI, where the job exports SUPABASE_URL/SUPABASE_KEY directly
  // after `supabase start`.
}
```

#### 4. Local env template

**File**: `.env.test.local.example` (new, repo root)

**Intent**: Mirror the existing `.env.example` convention for the
integration suite's own env source, pointing at the well-known local
Supabase defaults.

**Contract**:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=###
```

A comment above `SUPABASE_KEY` instructs: "run `supabase start` (or `supabase
status -o env`) and copy the printed anon key here." `.env.test.local` itself
is added to `.gitignore` alongside `.env`/`.dev.vars`.

#### 5. Shared test-user helper

**File**: `src/lib/test-helpers/integration-users.ts` (new)

**Intent**: One reusable way to create a real, signed-in throwaway user
against the local stack — used identically by this phase's smoke test and
by Phases 2 and 3, so the signup/client-construction logic exists exactly
once.

**Contract**: `createTestUser(): Promise<{ client: SupabaseClient<Database>;
userId: string }>` — constructs a client via `@supabase/supabase-js`'s
`createClient<Database>(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession:
false, autoRefreshToken: false } })`, signs up with a
`crypto.randomUUID()`-based email, and returns the now-authenticated client
plus the created user's id. Throws if signup fails (no user, no error
swallowing) — a broken local stack should fail loudly, not silently produce
an unauthenticated client.

#### 6. Smoke test

**File**: `src/lib/test-helpers/integration-users.integration.test.ts` (new)

**Intent**: Prove the whole chain — local Supabase reachable, signup works,
a real session is issued — before any isolation assertion is written.

**Contract**: Call `createTestUser()` twice; assert both calls return a
non-null `userId`, the two ids differ, and each returned client's
`auth.getUser()` resolves to a user whose `id` matches the id returned by
`createTestUser`.

#### 7. Integration script

**File**: `package.json`

**Intent**: Expose the integration suite as its own command, independent of
`npm run test`.

**Contract**: `scripts` gains `"test:integration": "vitest run --config
vitest.integration.config.ts"`.

#### 8. CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the integration suite in CI, independently of the existing
lint/unit/build job, so a Docker/Supabase hiccup can't block the fast gate
and vice versa.

**Contract**: A second job (e.g. `integration`) in the same workflow,
`runs-on: ubuntu-latest`: checkout → `actions/setup-node@v4` (node 22) →
`npm ci` → the Supabase CLI's setup action → `supabase start` → export
`SUPABASE_URL`/`SUPABASE_KEY` from `supabase status -o env` (or parsed
`supabase start` stdout) into `$GITHUB_ENV` → `npm run test:integration` →
`supabase stop` (in an `if: always()` step, so a failed test run still
tears down the containers). No hosted `SUPABASE_URL`/`SUPABASE_KEY` repo
secrets are needed for this job — confirm the exact Supabase CLI setup
action name/version against what's actually published at implementation
time (research identified `supabase/setup-cli` as the documented approach;
pin its current stable tag when wiring this job).

### Success Criteria:

#### Automated Verification:

- [ ] `supabase start` succeeds locally and the smoke test passes:
      `npm run test:integration`
- [ ] `npm run test` (Phase 1's unit suite) still passes and does not pick
      up any `*.integration.test.ts` file
- [ ] `npm run lint` passes on all new files
- [ ] `npm run build` still passes unaffected

#### Manual Verification:

- [ ] A push/PR CI run shows the new `integration` job provisioning
      Docker/Supabase and passing, independently of the existing job

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the CI run was observed before proceeding to Phase 2. Docker is required to
run this phase's tests locally — verification of the automated criteria
above must happen on a machine with Docker available, not in a sandboxed
research/planning environment.

---

## Phase 2: Profile isolation tests

### Overview

Prove `profiles` isolation across every operation the RLS policies define —
select, update, delete — using real signed-in users, plus the anon and
same-user baselines that keep the check from being accidentally over-broad.

### Changes Required:

#### 1. Profile isolation suite

**File**: `src/lib/services/profile.integration.test.ts` (new)

**Intent**: Prove user B cannot read, update, or delete user A's profile
through the app's own service functions (`getProfile`) and through the raw
Postgrest client for the operations that layer doesn't expose
(update/delete — `profiles.ts` only ever upserts the caller's own row).

**Contract**: `beforeAll` creates two users via `createTestUser()` and has
user A create a profile via `upsertProfile`. Required cases:

- User B calling `getProfile(clientB, userA.userId)` receives `null` — not
  user A's data. (Grounds Risk #1's core claim directly through the actual
  service function the app uses.)
- User B attempting `clientB.from("profiles").update({ age: 99
  }).eq("user_id", userA.userId)` affects zero rows; a subsequent
  `getProfile(clientA, userA.userId)` as user A shows the original,
  unmutated value.
- User B attempting `clientB.from("profiles").delete().eq("user_id",
  userA.userId)` affects zero rows; the row still exists for user A
  afterward.
- An anonymous client (`createClient` with no signed-in session)
  attempting `getProfile(anonClient, userA.userId)` receives `null`.
- **Negative control**: user A calling `getProfile(clientA, userA.userId)`
  for their own row succeeds and returns the expected data — proves the
  isolation checks above are actually testing cross-user denial, not a
  universal read failure.

**Anti-pattern avoided**: testing isolation through a mocked database
client — every assertion above runs against the real local Postgres/RLS
through a real signed-in session; nothing here is a mock, and nothing
green-lights on a policy that was never actually evaluated.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:integration` passes, including all
      `profile.integration.test.ts` cases
- [ ] `npm run lint` passes on the new file
- [ ] `npm run test` (unit suite) remains unaffected

#### Manual Verification:

- [ ] A reviewer confirms each cross-user assertion checks an actual
      row-count/return-value (zero rows affected, `null` returned), not just
      "no error was thrown" — a silently-swallowed error would look like a
      pass without proving isolation

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation before proceeding to
Phase 3.

---

## Phase 3: Plan isolation tests

### Overview

Prove `plans` isolation across the two read shapes the app actually uses
(list, single-item) plus update/delete RLS that no app code exercises today,
using the same real-user pattern as Phase 2.

### Changes Required:

#### 1. Plan isolation suite

**File**: `src/lib/services/plans.integration.test.ts` (new)

**Intent**: Prove user B cannot list, read, update, or delete user A's
saved plans, through both the app's service functions (`getPlans`,
`getPlanById`) and the raw Postgrest client for update/delete.

**Contract**: `beforeAll` creates two users via `createTestUser()` and has
user A save a plan via `savePlan` (reusing a literal `WorkoutPlan` /
`ProfileSnapshot` fixture in the same style as Phase 1's unit-test
fixtures). Required cases:

- User B calling `getPlans(clientB, userA.userId)` receives an empty array —
  not user A's plan. (This call is scoped by `userId`, so it also proves
  the parameter can't be used to read another user's list even if a caller
  tried; the real risk is a route ever passing the wrong id, which this
  test would catch as a non-empty result.)
- User B calling `getPlanById(clientB, userA.userId, planId)` receives
  `null` — matching production's actual behavior at `src/pages/plan/[id].astro`,
  which treats `null` as "redirect to `/dashboard`."
- User B attempting `clientB.from("plans").update({ plan: {...} }).eq("id",
  planId)` affects zero rows; a subsequent `getPlanById(clientA, ...)` as
  user A shows the original, unmutated plan.
- User B attempting `clientB.from("plans").delete().eq("id", planId)`
  affects zero rows; the row still exists for user A afterward via
  `getPlanById`.
- An anonymous client attempting `getPlanById(anonClient, userA.userId,
  planId)` receives `null`.
- **Negative control**: user A calling `getPlanById(clientA, userA.userId,
  planId)` for their own plan succeeds and returns the saved plan.

**Anti-pattern avoided**: same as Phase 2 — no mocked client, every
assertion runs through real RLS with a real session.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:integration` passes, including all
      `plans.integration.test.ts` cases
- [ ] `npm run lint` passes on the new file
- [ ] `npm run test` (unit suite) remains unaffected

#### Manual Verification:

- [ ] A reviewer confirms the `getPlanById` cross-user case matches the
      real production behavior at `src/pages/plan/[id].astro` (null → treated
      as not-found), so the test's oracle is the actual route contract, not
      an assumption about it

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation before proceeding to
Phase 4.

---

## Phase 4: Cookbook update

### Overview

Fill in `context/foundation/test-plan.md` §6.3 with the pattern just
shipped, replacing its "TBD — see §3 Phase 2" placeholder. Doc-only.

### Changes Required:

#### 1. §6.3 — Adding an account-isolation test

**File**: `context/foundation/test-plan.md`

**Intent**: Record the real-user, real-database isolation pattern — local
Docker Supabase, a shared `createTestUser()` helper, direct Postgrest calls
for operations the app doesn't expose, and the negative-control/anon-baseline
discipline — as the template for any future per-user-table isolation test.

**Contract**: Replace the §6.3 placeholder with a short walkthrough
referencing `src/lib/test-helpers/integration-users.ts`,
`profile.integration.test.ts`, and `plans.integration.test.ts` as the
canonical examples, restating why a mocked database client cannot
substitute and why the update/delete RLS policies needed direct Postgrest
calls rather than app-level functions.

### Success Criteria:

#### Automated Verification:

- [ ] None — documentation-only change; `npm run test`/`npm run
      test:integration` are unaffected and continue passing

#### Manual Verification:

- [ ] §6.3 no longer reads "TBD"; it references the actual test files
      shipped in Phases 1–3 and is legible to someone who did not write this
      plan

**Implementation Note**: This is the final phase of this change. After
manual verification, the change is ready to move toward archival per its
own process.

---

## Testing Strategy

### Unit Tests:

None in this phase — Phase 1 of the overall test-plan rollout already owns
unit coverage.

### Integration Tests:

- `src/lib/test-helpers/integration-users.integration.test.ts` — smoke test
  (Phase 1)
- `src/lib/services/profile.integration.test.ts` — profile isolation
  (Phase 2)
- `src/lib/services/plans.integration.test.ts` — plan isolation (Phase 3)

### Manual Testing Steps:

1. Run `supabase start`, populate `.env.test.local` from its printed output,
   then `npm run test:integration` locally after each phase.
2. After Phase 1, push a commit and confirm the new CI `integration` job
   provisions Docker/Supabase and passes independently of the existing job.
3. After Phase 3, manually sign in as two real users in a browser against
   the local stack and confirm `/plan/<id>` for a foreign plan id redirects
   to `/dashboard`, matching what the automated test asserts.

## Performance Considerations

Container boot adds real time (tens of seconds) to CI, which is why this
suite runs in its own job rather than blocking the fast lint/unit/build
gate. Local runs pay the same cost once per `supabase start` invocation,
amortized across the whole suite via the `beforeAll`-scoped test users.

## Migration Notes

No new migration in this phase — the RLS policies already exist for
`update`/`delete` on both tables; this phase only adds tests exercising
them. `supabase/config.toml` is unchanged (already correctly configured for
local dev per research).

## Open Risks & Assumptions

- **The exact Supabase CLI GitHub Action name/version for CI is unverified
  in this session** (no live web access or Docker available while planning).
  Research identified `supabase/setup-cli` as the documented approach;
  Phase 1's CI-job implementation step should confirm the current tag
  against the actual published action before pinning it.
- **The local anon key is not hardcoded anywhere in this repo or plan** —
  by design, since it's environment-specific output from `supabase start`.
  A developer must run it once and populate `.env.test.local` themselves;
  this is a one-time local setup cost, not a recurring one.
- **`.env.test.local` needs a `.gitignore` entry.** Implementation must add
  it alongside the existing `.env`/`.dev.vars` entries — omitting this would
  risk a local anon key (harmless, since it's a well-known local-dev default,
  but still hygiene) landing in a commit.

## References

- Research: `context/changes/testing-account-isolation/research.md`
- Change identity: `context/changes/testing-account-isolation/change.md`
- Client factory: `src/lib/supabase.ts:6-25`
- Profile service: `src/lib/services/profile.ts`
- Plans service: `src/lib/services/plans.ts`
- Profiles RLS: `supabase/migrations/20260627202445_create_profiles.sql:42-67`
- Plans RLS: `supabase/migrations/20260628105841_create_plans.sql:18-44`
- Existing manual script (prior art, not reused): `supabase/scripts/verify-profiles-rls.sql`
- Prior deferral chain: `context/archive/2026-06-27-data-rls-baseline/plan.md`,
  `context/archive/2026-06-27-training-profile/plan.md`,
  `supabase/migrations/README.md:74-84`
- Phase 1 of the test-plan rollout (Vitest bootstrap, unaffected):
  `context/changes/testing-plan-soundness/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a
> step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration-test infrastructure bootstrap

#### Automated

- [ ] 1.1 `supabase start` succeeds locally and `npm run test:integration`
      smoke test passes (**blocked**: no Docker in this environment — see
      note below)
- [x] 1.2 `npm run test` still passes and does not pick up
      `*.integration.test.ts` — 3dd0240
- [x] 1.3 `npm run lint` passes on all new files — 3dd0240
- [x] 1.4 `npm run build` still passes unaffected — 3dd0240

#### Manual

- [ ] 1.5 A push/PR CI run shows the new `integration` job provisioning
      Docker/Supabase and passing independently of the existing job

### Phase 2: Profile isolation tests

#### Automated

- [ ] 2.1 `npm run test:integration` passes, including all
      `profile.integration.test.ts` cases (**blocked**: no Docker in this
      environment — verified instead that the suite fails at the expected
      network boundary, not from a coding error, with and without dummy env
      vars)
- [x] 2.2 `npm run lint` passes on the new file — 9cc923c
- [x] 2.3 `npm run test` (unit suite) remains unaffected — 9cc923c

#### Manual

- [x] 2.4 A reviewer confirms each cross-user assertion checks an actual
      row-count/return-value, not just "no error was thrown" — 9cc923c

### Phase 3: Plan isolation tests

#### Automated

- [ ] 3.1 `npm run test:integration` passes, including all
      `plans.integration.test.ts` cases (**blocked**: no Docker in this
      environment — verified instead that the suite fails at the expected
      network boundary, not from a coding error)
- [x] 3.2 `npm run lint` passes on the new file — b2fed40
- [x] 3.3 `npm run test` (unit suite) remains unaffected — b2fed40

#### Manual

- [x] 3.4 A reviewer confirms the `getPlanById` cross-user case matches the
      real production behavior at `src/pages/plan/[id].astro` — b2fed40

### Phase 4: Cookbook update

#### Manual

- [x] 4.1 §6.3 no longer reads "TBD" and references the actual test files
      shipped — b8e2cfc
