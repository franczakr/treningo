<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Delete a Saved Plan

- **Plan**: context/changes/delete-plan/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-08-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run at review time)

- `npm run lint` — pass
- `npm run test` — 54/54 pass
- `npm run test:integration` — 13/13 pass, including the new owner-delete positive control
- `npm run build` — succeeds

## Plan drift detection

All 5 planned changes (Phase 1: `plans.ts` `deletePlan`, `api/plan/delete.ts`, the new integration test; Phase 2: `dashboard.astro`, `plan/[id].astro`) are exact MATCHes against the plan's Intent/Contract. No MISSING items, no DRIFT.

The plan's one critical constraint — the new integration test must not reuse or delete the shared `planId` seeded in `beforeAll` (other tests depend on that row still existing) — was correctly honored: the new test seeds and deletes its own second plan, and is positioned last in the `describe` block, posing zero ordering risk.

## Findings

### F1 — Unrelated files bundled into the Phase 1 commit

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; already resolved
- **Dimension**: Scope Discipline
- **Location**: N/A (commit `93345fb`)
- **Detail**: `context/foundation/prd.md` / `roadmap.md` (adding FR-007 / S-09 — the upstream artifacts this change implements) and two unrelated housekeeping files (`.claude/.10x-cli-manifest.json`, `.claude/prompts/mvp-check.md`) were bundled into the Phase 1 commit alongside the planned files.
- **Decision**: ACCEPTED — the user was shown the exact dirty-path list via the phase-commit ritual's dirty-path prompt and explicitly chose to stage all four; the PRD/roadmap files are the direct upstream justification for this change, and the other two were inspected for secrets before staging (none found).

### F2 — `deletePlan` doesn't distinguish "deleted" from "matched zero rows"

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plans.ts:60-68
- **Detail**: `deletePlan` doesn't `.select()` or check affected-row count, so a delete matching zero rows looks identical to a real delete.
- **Fix**: Not applied — idempotent delete-and-redirect-on-success is the deliberate, simplest behavior and matches this app's existing tolerance for "no distinct not-found signal" (e.g. `upsertProfile` also can't report insert-vs-update via its return value).
- **Decision**: SKIPPED — acceptable as designed; no user-visible harm (a no-op delete just redirects to `/dashboard` same as a real one).

### F3 — No format validation on `plan_id` before this fix

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/plan/delete.ts:26-31
- **Detail**: Original implementation only checked `typeof planId === "string" && length > 0`, unlike `profile.ts`'s full zod-schema validation of form input.
- **Fix**: Applied — added `const planIdSchema = z.uuid();` and switched to `planIdSchema.safeParse(form.get("plan_id"))`, matching the codebase's general validate-with-zod convention at API boundaries.
- **Decision**: FIXED (this review pass). Re-verified: `npm run lint` and `npm run test:integration` (13/13) both pass after the change.

### F4 — Detail-page delete always redirects to `/dashboard`, discarding the referrer

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; already a documented tradeoff
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/plan/delete.ts:41
- **Detail**: Deleting from `plan/[id].astro` always lands on `/dashboard`, never back to a `return_to`.
- **Decision**: ACCEPTED — explicitly called out as a deliberate choice in `plan.md` (matching `profile.ts`'s fixed-target redirect precedent) and in `plan-brief.md`'s Open Risks & Assumptions. Not a defect.

### F5 — No CSRF protection on the delete form

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; pre-existing, out of scope
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/plan/delete.ts, src/pages/api/profile.ts
- **Detail**: Neither route has CSRF protection on its POST form.
- **Decision**: ACCEPTED as out of scope — pre-existing pattern across every mutation route in this app, not a regression introduced by this change. Would be its own hardening slice if prioritized.

## Triage summary

- Fixed: F3 (1)
- Accepted: F1, F2, F4, F5 (4)
- Skipped: —
