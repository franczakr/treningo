<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test Runner Bootstrap + Plan-Soundness Guardrails

- **Plan**: `context/changes/testing-plan-soundness/plan.md`
- **Scope**: Phase 1-4 of 4 (full plan)
- **Date**: 2026-08-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Method

Two parallel sub-agent passes plus independent re-verification:

- **Drift detection**: compared all 10 planned changes (package.json/lock,
  vitest.config.ts, the 5 new test files, the plan.ts refine, the CI step,
  and the §6.1/§6.2 cookbook update) against actual file content, line by
  line. Result: 10/10 MATCH.
- **Safety, quality & pattern scan**: read all changed files for security,
  reliability, and convention issues, with special attention to the three
  highest-risk-of-silent-mistake items — the NUL-character `.refine()`, the
  NUL test fixtures, and the migration-string transcriptions — verified at
  the byte level with `od -c`. Result: 0 critical, 0 warning findings.
- Both agents independently converged on the same single coverage gap
  (F1 below).
- Re-ran all automated verification independently: `npm run test` (45/45
  passing at review time, 54/54 after F1's fix), `npm run lint` (clean),
  `npm run build` (clean, confirming `PLAN_JSON_SCHEMA` construction is
  unaffected by the new `.refine()`).

## Findings

### F1 — Normalization test covered only one of five optional fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/schemas/profile.test.ts:113-119` (original)
- **Detail**: Phase 3's contract stated: "Absent vs. explicit `null` on
  every optional lift/`plank_seconds` field both normalize to a stored
  `null` ... assert this behavior explicitly since it is the one place
  absent/null distinctions are collapsed on purpose." The shipped test
  asserted only `squat_kg`'s empty-string case; `bench_kg`, `deadlift_kg`,
  `ohp_kg`, and `plank_seconds` were untested, and the *absent*
  (`undefined`) case was never asserted separately from the empty-string
  (`""`) case — both collapse through the same `profile.ts:19-27` preprocess
  step but were not both exercised.
- **Fix**: Expanded the single test into a `describe.each` over all five
  fields × both `{ "", absent }` inputs (10 cases total), each asserting
  the parsed value normalizes to `null`.
- **Decision**: FIXED — `src/lib/schemas/profile.test.ts` now has
  `describe.each(["squat_kg", "bench_kg", "deadlift_kg", "ohp_kg",
  "plank_seconds"] as const)("%s — absent/null normalization", ...)` with
  two `it` blocks per field (empty-string and absent). Test count went from
  45 to 54; all pass. Verified `npm run lint` and `npm run build` remain
  clean after the change.
