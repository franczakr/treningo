<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Training Profile Capture & Save

- **Plan**: context/changes/training-profile/plan.md
- **Scope**: Phases 2–3 of 3 (Phase 1 landed earlier in 0d22254)
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION → all findings triaged & fixed
- **Findings**: 0 critical · 3 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (3 findings — all fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS (2 observations — both fixed) |
| Success Criteria | PASS |

## Findings

### F1 — plank_seconds: zod allows 0, DB rejects it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data safety)
- **Location**: src/lib/schemas/profile.ts:26
- **Detail**: Schema used `.nonnegative()` (permits 0); DB CHECK requires `plank_seconds > 0`. A 0 entry passed client + server validation then failed at the DB.
- **Fix**: Changed `nonnegative()` → `positive()`.
- **Decision**: FIXED

### F2 — getProfile throws; profile page has no fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/profile.ts:16-18, src/pages/training-profile.astro:13-15
- **Detail**: getProfile re-throws PostgrestError; the page had no try/catch → a transient read error rendered a hard 500.
- **Fix A ⭐**: Wrapped the read in try/catch on the page, degrade to `profile = null` + error banner via the existing `serverError` prop.
- **Decision**: FIXED via Fix A

### F3 — Raw Postgres error text reflected into the UI on write failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability / minor info disclosure)
- **Location**: src/pages/api/profile.ts:51-53
- **Detail**: Raw `error.message` reflected into `?error=` and shown to the user.
- **Fix**: Friendly generic message to the user; raw detail logged server-side via `console.error` (with an explicit `eslint-disable-next-line no-console` to keep lint clean — no prior console usage in the codebase).
- **Decision**: FIXED

### F4 — Equipment error uses a hardcoded message, not the zod issue

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/profile/TrainingProfileForm.tsx (equipment fieldset)
- **Detail**: Equipment rendered a fixed Polish string instead of `errors.equipment` from the shared schema.
- **Fix**: Gave the schema `.min(1, "Wybierz co najmniej jeden element sprzętu.")` and render `errors.equipment`.
- **Decision**: FIXED

### F5 — redirectWithError typed via Parameters<APIRoute>[0]

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/profile.ts:11
- **Detail**: Awkward `Parameters<APIRoute>[0]` param type.
- **Fix**: Import `APIContext` from "astro" and use it.
- **Decision**: FIXED
