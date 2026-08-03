# Persistence Round-Trip + Boundary Contracts — Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md`. Closes three risks:
#3 (a saved plan can come back in a different shape than it was saved in),
#5 (schema/database acceptance parity — the direction not yet proven: does the
database actually accept everything the zod schema accepts), and #6 (a
signed-in user can persist an arbitrarily large plan into jsonb storage — no
array-length cap exists anywhere today). All test types are integration,
reusing the Phase 2 Docker-Supabase harness as-is.

## Current State Analysis

- **Risk #3 is real, not speculative.** `getPlans`/`getPlanById`
  (`src/lib/services/plans.ts:33-56`) end in a bare `as SavedPlan[]` /
  `as SavedPlan | null` cast — `planSchema` is never re-imported or
  re-parsed on read (confirmed by grep: the only occurrence in `plans.ts` is
  a comment at line 32). `ProfileSnapshot` (`src/types.ts:67`) is derived
  from the *current* `profiles` Row shape, not a versioned zod schema, and
  `plans` has no schema-version column
  (`supabase/migrations/20260628105841_create_plans.sql`). The existing
  Phase 2 round trip in `plans.integration.test.ts` (`beforeAll` + first
  `it`, ~lines 49-68) only asserts `toHaveLength(1)` and `.id).toBe(planId)`
  — it never compares saved vs. read-back content.
- **Risk #5, acceptance direction.** Every `profiles` DB CHECK
  (`supabase/migrations/20260627202445_create_profiles.sql:27-36`) already
  has an equal-or-stricter zod bound in `src/lib/schemas/profile.ts` — the
  *rejection* direction shipped in Phase 1. The *acceptance* direction (does
  the DB really take what zod allows) has never been proven against a real
  database. For `plans`, the two jsonb columns (`plan`, `profile_snapshot`)
  carry **zero DB CHECK constraints** — so for that table, "acceptance"
  collapses into the same content-fidelity question as risk #3; there is
  nothing structurally distinct to assert.
- **Risk #6 is real and unchanged since it was raised and skipped.**
  `src/lib/schemas/plan.ts:44` (`planSessionSchema.exercises`) and `:48-50`
  (`planSchema.sessions`) have no `.max()`. `plan-validator.ts`'s
  `MAX_EXERCISES_PER_SESSION = 15` (line 16) is an advisory *soundness*
  guardrail only — and `validatePlan` is never even called from the save
  path (`src/pages/api/plan/save.ts` calls only `planSchema.safeParse`, not
  `validatePlan`). So `planSchema` is the *only* enforcement point that
  could ever reject an oversized plan before persistence — none exists
  today. `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F3
  flagged exactly this and was SKIPPED as "low risk"; research confirms the
  gap is still live.
- **Existing integration infra is complete and reusable as-is**:
  `vitest.integration.config.ts` (`environment: "node"`, include
  `**/*.integration.test.ts`, `setupFiles: ["./vitest.integration.setup.ts"]`),
  `src/lib/test-helpers/integration-users.ts` (`createTestUser()` /
  `createAnonClient()`), and CI's separate `integration` job
  (`.github/workflows/ci.yml`, already runs `supabase start` →
  `npm run test:integration` → `supabase stop`). No new infrastructure is
  needed — new specs matching `**/*.integration.test.ts` are picked up
  automatically both locally and in CI.

### Key Discoveries:

- `src/pages/api/plan/save.ts:40-44` — the only place `planSchema` is
  actually enforced before a row is written; this is the real target for
  risk #6, not `savePlan()` itself (which does no validation) and not
  `plan-validator.ts` (never called from this path).
- `src/lib/supabase.ts:1-25` (`createClient`) reads `SUPABASE_URL`/
  `SUPABASE_KEY` from `astro:env/server` — a virtual module that only
  resolves inside the Astro/Vite runtime, not in a plain-`node` Vitest
  environment. Testing `save.ts`'s `POST` handler directly therefore
  requires substituting `@/lib/supabase`'s `createClient` at the module
  boundary (`vi.mock`) with a function that returns an already-authenticated
  real integration-test client — mirroring the Phase 1 cookbook principle
  of faking only at the external-boundary, never the logic under test. This
  also sidesteps the SSR cookie-based session Phase 2 explicitly avoided
  ("needs a real HTTP request/response cycle this test doesn't have").
- `src/types.ts:68-71` (`SavedPlan`) confirms `plan`/`profile_snapshot` are
  the two fields whose write-time and read-time shapes could diverge —
  these are exactly what the round-trip test must deep-compare.

## Desired End State

A saved plan's `plan` and `profile_snapshot` content is proven, by a real
write-then-read integration test, to come back byte-for-byte equal to what
was saved and still parseable by the current `planSchema`. A profile saved
at its zod-accepted upper and lower bounds is proven to round-trip through
the real database unchanged. `planSchema` enforces a hard cap on
`sessions`/`exercises` array length, and a real-endpoint integration test
proves an oversized plan is rejected (400) with nothing persisted.
`context/foundation/test-plan.md` §3 Phase 3 row and §6.4 reflect what
shipped.

### Verification

`npm run test:integration` passes locally (Docker Supabase running) and in
CI's `integration` job; `npm run test` (unit) and `npm run lint` remain
green after the `planSchema` change.

## What We're NOT Doing

- Not adding a schema-version column to `plans` — that's a larger,
  unscoped migration; the round-trip test proves today's shape is stable,
  not that a future intentional schema change is guarded (noted as a
  residual risk, not fixed here).
- Not calling `validatePlan` from the save path — that would change product
  behavior (the accepted decision that soft-failure plans are still
  savable, per `context/archive/2026-06-28-save-plan/plan.md`) and is out
  of scope for a test-rollout phase.
- Not adding pagination, `.limit()`, or any other change to `getPlans` —
  unrelated to these three risks (already covered/accepted under risk #7 /
  Phase 4 territory).
- Not testing `profiles` at every boundary already covered by Phase 1's
  exhaustive rejection suite — only the two acceptance-direction extremes
  (max and min) are added here; re-testing every already-proven rejection
  case would duplicate `profile.test.ts`.
- Not promoting risk #6 to an e2e/Playwright test — the endpoint-level
  Vitest integration test (with only the Supabase-client-construction
  boundary substituted) gives the same signal for far less cost.

## Implementation Approach

Four sub-phases, ordered by dependency: the schema cap (risk #6's
enforcement point) must exist before the endpoint test that exercises it.
The two round-trip/acceptance tests (risk #3, #5) are independent of the
cap and could run in either order; they're sequenced after the cap so all
new integration specs land together for one review pass. A final sub-phase
updates the cookbook (§6.4, the exact placeholder this phase was meant to
fill) and per-phase notes (§6.6).

## Phase 1: Add array-length caps to `planSchema` (risk #6 enforcement point)

### Overview

Add a hard, save-blocking upper bound on `sessions` and `exercises` array
length — the only fix that makes risk #6 testable as "rejected before
persistence," since no other layer (validator, DB) enforces any bound
today.

### Changes Required:

#### 1. Schema caps

**File**: `src/lib/schemas/plan.ts`

**Intent**: Add two new "sane bounds" constants alongside the existing
`SETS_MIN`/`SETS_MAX`/`REST_MIN`/`REST_MAX`, and apply them as `.max()` on
`planSessionSchema.exercises` and `planSchema.sessions`. `EXERCISES_MAX`
is set to `15` — the same value as `plan-validator.ts`'s
`MAX_EXERCISES_PER_SESSION`, so the schema-layer save-blocking cap and the
soundness-layer structural-sanity check agree (a plan that fails one for
volume reasons fails the other too, avoiding a confusing split). Add a
one-line comment cross-referencing that file so the two constants are
found together if either changes. `SESSIONS_MAX` is set to `14` — double
`profile.ts`'s `training_days_per_week` max of `7` — since a legitimate
plan's session count must equal the profile's `training_days_per_week`
(enforced by `plan-validator.ts`'s day-count guardrail, though not
save-blocking), `14` gives headroom no legitimate plan can approach while
still bounding worst-case abuse.

**Contract**: `planSessionSchema.exercises: z.array(planExerciseSchema).max(EXERCISES_MAX)...`;
`planSchema.sessions: z.array(planSessionSchema).max(SESSIONS_MAX)...`. Keep
the existing `.describe()` text; append the cap to it (e.g. "Sesje
treningowe — dokładnie tyle, ile wynosi liczba dni treningowych użytkownika
(maks. 14)."). No other field changes.

#### 2. Boundary unit tests

**File**: `src/lib/schemas/plan.test.ts`

**Intent**: Extend the existing file with a new `describe` block covering
the two new caps, following the Phase 1 cookbook pattern (§6.1/§6.2):
hand-built fixtures at the boundary, not derived from the schema itself.

**Contract**: Add `describe("planSchema — array-length caps (Risk #6)", ...)`
with four `it` cases, each built from the file's existing `validPlanWith`
helper (or a small local variant that repeats a session/exercise N times):
sessions array at exactly `SESSIONS_MAX` → `safeParse(...).success === true`;
at `SESSIONS_MAX + 1` → `false`; exercises array (within one session) at
exactly `EXERCISES_MAX` → `true`; at `EXERCISES_MAX + 1` → `false`. Import
the two constants from `@/lib/schemas/plan` if exported, or hard-code the
literal boundary values with a comment pointing at the schema — prefer
exporting `SESSIONS_MAX`/`EXERCISES_MAX` from `plan.ts` so the test can
never silently drift from the real bound.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test` (includes the new `plan.test.ts` cases)
- Lint passes: `npm run lint`
- Type checking passes as part of `npm run build`

#### Manual Verification:

- None — this is a pure schema/unit change with no UI or runtime surface
  beyond what the unit tests already exercise.

---

## Phase 2: Persistence round-trip content-fidelity (Risk #3, folds in Risk #5 for `plans`)

### Overview

Prove that a plan saved in one call and read back in a separate call —
both through `getPlanById` and through `getPlans` — is deep-equal to what
was saved, and that the read-back `plan` still parses against the current
`planSchema`. This is the direct fix for the gap in the existing Phase 2
round-trip assertion (`plans.integration.test.ts`), which only checks `id`
and list length.

### Changes Required:

#### 1. New integration test file

**File**: `src/lib/services/plans-persistence.integration.test.ts`

**Intent**: A dedicated file (separate from `plans.integration.test.ts`,
which is scoped to account isolation) so this phase's risk ownership is
clear and future readers don't have to disentangle isolation assertions
from content-fidelity assertions in one file.

**Contract**: `beforeAll` creates one test user (`createTestUser()`), calls
`savePlan` with a **richer fixture** than the existing isolation test's
single-exercise plan — at least two sessions, at least one session with
two exercises, and a `profileSnapshot` with a mix of non-null and null
optional lift fields (`squat_kg` set, `bench_kg` null, etc.) — specifically
so a dropped, renamed, or null-coerced field would be caught. Reads the
saved id back once via `getPlans`.

Two `it` cases, both asserting on the **hand-written literal fixture
object** (the oracle), never on a value derived from the code under test:
1. `getPlanById` result: `expect(single?.plan).toEqual(seededPlan)` and
   `expect(single?.profile_snapshot).toEqual(seededSnapshot)`, plus
   `expect(planSchema.safeParse(single?.plan).success).toBe(true)` — the
   "still parses against the current schema" clause from the risk's
   response guidance.
2. `getPlans` list result: the same two `toEqual` assertions against
   `list[0]`, since `dashboard.astro` reads through `getPlans`, not
   `getPlanById` — a divergence between the two query shapes (e.g.
   different `.select()` columns) would otherwise go uncaught.

Anti-pattern avoided: never assert only `id` or array length (that's what
the existing isolation test already does and is not sufficient evidence
for this risk).

### Success Criteria:

#### Automated Verification:

- Integration tests pass: `npm run test:integration` (requires local
  `supabase start`, or runs in CI's `integration` job)
- Lint passes: `npm run lint`

#### Manual Verification:

- None — no UI surface; the integration suite against the real local
  database is the verification.

---

## Phase 3: Profile boundary-value acceptance round trip (Risk #5, `profiles`)

### Overview

Prove the real database accepts profile values at the exact zod-accepted
extremes — the acceptance direction Phase 1 didn't (and couldn't, being
unit-only) cover, and a parity guard against a future migration silently
tightening a CHECK without a matching zod update.

### Changes Required:

#### 1. New integration test file

**File**: `src/lib/services/profile-persistence.integration.test.ts`

**Intent**: Two `it` cases (not a full re-run of Phase 1's exhaustive
rejection matrix): one profile at the schema's upper boundary
(`age: 100, weight_kg: 500, training_days_per_week: 7, equipment` at least
one item, `squat_kg`/`bench_kg`/`deadlift_kg`/`ohp_kg: 1000`,
`plank_seconds: 3600`), one at the lower boundary (`age: 13`,
`weight_kg` just above `0`, e.g. `0.1`, `training_days_per_week: 1`, the
four lift fields and `plank_seconds` as `null`). Each case: `createTestUser()`,
`upsertProfile(client, userId, dto)`, assert `{ error: null }`, then
`getProfile(client, userId)` and deep-equal every input field against the
literal `dto` fixture (excluding server-managed `id`/`user_id`/
`created_at`/`updated_at`).

**Contract**: Uses `upsertProfile`/`getProfile` from
`src/lib/services/profile.ts` exactly as they exist today — no service
changes. Anti-pattern avoided: this hits the real local database (never a
mocked client), so it actually proves DB acceptance, not just that the
schema and the test agree with each other.

### Success Criteria:

#### Automated Verification:

- Integration tests pass: `npm run test:integration`
- Lint passes: `npm run lint`

#### Manual Verification:

- None — no UI surface.

---

## Phase 4: Oversized plan rejected before persistence at the real save endpoint (Risk #6)

### Overview

Prove, through the actual `POST /api/plan/save` handler (not just the
schema in isolation), that a plan exceeding the new `SESSIONS_MAX`/
`EXERCISES_MAX` caps is rejected with 400 and that nothing is written —
fulfilling the test-plan's own guidance that this risk's cheapest layer is
"integration on the write endpoint," and filling §6.4's TBD placeholder
("adding a test for a new API endpoint... the request → response contract
*and* the persisted side-effect").

### Changes Required:

#### 1. New integration test file, endpoint-boundary pattern

**File**: `src/pages/api/plan/save.integration.test.ts`

**Intent**: Drive the real `POST` handler end-to-end against the real
database, substituting only the Supabase-client-construction boundary
(`@/lib/supabase`'s `createClient`, which reads `astro:env/server` — not
resolvable under plain-`node` Vitest, and uses cookie-based SSR sessions
Phase 2 already established are impractical to fabricate in a test) with a
`vi.mock("@/lib/supabase", ...)` factory returning the real, already
signed-in integration-test client (`createTestUser()`'s client), ignoring
the `requestHeaders`/`cookies` arguments it's called with. This is the
endpoint-level analogue of the Phase 1 cookbook principle: fake only at the
external/environment boundary, drive everything else — auth guard, schema
validation, profile lookup, `savePlan` call, real DB — for real.

**Contract**: `beforeAll` creates one test user and seeds a valid profile
via `upsertProfile` (the handler 422s without one). Each `it` builds a
minimal fake `APIContext`-shaped object: `{ locals: { user: { id:
testUser.userId } }, request: new Request("http://localhost/api/plan/save",
{ method: "POST", body: JSON.stringify({ plan }) }), cookies: {} }` (cast
through `as unknown as Parameters<typeof POST>[0]` — the handler only reads
`locals.user`, calls `createClient(request.headers, cookies)` (mocked), and
`request.json()`), then calls the route's exported `POST` directly.

Three cases:
1. `plan.sessions.length === SESSIONS_MAX + 1` → `response.status === 400`,
   parsed body `.error === "invalid_plan"`, and a follow-up
   `getPlans(testUser.client, testUser.userId)` call returns `[]` — nothing
   persisted.
2. one session's `exercises.length === EXERCISES_MAX + 1` (sessions count
   otherwise valid) → same 400 + empty-persistence assertions.
3. Positive control: a plan at exactly `SESSIONS_MAX` sessions of 1
   exercise each → `response.status === 200`, and `getPlans(...)` now
   returns exactly one row — proves the cap doesn't false-reject its own
   boundary value through the real endpoint.

Anti-pattern avoided: asserting on request/response byte size instead of
array cardinality; over-mocking beyond the one environment boundary that
must be substituted.

### Success Criteria:

#### Automated Verification:

- Integration tests pass: `npm run test:integration`
- Lint passes: `npm run lint`

#### Manual Verification:

- None — no UI surface; the endpoint-level integration test against the
  real local database is the verification.

---

## Phase 5: Cookbook + rollout documentation

### Overview

Fill `context/foundation/test-plan.md` §6.4's TBD placeholder with the
pattern Phase 4 just shipped, and record what Phase 3 added in §6.6, so
future contributors adding a new endpoint test or a new persistence test
have a concrete example to follow.

### Changes Required:

#### 1. §6.4 — Adding a test for a new API endpoint

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 3" placeholder with the actual
pattern: canonical example `src/pages/api/plan/save.integration.test.ts`;
substitute only the Supabase-client-construction module (`vi.mock` on
`@/lib/supabase`) with a real authenticated integration-test client,
drive the exported route handler directly with a minimal fake
`APIContext`, and assert both the response contract (status + error code)
and the persisted (or, for a rejection case, *not*-persisted) side-effect
via the real service functions against the real local database. Note why
this is necessary here specifically: the real `createClient` depends on
`astro:env/server` (unavailable under plain-`node` Vitest) and cookie-based
SSR sessions (impractical to fabricate without a real HTTP cycle, per
Phase 2's own documented reasoning).

**Contract**: Prose replacing the §6.4 placeholder paragraph; no code.

#### 2. §6.6 — Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: One paragraph recording what Phase 3 added: the round-trip
content-fidelity pattern (deep-equal against a hand-written fixture,
covering both `getPlanById` and `getPlans` read paths — not just
`id`/length), the profile boundary-acceptance pattern (two cases at the
zod extremes, not a full re-run of Phase 1's rejection matrix), and the
`planSchema` array-length caps added to close Risk #6 (`SESSIONS_MAX = 14`,
`EXERCISES_MAX = 15`), plus the residual, deliberately-unaddressed risk
that `plans` still has no schema-version column.

**Contract**: Prose appended under the "(Filled in by each phase as it
lands.)" placeholder; no code.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (markdown is not linted, but the repo-wide lint
  command must still succeed after all prior phases' code changes)

#### Manual Verification:

- §6.4 no longer reads "TBD"; §6.6 names this phase's additions

**Implementation Note**: After completing this phase, pause for confirmation
that all four preceding phases' automated verification passed before this
phase is considered the close of the rollout phase.

---

## Testing Strategy

### Unit Tests:

- `planSchema` array-length boundary cases (Phase 1), extending
  `src/lib/schemas/plan.test.ts`.

### Integration Tests:

- Persistence round-trip content fidelity, both read paths (Phase 2).
- Profile boundary-value acceptance, both extremes (Phase 3).
- Real-endpoint rejection + non-persistence for oversized plans, plus one
  positive control at the boundary (Phase 4).

### Manual Testing Steps:

None required — every change in this phase has a deterministic automated
check (unit or integration) that gives complete signal; there is no user-
facing surface change.

## Performance Considerations

None — the schema cap is a validation-time check with negligible cost; the
new integration tests run against the same local/CI Supabase stack Phase 2
already provisions.

## Migration Notes

No database migration in this phase — `SESSIONS_MAX`/`EXERCISES_MAX` are
zod-layer constants only, not DB constraints (consistent with the finding
that `plans` has no CHECK constraints and none are being added here).

## References

- Related research: `context/changes/testing-persistence-boundaries/research.md`
- Existing round-trip side effect to extend, not duplicate:
  `src/lib/services/plans.integration.test.ts` (~lines 49-68)
- Existing rejection-direction unit tests, not to be duplicated:
  `src/lib/schemas/profile.test.ts:35-133`, `src/lib/schemas/plan.test.ts:28-42`
- Prior finding this phase closes:
  `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F3

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Add array-length caps to planSchema (risk #6 enforcement point)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — 2553616
- [x] 1.2 Lint passes: `npm run lint` — 2553616

### Phase 2: Persistence round-trip content-fidelity (Risk #3, folds in Risk #5 for plans)

#### Automated

- [x] 2.1 Integration tests pass: `npm run test:integration` — 2139420
- [x] 2.2 Lint passes: `npm run lint` — 2139420

### Phase 3: Profile boundary-value acceptance round trip (Risk #5, profiles)

#### Automated

- [x] 3.1 Integration tests pass: `npm run test:integration` — 6c33813
- [x] 3.2 Lint passes: `npm run lint` — 6c33813

### Phase 4: Oversized plan rejected before persistence at the real save endpoint (Risk #6)

#### Automated

- [x] 4.1 Integration tests pass: `npm run test:integration` — 4259e00
- [x] 4.2 Lint passes: `npm run lint` — 4259e00

### Phase 5: Cookbook + rollout documentation

#### Automated

- [x] 5.1 `npm run lint` passes — 0b56d01

#### Manual

- [x] 5.2 §6.4 no longer reads "TBD"; §6.6 names this phase's additions — 0b56d01
