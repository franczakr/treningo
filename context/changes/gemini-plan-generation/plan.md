# Switch FR-003 Plan Generation to Google Gemini 2.5 Flash — Implementation Plan

## Overview

Swap the LLM provider for FR-003 plan generation from Anthropic (Opus 4.8, via
`@anthropic-ai/sdk`) to **Google Gemini 2.5 Flash** (via `@google/genai`), so the
product runs on a **free tier** (no credit card, no per-request billing). The
prompt builder, the soundness validator, and the retry orchestration are
preserved unchanged — only the model client and the structured-output call site
change. Anthropic is removed entirely (single provider). This is a **deliberate
deviation** from `tech-stack.md` / `CLAUDE.md`, which specified the Anthropic SDK
for FR-003; the docs are updated to match.

## Current State Analysis

The `personalized-plan-generation` slice (S-02) is implemented and committed
(`bf8a57d`, `c2cc8ee`, `480b4ef`). Its generation stack:

- **Client factory** `src/lib/anthropic.ts` — `createAnthropic(): Anthropic | null`,
  reads `ANTHROPIC_API_KEY` from `astro:env/server`, null when unset.
- **Generator** `src/lib/services/plan-generator.ts` — `generatePlan(client, profile)`
  calls `client.messages.parse()` with `model: "claude-opus-4-8"`, adaptive
  thinking, `effort: "medium"`, `output_config.format = zodOutputFormat(planSchema)`;
  checks `stop_reason === "refusal"` and null `parsed_output` as hard failures;
  validates + retries (max 2) feeding violations back; throws `PlanGenerationError`.
- **Prompt builder** `src/lib/services/plan-prompt.ts` — `buildPlanPrompt(profile, violations?)`
  returns `{ system, user }` (Polish instructions; provider-agnostic).
- **Validator** `src/lib/services/plan-validator.ts` — pure `validatePlan(plan, profile)`
  (provider-agnostic).
- **Schema** `src/lib/schemas/plan.ts` — Zod `planSchema`; types in `src/types.ts`
  (`WorkoutPlan`, `PlanSession`, `PlanExercise`, `Violation`, `PlanGenerationResult`).
- **API route** `src/pages/api/plan/generate.ts` — `createAnthropic()` + `generatePlan`,
  distinct status codes (401/422/503/500), `{ plan, violations, ok }` on 200.
- **Env** `astro.config.mjs` declares `ANTHROPIC_API_KEY` as a server-only secret;
  `.env.example` documents it.

### Key Discoveries:

- **`@google/genai` is the supported SDK** (the old `@google/generative-ai` is
  deprecated and had Cloudflare Workers issues). API: `new GoogleGenAI({ apiKey })`
  → `ai.models.generateContent({ model, contents, config })` → `response.text`.
  System prompt goes in `config.systemInstruction`.
- **Structured output**: Gemini 2.5 supports `config.responseJsonSchema` (a full
  JSON Schema — `$ref`, nested defs, `additionalProperties`) alongside
  `config.responseMimeType: "application/json"`. When `responseJsonSchema` is set,
  `responseSchema` must be omitted.
- **Zod → JSON Schema is clean**: `z.toJSONSchema(planSchema)` (Zod 4.4.3 ships
  `z.toJSONSchema`) produces a fully **inlined** schema (verified: no `$ref`/`$defs`),
  with `enum`, `minimum`/`maximum`, and `description` preserved — all supported by
  Gemini 2.5 `responseJsonSchema`. The **only** incompatibility is the top-level
  `$schema` key (`"https://json-schema.org/draft/2020-12/schema"`), which must be
  stripped before sending.
- **workerd**: the SDK is fetch-based and `wrangler.jsonc` already has
  `nodejs_compat` (`compatibility_flags: ["nodejs_compat", "disable_nodejs_process_v2"]`),
  so it should run on Workers — verified at build + dev-runtime, not assumed.
- **No `effort`/`thinking`/`stop_reason` analogues**: Gemini 2.5 Flash has thinking
  on by default (no config needed). There is no `effort`. "Refusal" surfaces
  differently — a blocked prompt yields `promptFeedback.blockReason`, or a
  candidate with `finishReason: "SAFETY"` and empty `text`. These map to our
  hard-failure path.

## Desired End State

A logged-in user with a profile clicks **"Generuj plan"** and gets the same
experience as before — spinner → Polish plan respecting the three guardrails,
"Wygeneruj ponownie", warning/error states — but generation runs on Gemini 2.5
Flash on the free tier. `@anthropic-ai/sdk` is gone; `GEMINI_API_KEY` is the only
LLM secret. `CLAUDE.md` and `tech-stack.md` reflect Gemini. The S-02 north star is
verified end-to-end with a real (free) key, closing the previously-pending manual
items.

Verify by: setting `GEMINI_API_KEY`, generating across profile combinations, and
confirming equipment/day-count/goal guardrails hold and all content is Polish.

## What We're NOT Doing

- **No change to the prompt builder, validator, schema, API route shape, page, or
  island logic** — only the provider/client/generator and env/deps change (plus
  the `createAnthropic`→`createGemini` reference in the route).
- **No persistence / history / multiple variants** — still ephemeral S-02 scope.
- **No multi-provider abstraction layer** — single provider (Gemini); we are not
  building a pluggable provider interface.
- **No keeping Anthropic as a fallback** — removed entirely (recoverable via git).
- **No test runner introduction** — validator stays pure/unit-testable; E2E is
  manual (or `/10x-e2e` later).

## Implementation Approach

Concentrated swap. Phase 1 replaces the client + generator call site and env/deps,
deleting Anthropic. The generator keeps its exact control flow (generate →
validate → retry ≤2 → best attempt; throw `PlanGenerationError` on hard failure)
— only the model call and the "no usable output" detection change to Gemini's
shapes. Phase 2 aligns the docs. Phase 3 verifies end-to-end with a free key and
closes the prior slice's pending manual checks.

## Critical Implementation Details

- **JSON Schema cleanup**: derive the schema once with `z.toJSONSchema(planSchema)`
  and delete the top-level `$schema` property before passing it as
  `config.responseJsonSchema`. Everything else in the generated schema is accepted
  by Gemini 2.5. If Gemini unexpectedly rejects a keyword at runtime, the fallback
  is to hand-map to the OpenAPI-subset `responseSchema` — but the verified output
  shape makes this unlikely.
- **Hard-failure detection on Gemini**: treat as `PlanGenerationError` (no silent
  bad result) when the SDK call throws, when `response.promptFeedback?.blockReason`
  is set, when the candidate `finishReason` indicates a safety/blocked stop, or
  when `response.text` is empty/undefined or not parseable into `planSchema`. Only
  guardrail violations on an otherwise-parsed plan go through the retry loop.

## Phase 1: Provider swap — deps, env, client factory, generator, API route

### Overview

Replace Anthropic with Gemini across the dependency, env, client-factory,
generator, and API-route layers; delete the Anthropic client module.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Remove `@anthropic-ai/sdk`; add `@google/genai`.

**Contract**: `npm uninstall @anthropic-ai/sdk && npm install @google/genai`. No
other LLM SDK remains. Lockfile updated.

#### 2. Environment secret

**File**: `astro.config.mjs`, `.env.example`

**Intent**: Replace the `ANTHROPIC_API_KEY` server-only secret with
`GEMINI_API_KEY`, same `envField` shape.

**Contract**: `GEMINI_API_KEY: envField.string({ context: "server", access: "secret", optional: true })`
in the `env.schema` block; `.env.example` swaps `ANTHROPIC_API_KEY=###` →
`GEMINI_API_KEY=###`. (Local dev needs it in `.dev.vars` too — gitignored; note in
manual steps.)

#### 3. Gemini client factory

**File**: `src/lib/gemini.ts` (new), `src/lib/anthropic.ts` (delete)

**Intent**: Null-safe factory mirroring the old `createAnthropic` — reads
`GEMINI_API_KEY` from `astro:env/server`, returns `null` when unset. Delete the
Anthropic module.

**Contract**: `createGemini(): GoogleGenAI | null`. Constructs
`new GoogleGenAI({ apiKey })` only when the key is present. `src/lib/anthropic.ts`
is removed.

#### 4. Generator — Gemini call + structured output

**File**: `src/lib/services/plan-generator.ts`

**Intent**: Swap the model call from `client.messages.parse()` (Anthropic) to
`ai.models.generateContent()` (Gemini) with `responseMimeType: "application/json"`
and `responseJsonSchema` derived from `planSchema`; map Gemini's "no usable
output" signals to `PlanGenerationError`. Preserve the validate → retry (≤2) →
best-attempt flow and the `PlanGenerationError` type unchanged.

**Contract**: `generatePlan(client: GoogleGenAI, profile: TrainingProfile): Promise<PlanGenerationResult>`
(signature changes only in the client type). Per attempt: call
`client.models.generateContent({ model: "gemini-2.5-flash", contents: user, config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: <schema> } })`
where `<schema>` is `z.toJSONSchema(planSchema)` with the top-level `$schema` key
deleted (compute once at module load). Hard-failure (throw `PlanGenerationError`)
when: the call throws, `promptFeedback?.blockReason` is set, the candidate
`finishReason` is a safety/blocked stop, `response.text` is empty, or
`JSON.parse` / `planSchema.safeParse` fails. On a parsed plan, run `validatePlan`;
violations with attempts remaining → rebuild prompt via `buildPlanPrompt(profile, violations)`
and retry. Drop the Anthropic-only `thinking`/`effort`/`stop_reason` handling.

#### 5. API route — client reference

**File**: `src/pages/api/plan/generate.ts`

**Intent**: Use `createGemini()` instead of `createAnthropic()`; the "not
configured" 503 branch and everything else stay identical.

**Contract**: `import { createGemini } from "@/lib/gemini"`; `const ai = createGemini();`
`if (!supabase || !ai) → 503`. `generatePlan(ai, profile)` unchanged otherwise.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- `astro check` reports 0 errors
- `@google/genai` resolves/imports in the build; no remaining import of `@anthropic-ai/sdk` (`grep -r "@anthropic-ai/sdk" src` is empty)

#### Manual Verification:

- Validator still reports `equipment`/`day_count` on crafted bad plans and empty on a sound plan (regression check — provider-agnostic)
- A simulated hard failure (stubbed Gemini client that throws / returns blocked / returns empty text) throws `PlanGenerationError`
- With `GEMINI_API_KEY` unset, `createGemini()` returns `null` (no throw)

**Implementation Note**: After this phase and all automated verification passes,
pause for manual confirmation before proceeding.

---

## Phase 2: Documentation alignment

### Overview

Update the project docs so they describe Gemini as the FR-003 provider, recording
the deliberate deviation.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Update the "Project context (Treningo)" note that says the plan
generator is built "with an LLM via the **Anthropic SDK**" to name **Google Gemini
2.5 Flash via `@google/genai`** with `responseJsonSchema` structured output, plus
the post-generation validation/retry layer. Keep the structured-output +
validation-guardrail framing.

**Contract**: The FR-003 bullet under "Project context" reflects Gemini; no
lingering "Anthropic SDK" reference for plan generation.

#### 2. tech-stack.md

**File**: `context/foundation/tech-stack.md`

**Intent**: Record the provider decision change (Anthropic → Gemini free tier) and
the rationale (zero-cost free tier; native structured output preserves the
validation/retry design), noting it as a deviation from the original choice.

**Contract**: The LLM/provider section names Gemini 2.5 Flash and the cost
rationale; original Anthropic choice noted as superseded.

### Success Criteria:

#### Automated Verification:

- `grep -ri "anthropic" CLAUDE.md context/foundation/tech-stack.md` returns no stale provider references (only historical/deviation notes if intentional)

#### Manual Verification:

- CLAUDE.md and tech-stack.md read correctly and consistently describe Gemini as the FR-003 provider

**Implementation Note**: After this phase and all automated verification passes,
pause for manual confirmation before proceeding.

---

## Phase 3: End-to-end verification (free key) — close out the north star

### Overview

With a real (free) `GEMINI_API_KEY`, verify the full flow and close the manual
items left pending in `personalized-plan-generation` (2.4, 3.3–3.8).

### Changes Required:

#### 1. Run the app and verify

**File**: (no code change) — `.dev.vars` (gitignored) gets `GEMINI_API_KEY`; `npm run dev`

**Intent**: Drive the happy path and the failure/guardrail paths against live
Gemini, then check off the corresponding manual rows in the prior change's plan.

**Contract**: After verification, update the `## Progress` Manual rows in
`context/changes/personalized-plan-generation/plan.md` (2.4, 3.3–3.8) to `[x]`,
and run that change's epilogue (flip its `change.md` → `implemented`). This change
owns driving the verification; the prior change's plan records the result.

### Success Criteria:

#### Automated Verification:

- (none — this phase is live/manual E2E)

#### Manual Verification:

- Happy path: profile → "Generuj plan" → spinner → Polish plan respecting equipment, day-count, and goal guardrails (covers prior 3.3)
- "Wygeneruj ponownie" produces a fresh plan (prior 3.4)
- A real-key generation yields a sound plan within the retry budget; observe at least one retry-correction by temporarily over-constraining equipment (prior 2.4)
- Profile-less user visiting `/plan` redirects to `/training-profile` (prior 3.5)
- Unauthenticated request to `/plan` redirects to signin (prior 3.6)
- Forced hard failure (invalid `GEMINI_API_KEY`) shows the friendly error + retry, no plan (prior 3.7)
- Forced soft failure (over-constrained equipment) shows the best attempt with a warning banner naming the violation (prior 3.8)

**Implementation Note**: This phase is manual. After it passes, check off the
prior change's pending rows and close it out. This closes the S-02 north star.

---

## Testing Strategy

### Unit Tests:

- None automated (no runner). Validator remains pure; regression-checkable via a
  throwaway tsx script as in the prior change.

### Integration Tests:

- Manual happy-path E2E (Phase 3), now feasible at zero cost with the free key.

### Manual Testing Steps:

1. Put `GEMINI_API_KEY` in `.env` and `.dev.vars`; `npm run dev`.
2. Sign in as a user with a saved profile; click "Generuj plan".
3. Confirm spinner → Polish plan; sessions = chosen days, equipment ⊆ available, choices fit the goal.
4. "Wygeneruj ponownie" → new plan.
5. Profile-less user → `/plan` redirects to `/training-profile`; logged-out → signin.
6. Invalid key → friendly error + retry (no plan).

## Performance Considerations

- Same shape as before: up to 3 sequential generation calls (2 retries), each an
  I/O-bound `fetch` within Worker limits. Gemini 2.5 Flash is fast; free-tier RPM/RPD
  limits apply (solo MVP stays well under them). No caching (regeneration is a feature).

## Migration Notes

- No schema/DB changes. Local dev and any deployment must set `GEMINI_API_KEY`
  (replacing `ANTHROPIC_API_KEY`) in `.dev.vars` / Cloudflare secrets.

## References

- Prior slice (the code being modified): `context/changes/personalized-plan-generation/plan.md`
- Provider decision context: this change's `change.md`; `context/foundation/tech-stack.md`
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- `@google/genai` SDK: https://github.com/googleapis/js-genai
- Files to modify: `src/lib/anthropic.ts` (→ `src/lib/gemini.ts`), `src/lib/services/plan-generator.ts`, `src/pages/api/plan/generate.ts`, `astro.config.mjs`, `.env.example`, `package.json`, `CLAUDE.md`, `context/foundation/tech-stack.md`

## Open Risks & Assumptions

- **workerd compatibility of `@google/genai`** — assumed (fetch-based +
  `nodejs_compat`); verified at build and dev runtime in Phase 1/3. If it pulls an
  unsupported Node API, `nodejs_compat` should cover it; worst case, fall back to
  calling the Gemini REST endpoint via `fetch` directly.
- **`responseJsonSchema` keyword acceptance** — verified the generated schema is
  inlined with only supported keywords (after stripping `$schema`); if Gemini
  rejects something at runtime, fall back to the OpenAPI-subset `responseSchema`.
- **Free-tier limits/quality** — Gemini 2.5 Flash free tier has RPM/RPD caps and is
  a smaller model than Opus 4.8; plan quality for nuanced Polish may differ. The
  validator + retry guardrails still apply; acceptable for a free MVP.
- **Polish output quality** — assumed good on Gemini 2.5 Flash; confirmed in Phase 3.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Provider swap — deps, env, client factory, generator, API route

#### Automated

- [x] 1.1 Type checking passes: `npm run build`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 `astro check` reports 0 errors
- [x] 1.4 `@google/genai` resolves in build; no remaining `@anthropic-ai/sdk` import in `src`

#### Manual

- [x] 1.5 Validator regression: `equipment`/`day_count` on bad plans, empty on a sound plan
- [x] 1.6 Simulated hard failure (stubbed Gemini: throw / blocked / empty text) throws `PlanGenerationError`
- [x] 1.7 With `GEMINI_API_KEY` unset, `createGemini()` returns `null` (no throw)

### Phase 2: Documentation alignment

#### Automated

- [ ] 2.1 No stale provider references: `grep -ri "anthropic" CLAUDE.md context/foundation/tech-stack.md` clean (bar intentional deviation notes)

#### Manual

- [ ] 2.2 CLAUDE.md + tech-stack.md consistently describe Gemini as the FR-003 provider

### Phase 3: End-to-end verification (free key) — close out the north star

#### Manual

- [ ] 3.1 Happy path: profile → "Generuj plan" → spinner → Polish plan respecting all three guardrails (prior 3.3)
- [ ] 3.2 "Wygeneruj ponownie" produces a fresh plan (prior 3.4)
- [ ] 3.3 Real-key generation: sound plan within retry budget, with an observed retry-correction (prior 2.4)
- [ ] 3.4 Profile-less user visiting `/plan` → redirect to `/training-profile` (prior 3.5)
- [ ] 3.5 Unauthenticated request to `/plan` → redirect to signin (prior 3.6)
- [ ] 3.6 Forced hard failure (invalid key) → friendly error + retry, no plan (prior 3.7)
- [ ] 3.7 Forced soft failure (over-constrained equipment) → best attempt + warning banner (prior 3.8)
- [ ] 3.8 Prior change closed out: its Manual rows checked off + `change.md` → implemented
