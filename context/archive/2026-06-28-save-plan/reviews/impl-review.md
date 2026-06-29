<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Save a Generated Plan (S-03)

- **Plan**: context/changes/save-plan/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-06-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — ProfileSnapshot derived from Insert type, not Row

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:64
- **Detail**: `ProfileSnapshot = ProfileUpsertDto` derives from `TablesInsert<"profiles">`, where optional fields are `bench_kg?: number | null` (key may be absent). The runtime value at save.ts:60-61 comes from a profile Row, where those fields are `number | null` (key always present). It type-checks and behaves correctly, but the type models a DTO/request shape, not the persisted snapshot (which always carries explicit nulls in jsonb).
- **Fix**: Derive ProfileSnapshot from Row: `Omit<Tables<"profiles">, "id" | "user_id" | "created_at" | "updated_at">`.
- **Decision**: FIXED

### F2 — SavePlanRequest type defined but unused

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/types.ts:72-74
- **Detail**: The endpoint uses inline `{ plan?: unknown }` (correct for an untrusted boundary) and the client uses `JSON.stringify({ plan })`. The dedicated `SavePlanRequest` DTO is never used — dead code.
- **Fix**: Annotate the client body (savePlanRequest) with it, or drop it.
- **Decision**: FIXED (removed the unused type)

### F3 — Request body / plan array length not bounded

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/plan/save.ts:40 (+ src/lib/schemas/plan.ts:35,39)
- **Detail**: `request.json()` parses an arbitrary-size body before validation. `planSchema` has no array-length caps (sessions/exercises unbounded), so a large but schema-valid payload would be persisted to jsonb. Low risk (authenticated-only endpoint).
- **Fix**: Optionally add `.max(...)` on sessions/exercises in planSchema (also benefits generation).
- **Decision**: SKIPPED (low risk, authenticated-only endpoint)
