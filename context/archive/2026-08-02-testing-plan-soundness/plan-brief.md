# Test Runner Bootstrap + Plan-Soundness Guardrails — Plan Brief

> Full plan: `context/changes/testing-plan-soundness/plan.md`
> Research: `context/changes/testing-plan-soundness/research.md`

## What & Why

This project has zero tests today. This change stands up Vitest as the first
test runner, wires it into CI as a required gate, and lands the two unit-test
suites that ground rollout Phase 1 of `context/foundation/test-plan.md`: proving
a generated workout plan never crosses the equipment/day-count guardrail
undetected (Risk #2), and proving the profile schema and the database's CHECK
constraints stay in lock-step (Risk #5, schema side) — the same class of bug
that already shipped once (training-profile impl-review F1: a zero value
passed both validation layers and failed at insert).

## Starting Point

No test files, no runner config, no `test` script. Research proved (by
bundling the target modules with the repo's own esbuild) that the
plan-validator and both zod schemas pull in nothing but `zod` at runtime — no
`astro:env`, no Astro Vite plugin needed. The `plans` table has zero CHECK
constraints, so the entire Risk #5 surface for this phase is `profiles` ×
`profileSchema`. The goal-consistency "guardrail" was found to not exist —
the validator never reads `profile.goal`.

## Desired End State

`npm run test` runs a fast (sub-second), CI-gated suite that: (1) proves no
plan the system reports as sound uses unavailable equipment or the wrong
session count, through both the pure validator and the full `generatePlan`
retry loop with a fake model client; (2) proves every DB-rejected profile
value is already rejected by the schema, anchored to the literal migration
text so a schema/DB edit forces the suite to be revisited; and (3) closes and
proves the one live "schema accepts, database rejects" gap (a NUL character
in plan text). `test-plan.md` §6.1/§6.2 are filled in as the cookbook
reference for future tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test runner | Vitest 4.1.10, `environment: "node"`, no Astro plugin | Import-graph analysis proved zero `astro:*` usage in the code under test | Research |
| Defect A (empty-array CHECK no-op) | Defer — record as a known gap | Fixing it needs a hosted-DB migration push, out of scope for a "unit, CI gate" phase | Plan |
| Defect B (NUL char in plan text) | Fix now in `planSchema` | ~5-line application-layer change; verified `.refine()` doesn't break the Gemini JSON Schema; converts a Phase-3-only claim into something this phase can prove | Plan |
| Test file layout | Co-located `*.test.ts` beside source | Matches this repo's flat structure; already covered by `tsconfig.json`'s `include: ["**/*"]` | Plan |
| Lint gate strictness | Leave `npm run lint` as-is (no `--max-warnings 0`) | 5 pre-existing `console.error` calls already warn; tightening now would fail CI on unrelated code | Plan |
| Goal-consistency testing | None — explicitly out of scope | The validator has no goal check to test; inventing one is a product change | Research |
| Risk #2 test depth | Test through `generatePlan` with a fake SDK client, not just the isolated validator | Directly proves the retry loop as a whole never accepts a violating plan, at the same cost | Research |

## Scope

**In scope:**
- Vitest install, config, `npm run test`/`test:watch` scripts
- One CI step (`npm run test`, no secrets needed) between `lint` and `build`
- One real smoke test proving the alias/runtime chain works
- Table-driven `validatePlan` tests with hand-declared oracles
- `generatePlan` tests via a fake `GoogleGenAI` client (retry loop, tie-break, soft-failure characterization)
- `profileSchema` boundary tests transcribed from the migration, plus a migration-text drift guard
- One `.refine()` in `planSchema` closing Defect B, plus its test
- `test-plan.md` §6.1/§6.2 cookbook fill-in

**Out of scope:**
- Fixing Defect A (empty-equipment-array CHECK no-op) — needs a hosted-DB migration
- Any test requiring a live database (Risk #5's acceptance direction — Phase 3)
- Array/string length caps beyond the one NUL refine (Risk #6)
- Enforcing or testing goal-consistency (unenforced by design/gap, not this phase's job)
- `@cloudflare/vitest-pool-workers` / any Workers-runtime test execution
- `--max-warnings 0` on the lint gate

## Architecture / Approach

Plain Vitest with `environment: "node"` and a single `resolve.alias` for `@/`
— no Astro or Cloudflare Vite plugin. Both target services (`generatePlan`,
`getProfile`, `savePlan`, etc.) already take their SDK/DB client as a
constructor parameter, so SDK-boundary substitution needs no mocking library.
The parity suite treats the migration `.sql` file as the oracle: bounds are
transcribed with the source line quoted, and a small guard re-reads the file
at test time to catch drift.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Runner bootstrap + CI gate | Vitest installed/configured, one smoke test, CI step wired | A misconfigured alias or environment silently passes because no real test exists yet to catch it — mitigated by using a real assertion, not `1+1` |
| 2. Plan-soundness guardrails (Risk #2) | Validator + generator-with-fake-client tests | Mistakenly asserting goal-consistency coverage that doesn't exist, or failing the accepted soft-failure/savable decision |
| 3. Schema↔DB parity (Risk #5) | Migration-anchored boundary tests + Defect B fix | Overstating the migration-text guard as proving correctness rather than just drift |
| 4. Cookbook update | `test-plan.md` §6.1/§6.2 filled in | None — documentation only |

**Prerequisites:** None beyond repo access; no hosted Supabase credentials
needed anywhere in this phase.
**Estimated effort:** ~1 session across 4 phases — the bulk of the work is
writing table-driven fixtures, not new infrastructure.

## Open Risks & Assumptions

- Defect A (empty-equipment-array CHECK) ships unfixed; tracked as a known
  gap for a dedicated follow-up change.
- The migration-text guard detects drift, not incorrectness — it would not
  have caught Defect A even if written today, since that CHECK's text was
  wrong from the start and has never changed.
- The fake-client tests for `generatePlan` assume today's `@google/genai`
  response shape (`text`, `promptFeedback`, `candidates[0].finishReason`);
  a provider-side shape change is Risk #4's territory (test-plan Phase 4),
  not this phase's.

## Success Criteria (Summary)

- `npm run test` is a required, passing CI step from Phase 1 onward.
- No plan the system reports as acceptable can be shown, in a table-driven
  test, to use unavailable equipment or the wrong session count.
- Every profile field's database-rejected boundary value is proven rejected
  by the schema, anchored to the literal migration text.
