# Switch FR-003 Plan Generation to Google Gemini 2.5 Flash — Plan Brief

> Full plan: `context/changes/gemini-plan-generation/plan.md`

## What & Why

Move FR-003 plan generation off Anthropic (Opus 4.8, paid) onto **Google Gemini
2.5 Flash** (`@google/genai`) so the product runs on a **free tier** — no credit
card, no per-request billing. The prompt builder, soundness validator, and retry
loop are kept; only the model client and the structured-output call site change.

## Starting Point

The `personalized-plan-generation` slice is built and committed. Generation goes
`createAnthropic()` → `generatePlan()` (`messages.parse()` + `zodOutputFormat`) →
validate → retry. The provider is isolated to `anthropic.ts` + the generator's
call site + the env/dep wiring; prompt/validator/schema/route/UI are
provider-agnostic.

## Desired End State

Same UX (spinner → Polish plan honoring the three guardrails → regenerate /
warning / error), but running on Gemini's free tier. `@anthropic-ai/sdk` is gone;
`GEMINI_API_KEY` is the only LLM secret. Docs name Gemini. The S-02 north star is
verified end-to-end with a real (free) key.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Provider | Google Gemini 2.5 Flash | Free tier, native structured output, good Polish | Plan |
| Anthropic code | Remove entirely | Single provider; no dead code / confusing keys (git keeps history) | Plan |
| Structured output | `responseJsonSchema` from `z.toJSONSchema(planSchema)` | One source of truth (Zod); mirrors old `zodOutputFormat` | Plan |
| Schema cleanup | Strip top-level `$schema` only | Verified output is inlined; that key is Gemini's only incompatibility | Plan |
| Docs | Update CLAUDE.md + tech-stack.md | Deliberate deviation — keep the decision trail honest | Plan |
| E2E scope | Close prior slice's pending manual items too | Free key finally makes the north-star E2E feasible | Plan |

## Scope

**In scope:** deps swap, `GEMINI_API_KEY` env, `gemini.ts` factory, generator
rewrite to Gemini + `responseJsonSchema`, API-route client ref, delete
`anthropic.ts`, docs update, E2E verification.

**Out of scope:** prompt/validator/schema/route/page/island logic changes,
persistence/history, multi-provider abstraction, keeping Anthropic as fallback,
test-runner introduction.

## Architecture / Approach

`createGemini()` returns a `GoogleGenAI | null`. `generatePlan` calls
`ai.models.generateContent({ model: "gemini-2.5-flash", contents: user, config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema } })`,
where `responseJsonSchema = z.toJSONSchema(planSchema)` minus its `$schema` key.
The validate → retry (≤2) → best-attempt flow and `PlanGenerationError` are
unchanged; Gemini's blocked/empty-output signals map to the hard-failure path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Provider swap | Gemini client + generator + env/deps; Anthropic removed | `@google/genai` on workerd; schema keyword acceptance |
| 2. Docs alignment | CLAUDE.md + tech-stack.md describe Gemini | none (doc-only) |
| 3. E2E verification | Live free-key happy path; prior slice closed out | free-tier limits / Polish quality |

**Prerequisites:** a free `GEMINI_API_KEY` (Google AI Studio) for Phase 3.
**Estimated effort:** ~1 session (Phase 1 focused; 2 trivial; 3 manual E2E).

## Open Risks & Assumptions

- `@google/genai` runs on workerd (fetch + `nodejs_compat`) — verified at build/dev; REST-via-`fetch` fallback if not.
- `responseJsonSchema` accepts the inlined schema after stripping `$schema`; OpenAPI-subset `responseSchema` fallback otherwise.
- Free-tier RPM/RPD limits and smaller-model quality vs Opus 4.8 — guardrails + retry mitigate; acceptable for a free MVP.

## Success Criteria (Summary)

- Plans generate on Gemini free tier with the same UX and all three guardrails honored, in Polish.
- No Anthropic SDK/secret remains; docs describe Gemini.
- S-02 north star verified end-to-end and closed out.
