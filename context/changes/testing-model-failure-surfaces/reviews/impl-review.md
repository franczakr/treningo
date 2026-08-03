<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Model Failure Surfaces (test-plan Phase 4)

- **Plan**: `context/changes/testing-model-failure-surfaces/plan.md`
- **Scope**: all 5 phases (full plan review)
- **Date**: 2026-08-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 6 warnings, 7 observations
- **Method**: two independent review agents (plan-drift; safety/quality/pattern), plus
  mutation checks run by the reviewer — each new guard was verified to go red when
  the property it protects is deliberately broken.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (3 narrow gaps found, all fixed) |
| Scope Discipline | PASS (every "not doing" boundary verified respected; one evidence-driven addition, documented below) |
| Safety & Quality | PASS (one real leak the phase's own fix had missed — found and fixed with a regression test) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (142 unit + 29 integration, lint, typecheck, build; suites stable across shuffled and repeated runs) |

## Findings

### F1 — `rename.ts` still leaked zod's English type-failure default

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/plan/rename.ts:10`
- **Detail**: Phase 3 authored a message for `plan_id` but not for `name`'s *type*
  check. `form.get("name")` can be a `File`, and zod then produced
  `"Invalid input: expected string, received File"` into `?error=` — the exact leak
  class the phase existed to close. Reproduced directly against zod 4.4.3 before fixing.
- **Fix**: `z.string("Nieprawidłowa nazwa planu.")`, plus a new
  `src/pages/api/plan/rename.test.ts` (5 cases) covering the malformed id, the
  posted-File name, the length message, a routing control, and a DB-error case
  proving `permission denied for table plans` reaches the log but not the redirect.
- **Verification**: the new case fails without the fix, passes with it.
- **Decision**: FIXED

### F2 — The unit fake's "fail loudly" overflow guard could not fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (test integrity)
- **Location**: `src/lib/services/plan-generator.test.ts:207-213`
- **Detail**: The scripted fake threw on an unscripted call, but `generatePlan`
  wraps *any* synchronous throw into a `PlanGenerationError` — so
  `expectHardFailure` accepted that error as a legitimate result. Because the call
  counter was not incremented on that path, `callCount()` still read `1`.
  Consequence: **S4 would have stayed green if the empty-text surface started
  consuming the retry budget** — the precise regression the case exists to catch.
- **Fix**: increment the counter *before* throwing, so the case's `toBe(1)`
  assertion is what catches it, with the reasoning stated inline.
- **Verification**: patched `plan-generator.ts` to make the empty-text branch
  `continue` instead of throw — S3, S4 and the hard/soft discriminator now go red
  (all three were green before this fix). Reverted.
- **Decision**: FIXED

### F3 — Response-shape guard was weaker than its own "KNOW THE LIMIT" note claimed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (test integrity)
- **Location**: `src/lib/services/plan-generator.test.ts:355-400`
- **Detail**: The guard claimed to detect "a renamed or removed field", but
  `GenerateContentResponsePromptFeedback` is an **empty class at runtime**
  (`blockReason` exists only in the type declarations), and
  `candidates[].finishReason` was not guarded at all — only its enum *value* was.
  Since the fakes are cast `as unknown as GoogleGenAI`, the compiler could not
  catch a divergence either. Net effect for a renamed field: production broken,
  unit suite green, build green. This defeats the whole purpose of the guard,
  which is the obligation rollout Phase 1 explicitly handed to Phase 4.
- **Fix**: split into two guards — the runtime one (honest about covering only
  `text` plus the enum values) and a **compile-time** `FieldsTheGeneratorReads`
  interface pinning all three exact field paths against the real
  `GenerateContentResponse` type. The limit note now states which guard covers
  what, and that the compile-time half is enforced by `npm run typecheck`.
- **Verification**: renaming `blockReason` → `blockReasonRenamed` in the guard
  fails `npm run typecheck` with `ts(2339)` while `vitest` stays green — which is
  also the evidence for F4.
- **Decision**: FIXED

### F4 — The compile-time guard was unenforced: CI had no typecheck gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `.github/workflows/ci.yml:26`
- **Detail**: Research had recorded "should typecheck join CI?" as an open question
  and answered "not needed for this phase, since the shape guard is a runtime
  assertion". F3 invalidates that reasoning — the field-name half *cannot* be a
  runtime assertion. Without a CI gate the guard is decorative. This is a scope
  addition beyond the plan, taken because the review produced the evidence the
  plan's own reasoning lacked.
- **Fix**: added `- run: npm run typecheck` to the `ci` job (verified it needs no
  secrets — every var in the `astro:env` schema is optional, confirmed by running
  it with `.dev.vars` absent). Synced `test-plan.md` §5 and `CLAUDE.md`.
- **Decision**: FIXED

### F5 — Unauthored array-level message, and a property guard that overclaimed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/schemas/profile.ts:71-77`, `src/lib/schemas/profile.test.ts:179-205`
- **Detail**: `equipment` authored its *element* and *min* messages but not the
  **array-level type** message, so a non-array yields
  `"Invalid input: expected array, received …"`. Latent, not live (`form.getAll`
  always returns an array) — but the property test claimed "a new field or
  constraint added without a message reintroduces English and fails here", and it
  contained no wrong-type or missing-field payload, so this slipped through the
  guard built to catch exactly it. The overclaim was the real defect.
- **Fix**: authored the array-level message; added five wrong-type/missing-field
  payloads (`equipment` as a string, `equipment: null`, missing `goal`, missing
  `age`, `weight_kg: null`).
- **Verification**: removing the array message turns two of the new payload cases red.
- **Decision**: FIXED

### F6 — Actionable auth feedback lost to the generic fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (UX regression introduced by the fix)
- **Location**: `src/lib/auth-errors.ts:22-40`
- **Detail**: Mapping on `code` correctly makes a pass-through impossible, but
  `email_address_invalid` was unmapped — so a user whose address GoTrue rejects
  (its rules are stricter than the client-side format check) now sees only
  "Spróbuj ponownie" and can retry the same address forever. Same dead end for
  `captcha_failed`, `email_address_not_authorized`, `request_timeout`.
- **Fix**: mapped those four with authored Polish, and covered them in the mapping
  table test. `user_not_found` deliberately left generic — mapping it would widen
  account enumeration (see F13).
- **Decision**: FIXED

### F7 — Nothing enforced that mapped codes are real provider codes

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test integrity)
- **Location**: `src/lib/auth-errors.test.ts:104-122`
- **Detail**: The module's header claimed codes come from the SDK's `ErrorCode`
  union, but the union is not re-exported from the package index, the parameter
  type is `{ code?: string }`, and the test fed the same literals back — so a typo
  (`invalid_credential`) would be pinned as correct by a green suite while every
  wrong-password login silently went generic. The same gap the branch went out of
  its way to close for `@google/genai`.
- **Fix**: added the §6.2 external-artifact pattern — read the installed
  `error-codes.d.ts` and assert every mapped key appears in it, with its limit
  stated inline.
- **Verification**: typo'ing a mapped key turns three cases red, including the new guard.
- **Decision**: FIXED

### F8 — Endpoint hard-failure cases dropped the call-count half of the contract

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/api/plan/generate.integration.test.ts:163,181,196`
- **Detail**: The endpoint fake deliberately repeats its last response, so a
  regression that retried a hard failure three times would replay an identical
  response, return an identical 500 body, and leave all three cases green — while
  tripling provider cost and latency per failure.
- **Fix**: added `expect(gemini.callCount()).toBe(1)` to all three, and documented
  the fake's deliberate repeat semantics.
- **Decision**: FIXED

### F9 — Plan gaps: S5c message, 401 body shape, missing `body.error` assertions

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/plan-generator.test.ts:321`, `src/pages/api/plan/generate.integration.test.ts:230`
- **Detail**: Three cases asserted less than the plan specified. S5c omitted the
  schema-specific message assertion, so `cause === undefined` alone did not
  distinguish it from S2/S3/S4 (which also have none). The 401 case used
  `toMatchObject`, a subset match, so the route's deliberate no-`message` body
  shape was unpinned. Endpoint cases 2 and 3 asserted status and message but not
  `body.error`.
- **Fix**: all three tightened (`toContain("struktury odpowiedzi modelu")`,
  `toEqual({ error: "unauthorized" })`, explicit `body.error` assertions).
- **Decision**: FIXED

### F10 — Shared mutable fake not reset between endpoint cases

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/plan/generate.integration.test.ts:130-137`, `src/pages/api/plan/rename.test.ts:52-57`
- **Detail**: `currentGemini` was never reset, so a future case forgetting to
  assign it would silently inherit the previous case's fake and could pass for the
  wrong reason. `rename.test.ts` also restored its console spy only on the happy
  path, so a mid-test failure would leave `console.error` suppressed for the file.
- **Fix**: reset both bindings in `afterEach`; `vi.restoreAllMocks()` in
  `rename.test.ts`'s `afterEach`.
- **Decision**: FIXED

### F11 — Violation messages interpolate raw DB enum identifiers into user-visible text

- **Severity**: ◽ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/services/plan-validator.ts:34,42` rendered at `src/components/plan/PlanView.tsx:216`
- **Detail**: A soft-failure banner reads "Plan używa sprzętu spoza listy…:
  `barbell`. Użyj wyłącznie: `bodyweight_only`." — the same "enumerates the
  database enum domain" class this phase cited when authoring the schema messages.
  The standard is applied inconsistently.
- **Decision**: SKIPPED, deliberately — these strings are **not only** user-facing:
  `src/types.ts:43-45` documents that `Violation.message` doubles as the corrective
  feedback fed back to the LLM on retry, where the enum identifier is the token
  that makes the correction work. Translating them to display labels would weaken
  the retry loop that Risk #2's guardrail depends on. Fixing it properly means
  splitting the message into an LLM-facing and a user-facing form — a real change
  to a guardrail path, out of scope for this phase. Recorded in `test-plan.md` §6.6
  as residual.

### F12 — Failed-login logging can write an email address into server logs

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/auth/signin.ts:20`, `src/pages/api/auth/signup.ts:20`
- **Detail**: Verified what a GoTrue error actually carries: `message`, `status`,
  `code`, `name`, `stack` — **no password, no token, no session**, so the new
  logging leaks no credentials. But GoTrue's `email_address_invalid` message quotes
  the submitted address, so an email (PII) can reach Workers Logs; and every failed
  login now emits a line an attacker can inflate.
- **Decision**: ACCEPTED — logging the whole error is what makes an unmapped code
  diagnosable, which is the point of the fix; server-side auth-failure logging is
  standard, and the logs are not user-visible. Revisit if log volume or a data-
  retention policy makes it matter.

### F13 — Account enumeration is now an explicitly tested contract

- **Severity**: ◽ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/auth-errors.ts:26-27`, pinned at `src/pages/api/auth/signup.test.ts:65-72`
- **Detail**: `user_already_exists`/`email_exists` confirm that an address is
  registered, and `email_not_confirmed` distinguishes "registered but unconfirmed"
  from "unknown". This was already the behavior before the change (GoTrue's own
  messages said the same), but the change makes it a deliberate, tested contract.
- **Decision**: ACCEPTED — unchanged posture, appropriate for this product's
  signup UX, and now explicit rather than incidental. Flagged here so it reads as
  a choice rather than an accident.

### F14 — Integration suite has no explicit `testTimeout` and now performs ~14 real signups

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `vitest.integration.config.ts`
- **Detail**: Default 5 s per test / 10 s per hook. One `createTestUser()` runs
  inside an `it` on the 5 s budget, and local GoTrue signup is bcrypt-bound.
  `supabase/config.toml` rate-limits sign-ups to 30 per 5 min per IP, and the suite
  now does roughly 14 — two quick local reruns inside one window could 429.
- **Decision**: SKIPPED — measured the whole suite at ~4 s of test time for 29
  tests with headroom, and the pattern (a signup inside an `it`) predates this
  phase in `save.integration.test.ts`. Raising the timeout or batching users is a
  suite-wide change better made when it actually bites. Noted so the next
  "Failed to create test user" is diagnosed in seconds.

## Automated verification (re-run at review time, post-fix)

| Gate | Result |
|---|---|
| `npm run test` | 142 passed (10 files) |
| `npm run test:integration` | 29 passed (7 files), local Docker Supabase |
| `npm run lint` | clean |
| `npm run typecheck` | 0 errors |
| `npm run build` | success |
| `npx vitest run --sequence.shuffle` ×3 | 119/119 stable (pre-F5/F6 count), no order dependence |
| `npm run test:integration` ×2 back-to-back | stable |

Manual rows 3.4 and 3.5 were verified end-to-end against `astro dev` on a local
Supabase stack (`.dev.vars` temporarily repointed per `E2E_RULES.md`, then
restored byte-identically — hash confirmed), not by inspection.

## Mutation checks (evidence the new guards are not vacuous)

| Property broken | Cases that went red |
|---|---|
| Hard-failure re-throw swallowed (`plan-generator.ts:92`) | 3 (S2, S3, S5c) |
| Empty-text branch consumes retries | 3 (S3, S4, hard/soft discriminator) — **0 before F2's fix** |
| `generate.ts` returns `error.message` | 3 endpoint leak cases |
| `authErrorMessage` passes `message` through | 8 across 3 files |
| A mapped auth code typo'd | 3, incl. the new SDK-union guard |
| `equipment` array message removed | 2 of the new payload cases |
| An authored bound message removed | 1 (`age (above max)`) |
| `rename.ts` name-type message removed | 1 |
| SDK field renamed in the compile-time guard | `npm run typecheck` fails; vitest stays green |
