# Personalized Plan Generation Implementation Plan

## Overview

Roadmap slice **S-02** — the product's north star. A logged-in user with a
completed training profile requests a workout plan and immediately views one
whose sessions, exercises, sets, reps, suggested weights, and rest match their
goal, experience, available equipment, and chosen training days (FR-003 +
FR-004, US-01).

Generation is **LLM-based** (Anthropic Opus 4.8 via the official SDK, structured
outputs) wrapped in a **post-generation validation layer** that enforces the
FR-003 plan-soundness guardrails (equipment ⊆ available, session count = chosen
days, consistency with the stated goal) and **retries with feedback** on
violation — not a hand-authored rules engine. This is the highest-risk, highest-
effort slice (PRD flags FR-003) and the one the `top_blocker` (time) concentrates
on; it proves the core hypothesis that an auto-generated, parameter-respecting
plan beats a generic one.

Scope is **ephemeral generate-and-view**: the plan is generated and rendered in
one flow, held only in client state. Persistence is S-03; browsing saved plans
is S-04 — both out of scope here.

## Current State Analysis

The S-01 (`training-profile`) slice is done and establishes every pattern this
slice extends:

- **Profile data** lives in `public.profiles` (one row per `user_id`, RLS deny-
  by-default). The rich input set the generator consumes: `goal`,
  `experience_level`, `age`, `weight_kg`, `training_days_per_week`,
  `equipment` (`equipment_item[]`), and optional `squat_kg` / `bench_kg` /
  `deadlift_kg` / `ohp_kg` / `plank_seconds` (`src/db/database.types.ts:44`).
- **Enums + UI option lists** with Polish labels in `src/types.ts:36` (`GOAL_OPTIONS`,
  `EXPERIENCE_OPTIONS`, `EQUIPMENT_OPTIONS`) and machine values in
  `Constants.public.Enums` (`src/db/database.types.ts:240`).
- **Service pattern**: `src/lib/services/profile.ts` — typed `SupabaseClient<Database>`,
  `user_id` always derived from the session, never the client.
- **Schema pattern**: `src/lib/schemas/profile.ts` — Zod (v`4.4.3`), driven off
  `Constants.public.Enums` so enum values stay in lock-step with the DB.
- **API pattern**: `src/pages/api/profile.ts` — `export const prerender = false`,
  reads `context.locals.user`, validates with Zod, friendly errors.
- **Page + island**: `src/pages/training-profile.astro` server-fetches and passes
  props to a `client:load` React island (`src/components/profile/TrainingProfileForm.tsx`).
- **Auth/middleware**: `src/middleware.ts` resolves `context.locals.user` and
  guards `PROTECTED_ROUTES = ["/dashboard", "/training-profile"]`.
- **Env**: `astro.config.mjs:17` declares server-only secrets via
  `envField.string({ context: "server", access: "secret", optional: true })`,
  read through `astro:env/server`. `createClient(...)` returns `null` when unset;
  callers null-check (`config-status` gating).
- **Runtime**: Astro 6 SSR, `output: "server"`, Cloudflare Workers
  (`wrangler.jsonc` has `nodejs_compat`). Low QPS, solo after-hours MVP.

What's missing: **no LLM SDK is installed**, no `ANTHROPIC_API_KEY`, no plan
types/schema, no generation service, no plan route/page/island.

### Key Discoveries:

- The Anthropic TypeScript SDK is `fetch`-based and runs on workerd unchanged;
  `nodejs_compat` is already enabled, so **no `wrangler.jsonc` change is needed**.
- Structured outputs (`client.messages.parse()` + `output_config.format` with the
  SDK's `zodOutputFormat` helper) are supported on Opus 4.8 and **guarantee the
  JSON shape** — but cannot enforce the FR-003 semantic guardrails. That is
  exactly why the separate validation layer exists.
- Zod is pinned at `4.4.3`; `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`
  consumes a Zod schema. Structured-output JSON Schema does **not** support
  numeric `min`/`max` or string-length constraints — the SDK strips them and
  validates client-side, so bounds belong in our own validator, not as a
  generation-time guarantee.
- The equipment guardrail is made deterministic by having **each generated
  exercise carry an `equipment` field** (an `equipment_item` enum value); the
  validator checks the set of used tags ⊆ the user's available set, never parsing
  Polish exercise names.

## Desired End State

A user who has saved a profile clicks **"Generuj plan"** (on the dashboard /
profile page), lands on `/plan`, sees a loading state while the plan generates
(~10–30 s), then views a plan: per-session name/focus + a list of exercises with
sets, reps, suggested weight, and rest — all in Polish. The plan respects all
three guardrails. A **"Wygeneruj ponownie"** button produces a fresh plan. A user
without a profile is redirected to `/training-profile`. On a hard failure (API
down, parse failure, refusal) the user sees a friendly error with a retry button;
on a soft failure (a structurally-valid plan that still violates a guardrail after
max retries) the best attempt is shown with a warning banner naming the
violation(s).

Verify by: signing in as a user with a profile, generating across several
profile combinations (different equipment / days / goal, with and without lifts),
and confirming each plan honors the equipment, day-count, and goal guardrails.

## What We're NOT Doing

- **No persistence** — plans are not written to any table (that's S-03). No plans
  table, no RLS for plans, no `db:migration` in this slice.
- **No browsing / history** — no list of past plans (that's S-04).
- **No multiple variants** — one plan per generation (PRD non-goal for v1).
- **No manual plan editing** (PRD non-goal, v2).
- **No template/rules fallback engine** — LLM-first per tech-stack; a rules engine
  remains a documented future fallback, not built here.
- **No test runner** — validator is written as a pure, unit-testable function, but
  introducing Vitest/Playwright is out of scope (matches S-01's decision); the
  `/10x-e2e` skill owns that later.
- **No streaming** of the LLM response — non-streaming `messages.parse()` is fine
  at this output size and QPS.

## Implementation Approach

Bottom-up vertical slice in three phases: **foundations → generation+validation →
API+UI**, mirroring how S-01 was built (data → backend → frontend), but with the
LLM service standing in for the DB layer (no persistence here).

The generation service is a pure orchestration function: build a prompt from the
profile → call Opus 4.8 with a Zod-constrained output schema → run the validator
→ if it reports violations, regenerate with the violations fed back as corrective
instructions (max 2 retries) → return the best attempt plus its violation list.
The validator is a standalone pure function over the parsed plan + profile, so the
guardrail logic is testable without calling the LLM.

The frontend is a `client:load` React island on a protected `/plan` page that
auto-fires the generation request on mount, shows a spinner, then renders the
plan (or a warning banner / error with retry). This handles the LLM latency and
the ephemeral model cleanly, departing from S-01's native-form-POST pattern
because generation is fundamentally async with a long, failable round-trip.

## Critical Implementation Details

- **Workerd latency budget.** The Opus 4.8 call is an outbound `fetch` (I/O wait,
  not CPU), so it does not burn the Worker CPU-time limit; wall-clock for
  subrequests is generous. Still, with up to 2 retries the worst case is 3
  sequential LLM calls — keep `effort: "medium"` and a bounded `max_tokens`
  (~16000, non-streaming) so a single generation stays well under request limits.
- **Refusal handling.** Opus 4.8 can return `stop_reason: "refusal"` (HTTP 200,
  no usable content). Treat it as a hard failure (error + retry UX), never as a
  plan. Check `stop_reason` before reading parsed output.
- **Soft vs hard failure (deliberate guardrail softening).** After max retries
  with a structurally-valid-but-violating plan, the UI shows the least-violating
  attempt with a warning banner — an explicit, accepted deviation from the PRD's
  strict "a plan always respects parameters" guardrail (see Open Risks). A *hard*
  failure (no parseable plan: API error, refusal, schema-parse failure) shows the
  error+retry state with no plan.

## Phase 1: Foundations — SDK, env, plan schema & types

### Overview

Install the Anthropic SDK, wire the API key through `astro:env` exactly like the
Supabase secrets, define the plan output schema + shared types, and add a null-
safe Anthropic client factory mirroring `src/lib/supabase.ts`.

### Changes Required:

#### 1. Anthropic SDK dependency

**File**: `package.json`

**Intent**: Add `@anthropic-ai/sdk` as a production dependency. No other LLM SDK.

**Contract**: New entry under `dependencies`; lockfile updated via `npm install @anthropic-ai/sdk`.

#### 2. Environment secret

**File**: `astro.config.mjs`, `.env.example`

**Intent**: Declare `ANTHROPIC_API_KEY` as a server-only secret using the same
`envField` shape as the Supabase secrets, and document it in the example env.

**Contract**: `ANTHROPIC_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` in the `env.schema` block; `ANTHROPIC_API_KEY=###` appended to `.env.example`. (Local dev also needs it in `.dev.vars`; note this in the phase's manual steps — `.dev.vars` is gitignored.)

#### 3. Plan output schema + shared types

**File**: `src/lib/schemas/plan.ts` (new), `src/types.ts`

**Intent**: A Zod schema describing the generated-plan shape that the LLM must
return, and shared TS types derived from it. Each exercise carries an `equipment`
tag (an `equipment_item` enum value) so the validator can check the equipment
guardrail on tags, not names. Content fields (session name/focus, exercise name)
are free Polish strings.

**Contract**: Plan = `{ sessions: PlanSession[] }`; `PlanSession = { name: string; focus: string; exercises: PlanExercise[] }`; `PlanExercise = { name: string; equipment: EquipmentItem; sets: number; reps: string; suggested_weight: string; rest_seconds: number }`. `equipment` uses `z.enum(Constants.public.Enums.equipment_item)`. `reps`/`suggested_weight` are strings to allow ranges ("8–10") and qualitative loads ("masa ciała", "orientacyjnie 40 kg"). Export `WorkoutPlan`, `PlanSession`, `PlanExercise` types from `src/types.ts` (re-exporting the Zod-inferred types). Keep numeric bounds (sets/rest) in this schema for client-side validation, but treat the validator (Phase 2) as the real guardrail enforcement.

#### 4. Anthropic client factory

**File**: `src/lib/anthropic.ts` (new)

**Intent**: A factory mirroring `src/lib/supabase.ts` — reads `ANTHROPIC_API_KEY`
from `astro:env/server`, returns `null` when unset so callers degrade gracefully
(consistent with the `config-status` gating pattern).

**Contract**: `createAnthropic(): Anthropic | null`. Reads the key from `astro:env/server`; constructs `new Anthropic({ apiKey })` only when present.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (or `astro check`)
- Linting passes: `npm run lint`
- `@anthropic-ai/sdk` resolves and imports without error in the build

#### Manual Verification:

- Plan schema/types compile and are importable from `@/types` and `@/lib/schemas/plan`
- With `ANTHROPIC_API_KEY` unset, `createAnthropic()` returns `null` (no throw)

**Implementation Note**: After this phase and all automated verification passes,
pause for manual confirmation before proceeding.

---

## Phase 2: Generation service + validation layer

### Overview

The core value and core risk. A prompt builder turns a profile into an
instruction; the generation service calls Opus 4.8 with the Zod-constrained
output schema; a pure validator enforces the three guardrails; a retry
orchestrator feeds violations back and regenerates (max 2 retries), returning the
best attempt with its violations.

### Changes Required:

#### 1. Prompt builder

**File**: `src/lib/services/plan-prompt.ts` (new)

**Intent**: Build the system + user prompt from a `TrainingProfile`. Encodes the
hard requirements as explicit instructions: use only the listed equipment; emit
exactly `training_days_per_week` sessions; align exercise selection / volume with
the goal and experience; derive suggested weights from the provided lifts as
percentages when present, else conservative starting loads by experience / body
weight, marked as orientational; write all content in Polish; tag each exercise
with its `equipment` enum value. Accepts an optional list of prior-attempt
violations to append as corrective feedback on retries.

**Contract**: `buildPlanPrompt(profile: TrainingProfile, violations?: Violation[]): { system: string; user: string }`. Equipment/goal/experience instructions reference the canonical enum values. The retry feedback section is omitted on the first attempt.

#### 2. Validator (pure function)

**File**: `src/lib/services/plan-validator.ts` (new)

**Intent**: Given a parsed plan + the profile, return the list of guardrail
violations (empty = sound). Three checks: (a) every exercise's `equipment` tag is
in the profile's `equipment` set; (b) `sessions.length === training_days_per_week`;
(c) goal-consistency — a best-effort structural check (e.g. plan is non-empty,
each session has exercises, volume/rep ranges are not absurd for the stated goal).
Pure and synchronous so it is unit-testable without the LLM.

**Contract**: `validatePlan(plan: WorkoutPlan, profile: TrainingProfile): Violation[]` where `Violation = { guardrail: "equipment" | "day_count" | "goal"; message: string }` (message in Polish, suitable for both the retry feedback and the UI warning banner). The equipment and day-count checks are hard/deterministic; the goal check is intentionally lenient (it cannot be fully decided structurally — see Open Risks).

#### 3. Generation service + retry orchestration

**File**: `src/lib/services/plan-generator.ts` (new)

**Intent**: Orchestrate generate → validate → retry. Calls
`client.messages.parse()` with `model: "claude-opus-4-8"`, `output_config.format`
from `zodOutputFormat(planSchema)`, adaptive thinking, `effort: "medium"`,
bounded `max_tokens`. On `stop_reason: "refusal"` or a parse failure, throw a
typed hard-failure error. On a parsed plan, run the validator; if violations and
attempts remain, rebuild the prompt with the violations as feedback and
regenerate (max 2 retries). Return the best attempt (fewest/least-severe
violations) and its violation list.

**Contract**: `generatePlan(client: Anthropic, profile: TrainingProfile): Promise<{ plan: WorkoutPlan; violations: Violation[]; ok: boolean }>` where `ok === (violations.length === 0)`. Throws `PlanGenerationError` (hard failure) for API errors / refusals / unparseable output. Retry cap is 2 (3 total attempts). "Best attempt" = the attempt with the fewest violations, ties broken toward the latest attempt.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Validator: hand-build a plan that uses unavailable equipment → reports an `equipment` violation; one with the wrong session count → reports a `day_count` violation; a sound plan → empty list
- Generation (with a real key): a profile produces a sound plan within the retry budget; observe at least one case where a first-attempt violation is corrected on retry (e.g. by temporarily over-constraining equipment)
- A simulated hard failure (e.g. invalid key) throws `PlanGenerationError`, not a silent bad result

**Implementation Note**: After this phase and all automated verification passes,
pause for manual confirmation before proceeding.

---

## Phase 3: API route + page + island

### Overview

Expose generation over an authenticated endpoint, add a protected `/plan` page
that redirects profile-less users, and a React island that auto-generates on
mount with loading / plan / warning / error+retry states. Add the entry point
button.

### Changes Required:

#### 1. Generation API route

**File**: `src/pages/api/plan/generate.ts` (new)

**Intent**: `POST` endpoint that auth-guards, loads the profile, and returns the
generated plan as JSON. If unauthenticated → 401 (island redirects to signin); if
no profile → a response that signals "profile required" so the island can route
to `/training-profile`; on hard failure → an error status the island renders as
the error+retry state; on success → `{ plan, violations, ok }`.

**Contract**: `export const prerender = false`. Reads `context.locals.user`; `createClient(...)` + `getProfile(...)` for the profile; `createAnthropic()` for the client (null → configuration error). Returns JSON `{ plan, violations, ok }` on success; distinct status codes for unauthenticated / no-profile / generation-failure so the client can branch. Logs raw errors server-side, returns friendly Polish messages.

#### 2. Protected plan page

**File**: `src/pages/plan.astro` (new), `src/middleware.ts`

**Intent**: A protected page that hosts the island. Server-side: if the user has
no profile, redirect to `/training-profile` (the endpoint also guards, but the
page redirect avoids a flash of the generating UI). Add `/plan` to
`PROTECTED_ROUTES`.

**Contract**: `PROTECTED_ROUTES` gains `"/plan"`. Page server-fetches the profile via `getProfile`; redirects to `/training-profile` when null; otherwise renders the island with `client:load`. Reuses the existing `Layout` and visual style from `training-profile.astro`.

#### 3. Plan view island

**File**: `src/components/plan/PlanView.tsx` (new)

**Intent**: On mount, `POST` to `/api/plan/generate`, show a spinner during the
call, then render the plan: per-session name/focus and a table/list of exercises
(name, sets×reps, suggested weight, rest). Render a warning banner listing
violations when `ok === false`. Render an error state with a retry button on hard
failure (and route to signin / profile on the respective status codes). Provide a
**"Wygeneruj ponownie"** button that re-fires generation.

**Contract**: Self-contained island (no props needed beyond optional config). States: `loading | success | warning | error`. Reuses the project's Tailwind/`cn()` styling and lucide-react icons; all visible text in Polish. The exercise list shape matches `WorkoutPlan` from `@/types`.

#### 4. Entry point

**File**: `src/pages/dashboard.astro` and/or `src/pages/training-profile.astro`

**Intent**: A "Generuj plan" link/button taking the user to `/plan`. Placed where
a logged-in user with a profile naturally lands.

**Contract**: An anchor/button to `/plan` styled consistently with existing actions.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Happy path E2E: a signed-in user with a profile clicks "Generuj plan" → spinner → a plan respecting equipment, day-count, and goal renders, in Polish
- "Wygeneruj ponownie" produces a fresh plan
- A user without a profile visiting `/plan` is redirected to `/training-profile`
- An unauthenticated request to `/plan` redirects to signin (middleware)
- A forced hard failure (invalid key) shows the friendly error + retry, never a partial/garbage plan
- A forced soft failure (over-constrained equipment that can't be satisfied) shows the best attempt with a warning banner naming the violation

**Implementation Note**: After this phase and all automated verification passes,
pause for manual confirmation. This closes the slice.

---

## Testing Strategy

### Unit Tests:

- None run automatically (no test runner in the project). The validator is written
  as a pure function so it can be unit-tested once a runner lands (`/10x-e2e`).

### Integration Tests:

- Manual only for this slice (happy path), per the chosen acceptance bar.

### Manual Testing Steps:

1. Set `ANTHROPIC_API_KEY` in `.env` and `.dev.vars`; `npm run dev`.
2. Sign in as a user with a saved profile; click "Generuj plan".
3. Confirm spinner → plan in Polish; verify sessions = chosen days, every exercise
   uses only available equipment, exercise/rep/weight choices fit the goal.
4. Click "Wygeneruj ponownie"; confirm a new plan generates.
5. Sign in as a user without a profile, visit `/plan`; confirm redirect to
   `/training-profile`.
6. Temporarily set an invalid key; confirm friendly error + retry (no plan shown).

## Performance Considerations

- One generation = up to 3 sequential Opus 4.8 calls (worst case with 2 retries).
  Each is I/O-bound `fetch`, not CPU — within Worker limits at low QPS. Keep
  `effort: "medium"` and bounded `max_tokens` to cap latency/cost. No caching
  (each request is intentionally fresh; regeneration is a feature).

## Migration Notes

None — no schema changes in this slice (ephemeral, no persistence).

## References

- PRD: `context/foundation/prd.md` (FR-003, FR-004, US-01, Guardrails)
- Roadmap: `context/foundation/roadmap.md` (S-02, north star)
- Tech stack: `context/foundation/tech-stack.md` (LLM + validation/retry decision)
- Prior slice (patterns): `context/archive/2026-06-27-training-profile/plan.md`
- Profile service / schema / API / island:
  `src/lib/services/profile.ts`, `src/lib/schemas/profile.ts`,
  `src/pages/api/profile.ts`, `src/components/profile/TrainingProfileForm.tsx`
- Env / client factory pattern: `astro.config.mjs:17`, `src/lib/supabase.ts`

## Open Risks & Assumptions

- **Guardrail softening (accepted).** Per the chosen failure UX, after max retries
  a structurally-valid-but-violating plan is shown with a warning banner rather
  than blocked. This deliberately relaxes the PRD's strict plan-soundness
  guardrail ("a plan always respects the provided parameters") to avoid a dead-end
  UX. Equipment and day-count violations should be rare given the deterministic
  retry feedback; the goal-consistency check is intentionally lenient.
- **Goal-consistency is only partially decidable structurally.** The validator
  cannot fully verify that exercise selection/volume matches the goal; it does
  best-effort structural checks and relies on the prompt + Opus 4.8 quality for
  the rest. Accepted for MVP.
- **Polish exercise names are not parsed** by the validator — the equipment
  guardrail rides on the per-exercise `equipment` enum tag the LLM must emit.
  Assumes the model tags reliably; mistags surface as equipment violations and
  trigger retry.
- **Equipment enum set is assumed final** for this slice (from S-01); new values
  are additive.
- **Cost/latency**: low-QPS solo MVP makes Opus 4.8 acceptable; if cost becomes a
  concern, Sonnet 4.6 is a drop-in model swap.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundations — SDK, env, plan schema & types

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — bf8a57d
- [x] 1.2 Linting passes: `npm run lint` — bf8a57d
- [x] 1.3 `@anthropic-ai/sdk` resolves and imports without error in the build — bf8a57d

#### Manual

- [x] 1.4 Plan schema/types compile and are importable from `@/types` and `@/lib/schemas/plan` — bf8a57d
- [x] 1.5 With `ANTHROPIC_API_KEY` unset, `createAnthropic()` returns `null` (no throw) — bf8a57d

### Phase 2: Generation service + validation layer

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — c2cc8ee
- [x] 2.2 Linting passes: `npm run lint` — c2cc8ee

#### Manual

- [x] 2.3 Validator reports `equipment` / `day_count` violations on crafted bad plans and empty on a sound plan — c2cc8ee
- [x] 2.4 A real-key generation yields a sound plan within the retry budget, with at least one observed retry-correction — verified post-migration on Gemini (gemini-plan-generation)
- [x] 2.5 A simulated hard failure throws `PlanGenerationError` (no silent bad result) — c2cc8ee

### Phase 3: API route + page + island

#### Automated

- [x] 3.1 Type checking passes: `npm run build` — 480b4ef
- [x] 3.2 Linting passes: `npm run lint` — 480b4ef

#### Manual

- [x] 3.3 Happy path E2E: profile → "Generuj plan" → spinner → Polish plan respecting all three guardrails — verified post-migration on Gemini (gemini-plan-generation)
- [x] 3.4 "Wygeneruj ponownie" produces a fresh plan — verified post-migration on Gemini (gemini-plan-generation)
- [x] 3.5 Profile-less user visiting `/plan` is redirected to `/training-profile` — verified post-migration on Gemini (gemini-plan-generation)
- [x] 3.6 Unauthenticated request to `/plan` redirects to signin — verified post-migration on Gemini (gemini-plan-generation)
- [x] 3.7 Forced hard failure shows friendly error + retry (no plan shown) — verified post-migration on Gemini (gemini-plan-generation)
- [x] 3.8 Forced soft failure shows best attempt with a warning banner naming the violation — verified post-migration on Gemini (gemini-plan-generation)
