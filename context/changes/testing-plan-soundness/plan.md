# Test Runner Bootstrap + Plan-Soundness Guardrails — Implementation Plan

## Overview

Bootstrap Vitest as this project's first test runner, wire it into CI as an
unconditional gate, and land two unit-test suites that ground `context/foundation/test-plan.md`
rollout Phase 1: the plan-soundness guardrail (Risk #2) and the schema↔database
parity claim (Risk #5, schema side). Close one live schema/DB divergence
(Defect B — a NUL code point that zod accepts and jsonb cannot store) as part
of the parity work, since research showed the fix is a small, safe
application-layer change that converts an otherwise Phase-3-only claim into
something this phase can prove today.

## Current State Analysis

This is a true greenfield bootstrap: zero test files, no runner config, no
`test` script (`context/changes/testing-plan-soundness/research.md` §3.1).
`.github/workflows/ci.yml` runs exactly `checkout` → `setup-node` → `npm ci`
→ `astro sync` → `lint` → `build`, with `SUPABASE_URL`/`SUPABASE_KEY` scoped
only to the `build` step.

The two risk surfaces are both pure, dependency-light code:

- `src/lib/services/plan-validator.ts` — `validatePlan(plan, profile): Violation[]`,
  65 lines, zero runtime imports (its one import is `import type`).
- `src/lib/schemas/profile.ts` / `src/lib/schemas/plan.ts` — zod schemas whose
  only runtime import is `Constants` from the generated `src/db/database.types.ts`,
  itself a leaf module with no imports at all.

Confirmed by bundling all three with the repo's own esbuild
(`research.md` §3.2): the only external dependency across this whole closure
is `zod`. No `astro:*` virtual module appears anywhere in it — the four
modules that do use `astro:env`/`astro:middleware` (`gemini.ts`, `supabase.ts`,
`config-status.ts`, `middleware.ts`) are outside this phase's scope entirely.

## Desired End State

- `npm run test` (a non-watch `vitest run`) exists, passes locally, and is a
  required step in CI between `lint` and `build`.
- A table-driven unit suite proves that whenever `generatePlan`/`validatePlan`
  report a plan as acceptable (`ok === true` / `violations === []`), that plan
  does not use equipment outside the profile's set and has exactly the chosen
  number of sessions — with the goal-consistency non-claim and the
  savable-soft-failure decision explicitly characterized, not silently
  asserted.
- A parity suite proves, for every numeric/array bound in `profiles`, that a
  value the database CHECK constraint would reject is already rejected by
  `profileSchema` — anchored to the literal migration text, so an edit to the
  `.sql` file forces the suite to be revisited.
- `planSchema` rejects the one live "schema accepts, database rejects" value
  (a NUL code point in any plan text field), proven by a unit test.
- `context/foundation/test-plan.md` §6.1 and §6.2 read as filled-in cookbook
  entries instead of "TBD — see §3 Phase 1."

### Key Discoveries:

- `plan-generator.ts:50` — `generatePlan(client: GoogleGenAI, profile)` takes
  its SDK client as a parameter, so the retry loop is exercisable with a
  hand-written fake and no mocking framework.
- `plan-validator.ts:46-62` — the check filed under `guardrail: "goal"` never
  reads `profile.goal`; it is a goal-independent volume-sanity band (1–15
  exercises per session). No test in this phase may claim goal-consistency
  coverage.
- `save.ts:38-44` / `plans.ts:21-25` — a soft-failure plan (`ok: false`) being
  displayed and savable is a recorded, accepted product decision
  (`context/archive/2026-06-28-save-plan/plan.md`: *"Saving works even when
  `ok === false`"*), not a defect to fail a test on.
- `supabase/migrations/20260628105841_create_plans.sql` — the `plans` table
  has zero CHECK constraints. The entire Risk #5 parity surface for this
  phase is `profiles` × `profileSchema`.
- Verified empirically (not assumed): `z.toJSONSchema()` does not throw when
  a field carries a `.refine()` — the refinement is silently omitted from the
  emitted JSON Schema. The `PLAN_JSON_SCHEMA` sent to Gemini
  (`plan-generator.ts:30-34`) is unaffected by adding a NUL-rejecting refine
  to `planSchema`'s text fields.

## What We're NOT Doing

- **Not fixing Defect A** (the `equipment` array CHECK is a no-op for `{}` —
  `array_length('{}', 1)` is `NULL`, and a Postgres CHECK passes on `NULL`).
  This is the DB-accepts/zod-rejects direction, which is safe while zod is
  the only writer, and fixing it requires a hosted-DB migration push — a
  production-affecting action out of scope for a change whose stated test
  types are "unit, CI gate." Recorded as an open risk below for a dedicated
  follow-up.
- **Not testing the acceptance direction of Risk #5** ("every value the
  schema accepts is accepted by the database") — that requires a real
  database and is explicitly Phase 3's job per the backported test-plan §2.
- **Not adding array-length or string-length caps** to `planSchema` beyond
  the single NUL-rejecting refine — that is Risk #6 (unbounded jsonb writes),
  explicitly out of this phase's scope and already flagged live in the test
  plan.
- **Not enforcing goal-consistency.** The validator has no goal check to
  test; inventing one is a product change, not a testing-phase change.
- **Not touching `@cloudflare/vitest-pool-workers`** or any Workers-runtime
  test setup — nothing in this phase's scope executes under `workerd`;
  deferred per test-plan §4 to Phase 3 if a risk there ever needs it.
- **Not adding `--max-warnings 0`** to `npm run lint` — five existing
  `console.error` calls already produce `no-console` warnings; tightening the
  gate now would fail CI on unrelated pre-existing code.
- **Not using a top-level `tests/` directory** — new test files are
  co-located with their source (`*.test.ts` beside the module under test),
  matching this repo's existing flat structure.

## Implementation Approach

Four phases, ordered by dependency and cost × signal:

1. Stand up the runner and the CI gate first, proven by one real (not
   throwaway) smoke test — so the gate exists before any risk-bearing test is
   written, and a broken runner is caught immediately rather than papered
   over by the first "real" suite passing.
2. Risk #2 next: it is the test plan's only High × High row, its subject is a
   pure function plus a parameter-injectable service, and it costs no new
   test infrastructure beyond what Phase 1 built.
3. Risk #5: narrower in scope than the test plan implied (only `profiles` has
   a parity surface), and includes the one small production-code change this
   phase makes (the Defect B refine), justified because it directly serves
   the parity claim under test.
4. Cookbook update: pure documentation, folding in the two patterns just
   shipped.

## Critical Implementation Details

- **Faking `GoogleGenAI` needs a cast, not a structural match.** `GoogleGenAI`
  is a real SDK class with private internals; a plain object literal can
  never structurally satisfy it under `strictTypeChecked`. The correct,
  ESLint-clean pattern is an explicit double assertion at the call site:
  `fakeClient as unknown as GoogleGenAI`, where `fakeClient` is typed only as
  `{ models: { generateContent: (args: unknown) => Promise<GenerateContentResponseShape> } }`
  — the minimal shape `plan-generator.ts` actually reads
  (`response.promptFeedback?.blockReason`, `response.text`,
  `response.candidates?.[0]?.finishReason`). Do not attempt a partial/`Partial<GoogleGenAI>`
  cast; it will not satisfy the private-field nominal typing and either fails
  to compile or silently widens to `any`.
- **The migration-text guard must resolve its path independent of CWD.**
  Because `package.json` declares `"type": "module"`, `vitest.config.ts` and
  any test file using `node:fs` to read the migration `.sql` must resolve the
  path via `fileURLToPath(new URL("../relative/path", import.meta.url))`, not
  `__dirname` (undefined in ESM) and not a bare relative path from
  `process.cwd()` (fragile if Vitest is ever invoked from a subdirectory).

## Phase 1: Runner bootstrap + CI gate

### Overview

Install Vitest, add its config, wire `npm run test` into CI, and prove the
whole chain works with one genuine (non-throwaway) smoke test — before any
risk-bearing test exists, so a broken toolchain is never mistaken for a
passing guardrail suite later.

### Changes Required:

#### 1. Vitest dependency + scripts

**File**: `package.json`

**Intent**: Add Vitest as the test runner and expose it through the scripts
the CI gate and local development will call.

**Contract**: `devDependencies` gains `"vitest": "^4.1.10"` (matches the
installed `vite@7.3.6`, itself pinned by the existing `overrides` block —
research confirmed the peer range `^6 || ^7 || ^8` and Node engines `^22`
both hold). `scripts` gains `"test": "vitest run"` (non-watch, CI-safe) and
`"test:watch": "vitest"` (local development).

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root, sibling to `astro.config.mjs`)

**Intent**: Give Vitest the one piece of Vite config Astro provides for free
and that this repo actually needs for the units under test — the `@/` path
alias — without pulling in the Astro or Cloudflare Vite plugins, which
nothing in this phase's scope requires.

**Contract**:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
```

#### 3. Smoke test

**File**: `src/lib/utils.test.ts` (new)

**Intent**: Prove the full chain — Vitest runs, the `@/` alias resolves, TS/ESM
transpilation works — using a real assertion against existing production
code (`cn()`'s Tailwind-class-merging behavior), not a throwaway `1 + 1`
check that would prove nothing about the alias.

**Contract**: `import { cn } from "@/lib/utils"`; assert that a later
conflicting Tailwind class wins (e.g. `cn("p-2", "p-4")` resolves to `"p-4"`),
exercising `tailwind-merge`'s actual merge behavior.

#### 4. CI gate

**File**: `.github/workflows/ci.yml`

**Intent**: Make the test suite an unconditional, required step from the
very first commit that adds a test file — not opt-in, not warning-only.

**Contract**: Insert `- run: npm run test` as a new step, positioned after
the existing `- run: npm run lint` step and before `- run: npm run build`.
No `env:` block — confirmed in research that nothing in this phase's test
closure imports `astro:env` bindings, so no secret is needed for this step.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test` passes locally
- [ ] `npm run lint` passes (new files conform to the existing type-checked +
      Prettier rules)
- [ ] `npm run build` still passes unaffected
- [ ] `.github/workflows/ci.yml` contains the new test step between `lint`
      and `build`

#### Manual Verification:

- [ ] A push/PR run of the CI workflow shows the new test step executing and
      passing

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the CI run was observed before proceeding to Phase 2.

---

## Phase 2: Plan-soundness guardrail tests (Risk #2)

### Overview

Prove, with hand-declared oracles rather than a re-implementation of the
validator, that no plan the system reports as acceptable violates the
equipment or day-count guardrail — at both the pure-validator level and
through the full retry loop in `generatePlan` using a fake model client.
Explicitly characterize the two accepted-but-easy-to-mistake-for-bugs
behaviors: the absence of a real goal check, and the savability of a
soft-failure plan.

### Changes Required:

#### 1. Validator table-driven tests

**File**: `src/lib/services/plan-validator.test.ts` (new)

**Intent**: For a range of hand-constructed `(profile, plan)` pairs, assert
`validatePlan`'s output against an oracle derived solely from the profile and
the PRD guardrail sentence (`context/foundation/prd.md`: *"it never suggests
exercises for equipment the user doesn't have, exceeds the chosen number of
training days"*) — never from a predicate that mirrors the validator's own
logic.

**Contract**: A fixture table where each row is a literal `TrainingProfile`
and a literal `WorkoutPlan`, paired with a hand-written expected guardrail
set (`("equipment" | "day_count")[]`, empty for sound). Required rows,
grounded in `research.md` §4.1:

- A sound baseline pair (all equipment tags ⊆ profile equipment, session
  count === `training_days_per_week`) → `[]`.
- One exercise's `equipment` tag outside the profile's set → `["equipment"]`,
  and assert the violation's `guardrail` field only — never assert the
  Polish `message` text verbatim, except to confirm it *contains* the
  offending enum value(s), since that string is fed back to the model as
  retry correction input (a functional requirement, not copy).
- Multiple offending tags across multiple exercises → still exactly one
  `"equipment"` violation (the check collapses all offenders into one
  `Violation`) — a single-property mutation from the multi-offender case,
  guarding the collapsing behavior specifically.
- Session count one over and one under `training_days_per_week` → two
  separate cases, each `["day_count"]`.
- Both an equipment and a day-count violation in the same plan →
  `["equipment", "day_count"]` (order as emitted).
- A negative control: change exactly one property of the sound baseline (one
  exercise's tag) and assert the guardrail set changes accordingly — proves
  the fixture isn't accidentally insensitive to the property under test.

**Anti-pattern avoided**: the oracle problem — every expected value above is
a constant written by reading the input profile and the PRD sentence, never
computed by calling any validation logic.

#### 2. Generator retry-loop tests with a fake client

**File**: `src/lib/services/plan-generator.test.ts` (new)

**Intent**: Prove the guardrail holds through the full decision path — build
prompt → call model → validate → retry — not just through the isolated
predicate, directly answering the challenge that "the validator returned ok"
must actually mean "no accepted plan violates the guardrail" end to end.

**Contract**: A fake client (see Critical Implementation Details for the
cast pattern) whose `generateContent` returns scripted JSON matching
`planSchema`'s shape. Required cases:

- Scripted response is sound on the first attempt → `generatePlan` resolves
  `{ ok: true, violations: [] }` after exactly one call to
  `generateContent`.
- Scripted response violates the equipment guardrail on every attempt (three
  distinct violating payloads, one per retry) → `generatePlan` resolves
  `ok: false` after exactly three calls, and the returned `plan` matches the
  attempt with the fewest violations (grounded in the documented tie-break:
  `plan-generator.ts:102`, `<=` resolves ties toward the latest attempt —
  construct a case where attempts 1 and 3 tie on violation count to pin this
  specific rule).
- Across every scripted-violating case, assert the invariant
  `result.ok === (result.violations.length === 0)` holds on the returned
  `PlanGenerationResult` — not just that `ok` is `false`.

**Anti-pattern avoided**: over-mocking internal modules — the fake substitutes
only at the SDK boundary (`client.models.generateContent`), leaving
`buildPlanPrompt` and `validatePlan` running for real.

#### 3. Characterization test for the accepted soft-failure decision

**File**: `src/lib/services/plan-generator.test.ts` (same file, separate
`describe` block)

**Intent**: Pin the decision that a soft-failure result (`ok: false`) is a
valid, well-formed `PlanGenerationResult` — not a defect — so a future change
that accidentally starts throwing instead of returning on exhausted retries
is caught as a behavior change, per `context/archive/2026-06-28-save-plan/plan.md`'s
recorded acceptance of "soft-failure plans are shown and savable."

**Contract**: Given the all-attempts-violating fake client from the test
above, assert `generatePlan` **resolves** (does not throw) and the resolved
value's `plan` field is the structurally-valid `WorkoutPlan` from the
best-scoring attempt — i.e. downstream code (display, save) receives a
well-typed plan to work with, by design.

**Anti-pattern avoided**: failing the build on shipped, intentional behavior
— the test name and an inline comment must make clear this locks in a
decision, not a defect.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test` passes, including all `plan-validator.test.ts` and
      `plan-generator.test.ts` cases
- [ ] `npm run lint` passes on the new test files
- [ ] `npm run build` still passes unaffected

#### Manual Verification:

- [ ] A reviewer reading `plan-validator.test.ts` can confirm each expected
      guardrail set was hand-derived from the fixture's profile/plan, not
      computed by calling `validatePlan` a second time anywhere in the test
      file

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation before proceeding to
Phase 3.

---

## Phase 3: Schema↔database parity tests (Risk #5)

### Overview

Prove the rejection direction of Risk #5 for the one table that has a parity
surface (`profiles`): every value a database CHECK constraint rejects is
already rejected by `profileSchema`, anchored to the literal migration text
so the suite goes red the moment that text changes. Separately, close and
prove the one live "schema accepts, database rejects" case (Defect B) on the
`plans` side.

### Changes Required:

#### 1. Profile schema boundary + migration-text guard tests

**File**: `src/lib/schemas/profile.test.ts` (new)

**Intent**: Build one parity table transcribing each column's DB bound
directly from `supabase/migrations/20260627202445_create_profiles.sql`
(quoting the SQL line in a comment), test boundary values against
`profileSchema`, and separately guard that the transcribed SQL text still
matches the file on disk — so a silent migration edit is caught even though
no database is available to test against.

**Contract**: Two `describe` blocks.

`describe("profileSchema boundary parity")`: for each of `age` (13–100),
`weight_kg` (>0, ≤500), `training_days_per_week` (1–7), `squat_kg` /
`bench_kg` / `deadlift_kg` / `ohp_kg` (nullable, >0, ≤1000),
`plank_seconds` (nullable, >0, ≤3600), and `equipment` (non-empty array):
just-inside-bound values parse successfully, just-outside-bound values
(including the exact zero-value case from training-profile impl-review F1 —
`plank_seconds: 0` — re-verified here as a regression guard, not re-derived)
fail `safeParse`. Absent vs. explicit `null` on every optional lift/`plank_seconds`
field both normalize to a stored `null`, per the existing preprocess step
(`profile.ts:19-27`) — assert this behavior explicitly since it is the one
place absent/null distinctions are collapsed on purpose.

`describe("migration text guard")`: read
`supabase/migrations/20260627202445_create_profiles.sql` via
`readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260627202445_create_profiles.sql", import.meta.url)), "utf-8")`
and assert it still contains each of the six literal CHECK clauses quoted in
the parity table above (e.g. `"check (age between 13 and 100)"`). State in an
inline comment that this guard detects **drift** (the transcribed text
changing without the test being updated), not **incorrectness** — it does
not, and cannot, catch a CHECK clause that was always wrong (Defect A is the
standing example: its guard would keep passing forever, since the SQL text
itself never changes).

**Anti-pattern avoided**: testing the schema in isolation — every bound
above is transcribed from and cross-checked against the migration file
itself, an artifact outside the code under test, not re-derived from
`profileSchema`'s own source.

#### 2. Close Defect B — reject the NUL code point in plan text

**File**: `src/lib/schemas/plan.ts`

**Intent**: `jsonb` cannot store the NUL code point; every plan text field is
currently an unconstrained `z.string()`, so a value zod accepts can 500 at
insert (`src/lib/services/plans.ts:21`). Add one reusable refinement and
apply it to the plan schema's free-text string fields, closing the one live
schema/database divergence found in this risk.

**Contract**: A single helper near the top of the file,
`const noNulChar = (v: string) => !v.includes(" ");`, applied via
`.refine(noNulChar, "Tekst nie może zawierać znaku NUL.")` to
`planExerciseSchema.name`, `.reps`, `.suggested_weight`, and
`planSessionSchema.name`, `.focus` (the five free-text fields whose values
flow into the persisted `plan` jsonb column). Verified in research: adding
`.refine()` to a zod string does not throw when `PLAN_JSON_SCHEMA` is built
via `z.toJSONSchema(planSchema)` at `plan-generator.ts:30-34` — the
refinement is silently omitted from the emitted JSON Schema rather than
raising, so Gemini's structured-output contract is unaffected.

#### 3. Plan schema NUL-rejection test

**File**: `src/lib/schemas/plan.ts` — co-locate as `src/lib/schemas/plan.test.ts` (new)

**Intent**: Prove the fix — that `planSchema` now rejects the one value it
used to silently accept and pass through to a database error.

**Contract**: A structurally-valid `WorkoutPlan` fixture with a NUL code
point (`" "`) embedded in one exercise's `name` fails
`planSchema.safeParse`; the same fixture with the character removed
succeeds. This directly converts Defect B from a Phase-3-only, database-
requiring claim into a Phase-1-provable one.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test` passes, including all `profile.test.ts` and
      `plan.test.ts` cases
- [ ] `npm run lint` passes on the new/changed files
- [ ] `npm run build` still passes unaffected (the `PLAN_JSON_SCHEMA`
      construction in `plan-generator.ts` does not throw at module load)

#### Manual Verification:

- [ ] A reviewer confirms every bound in the parity table has a matching
      quoted CHECK clause verified against the actual migration file (not
      re-typed from memory)
- [ ] A reviewer confirms the migration-text guard's stated limitation
      (drift detection, not correctness) is documented inline, so Defect A's
      standing gap is not mistaken for something this suite protects against

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation before proceeding to
Phase 4.

---

## Phase 4: Cookbook update

### Overview

Fill in `context/foundation/test-plan.md` §6.1 and §6.2 with the patterns
just shipped, replacing their "TBD — see §3 Phase 1" placeholders. Doc-only;
no source changes.

### Changes Required:

#### 1. §6.1 — Adding a unit test

**File**: `context/foundation/test-plan.md`

**Intent**: Record the guardrail-testing pattern from Phase 2 — hand-declared
oracles derived from the profile and the PRD sentence, asserting on guardrail
categories rather than message text, and exercising the retry loop through a
fake SDK-boundary client rather than the isolated predicate alone — as the
template for any future unit test in this project.

**Contract**: Replace the §6.1 placeholder with a short walkthrough
referencing `src/lib/services/plan-validator.test.ts` and
`plan-generator.test.ts` as the canonical example, restating the oracle-
problem anti-pattern and the SDK-boundary-fake pattern from this plan.

#### 2. §6.2 — Adding a schema-boundary test

**File**: `context/foundation/test-plan.md`

**Intent**: Record the migration-text-anchored parity pattern from Phase 3 —
transcribe the DB bound with its SQL line quoted, test boundary values, and
add a guard reading the migration file itself — plus its documented
limitation (drift detection, not correctness).

**Contract**: Replace the §6.2 placeholder with a short walkthrough
referencing `src/lib/schemas/profile.test.ts` as the canonical example,
explicitly noting the guard's scope limitation so it is not overstated in
future use.

### Success Criteria:

#### Automated Verification:

- [ ] None — documentation-only change; `npm run lint`/`npm run test` are
      unaffected and continue passing

#### Manual Verification:

- [ ] §6.1 and §6.2 no longer read "TBD"; both reference the actual test
      files shipped in Phases 2–3 and are legible to someone who did not
      write this plan

**Implementation Note**: This is the final phase of this change. After
manual verification, the change is ready to move toward archival per its own
process.

---

## Testing Strategy

### Unit Tests:

- `src/lib/utils.test.ts` — runner/alias smoke test (Phase 1)
- `src/lib/services/plan-validator.test.ts` — guardrail table (Phase 2)
- `src/lib/services/plan-generator.test.ts` — retry-loop + characterization
  (Phase 2)
- `src/lib/schemas/profile.test.ts` — DB parity + migration-text guard
  (Phase 3)
- `src/lib/schemas/plan.test.ts` — NUL-rejection boundary (Phase 3)

### Integration Tests:

None in this phase — the acceptance direction of Risk #5 and any test
requiring a live database are explicitly deferred to test-plan Phase 3
(persistence + boundary contracts).

### Manual Testing Steps:

1. Run `npm run test` locally after each phase and confirm the expected
   number of passing cases.
2. After Phase 1, push a commit and confirm the CI workflow's new test step
   appears and passes in the Actions run.
3. After Phase 3, open `supabase/migrations/20260627202445_create_profiles.sql`
   side-by-side with `src/lib/schemas/profile.test.ts` and manually confirm
   every quoted CHECK clause is character-for-character accurate.

## Performance Considerations

None — all tests in this phase run in `environment: "node"` against pure
functions and zod parses; no network, no database, no Workers runtime.
Expected suite runtime is sub-second.

## Migration Notes

No database migration in this change (Defect A's fix is explicitly deferred,
see Open Risks & Assumptions and "What We're NOT Doing"). No data migration;
nothing to roll back beyond reverting the added files and the small
`plan.ts` refine.

## Open Risks & Assumptions

- **Defect A remains unfixed.** The `equipment` array's CHECK constraint
  (`array_length(equipment, 1) >= 1`) is a no-op for an empty array in
  Postgres (`array_length('{}', 1)` is `NULL`, and CHECK passes on `NULL`).
  Deferred by explicit decision (see "What We're NOT Doing") to a dedicated
  follow-up that can carry a hosted-DB migration push; not blocking for this
  phase since zod remains the sole writer today.
- **The migration-text guard only detects drift, not incorrectness** — a
  CHECK clause that was wrong from the start (like Defect A) will pass the
  guard forever, since its SQL text never changes. This is a known,
  documented limitation of the pattern, not a gap in this phase's execution.
- **`generatePlan`'s fake-client tests assume Gemini's real JSON shape holds.**
  The fake returns `{ text: JSON.stringify(planPayload) }`; if the real
  `@google/genai` response shape changes, these tests would keep passing
  while production breaks. Out of this phase's scope (a provider-integration
  concern, not a guardrail-logic concern) — Risk #4 (model failure surfaces)
  in test-plan Phase 4 owns that surface.

## References

- Research: `context/changes/testing-plan-soundness/research.md`
- Change identity: `context/changes/testing-plan-soundness/change.md`
- Validator: `src/lib/services/plan-validator.ts:18-65`
- Generator: `src/lib/services/plan-generator.ts:50-115`
- Profile schema: `src/lib/schemas/profile.ts`
- Plan schema: `src/lib/schemas/plan.ts`
- Profiles migration: `supabase/migrations/20260627202445_create_profiles.sql`
- Existing CI workflow: `.github/workflows/ci.yml`
- Prior zero-value bug (F1): `context/archive/2026-06-27-training-profile/reviews/impl-review.md`
- Accepted soft-failure decision: `context/archive/2026-06-28-save-plan/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a
> step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner bootstrap + CI gate

#### Automated

- [x] 1.1 `npm run test` passes locally — e723fff
- [x] 1.2 `npm run lint` passes — e723fff
- [x] 1.3 `npm run build` still passes unaffected — e723fff
- [x] 1.4 `.github/workflows/ci.yml` contains the new test step between
      `lint` and `build` — e723fff

#### Manual

- [x] 1.5 A push/PR CI run shows the new test step executing and passing — e723fff

### Phase 2: Plan-soundness guardrail tests (Risk #2)

#### Automated

- [x] 2.1 `npm run test` passes, including all `plan-validator.test.ts` and
      `plan-generator.test.ts` cases — 551fdf7
- [x] 2.2 `npm run lint` passes on the new test files — 551fdf7
- [x] 2.3 `npm run build` still passes unaffected — 551fdf7

#### Manual

- [x] 2.4 A reviewer confirms every expected guardrail set was hand-derived,
      never computed by calling `validatePlan` a second time in the test file — 551fdf7

### Phase 3: Schema↔database parity tests (Risk #5)

#### Automated

- [x] 3.1 `npm run test` passes, including all `profile.test.ts` and
      `plan.test.ts` cases — 384e0b5
- [x] 3.2 `npm run lint` passes on the new/changed files — 384e0b5
- [x] 3.3 `npm run build` still passes unaffected — 384e0b5

#### Manual

- [x] 3.4 A reviewer confirms every parity-table bound matches a quoted CHECK
      clause verified against the actual migration file — 384e0b5
- [x] 3.5 A reviewer confirms the migration-text guard's drift-vs-correctness
      limitation is documented inline — 384e0b5

### Phase 4: Cookbook update

#### Manual

- [x] 4.1 §6.1 and §6.2 no longer read "TBD" and reference the actual test
      files shipped
