# Persistence Round-Trip + Boundary Contracts — Plan Brief

> Full plan: `context/changes/testing-persistence-boundaries/plan.md`
> Research: `context/changes/testing-persistence-boundaries/research.md`

## What & Why

Rollout Phase 3 of the test plan. Closes three risks against the real
local Supabase database: a saved plan silently coming back in a different
shape than it was saved in (#3), the unproven half of schema/database
acceptance parity (#5), and a signed-in user persisting an arbitrarily
large plan into jsonb storage with nothing to stop them (#6, flagged and
skipped once already in the save-plan impl review).

## Starting Point

Phase 1 shipped unit tests proving the schema *rejects* what the database
would reject (boundary/CHECK-mirroring). Phase 2 shipped the Docker-Supabase
integration harness and proved account isolation, with a save-then-read
round trip that only asserts `id` and list length — never content. Research
confirmed all three Phase 3 risks are live: `getPlans`/`getPlanById` never
re-validate what they read back; `planSchema` has no cap on `sessions`/
`exercises`; and `plans`' jsonb columns carry zero DB CHECK constraints.

## Desired End State

A round-trip integration test proves a saved plan and profile snapshot come
back byte-for-byte identical through both read paths (`getPlanById` and
`getPlans`). A profile saved at the zod schema's exact upper/lower bounds
is proven to round-trip through the real database unchanged. `planSchema`
gains a hard cap on plan size, and a real-endpoint integration test proves
an oversized plan is rejected with nothing persisted.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Fix risk #6 at the schema layer or only test current (permissive) behavior | Add `.max()` caps to `planSchema` (`SESSIONS_MAX=14`, `EXERCISES_MAX=15`) | A test can't prove "rejected before persistence" against code with no rejection logic — the gap has to be closed, not just documented, since `validatePlan` is never called from the save path | Plan |
| How to test risk #6's "before persistence" claim | Real-endpoint integration test (`save.ts`'s `POST` handler), mocking only the `@/lib/supabase` client-construction boundary | The test-plan's own guidance names this the cheapest layer; the only alternative (schema-only unit test) can't prove nothing was persisted, and full e2e would cost far more for the same signal | Plan |
| Where to put the round-trip content-fidelity test | New file `plans-persistence.integration.test.ts`, separate from the existing isolation test file | Keeps Phase 2's isolation-risk ownership and Phase 3's content-fidelity risk ownership disentangled | Plan |
| Profile boundary-acceptance coverage | Two cases only (zod max, zod min) — not a full re-run of Phase 1's rejection matrix | Phase 1 already exhaustively covers rejection; acceptance only needs the extremes proven against a real DB | Plan |

## Scope

**In scope:**
- `planSchema` array-length caps + unit boundary tests
- Plan save/read round-trip content-fidelity integration test (both read paths)
- Profile boundary-value acceptance integration test (both extremes)
- Real-endpoint integration test proving oversized-plan rejection + non-persistence
- `test-plan.md` §6.4 (new-endpoint-test cookbook) and §6.6 (phase notes)

**Out of scope:**
- Schema-version column on `plans` (residual risk, noted not fixed)
- Calling `validatePlan` from the save path (would change accepted product behavior)
- Any change to `getPlans` pagination/limits (Phase 4 / risk #7 territory)
- Re-testing profile boundaries Phase 1 already covers exhaustively
- Promoting risk #6 to an e2e/Playwright test

## Architecture / Approach

Four ordered sub-phases: the schema cap ships first since it's the
enforcement point the endpoint test exercises. The two round-trip/
acceptance tests are independent of the cap and land next. A final
sub-phase updates the test-plan cookbook. All new specs match
`**/*.integration.test.ts` and are picked up by the existing Phase 2
harness and CI job with zero new infrastructure.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema caps | `planSchema` gains `SESSIONS_MAX`/`EXERCISES_MAX` + unit boundary tests | Picking a cap too tight for a legitimate plan (mitigated: 2x headroom above any valid `training_days_per_week`) |
| 2. Persistence round-trip | Deep-equal fidelity test on `getPlanById`/`getPlans`, closing risk #3 | A too-narrow fixture could miss a real drift case (mitigated: multi-session, mixed-null fixture) |
| 3. Profile boundary acceptance | Round-trip test at zod's exact extremes, closing risk #5 | None significant — additive, read-only assertions |
| 4. Endpoint rejection test | Real `POST` handler test proving 400 + no persistence, closing risk #6 | Mocking the wrong boundary could turn this into an implementation mirror (mitigated: only `@/lib/supabase`'s client constructor is faked) |
| 5. Cookbook docs | §6.4 filled in, §6.6 phase notes | None |

**Prerequisites:** Local Docker Supabase running (`supabase start`) or CI's
`integration` job; no new setup beyond what Phase 2 already requires.
**Estimated effort:** ~1 session across 5 phases.

## Open Risks & Assumptions

- `plans` still has no schema-version column — this phase proves today's
  shape is stable, not that a future intentional schema change is caught.
  Deliberately out of scope.
- `SESSIONS_MAX=14`/`EXERCISES_MAX=15` are abuse-prevention ceilings, not
  product requirements — if the product ever legitimately needs more
  sessions or exercises per session, these constants must move together
  with `plan-validator.ts`'s `MAX_EXERCISES_PER_SESSION`.

## Success Criteria (Summary)

- `npm run test` and `npm run test:integration` both pass, locally and in CI.
- A save-then-read round trip of a plan (via either read path) is
  deep-equal to what was saved.
- A plan exceeding either array cap is rejected (400) via the real
  endpoint with zero rows persisted; one at the exact cap is accepted.
