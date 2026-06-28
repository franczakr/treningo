# Personalized Plan Generation — Plan Brief

> Full plan: `context/changes/personalized-plan-generation/plan.md`

## What & Why

Roadmap slice **S-02**, the product's north star (FR-003 + FR-004, US-01): a
logged-in user with a completed training profile requests a workout plan and
**immediately views** one tailored to their goal, experience, available
equipment, and chosen training days. This is the moment of value that proves the
core hypothesis — an auto-generated, parameter-respecting plan beats a generic
one — and the highest-risk slice in the product.

## Starting Point

S-01 (`training-profile`) is done: a rich `profiles` row per user, the enum/option
lists, and the full pattern stack (Zod schema in `src/lib/schemas/`, service in
`src/lib/services/`, `prerender = false` API route, protected page + `client:load`
island, `astro:env` server secrets, middleware auth). No LLM SDK, key, plan
types, or generation code exists yet.

## Desired End State

A user clicks "Generuj plan" → lands on a protected `/plan` page → sees a spinner
during generation (~10–30 s) → views a Polish plan (per-session name/focus +
exercises with sets, reps, suggested weight, rest) that honors all three
guardrails. "Wygeneruj ponownie" makes a fresh plan. No-profile users are
redirected to `/training-profile`; hard failures show a friendly error + retry.
The plan is **ephemeral** — not persisted (that's S-03).

## Key Decisions Made

| Decision                  | Choice                                                              | Why (1 sentence)                                                       | Source |
| ------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------ |
| Persistence               | Ephemeral generate-and-view (no DB save)                           | Matches roadmap; save is S-03, don't build a table prematurely.       | Plan   |
| Generation UX             | React island + `fetch` with loading state                          | Cleanly handles LLM latency + the ephemeral model; departs from S-01's form-POST. | Plan   |
| Plan schema               | Sessions × exercises (name, sets, reps, suggested weight, rest)    | Covers FR-004 + US-01 acceptance without bloat.                       | Plan   |
| Content language          | Polish                                                             | Consistent with Polish UI; user is a Polish beginner.                 | Plan   |
| Exercise selection        | Free LLM choice + per-exercise `equipment` enum tag                | Equipment guardrail validated on the tag, not the Polish name.        | Plan   |
| Validation + retry        | 3 guardrails + feedback retry (max 2)                              | Enforces FR-003 deterministically; cap protects cost/latency.         | Plan   |
| Model                     | `claude-opus-4-8`, structured outputs (`messages.parse`)           | Guaranteed JSON shape + best quality; fine at low QPS.                | Plan   |
| Weight derivation         | From lifts when present, else conservative starting loads          | Respects S-01's optional-lifts decision (beginners).                  | Plan   |
| Hard-failure UX           | Friendly error + retry; no plan shown                              | Never display a non-plan; clear recovery path.                        | Plan   |
| Soft-failure UX           | Show best attempt + warning banner (after max retries)             | Avoids a dead end; an accepted, documented PRD-guardrail softening.   | Plan   |
| Regeneration              | "Wygeneruj ponownie" button                                        | Gives a variant when the plan doesn't fit; natural for ephemeral.     | Plan   |
| No-profile                | Redirect to `/training-profile` (+ server guard)                   | Profile is a hard prerequisite for personalization.                   | Plan   |
| Acceptance                | Manual happy-path; validator kept pure/unit-testable               | Fast; no test runner introduced (matches S-01).                       | Plan   |

## Scope

**In scope:** Anthropic SDK + `ANTHROPIC_API_KEY` env, plan Zod schema + shared
types, null-safe Anthropic client factory, prompt builder, pure guardrail
validator, generation+retry service, `POST /api/plan/generate`, protected
`/plan` page (+ middleware), `PlanView` island, entry-point button.

**Out of scope:** persistence (S-03), browsing (S-04), multiple variants, manual
editing, a rules/template fallback engine, a test runner, response streaming,
`wrangler.jsonc` changes.

## Architecture / Approach

Bottom-up vertical slice, three phases mirroring S-01 (data→backend→frontend) with
the LLM service replacing the DB layer. Generation service = pure orchestration:
`buildPlanPrompt(profile)` → `messages.parse()` (Opus 4.8 + `zodOutputFormat`) →
`validatePlan(plan, profile)` → on violations, rebuild prompt with feedback and
regenerate (≤2 retries) → return best attempt + violations. The validator is a
standalone pure function (equipment ⊆ available; sessions = days; goal best-effort)
so guardrail logic is testable without the LLM. The `/plan` island auto-fires
generation on mount and renders loading / plan / warning / error+retry.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundations | SDK + `ANTHROPIC_API_KEY` env + plan schema/types + client factory | SDK on workerd / Zod-v4 structured-output helper compatibility |
| 2. Generation + validation | Prompt builder, pure validator, generate→validate→retry service | The core risk — guardrail enforcement + retry quality |
| 3. API + page + island | `/api/plan/generate`, protected `/plan`, `PlanView` island, entry button | Async UX states (loading/warning/error) + redirects |

**Prerequisites:** S-01 done (it is); a valid `ANTHROPIC_API_KEY` in `.env` and
`.dev.vars`; a signed-in test user with a saved profile.
**Estimated effort:** ~2–3 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- **Accepted guardrail softening:** after max retries a violating-but-valid plan is
  shown with a warning rather than blocked — a deliberate relaxation of the PRD's
  strict plan-soundness guarantee to avoid a dead-end UX.
- **Goal-consistency is only partially decidable structurally** — the validator
  does best-effort checks; the rest relies on the prompt + Opus 4.8 quality.
- **Equipment guardrail rides on the per-exercise `equipment` tag** the LLM emits,
  not on parsing Polish names; mistags surface as violations and trigger retry.
- **Cost/latency** acceptable at low QPS with Opus 4.8; Sonnet 4.6 is a drop-in swap.

## Success Criteria (Summary)

- A user with a profile generates and views a Polish plan respecting equipment,
  day-count, and goal — across several profile combinations.
- "Wygeneruj ponownie" works; no-profile users are redirected; hard failures show
  a friendly error + retry and never a garbage plan.
