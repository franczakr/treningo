<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Persistence Round-Trip + Boundary Contracts

- **Plan**: context/changes/testing-persistence-boundaries/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-08-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Positive-control test's absolute row-count assertion depended on prior-test ordering

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/plan/save.integration.test.ts` (positive-control `it`)
- **Detail**: The third case (`"positive control: a plan at exactly the caps is accepted and persisted"`) asserted `getPlans(...)` returns exactly 1 row for the shared `user`, implicitly depending on the two preceding rejection cases having run first and persisted nothing, with nothing pinning that order (no `sequence.concurrent: false`, no explicit ordering guarantee near the assertion). A future switch to `.concurrent` or a shuffled runner would silently flake this test.
- **Fix**: Give the positive-control case its own fresh test user (via a new `createSeededUser()` helper extracted from the shared `beforeAll` setup) so its absolute-count assertion is self-contained and order-independent.
- **Decision**: FIXED — extracted `createSeededUser()`; the positive-control test now creates and asserts against a dedicated user. Re-ran `npm run test:integration` (22/22 pass), `npm run test` (58/58 pass), `npm run lint` (clean) after the fix.

### F2 — No comment documenting the module-isolation dependency for the mock's mutable state

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/plan/save.integration.test.ts:25` (`let currentClient`)
- **Detail**: Cross-file mock pollution is currently prevented only by Vitest's default `isolate: true` (neither `vitest.config.ts` nor `vitest.integration.config.ts` overrides it), and this wasn't documented near the mutable binding.
- **Fix**: Added a comment next to `let currentClient` noting the dependency on default module isolation.
- **Decision**: FIXED.

### F3 — `profile-persistence.integration.test.ts` creates two users instead of one shared user

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/services/profile-persistence.integration.test.ts`
- **Detail**: Unlike sibling integration files, this one skips a shared `beforeAll` and calls `createTestUser()` inline per `it()` (one user per boundary case) rather than reusing a single shared user. Each case is genuinely independent (upper vs. lower boundary), and inline `expect(error).toBeNull()` arguably attributes a failure more precisely than throwing in `beforeAll`.
- **Fix**: None required — a legitimate, self-explanatory variation on the established pattern, not a defect.
- **Decision**: SKIPPED (no-action observation).

### F4 — `test-plan.md` §3 Phase 3 status not yet flipped to `complete`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/test-plan.md` §3 (Phase 3 row)
- **Detail**: The plan's own Progress section is fully `[x]` and `change.md` is `status: implemented`, but §3's rollout-status table still read "planned" at review time — this is the `/10x-test-plan` orchestrator's own reconciliation step (Handoff E), not a plan-execution defect.
- **Fix**: Flip §3 Phase 3 status to `complete` as part of closing out this change (immediately following this review).
- **Decision**: FIXED — addressed in the close-out step immediately after this review.

## Notes

All 5 phases verified MATCH against the plan with zero scope creep; every
"What We're NOT Doing" guardrail upheld (no schema-version column added,
`validatePlan` not wired into the save path, no `getPlans` pagination
change, no full re-run of Phase 1's profile rejection matrix). Automated
success criteria re-verified at review time: `npm run test` (58/58),
`npm run test:integration` (22/22), `npm run lint` (clean), `npm run build`
(clean). No security, performance, or data-safety findings — the one
WARNING was a test-robustness issue (fixed), not a product defect.
