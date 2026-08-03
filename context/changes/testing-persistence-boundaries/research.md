---
date: 2026-08-03T10:31:08Z
researcher: Claude Code
git_commit: 1632fede7abdad35750e7c074a3dfc3d54d6a4a2
branch: master
repository: treningo
topic: "Rollout Phase 3 grounding: persistence round-trip + boundary contracts (risks #3, #5, #6)"
tags: [research, codebase, testing, plans, profiles, jsonb, vitest-integration]
status: complete
last_updated: 2026-08-03
last_updated_by: Claude Code
---

# Research: Rollout Phase 3 grounding — persistence round-trip + boundary contracts

**Date**: 2026-08-03T10:31:08Z
**Researcher**: Claude Code
**Git Commit**: 1632fede7abdad35750e7c074a3dfc3d54d6a4a2
**Branch**: master
**Repository**: treningo

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md` ("Persistence round-trip + boundary contracts", risks #3, #5, #6) in the current code: trace the write→read round trip for a saved plan, compare the zod schemas against the actual database CHECK constraints, locate existing tests so Phase 3 doesn't duplicate them, and identify the cheapest test layer per risk.

## Summary

All three risks are confirmed live and each has a concrete, previously-unproven gap:

- **Risk #3 (shape drift)**: confirmed. `getPlans`/`getPlanById` (`src/lib/services/plans.ts`) do a bare `as SavedPlan[]`/`as SavedPlan | null` cast on read — `planSchema` is never re-imported or re-parsed on the read path (only referenced in a comment). There is no schema-version column on `plans`. `ProfileSnapshot` is derived from the *current* `profiles` Row type (`src/types.ts:67`), not from a zod schema, so it has no independent structural check at either write or read time.
- **Risk #5 (acceptance direction)**: confirmed as the *right* remaining half. Every `profiles` DB CHECK already has an equal-or-stricter zod bound (rejection direction, proven in Phase 1). The `plans` table's two jsonb columns (`plan`, `profile_snapshot`) have **zero DB CHECK constraints at all** — so the acceptance direction is not "will the DB reject something zod accepts" (structurally it can't, there's nothing to reject) but "does a real insert+read round trip actually succeed and come back intact" — which folds into risk #3's test.
- **Risk #6 (unbounded plan size)**: confirmed live and unchanged since the save-plan impl review flagged and skipped it. `planSessionSchema.exercises` and `planSchema.sessions` have no `.max()` (`src/lib/schemas/plan.ts:44`, `:48-50`). `plan-validator.ts`'s `MAX_EXERCISES_PER_SESSION = 15` is an advisory soundness guardrail, not a save-blocking limit, and never caps `sessions.length` at all. No DB-side jsonb array-length CHECK exists either.

Existing Phase 2 integration infra (`vitest.integration.config.ts`, `src/lib/test-helpers/integration-users.ts`, CI's `integration` job) is a complete, reusable base — Phase 3 needs zero new infrastructure, only new test files matching `**/*.integration.test.ts`. One existing test (`plans.integration.test.ts`'s first `beforeAll`/`it`) already does a save-then-read as a side effect of proving isolation, but only asserts `id` and list length — never deep-equality on `plan`/`profile_snapshot` content. That is exactly the gap Phase 3 must close, not duplicate.

## Detailed Findings

### Risk #3 — Persistence round-trip / shape drift

**Write path** — `src/pages/api/plan/save.ts`:
- Auth guard: `src/pages/api/plan/save.ts:28-31`.
- Re-validation at the boundary: `src/pages/api/plan/save.ts:40-44` — `planSchema.safeParse(body?.plan)`, comment at :38-39 ("never trust the client's shape").
- `ProfileSnapshot` construction: `src/pages/api/plan/save.ts:59-61` — destructures a live `profiles` Row, dropping `id`/`user_id`/`created_at`/`updated_at`.
- Insert: `src/lib/services/plans.ts:21-25` (`savePlan`) — `.insert({ user_id, plan, profile_snapshot })` into two `jsonb` columns.

**Read path** — `src/lib/services/plans.ts`:
- `getPlans` (:33-44) and `getPlanById` (:49-56) both end with a bare type assertion (`return data as SavedPlan[]` / `as SavedPlan | null`) — no runtime re-parse.
- Comment at `src/lib/services/plans.ts:30-32` states the load-bearing assumption explicitly: read trusts save-time validation and never re-checks it.
- `planSchema` is not imported anywhere in `plans.ts` — confirmed via repo-wide grep; the only occurrence there is the comment.
- Consumers dereference the cast shape directly with no guard beyond null-check: `src/pages/dashboard.astro:14-16` (list), `src/pages/plan/[id].astro:16-17,23,63` (`saved.plan.sessions.map(...)`, `saved.profile_snapshot.goal`).

**Types** — `src/types.ts`:
- `WorkoutPlan = z.infer<typeof planSchema>` (:39).
- `ProfileSnapshot = Omit<Tables<"profiles">, "id"|"user_id"|"created_at"|"updated_at">` (:67) — derived from the **current** DB Row type, not a zod schema, not versioned.
- `SavedPlan` (:68-71) overrides the generated `Tables<"plans">` Row's `plan`/`profile_snapshot` (`Json`) with the domain types above.

**Migrations** — no version marker:
- `supabase/migrations/20260628105841_create_plans.sql:8-16` — `plan jsonb not null`, `profile_snapshot jsonb not null`, comment: "stored whole as jsonb (...), never edited in v1)."
- `20260803084944_add_plan_name.sql` — adds nullable `name text` only.
- No `schema_version`/`plan_version` column exists on `plans`.

**Conclusion**: if `planSchema` or the `profiles` table shape changes after rows are saved, older rows can come back "in a different shape than saved," and nothing detects it — failure is either silent (renamed/optional field renders wrong) or a late, unguarded runtime error (`.sessions.map` on a malformed row → uncaught 500). This is exactly the risk the test-plan describes, and the response guidance's "must challenge: it returned 200 is not it comes back the same" is directly on point — confirmed, not speculative.

### Risk #5 — Schema/database acceptance parity (acceptance direction)

**Zod schemas**:
- `src/lib/schemas/profile.ts` — every numeric/enum bound (`age` 13–100, `weight_kg` >0 & ≤500, `training_days_per_week` 1–7, 4 lift fields >0 & ≤1000 nullable, `plank_seconds` >0 & ≤3600 nullable, `equipment` `.min(1)`) matches an equal-or-stricter DB CHECK.
- `src/lib/schemas/plan.ts` — `sets` 1–20, `rest_seconds` 0–1200 (both bounded); text fields via `boundedText` (only a NUL-codepoint check, otherwise unbounded length); `exercises` and `sessions` arrays have **no** `.max()`.

**DB migrations**:
- `profiles` CHECKs (`20260627202445_create_profiles.sql:27-36`) — all mirrored by zod, confirmed above. One known no-op: `check (array_length(equipment, 1) >= 1)` (:30) is a documented Postgres no-op for the empty-array case (`array_length('{}',1)` is `NULL`, and CHECK passes on NULL) — already covered by the Phase 1 guard test (`profile.test.ts:72-78`), not a new Phase 3 concern since zod's `.min(1)` is the only real enforcement and the acceptance direction (DB not rejecting a zod-accepted value) is not at risk here — an empty array is zod-rejected, so it never reaches the DB either way.
- `plans` table (`20260628105841_create_plans.sql`) — **zero CHECK constraints** on `plan` or `profile_snapshot` (confirmed via full-repo grep for `check`/`CHECK` across `supabase/migrations/*.sql`).

**Conclusion**: for `profiles`, the acceptance direction is structurally guaranteed (every zod-accepted value is necessarily DB-accepted, since DB bounds are equal-or-looser) — a positive-path integration test is still valuable as a *round-trip* proof (parity can silently drift if a future migration tightens a CHECK without updating zod), but there is no known live gap here beyond "prove it, don't assume it." For `plans`, since there are no DB CHECKs at all on the jsonb columns, the acceptance direction collapses into risk #3's round-trip test — there's nothing distinct to test structurally; the risk that matters is content-shape fidelity, not constraint rejection.

### Risk #6 — Unbounded plan size / resource abuse

- `planExerciseSchema` / `planSessionSchema` (`src/lib/schemas/plan.ts:30-45`) — no cap on the `exercises` array (:44).
- `planSchema` (`src/lib/schemas/plan.ts:47-51`) — no cap on the `sessions` array (:48-50).
- `plan-validator.ts:16` — `MAX_EXERCISES_PER_SESSION = 15` exists but is an advisory soundness violation, not a save-blocking hard limit; `validatePlan` never checks an upper bound on `sessions.length` (only equality to `training_days_per_week`).
- `src/pages/api/plan/save.ts` — no independent size/length check before `planSchema.safeParse` or before insert.
- DB — no `jsonb_array_length` or size CHECK on `plans.plan`/`plans.profile_snapshot` (confirmed above).

**Conclusion**: gap is real and unchanged since `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F3 ("SKIPPED, low risk, authenticated-only endpoint"). One authenticated user can persist an arbitrarily large, schema-valid plan. Cheapest test layer per the test-plan's own guidance is integration on the write endpoint (`src/pages/api/plan/save.ts`), asserting on **cardinality rejected before persistence**, not byte size.

### Existing tests — what NOT to duplicate

**Phase 1 (unit, rejection direction)**:
- `src/lib/schemas/profile.test.ts:35-133` — full boundary-rejection suite parameterized against each DB CHECK, plus a migration-text drift guard (:136-160).
- `src/lib/schemas/plan.test.ts:33-41` — NUL-codepoint rejection/acceptance pair (the one schema/DB divergence that existed, already fixed via `boundedText`).
- No existing unit test anywhere touches `sessions`/`exercises` array *size* (confirmed: not in `plan.test.ts`, not in `plan-validator.test.ts`).

**Phase 2 (integration, isolation)** — reusable infra, do not rebuild:
- `vitest.integration.config.ts` — `environment: "node"`, `include: ["**/*.integration.test.ts"]`, `setupFiles: ["./vitest.integration.setup.ts"]`.
- `vitest.config.ts:17` excludes `**/*.integration.test.ts` and `tests/e2e/**` from the unit run.
- `src/lib/test-helpers/integration-users.ts` — `createTestUser()` (plain `@supabase/supabase-js` client, `persistSession: false`, unique email per call, no cleanup — uniqueness is the isolation strategy) and `createAnonClient()`; both called in `beforeAll`, reused across cases in a suite.
- `.env.test.local` loaded via `process.loadEnvFile()` in `vitest.integration.setup.ts:6` inside a try/catch (CI exports vars directly instead); guard is "gitignored + example file," not a URL-pattern assertion.
- `plans.integration.test.ts` already has a `savePlan` → `getPlans`/`getPlanById` round trip in its `beforeAll` (lines ~49-68) and a first `it` (`"negative control: user A can list and read their own plan"`, line 62) that asserts `toHaveLength(1)` and `single?.id).toBe(planId)` **only** — it never asserts `plan`/`profile_snapshot` deep-equality against the seeded objects. **This is the exact gap Phase 3 fills**: add a dedicated content-shape equality assertion, in a new test (or new `describe` block), not by editing the isolation test's existing assertions.
- CI already runs this suite today: `.github/workflows/ci.yml`'s separate `integration` job (`npx supabase start` → export env → `npm run test:integration` → `npx supabase stop`, `if: always()`). **Phase 3 needs no new CI wiring** — new specs matching `**/*.integration.test.ts` are picked up automatically.
- Local prerequisite: Docker + `supabase start` (`supabase/config.toml` exists; documented at length in `context/archive/2026-08-02-testing-account-isolation/plan.md`).

## Code References

- `src/pages/api/plan/save.ts:28-31,38-44,59-61` — auth guard, re-validation, ProfileSnapshot construction
- `src/lib/services/plans.ts:21-25,30-56` — savePlan insert; getPlans/getPlanById bare-cast reads
- `src/types.ts:39,67-71` — WorkoutPlan, ProfileSnapshot, SavedPlan type definitions
- `src/lib/schemas/plan.ts:16-51` — planExerciseSchema/planSessionSchema/planSchema, no array `.max()`
- `src/lib/schemas/profile.ts:10-37` — profile schema bounds, all matching DB CHECKs
- `src/lib/services/plan-validator.ts:16` — MAX_EXERCISES_PER_SESSION advisory guardrail (not save-blocking)
- `supabase/migrations/20260628105841_create_plans.sql:8-16` — plans table, no CHECK on jsonb columns, no version column
- `supabase/migrations/20260627202445_create_profiles.sql:27-36` — profiles CHECKs, all zod-mirrored (equipment empty-array no-op already known)
- `supabase/migrations/20260803084944_add_plan_name.sql` — nullable name column, no constraint
- `vitest.integration.config.ts:1-13`, `vitest.config.ts:17`, `vitest.integration.setup.ts:1-9` — integration test infra
- `src/lib/test-helpers/integration-users.ts:21-57` — createTestUser/createAnonClient
- `src/lib/services/plans.integration.test.ts` (existing `beforeAll` + first `it`, ~lines 49-68) — round trip side-effect, no content-shape assertion
- `.github/workflows/ci.yml:27-47` — existing `integration` CI job (already wired, reusable as-is)
- `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F1, F3 — shape-drift type mismatch (fixed) and unbounded array size (skipped, still live)
- `context/archive/2026-06-29-browse-saved-plans/reviews/impl-review.md` F1 — unhandled read-time DB error surfaces as 500 (accepted convention, out of Phase 3 scope — belongs to risk #7 / Phase 4)

## Architecture Insights

- The project's jsonb persistence strategy is deliberately "validate once at write, trust forever after" (explicit code comment at `plans.ts:30-32`) — this is a real architectural choice, not an oversight, but it means the *only* place that can ever catch shape drift is a test that writes then reads back and compares content, since production code never will.
- `ProfileSnapshot` being coupled to the live `profiles` Row type (rather than a frozen/versioned DTO) means any future `profiles` migration is a silent, untested compatibility hazard for every previously-saved plan — worth stating as a residual risk in the plan even though no fix is in scope.
- The `plans` table having zero CHECK constraints means risk #5's "acceptance direction" and risk #3's "round trip" are, for this table, the same test — no separate boundary-value integration suite is needed for `plans`; boundary-value coverage is only meaningfully distinct for `profiles`, which already has DB CHECKs to parity-check against real inserts.
- Risk #6's cheapest layer is a single integration test on the write endpoint (or `savePlan` service call) asserting rejection before persistence — no new validator logic is implied by the test-plan's response guidance; whether a `.max()` should be *added* to `planSchema` is an implementation decision for `/10x-plan`/`/10x-implement` to make explicitly, not something research should decide.

## Historical Context (from prior changes)

- `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F1 — the exact type-derivation issue (Insert vs Row) that seeded risk #3; already fixed for `ProfileSnapshot`'s write-time construction, but the *read-time* re-validation gap it points at was never addressed.
- `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F3 — the unbounded-array finding for risk #6, explicitly SKIPPED as "low risk," now the direct subject of this rollout phase.
- `context/archive/2026-08-02-testing-plan-soundness/` — Phase 1: unit rejection-direction tests for schema boundaries (profile + plan), the migration-text drift guard pattern Phase 3 should NOT re-invent for `plans` (no CHECKs to transcribe there).
- `context/archive/2026-08-02-testing-account-isolation/` — Phase 2: the integration test infra (Docker Supabase, `createTestUser`, separate Vitest config + CI job) Phase 3 reuses as-is.

## Related Research

- `context/archive/2026-08-02-testing-plan-soundness/research.md` — prior research grounding Phase 1 (schema-boundary + plan-validator).
- `context/archive/2026-08-02-testing-account-isolation/research.md` — prior research grounding Phase 2 (RLS isolation).

## Open Questions

- Should `planSchema` gain a `.max()` on `sessions`/`exercises` (closing risk #6 at the schema layer) as part of this phase, or should the test characterize the gap only if the fix is deferred again? Recommend `/10x-plan` propose adding the cap — the test-plan's response guidance for #6 says "a plan with an absurd number of sessions or exercises is rejected before anything is persisted," which requires an actual enforcement point to exist, not just a test asserting current (permissive) behavior. This is a planning decision, flagged here rather than decided.
- No schema-version column exists for `plans`; the round-trip test can only prove today's shape is stable, not guard against a future intentional schema change. Out of scope for Phase 3 — noted as a residual risk, not a corrective action.
