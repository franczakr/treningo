<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Switch FR-003 Plan Generation to Google Gemini 2.5 Flash

- **Plan**: context/changes/gemini-plan-generation/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-06-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Plan adherence 7/7 MATCH, no scope creep. Structured-output wiring, retry loop
(max 2 / 3 attempts), tie-break-toward-latest, and the hard-vs-soft failure split
all verified correct. Secrets server-only (no client leakage), auth guard at the
boundary, raw errors logged server-side with generic Polish user messages. All
automated criteria green (`build`, `lint`, `astro check` 0 errors, no Anthropic in
`src`); manual E2E confirmed by the user on the free Gemini key.

## Findings

### F1 — Incomplete finishReason handling on blocked/truncated responses

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plan-generator.ts:64
- **Detail**: Hard-failure check inspected `promptFeedback.blockReason`, but Gemini can also stop via `candidates[0].finishReason` (SAFETY/RECITATION/MAX_TOKENS) without setting blockReason. Those cases yield empty/truncated `text`, caught by the `if (!text)` guard or JSON.parse failure — degrades safely, but with a less specific server log.
- **Fix**: Enriched the hard-failure messages with `blockReason` and `candidates[0].finishReason` for clearer server-side diagnostics; UX unchanged (route still returns the generic Polish message).
- **Decision**: FIXED

### F2 — Stale "Anthropic" comments left after the swap

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/plan/generate.ts:21, src/lib/schemas/plan.ts:2
- **Detail**: Two code comments still referenced Anthropic after the provider swap (a third, the plan.ts schema NOTE, also described the Anthropic-era "SDK strips min/max" behavior, inaccurate for Gemini `responseJsonSchema`).
- **Fix**: Updated the generate.ts status-code comment and the plan.ts header + NOTE to describe Gemini / `z.toJSONSchema` accurately.
- **Decision**: FIXED

### F3 — No explicit output-token cap (truncation → hard failure)

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/plan-generator.ts:53
- **Detail**: No `maxOutputTokens` in the generateContent config; a large plan hitting the model's default cap would truncate → hard failure + retry.
- **Fix**: Added `maxOutputTokens: 8192` (generous on purpose — Gemini 2.5 Flash thinking tokens count against the cap, so a tight limit could starve the plan JSON). Bounds cost/latency while leaving room for the largest 7-day plans.
- **Decision**: FIXED
