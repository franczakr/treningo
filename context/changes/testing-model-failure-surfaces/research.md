---
date: 2026-08-03T11:11:09Z
researcher: Claude (Opus 5)
git_commit: 65e91d8e88fcb9015f63883caaafaeb12930d586
branch: master
repository: treningo
topic: "Rollout Phase 4 of test-plan.md — model failure surfaces (Risk #4) and internal-detail leakage (Risk #7)"
tags: [research, codebase, plan-generator, gemini, error-handling, api-routes, testing]
status: complete
last_updated: 2026-08-03
last_updated_by: Claude (Opus 5)
---

# Research: Model failure surfaces + error-detail leakage (test-plan Phase 4)

**Date**: 2026-08-03T11:11:09Z
**Researcher**: Claude (Opus 5)
**Git Commit**: `65e91d8e88fcb9015f63883caaafaeb12930d586`
**Branch**: `master`
**Repository**: treningo

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md`:

- **Risk #4** — a model-side failure ends as a 500 or a blank screen instead of
  a clean, retryable error — or worse, a partial plan the user believes is real.
- **Risk #7** — an unexpected server error shows the user raw internal detail
  (database message, provider error body) instead of a generic message.

Verify — not blindly accept — the §2 Risk Response Guidance for both.

## Summary

Both risks are real, but **not where the test plan's evidence pointed**, and the
two need opposite treatments:

1. **Risk #4 is well-defended in the generator and completely untested.**
   `generatePlan` (`src/lib/services/plan-generator.ts`) genuinely funnels all
   five documented hard-failure surfaces into `PlanGenerationError`, and
   `generate.ts` genuinely converts that into a 500 with a generic Polish
   message while logging the raw cause. `PlanView.tsx` genuinely renders a
   retry button on that error. **None of it has a single test**:
   `src/pages/api/plan/generate.ts` and `src/lib/gemini.ts` have no test file
   at all, and `plan-generator.test.ts` covers only the *soft*-failure retry
   loop — every hard-failure surface is uncovered. Every failure-UI claim in
   the archive was verified by human eyeball only
   (`context/archive/2026-06-28-gemini-plan-generation/plan.md:384-385`).
   So Phase 4's job for #4 is **coverage, not repair**.

2. **Risk #7 is a live defect — in three places the test plan never named.**
   §2 cited the read paths (`browse-saved-plans` F1). Those turn out to be the
   *least* leaky: a `PostgrestError` thrown out of an `.astro` page escapes to
   Cloudflare's own error page in production SSR — HTTP 500, **no app body, no
   stack** (`astro/dist/core/routing/handler.js:142-143` logs the stack
   server-side only). The actual leaks are elsewhere and are *rendered to the
   user*:
   - `src/pages/api/auth/signin.ts:16` and `src/pages/api/auth/signup.ts:16`
     interpolate GoTrue's `error.message` **verbatim** into `?error=`, which
     `auth/signin.astro:6` → `ServerError.tsx:13` renders raw. Benign
     ("Invalid login credentials") shares the channel with infrastructure text
     ("Database error querying schema", "Error sending confirmation email").
   - `src/pages/api/profile.ts:45-46` renders zod's **English default** issue
     text on `/training-profile` — e.g. `"Too small: expected number to be >=13"`,
     and `"Invalid option: expected one of \"strength\"|…"`, which enumerates the
     DB enum domain. Its fallback literal `"Invalid profile data"` is the only
     English string in an otherwise-Polish UI.
   - `src/pages/api/plan/rename.ts:36,45` emits English `"Supabase is not
     configured"` and zod's `"Invalid UUID"`.

   All four DB-error branches (`save`, `rename`, `delete`, `profile` upsert) are
   clean — raw `PostgrestError` logged via `console.error`, constant Polish
   string returned. Nothing is ever spread or `JSON.stringify`'d into a body.

3. **The response guidance needs two corrections** (see
   [Corrections to the test plan](#corrections-to-the-test-plan)): #4's
   "retryable UI" clause is not provable at this phase's layers (no DOM
   environment, and `page.route()` cannot intercept a *server-side* Gemini
   call — `tests/e2e/E2E_RULES.md:43-49`), and #7's "cheapest layer:
   integration" is right for the endpoints but wrong for the read paths it
   was citing.

## Detailed Findings

### Risk #4 — the five hard-failure surfaces, verified against the code

`context/archive/2026-06-28-gemini-plan-generation/plan.md:104-108` is the
contract (the oracle — written before the code, and independent of it):

> "treat as `PlanGenerationError` (no silent bad result) when the SDK call
> throws, when `response.promptFeedback?.blockReason` is set, when the candidate
> `finishReason` indicates a safety/blocked stop, or when `response.text` is
> empty/undefined or not parseable into `planSchema`. Only guardrail violations
> on an otherwise-parsed plan go through the retry loop."

Traced to `src/lib/services/plan-generator.ts`:

| # | Surface | Code | Resulting error | Retries consumed |
|---|---|---|---|---|
| S1 | SDK call throws | `:91-94` generic `catch` | `PlanGenerationError("Błąd podczas wywołania modelu generującego plan.", error)` — **raw error preserved on `.cause`** | none: throws out of the loop on attempt 1 |
| S2 | `promptFeedback.blockReason` set | `:73-77` | `PlanGenerationError` whose message interpolates the `blockReason` | none |
| S3 | candidate `finishReason` without a block reason | **no dedicated branch** — falls into `:79-84` | message interpolates `finishReason` when `text` is empty | none |
| S4 | `response.text` empty/undefined | `:78-84` | same branch as S3, `finishReason` omitted when absent | none |
| S5 | unparseable output | `JSON.parse` throw → wrapped at `:93` with `cause`; `planSchema.safeParse` failure → `:86-89` unwrapped | two *different* messages | none |

Verified properties worth asserting (all currently untested):

- **A hard failure aborts immediately; it does not consume the retry budget.**
  `:92` re-throws `PlanGenerationError` out of the `for` loop, so exactly one
  `generateContent` call happens. Only soft (guardrail) failures loop.
- **`.cause` carries the raw provider error** for S1/S5-`JSON.parse` (`:93`),
  and `generate.ts:56` logs precisely `error.cause ?? error`. This is the
  seam that makes "detail reaches only the server log" assertable.
- **S3 is real but unbranched.** `gemini-plan-generation/reviews/impl-review.md:30-38`
  (F1, decision **FIXED**) confirms the fix was *diagnostic only*: "Enriched
  the hard-failure messages with `blockReason` and `candidates[0].finishReason`
  for clearer server-side diagnostics; UX unchanged". So a `MAX_TOKENS` stop
  still arrives through the empty-text guard — which is exactly what a test
  must pin, because it is the shipped contract, not a defect.
- **F3 (thinking tokens vs. the output cap)** was fixed by
  `MAX_OUTPUT_TOKENS = 8192` (`plan-generator.ts:24`). Truncation is therefore
  routed into S5 (`JSON.parse` fails on a cut-off document) — testable by
  handing the fake client a truncated JSON string, with no need to reproduce a
  real token cap.

#### The endpoint contract (`src/pages/api/plan/generate.ts`) — zero tests

Documented status codes (`:18-23`) all verified present: 401 unauthorized,
503 `not_configured` (Supabase **or** Gemini key missing, `:32`), 500
`profile_load_failed` (`:39-43`), 422 `profile_required` (`:45-47`), 500
`generation_failed` (`:52-58`), 200 `{plan, violations, ok}`.

`:52-57` is the cleanest error path in the codebase and the natural positive
control for Risk #7:

```ts
console.error("Plan generation failed:", error instanceof PlanGenerationError ? (error.cause ?? error) : error);
return json({ error: "generation_failed", message: "Nie udało się wygenerować planu. Spróbuj ponownie." }, 500);
```

`PlanGenerationError.message` itself *does* carry provider internals
(`plan-generator.ts:75,82` interpolate `blockReason` / `finishReason`) and is
**never** returned — only the constant is. That asymmetry (detail in the log,
constant in the body) is precisely what #7's response guidance asks to prove,
and it is provable here in one test.

#### What the user actually sees (verified, not assumed)

- **The retry affordance is real.** `PlanView.tsx:151` renders
  `<RegenerateButton onClick={regenerate} label="Spróbuj ponownie" />`;
  `regenerate()` (`:108-115`) resets state and re-fires. Error text comes from
  `body?.message ?? "Nie udało się wygenerować planu. Spróbuj ponownie."`
  (`:24-25`) — server-generic or hardcoded, never raw.
- **503 and 500 are rendered identically** — both collapse into the single
  `!res.ok` branch (`PlanView.tsx:23`). Distinct server codes exist but the
  client does not distinguish them. Cosmetic; not a leak.
- **A soft failure (`ok: false`) renders the plan *plus* a warning banner**
  (`PlanView.tsx:160-164`, heading "Plan może nie spełniać wszystkich
  wymagań:") and remains savable — `SaveButton` has no `ok` gate (`:169`),
  and `save.ts:41` re-validates shape only. This is a **recorded, accepted
  product decision**, not a defect:
  `context/archive/2026-06-28-save-plan/plan.md` ("Saving works even when
  `ok === false`"), reaffirmed in
  `context/archive/2026-08-02-testing-plan-soundness/plan.md:63-67`. A test
  must characterize it, never fail on it.
- **Residual, genuinely uncaveated surface:** violations are *not persisted* —
  the `plans` row has only `created_at, id, name, plan, profile_snapshot,
  user_id` (`src/db/database.types.ts:45-52`). A plan saved from an `ok: false`
  generation reopens on `/plan/[id]` with **no guard and no banner**
  (`plan/[id].astro:62-64`). Closing that would need a migration plus UI work
  and would partly contradict the accepted decision above — out of scope for a
  test phase; recorded as residual risk.
- **A live blank-screen path exists, but is not reachable from a model
  failure.** `PlanView.tsx:27` casts the 200 body (`as PlanGenerationResult`)
  with no zod parse and no `.catch`; a 200 whose body lacked `violations` would
  throw inside `WarningBanner`'s `violations.map` (`:216`), and there is no
  React error boundary anywhere in the repo, so React 19 would unmount the
  island. Reaching it requires a malformed 200 — which `generate.ts` cannot
  produce, since it only ever serializes a `PlanGenerationResult` built from a
  schema-parsed plan. Speculative under the challenger rule (it would require
  *adding* a defect to trigger); recorded, not tested.

#### The provider-shape gap Phase 1 explicitly handed to Phase 4

`context/archive/2026-08-02-testing-plan-soundness/plan.md:592-597`:

> "**`generatePlan`'s fake-client tests assume Gemini's real JSON shape holds.**
> The fake returns `{ text: JSON.stringify(planPayload) }`; if the real
> `@google/genai` response shape changes, these tests would keep passing while
> production breaks. Out of this phase's scope … — Risk #4 (model failure
> surfaces) in test-plan Phase 4 owns that surface."

This is Phase 4's inherited obligation, and it **is** cheaply provable at
runtime. Verified against the installed SDK:

```
GenerateContentResponse prototype descriptors: constructor, text, data, functionCalls, executableCode, codeExecutionResult
FinishReason: FINISH_REASON_UNSPECIFIED, STOP, MAX_TOKENS, SAFETY, RECITATION, LANGUAGE, OTHER, BLOCKLIST, PROHIBITED_CONTENT, SPII, MALFORMED_FUNCTION_CALL, IMAGE_SAFETY
BlockedReason: BLOCKED_REASON_UNSPECIFIED, SAFETY, OTHER, BLOCKLIST, PROHIBITED_CONTENT, IMAGE_SAFETY, MODEL_ARMOR, JAILBREAK
```

So `text` is a real accessor on the real class, and the enum members the
fixtures use (`MAX_TOKENS`, `SAFETY`) are real exported values. A guard that
asserts these against the SDK — rather than against our own fake — is the
direct analogue of §6.2's migration-text guard: the *external artifact* is the
oracle. Its limit is the same and must be stated inline: it detects a rename or
removal, not a semantic change in when the field is populated.

### Risk #7 — the leak catalogue

Complete inventory of client-visible error text (37 error paths audited across
`src/pages/api/**`, the five server-rendering pages, both services, and
`middleware.ts`):

| Verdict | Paths |
|---|---|
| **(a) Internal detail rendered to the user** | `auth/signin.ts:16`, `auth/signup.ts:16` (GoTrue `error.message` verbatim); `api/profile.ts:45-46` (zod English default text + `"Invalid profile data"`) |
| **(a′) Internal detail emitted but never rendered** | `plan/rename.ts:36` (`"Supabase is not configured"`), `:45` (zod `"Invalid UUID"`) — `dashboard.astro` never reads `searchParams`, so these dead-end |
| **(b) Detail logged only, constant returned** | `generate.ts:41,56`; `save.ts:51,66`; `rename.ts:58`; `delete.ts:40`; `profile.ts:65` — all seven `console.error` sites |
| **(c) Raw throw → framework 500** | `dashboard.astro:16`, `plan.astro:15`, `plan/[id].astro:17`, `middleware.ts:12`, plus `formData()` throws in `signin.ts:5`, `rename.ts:39`, `profile.ts:27` |
| Clean by construction | every `plan/generate.ts` and `plan/save.ts` response body; no `...error`, no `JSON.stringify(error)`, no `flatten()` anywhere in `src/` |

Two corrections to what §2 assumed about category (c):

- **In production SSR a raw throw does not leak.** No `500.astro`/`404.astro`
  exists; `@astrojs/cloudflare`'s handler has no try/catch, so the exception
  escapes the Worker and Cloudflare serves its own error page — status 500, no
  app body, no stack. The stack goes to `wrangler tail` only. In `astro dev`
  the Vite overlay *does* show the `PostgrestError` text — a dev-only exposure.
- Therefore `browse-saved-plans` F1 (SKIPPED, "a genuine DB error becomes a
  500") is a *reliability/UX* gap, not an information-disclosure one. Worth
  documenting; not worth a leak test.

Two findings adjacent to #7 that are defects but **out of this phase's scope**:

1. **Every rename/delete failure message is silently discarded.**
   `rename.ts` and `delete.ts` redirect to `/dashboard?error=…`, but neither
   `dashboard.astro` nor `plan/[id].astro` reads `Astro.url.searchParams` (only
   `training-profile.astro:25`, `auth/signin.astro:6`, `auth/signup.astro:6`
   do). A failed delete or rename is indistinguishable from a successful one.
   Fixing it is `.astro` UI work, unreachable from any layer this phase uses
   (no Container API in the repo, no DOM environment) — recommended as its own
   follow-up change.
2. **`middleware.ts:10-13` does not destructure `getUser()`'s error**, so a
   Supabase outage looks like a logout (redirect to signin); a *rejection*
   there is unhandled and would 500 every route, public ones included.
   Pre-existing, unrelated to model failures.

### Test-infrastructure facts that constrain the plan

- **Suite selection is purely by filename.** Integration =
  `**/*.integration.test.ts` (`vitest.integration.config.ts:12`); unit = the
  Vitest default globs minus that pattern and `tests/e2e/**`
  (`vitest.config.ts:17`). New files in either suite are picked up
  automatically, locally and in CI (`.github/workflows/ci.yml` runs
  `npm run test` in job `ci` and `npm run test:integration` in job
  `integration`, the latter with a real `npx supabase start`, no secrets).
- **`environment: "node"` in both configs; no `jsdom`/`happy-dom` and no
  `@testing-library/*` installed.** React islands are therefore not testable
  today without adding a DOM environment — new infrastructure this phase does
  not need (see corrections below).
- **`astro:env/server` is not aliased in either config**, so *any* node-level
  test of an API route must substitute `@/lib/supabase` — and, for
  `generate.ts`, also `@/lib/gemini` (`src/lib/gemini.ts:2`). This is a hard
  constraint, not a preference.
- **The only `vi.mock` in the repo** is
  `save.integration.test.ts:32-34` + the dynamic-import-after-mock idiom at
  `:36`. Everything else uses hand-rolled fakes cast `as unknown as T`
  (`plan-generator.test.ts:59-71` for `GoogleGenAI`,
  `save.integration.test.ts:38-47` for `APIContext`). **`console.error` is
  never spied anywhere** — a spy is new (but standard Vitest, no new
  dependency) and is the only way to assert the "detail reaches the log" half.
- `generatePlan` takes its client as a parameter (`plan-generator.ts:50`), so
  the SDK boundary needs *no* mocking at all for the unit layer — dependency
  injection already exists.
- `CLAUDE.md:15` is stale: "no test runner is configured yet — there is no
  `test` script and no Playwright/Vitest install", contradicted by
  `package.json:13-16` and 12 existing test files.

## Corrections to the test plan

Per §1 principle #3, research is ground truth where it disagrees with the plan.
Three corrections, none of which adds a file anchor to §2:

1. **Risk #4 — "plus a retryable UI" is not provable at this phase's cost.**
   The retry button exists and was verified by reading
   (`PlanView.tsx:151,108-115`), but proving it *fires* needs either a DOM
   environment + `@testing-library` (new infrastructure for one island) or a
   browser test — and a browser test cannot force a model failure, because the
   Gemini call is server-side and `page.route()` cannot intercept it
   (`tests/e2e/E2E_RULES.md:43-49`). Recommendation: scope #4 to the two
   server-side halves (error type at the SDK boundary; status + body contract
   at the endpoint), and record the UI clause as covered by reading, not by
   test.
2. **Risk #7 — the cited evidence pointed at the least leaky paths.** The read
   paths do not disclose detail in production. The live, rendered leaks are on
   the *auth* and *profile/rename* endpoints, which §2 never mentioned. §2's
   Source cell for #7 should gain "audit of all client-visible error text
   (Phase 4 research)" alongside its existing citations; the guidance's
   "integration" layer remains correct for those endpoints.
3. **Risk #4's "never a partial plan" needs splitting.** Against a *model*
   failure it holds unconditionally (a hard failure throws; nothing partial is
   returned). The remaining exposure is a *persistence* one — violations aren't
   stored, so a soft-failure plan reopens uncaveated — which is partly an
   accepted product decision and needs a migration to fix. It belongs in §6.6
   as residual risk, not in this phase's test scope.

## Code References

- `src/lib/services/plan-generator.ts:50-115` — the whole hard/soft split; `:73-77` S2, `:78-84` S3+S4, `:86-89` + `:91-94` S5/S1, `:92` the immediate re-throw that skips retries
- `src/lib/services/plan-generator.ts:40-48` — `PlanGenerationError` with its `readonly cause`
- `src/pages/api/plan/generate.ts:24-59` — every documented status code; `:56` the log-the-cause / return-a-constant seam
- `src/lib/gemini.ts:8-14` — `createGemini()` returns `null` when the key is unset (the 503 branch); no test file
- `src/components/plan/PlanView.tsx:17-31` (status branching), `:108-115` (`regenerate`), `:151` (retry button), `:160-164` (`ok:false` banner), `:169` (unconditional save)
- `src/pages/api/auth/signin.ts:16`, `src/pages/api/auth/signup.ts:16` — GoTrue `error.message` → `?error=` → `ServerError.tsx:13`
- `src/pages/api/profile.ts:45-46` — zod English issue text + `"Invalid profile data"`
- `src/pages/api/plan/rename.ts:36,45` — `"Supabase is not configured"`, `"Invalid UUID"`
- `src/lib/services/plans.ts:40-43,52-55`, `src/lib/services/profile.ts:16-19` — bare `throw error` (raw `PostgrestError`)
- `src/lib/schemas/plan.ts:56-68` — no `.min()` on either array, so `{sessions: []}` parses (caught downstream as a soft violation by `plan-validator.ts:47-51`, then retried)
- `src/pages/api/plan/save.integration.test.ts:26-47` — the endpoint-boundary pattern to reuse verbatim
- `src/lib/services/plan-generator.test.ts:53-71` — the fake-client shape and the documented reason for the `as unknown as GoogleGenAI` cast

## Architecture Insights

- **The error convention is uniform and deliberate**: services throw or return
  raw `PostgrestError`; routes log it and return a constant Polish string. It
  originated as a fix — `training-profile/reviews/impl-review.md` F3 ("Raw
  Postgres error text reflected into the UI on write failure", FIXED). Every
  route that post-dates that fix honors it. The three leaks all sit in code
  paths that either pre-date it (auth, scaffolded by the starter) or route
  *validation* rather than *database* errors, which the convention never
  explicitly covered.
- **Hard vs. soft failure is the load-bearing distinction** in this product:
  hard = throw, no retry, error+retry UI; soft = retry with corrective
  feedback, then show the best attempt with a warning and let the user save it.
  Any test touching generation must know which side of that line its fixture
  lands on.
- **Everything server-side is injectable; nothing UI-side is.** Two module
  boundaries (`@/lib/supabase`, `@/lib/gemini`) plus one parameter
  (`generatePlan`'s client) make every server error branch reachable offline.
  The `.astro` frontmatter and the React islands are the opposite: no Container
  API, no DOM environment, so their branches are browser-only today.

## Historical Context (from prior changes)

- `context/archive/2026-06-28-gemini-plan-generation/plan.md:104-108,166-171` — the five-surface contract (the oracle for Phase 4's unit tests)
- `context/archive/2026-06-28-gemini-plan-generation/reviews/impl-review.md:30-38` (F1, FIXED, diagnostic-only), `:50-58` (F3, FIXED via `maxOutputTokens: 8192`)
- `context/archive/2026-06-28-personalized-plan-generation/plan.md:80-86` — the failure-UX contract ("friendly error with a retry button" / warning banner); `:406-411` the accepted guardrail softening
- `context/archive/2026-06-28-save-plan/plan.md` — "Saving works even when `ok === false`" (accepted)
- `context/archive/2026-06-29-browse-saved-plans/reviews/impl-review.md:23-31` — F1 SKIPPED, "Revisit only if global error-page handling is added later"
- `context/archive/2026-06-27-training-profile/reviews/impl-review.md:33-51` — F2/F3, origin of the log-raw/show-generic convention
- `context/archive/2026-08-02-testing-plan-soundness/plan.md:592-597` + `plan-brief.md:102-105` — the provider-shape obligation handed to Phase 4
- `context/archive/2026-08-03-testing-persistence-boundaries/plan.md:104-106,316-339` — `getPlans` deferrals pushed to "risk #7 / Phase 4 territory", and the endpoint-boundary test pattern to reuse

## Related Research

- `context/archive/2026-08-02-testing-plan-soundness/research.md` — fake-client conventions, oracle-problem discipline
- `context/archive/2026-08-03-testing-persistence-boundaries/research.md` — `astro:env/server` constraint, integration harness

## Open Questions

1. Should the silently-dropped `?error=` on `/dashboard` (failed rename/delete
   looking successful) become its own change? Recommended: yes — it is a real
   user-facing defect, but its fix and its test both live in layers this phase
   does not touch.
2. Should violations/`ok` be persisted on the `plans` row so a soft-failure
   plan stays caveated when reopened? Needs a migration and a UI decision, and
   it partly reverses an accepted decision — deliberately left open.
3. Should `npm run typecheck` (`astro check`) join CI? Not needed for this
   phase (its shape guard is a runtime assertion, so `npm run test` enforces
   it), but CI currently has no typecheck gate at all.
