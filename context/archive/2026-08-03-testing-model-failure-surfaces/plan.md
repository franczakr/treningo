# Model Failure Surfaces — Implementation Plan

## Overview

Rollout Phase 4 of `context/foundation/test-plan.md` — the last phase. Closes
two risks: **#4** (a model-side failure ending as a 500, a blank screen, or a
partial plan the user believes is real) and **#7** (an unexpected server error
showing the user raw internal detail).

The two need opposite treatments, which research established:

- **#4 is well-defended and entirely untested.** `generatePlan` funnels all five
  documented hard-failure surfaces into `PlanGenerationError`; `generate.ts`
  turns that into a 500 with a generic Polish message while logging the raw
  cause; `PlanView.tsx` renders a retry button. Not one line of it is covered —
  `src/pages/api/plan/generate.ts` and `src/lib/gemini.ts` have **no test file
  at all**, and `plan-generator.test.ts` exercises only the *soft*-failure retry
  loop. Every failure-UI claim in the archive was verified by human eyeball
  only. So #4 gets **coverage, not repair**.
- **#7 is a live defect in three places §2 never named.** The read paths it
  cited turn out to be the least leaky (in production SSR an unhandled throw
  yields the platform's own 500 page — no app body, no stack). The real leaks
  are *rendered*: GoTrue's `error.message` verbatim on signin/signup, and zod's
  **English default** issue text on `/training-profile`. So #7 gets a **fix plus
  a regression test**, at the source.

## Current State Analysis

- **The five hard-failure surfaces are real and traceable** (oracle:
  `context/archive/2026-06-28-gemini-plan-generation/plan.md:104-108`, written
  before the code): SDK throw → `src/lib/services/plan-generator.ts:91-94`
  (wrapped, raw error kept on `.cause`); `promptFeedback.blockReason` → `:73-77`;
  candidate `finishReason` → **no dedicated branch**, falls into the empty-text
  guard at `:79-84`; empty `text` → `:78-84`; unparseable output → `:86-89`
  (`safeParse`, unwrapped) or `:93` (`JSON.parse` throw, wrapped with `cause`).
  `:92` re-throws `PlanGenerationError` straight out of the retry loop, so a
  hard failure **does not consume the retry budget** — exactly one
  `generateContent` call happens. None of this is asserted anywhere today.
- **`generatePlan` needs no mocking at all** — it takes its client as a
  parameter (`plan-generator.ts:50`), and `plan-generator.test.ts:53-71` already
  has the hand-rolled fake + the documented `as unknown as GoogleGenAI` cast.
  The unit layer is pure extension of an existing file.
- **The endpoint has zero tests but is fully injectable.** Every route imports
  `@/lib/supabase` → `astro:env/server`, which neither Vitest config aliases, so
  any node-level route test *must* substitute that module (and, for
  `generate.ts`, `@/lib/gemini` too). Phase 3 established the exact pattern
  (`src/pages/api/plan/save.integration.test.ts:26-47`): `vi.mock` the one
  environment boundary, dynamic-import the route after it, hand-build a fake
  `APIContext`.
- **`generate.ts:52-57` is the cleanest error path in the codebase** and the
  natural target for #7's positive direction: `PlanGenerationError.message`
  *does* carry provider internals (`plan-generator.ts:75,82` interpolate
  `blockReason` / `finishReason`), and it is never returned — only the constant
  `"Nie udało się wygenerować planu. Spróbuj ponownie."` is, while `:56` logs
  `error.cause ?? error`. That asymmetry is precisely what the risk asks to
  prove, and both halves are assertable in one test.
- **The three leaks, verified:**
  - `src/pages/api/auth/signin.ts:16` / `signup.ts:16` —
    `?error=${encodeURIComponent(error.message)}`, read at `auth/signin.astro:6`
    and rendered raw by `ServerError.tsx:13`. Benign text ("Invalid login
    credentials") shares the channel with infrastructure text ("Database error
    querying schema", "Error sending confirmation email"). No `error.code`
    branch exists — the message *is* the branch.
  - `src/pages/api/profile.ts:45-46` — `parsed.error.issues[0]?.message ??
    "Invalid profile data"` rendered on `/training-profile`. Only **one** field
    in `src/lib/schemas/profile.ts` carries an authored message (`:37`
    equipment); every other field falls back to zod 4 English defaults, e.g.
    `"Too small: expected number to be >=13"` and `"Invalid option: expected one
    of \"strength\"|…"` — which enumerates the DB enum domain. Because the same
    schema is the client mirror (`TrainingProfileForm.tsx:118-126` renders
    `issue.message` per field), **the English text is also what the client shows
    today** — a violation of the project's Polish-UI rule on both sides.
  - `src/pages/api/plan/rename.ts:45` — same shape, but here only one of the two
    possible issues is unauthored: `plan_id: z.uuid()` (`:7`) yields
    `"Invalid UUID"`. The other (`:13`, name length) is already authored Polish.
  - Plus five English `"Supabase is not configured"` literals
    (`signin.ts:11`, `signup.ts:11`, `profile.ts:24`, `rename.ts:36`,
    `delete.ts:26`) in an otherwise-Polish UI.
- **`AuthError.code` is a stable, typed surface** in the installed
  `@supabase/auth-js` (`dist/module/lib/errors.d.ts`: `code: ErrorCode | (string
  & {}) | undefined`), and every code this fix needs exists in its `ErrorCode`
  union: `invalid_credentials`, `email_not_confirmed`, `user_already_exists`,
  `email_exists`, `weak_password`, `over_request_rate_limit`,
  `over_email_send_rate_limit`, `signup_disabled`, `user_banned`,
  `validation_failed`. So the fix can preserve today's *useful* feedback
  (wrong password, unconfirmed email) instead of flattening everything to one
  opaque string.
- **The provider-shape obligation is inherited, and cheaply dischargeable.**
  `context/archive/2026-08-02-testing-plan-soundness/plan.md:592-597` handed
  Phase 4 the gap that "the fake returns `{ text: JSON.stringify(planPayload) }`;
  if the real `@google/genai` response shape changes, these tests would keep
  passing while production breaks." Verified against the installed SDK: `text`
  is a real accessor on `GenerateContentResponse.prototype` (alongside
  `constructor, data, functionCalls, executableCode, codeExecutionResult`), and
  `FinishReason.MAX_TOKENS` / `BlockedReason.SAFETY` are real exported enum
  members. A runtime guard can therefore use the **SDK itself** as the oracle.
- **Infrastructure needs nothing new.** Suite membership is decided purely by
  filename (`**/*.integration.test.ts` → the Docker suite;
  everything else → the hermetic unit suite), and CI already runs both jobs.
  `console.error` has never been spied in this repo, but `vi.spyOn` needs no new
  dependency.

### Key Discoveries:

- `src/lib/services/plan-generator.ts:92` — `if (error instanceof
  PlanGenerationError) throw error` is what makes "a hard failure aborts
  immediately, without consuming retries" an assertable contract (call count
  === 1), distinguishing it from the soft path that legitimately calls three
  times.
- `src/pages/api/plan/generate.ts:56` — `error.cause ?? error` is the seam that
  makes both halves of #7 provable at once: a sentinel string planted in the
  fake SDK's thrown error must appear in the `console.error` argument and must
  **not** appear anywhere in the response body.
- Fixing the zod leaks **at the schema** (authored Polish messages) rather than
  at the route (a blanket generic string) removes the leak for the client mirror
  too, and turns the property into something testable in one line: no
  user-facing issue message may match zod's English default vocabulary.
- `src/lib/schemas/plan.ts:56-68` has no `.min()`, so `{sessions: []}` parses —
  but `plan-validator.ts:47-51` catches it as a `goal` violation, making it a
  *soft* failure that retries. Adding `.min(1)` would convert it into a hard
  failure and **destroy that retry-with-feedback recovery**, so it is
  deliberately not done here (see What We're NOT Doing).

## Desired End State

Every documented model-side hard-failure surface is proven, by unit tests at
the SDK boundary, to end in `PlanGenerationError` — with the raw provider error
preserved for the log, the retry budget untouched, and no partial plan
returned. The generate endpoint is proven, by an integration test against the
real database with a scripted fake SDK, to answer each failure class with its
documented status code and a generic Polish message, with the provider detail
reaching only the server log. No user-facing error string anywhere in the app
carries provider text, validator internals, or English. The test plan's §6.5
placeholder is filled with the pattern, §6.6 records what shipped and what
remains, and the rollout's last row reads `complete`.

### Verification

`npm run test` (unit) and `npm run test:integration` (Docker Supabase running)
both pass locally and in CI's two jobs; `npm run lint` stays green.

## What We're NOT Doing

- **Not adding a DOM test environment (`jsdom`/`@testing-library`) to test
  `PlanView`'s retry button.** The button exists and was verified by reading
  (`PlanView.tsx:151,108-115`), but proving it *fires* needs either new
  infrastructure for a single island or a browser test — and a browser test
  cannot force a model failure at all, because the Gemini call is server-side
  and `page.route()` cannot intercept it (`tests/e2e/E2E_RULES.md:43-49`).
  Recorded in the backported §2 guidance as covered by reading, not by test.
- **Not adding `.min(1)` to `planSchema`'s arrays.** It would convert an
  empty-plan model response from a soft failure (retried with corrective
  feedback, per `plan-validator.ts:47-51`) into an immediate hard failure with
  no retry — a behavior regression dressed as a hardening.
- **Not persisting `violations`/`ok` on the `plans` row.** This is the one
  genuinely uncaveated Risk-#4 surface left (a soft-failure plan reopens on
  `/plan/[id]` with no banner), but closing it needs a migration plus a UI
  decision and partly reverses the accepted decision that soft-failure plans
  are savable (`context/archive/2026-06-28-save-plan/plan.md`). Recorded as
  residual risk in §6.6.
- **Not fixing the silently-dropped `?error=` on `/dashboard`** (a failed
  rename/delete currently looks like a success, because neither
  `dashboard.astro` nor `plan/[id].astro` reads `searchParams`). A real defect,
  but both its fix and its test live in `.astro` frontmatter, which no layer
  this rollout uses can reach. Recommended as its own follow-up change.
- **Not touching `middleware.ts`'s undestructured `getUser()` error**, the
  unhandled read-path throws, or `api/profile.ts:57`'s deliberate bare `catch` —
  all pre-existing, none of them a disclosure path in production.
- **Not adding a React error boundary** for the theoretical malformed-200 crash
  path in `PlanView.tsx:27`. `generate.ts` can only ever serialize a
  schema-parsed `PlanGenerationResult`, so triggering it would require adding a
  defect first — speculative under the challenger rule.
- **Not asserting message text as a contract** where it isn't one. Violation
  messages *are* a functional contract (they are fed back to the LLM as retry
  correction), so §6.1's rule holds: assert on categories, except where the
  string itself is the user-facing guarantee under test (the generic-message
  constants in Phase 3/4 below).

## Implementation Approach

Five sub-phases. The unit surface matrix comes first (cheapest, no Docker, and
it pins the error contract the endpoint test then relies on). The endpoint test
follows, since it needs that contract plus the real database. The #7 fix comes
next as one atomic change with its own unit tests — deliberately *after* the #4
work so a review can read coverage-only and behavior-changing commits apart.
Then the leak-regression tests at the route boundary, which need no database and
therefore belong in the hermetic unit suite. A final documentation sub-phase
fills §6.5 — the exact placeholder this phase was created to fill.

## Phase 1: Hard-failure surface matrix + SDK response-shape guard (Risk #4, unit)

### Overview

Cover all five documented hard-failure surfaces at the injected SDK boundary,
and discharge the provider-shape obligation Phase 1 of the rollout explicitly
handed here.

### Changes Required:

#### 1. Hard-failure cases

**File**: `src/lib/services/plan-generator.test.ts`

**Intent**: Extend the existing file (do not create a new one — the fake-client
helpers and profile fixture already live here) with a new
`describe("generatePlan — hard-failure surfaces (Risk #4)", …)` block. The
oracle is `context/archive/2026-06-28-gemini-plan-generation/plan.md:104-108`,
quoted in a header comment above the block, **not** the current implementation.

Widen the existing `FakeGenerateContentResponse` interface only as far as the
new fixtures need (it already declares `text`, `promptFeedback.blockReason`,
`candidates[].finishReason`), and add one helper that scripts a single raw
response or a thrown error and counts calls — so every case can assert the call
count as well as the outcome.

**Contract**: One `it` per surface, each asserting the outcome **and** that the
retry budget was untouched (`calls === 1`), because "a hard failure aborts
immediately" is the load-bearing half of the contract:

1. **S1 — SDK throws.** Fake `generateContent` rejects with a distinctive
   `Error("upstream 503 — SENTINEL")`. Assert: rejects with
   `PlanGenerationError`; `error.cause` **is** the thrown error (identity), so
   the raw detail survives for the server log; `calls === 1`.
2. **S2 — blocked prompt.** Response `{ promptFeedback: { blockReason: "SAFETY" } }`.
   Assert: rejects with `PlanGenerationError`; the message contains `"SAFETY"`
   (a server-side diagnostic guarantee, per the impl review's F1 fix);
   `cause === undefined`; `calls === 1`.
3. **S3 — stop reason without a block reason** (the F1 surface). Response
   `{ candidates: [{ finishReason: "MAX_TOKENS" }] }` with no `text` and no
   `promptFeedback`. Assert: rejects with `PlanGenerationError` whose message
   contains `"MAX_TOKENS"`. Comment must state this is a *characterization* of
   the shipped design — F1 was fixed diagnostically only, so this case
   deliberately arrives through the empty-text guard rather than its own branch.
4. **S4 — empty text, no reason at all.** Response `{}`. Assert: rejects with
   `PlanGenerationError`; message does **not** contain `"finishReason"` (the
   documented conditional interpolation); `calls === 1`.
5. **S5a — output not JSON.** `{ text: "Oto Twój plan: nie mogę tego zrobić." }`.
   Assert: rejects with `PlanGenerationError`; `error.cause` is a `SyntaxError`
   (so the parse failure is diagnosable server-side). One inline comment noting
   the message is the generic call-failure string rather than a parse-specific
   one — shipped behavior, log-only, characterized not failed.
6. **S5b — truncated JSON** (F3's truncation route, reproduced without needing a
   real token cap): `{ text: JSON.stringify(soundPlan).slice(0, 40) }`. Same
   assertions as S5a.
7. **S5c — valid JSON, wrong shape.** `{ text: JSON.stringify({ sessions: [{ name: "A" }] }) }`.
   Assert: rejects with `PlanGenerationError`; message is the schema-specific
   one; `cause === undefined`; `calls === 1`.
8. **Invariant across the matrix — never a partial plan.** One case asserting
   that a hard failure produces no resolved value at all (`await expect(...)
   .rejects.toBeInstanceOf(PlanGenerationError)`), contrasted with an adjacent
   positive control: the *soft* path with the same fixture count resolves and
   calls three times — proving the suite can tell the two failure classes apart
   and did not simply make everything throw.

**Anti-pattern avoided**: not mocking `@/lib/gemini` or any internal module —
the SDK boundary is already a parameter. Not re-deriving expected messages by
calling the code under test; each expectation comes from the archived contract.

#### 2. SDK response-shape guard

**File**: `src/lib/services/plan-generator.test.ts` (same file, its own
`describe`)

**Intent**: Make the fake's assumptions falsifiable against the real SDK — the
§6.2 migration-guard pattern, with `@google/genai` as the external oracle
instead of a `.sql` file. If the SDK renames or drops a field the generator
reads, this goes red instead of the fake quietly lying forever.

**Contract**: `describe("@google/genai response-shape guard", …)` importing the
**real** SDK values (`GenerateContentResponse`, `FinishReason`, `BlockedReason`
— runtime imports, not `import type`, so `npm run test` enforces them):

- `text` is an own property of `GenerateContentResponse.prototype` (assert via
  `Object.getOwnPropertyDescriptor(GenerateContentResponse.prototype, "text")`
  being defined) — the field `plan-generator.ts:78` reads.
- The enum members the fixtures use still exist:
  `FinishReason.MAX_TOKENS === "MAX_TOKENS"`, `BlockedReason.SAFETY === "SAFETY"`.
- The fixtures reference those enum members rather than bare string literals
  wherever practical, so a renamed member breaks compilation of the fixture too.

Include an explicit **limit statement** in a comment, mirroring §6.2's: this
detects a rename or removal, not a semantic change in *when* the SDK populates
a field, and it cannot prove the live API still returns what the type says.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Lint passes: `npm run lint`
- Deliberate-break check: temporarily change `plan-generator.ts:92` to swallow
  the re-throw (or drop the `blockReason` guard) and confirm the new cases go
  red; revert.

#### Manual Verification:

- None — pure unit surface.

---

## Phase 2: Generate-endpoint failure contract (Risks #4 + #7, integration)

### Overview

The endpoint has no test at all. Prove that each documented failure class ends
in its documented status code with a generic Polish body, that a hard failure
never yields a 200 or a partial plan, and — the #7 half — that provider detail
reaches only the server log.

### Changes Required:

#### 1. New integration test file

**File**: `src/pages/api/plan/generate.integration.test.ts`

**Intent**: Drive the real exported `POST` against the **real** local database
(real signed-in user, real seeded profile, real `getProfile`), substituting only
the two modules that cannot load under plain-`node` Vitest — `@/lib/supabase`
(per Phase 3's precedent) and `@/lib/gemini` (same reason: it reads
`astro:env/server`). The Gemini *client* is a scripted fake, so no network call
and no quota is consumed.

**Contract**: Two module-scope mutable bindings assigned in `beforeAll`
(`currentClient`, `currentGemini`), both closed over by the `vi.mock` factories,
followed by `const { POST } = await import("./generate")`. Reuse
`createTestUser()` + `upsertProfile` to seed a profile, exactly as
`save.integration.test.ts:68-85` does, and a `fakeContext(userId)` helper
returning `{ locals: { user: { id } }, request: new Request("http://localhost/api/plan/generate", { method: "POST" }), cookies: {} } as unknown as APIContext`.

Cases:

1. **Hard failure → 500 `generation_failed`, nothing leaked.** The fake SDK
   throws `new Error("Gemini 500: SENTINEL-PROVIDER-DETAIL")`. Assert:
   `status === 500`; body `error === "generation_failed"` and `message ===
   "Nie udało się wygenerować planu. Spróbuj ponownie."` (the exact user-facing
   guarantee); **and** that the whole serialized body contains neither
   `"SENTINEL-PROVIDER-DETAIL"` nor `"Gemini"`. A `vi.spyOn(console, "error")`
   (restored in `afterEach`) must have been called with an argument whose
   serialization *does* contain the sentinel — the "detail reaches only the
   server log" half. Asserting only one half would let a leak or a silent log
   pass.
2. **Blocked prompt → same 500 contract.** Fake returns
   `{ promptFeedback: { blockReason: BlockedReason.SAFETY } }`. Assert the same
   status/body, and that the body does not contain `"SAFETY"` — the block reason
   is a server-side diagnostic and must not surface, even though
   `PlanGenerationError.message` carries it.
3. **Unparseable output → same 500 contract**, with a non-JSON `text`. Proves
   the endpoint collapses distinct hard-failure surfaces into one user-facing
   answer (three surfaces, one contract) rather than accidentally passing one
   through.
4. **Not configured → 503 `not_configured`.** `currentGemini = null` (the real
   `createGemini()` contract when `GEMINI_API_KEY` is unset,
   `src/lib/gemini.ts:9-11`). Assert `status === 503`, `error ===
   "not_configured"`, and that the message is Polish and mentions no
   configuration internals (no key name, no env-var name).
5. **No profile → 422 `profile_required`.** A second, freshly created user with
   **no** profile row (real database, real `getProfile` returning `null`).
   Assert `422` / `profile_required`. This case is what proves the DB path is
   genuinely live rather than stubbed.
6. **Unauthenticated → 401 `unauthorized`.** `locals.user` absent. Assert the
   body has an `error` and **no** `message` field (matching the route's actual,
   deliberate shape) — and that the fake SDK was never called, i.e. the auth
   guard runs before any provider work.
7. **Positive control — soft failure still returns 200.** Fake returns, three
   times, a structurally valid plan that violates the day-count guardrail.
   Assert `status === 200`, `ok === false`, `violations` non-empty, and
   `plan.sessions.length > 0`. Comment must state this characterizes the
   *accepted* decision (a soft-failure plan is shown and savable —
   `context/archive/2026-06-28-save-plan/plan.md`), so the suite cannot pass by
   having made everything fail.

**Anti-pattern avoided**: mocking `@/lib/services/profile` or
`@/lib/services/plan-generator` — that would turn the test into an
implementation mirror proving only that the route calls what it was told to
call. Only the two environment-bound modules are substituted, per §6.4.

### Success Criteria:

#### Automated Verification:

- Integration tests pass: `npm run test:integration` (local `supabase start`, or
  CI's `integration` job)
- Lint passes: `npm run lint`
- Deliberate-break check: temporarily change `generate.ts:57` to return
  `error.message` instead of the constant, and confirm case 1 goes red on the
  leak assertion (not merely on the status); revert.

#### Manual Verification:

- None — no UI surface; the real-endpoint, real-database test is the
  verification.

---

## Phase 3: Remove the rendered error-detail leaks (Risk #7, code fix + unit)

### Overview

Fix the three leaks at their source, in Polish, without flattening the useful
feedback users depend on (wrong password, unconfirmed email, name too long).

### Changes Required:

#### 1. Auth error translation

**File**: `src/lib/auth-errors.ts` (new)

**Intent**: Map Supabase's **stable `error.code`** to an authored Polish
message, with a caller-supplied generic fallback for everything unrecognized —
so infrastructure text ("Database error querying schema", rate-limit internals,
hook failures) can never reach the user, while `invalid_credentials` and
`email_not_confirmed` keep their helpful wording. Codes are taken from the
installed `@supabase/auth-js` `ErrorCode` union (verified present).

**Contract**:
```ts
export const SIGNIN_FALLBACK_MESSAGE = "Nie udało się zalogować. Spróbuj ponownie.";
export const SIGNUP_FALLBACK_MESSAGE = "Nie udało się utworzyć konta. Spróbuj ponownie.";
export function authErrorMessage(error: { code?: string }, fallback: string): string;
```
Mapped codes → Polish: `invalid_credentials`, `email_not_confirmed`,
`user_already_exists` / `email_exists`, `weak_password`, `validation_failed`,
`over_request_rate_limit` / `over_email_send_rate_limit`, `signup_disabled`,
`user_banned`. Everything else, and a missing/undefined `code`, returns
`fallback`. The function must read **only** `code` — never `message` — so no
provider string can pass through by construction. A header comment states that
property, because it is the security-relevant part of the design.

#### 2. Auth routes stop echoing the provider

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Replace `encodeURIComponent(error.message)` with
`encodeURIComponent(authErrorMessage(error, SIGNIN_FALLBACK_MESSAGE))` (resp.
`SIGNUP_FALLBACK_MESSAGE`), and log the raw error server-side with the existing
convention (`console.error` + the `eslint-disable-next-line no-console --
deliberate server-side error log` comment) so diagnosability is preserved rather
than lost. Also replace the English `"Supabase is not configured"` literal with
a Polish message consistent with the other routes.

#### 3. Polish, authored validation messages (kills the zod-default leak at source)

**Files**: `src/lib/schemas/profile.ts`, `src/pages/api/plan/rename.ts`,
`src/pages/api/profile.ts`

**Intent**: Give every constraint in `profileSchema` an authored Polish message
(goal, experience_level, age min/max, weight_kg, training_days_per_week min/max,
the four optional lifts, plank_seconds — `equipment` already has one at `:37`),
and give `rename.ts:7`'s `z.uuid()` one too. This removes the leak for the
**client mirror** as well, since `TrainingProfileForm.tsx:118-126` renders the
same `issue.message` per field — so the fix is also the Polish-UI fix. Then
replace `profile.ts:46`'s English fallback literal `"Invalid profile data"` with
a Polish one, and log the failing issues server-side.

**Contract**: Message text only — **no bound changes**. Every numeric bound and
nullability in `profile.ts` must stay byte-identical, because
`src/lib/schemas/profile.test.ts` pins them against the migration text and Phase
3 pinned the acceptance direction against the real database. Keep `AGE_MIN` &c.
as the interpolation source for the messages so a future bound change updates
the text automatically.

#### 4. Remaining English config literals

**Files**: `src/pages/api/profile.ts:24`, `src/pages/api/plan/rename.ts:36`,
`src/pages/api/plan/delete.ts:26`

**Intent**: Same Polish replacement, for consistency with `generate.ts:33` /
`save.ts:35` which already do this correctly. Behavior otherwise unchanged.

#### 5. Unit tests for the translation layer

**File**: `src/lib/auth-errors.test.ts` (new)

**Intent**: The oracle is the mapping table as a *product* requirement plus the
security property, never the function's own output.

**Contract**:
- One case per mapped code asserting the exact Polish string, so a silent
  remapping is caught.
- The security property, stated as its own case: for an error carrying a
  realistic infrastructure `message` (`"Database error querying schema"`) and an
  **unmapped** code (`"unexpected_failure"`), the result is exactly the fallback
  and contains none of that text. Repeat with `code: undefined` (the documented
  pre-response case) and with a code absent from the union entirely.
- A table-driven sweep asserting the returned string is always one of the
  authored constants — so a future edit cannot introduce a pass-through.

**File**: `src/lib/schemas/profile.test.ts` (extend)

**Intent**: Pin the no-zod-default property, which is what actually prevents a
regression: a new field added without a message would silently reintroduce
English.

**Contract**: One case that walks a battery of invalid payloads (one per
constrained field, reusing the file's existing invalid fixtures where possible),
collects every `issue.message`, and asserts none matches zod's English default
vocabulary — `/expected|received|Invalid option|Too small|Too big|Invalid input/i`
— and that each is non-empty. Comment must name the vocabulary as
zod-4-specific and therefore worth revisiting on a zod major upgrade.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Integration tests still pass: `npm run test:integration` (the profile
  boundary/acceptance suites must be unaffected — message-only changes)
- Lint passes: `npm run lint`

#### Manual Verification:

- Sign in with a wrong password → Polish "nieprawidłowy e-mail lub hasło"
  message (not the English provider string).
- Submit the profile form with JS disabled and an out-of-range age → a Polish
  message on `/training-profile`.

---

## Phase 4: Leak-direction regression tests at the route boundary (Risk #7, unit)

### Overview

Prove at the route level that a provider or validator error cannot reach the
user, for the routes Phase 3 just fixed. These need **no database** — the
failing dependency is the auth provider or the schema — so they belong in the
hermetic unit suite, not the Docker one.

### Changes Required:

#### 1. Auth-route leak tests

**File**: `src/pages/api/auth/signin.test.ts` (new)

**Intent**: The one boundary substituted is `@/lib/supabase` (mandatory: it
reads `astro:env/server`), returning a fake whose
`auth.signInWithPassword` resolves `{ error: { code, message } }`. Everything
else — the route's own translation and redirect construction — runs for real.
No database is involved because none is reached on this path.

**Contract**: `vi.mock("@/lib/supabase", () => ({ createClient: () => currentClient }))`
+ `const { POST } = await import("./signin")`, and a fake `APIContext` whose
`redirect` is a `vi.fn()` returning a `Response` (the route returns
`context.redirect(...)`, so the assertion target is the URL passed to it).
Cases:
1. Infrastructure error (`code: "unexpected_failure"`, `message: "Database error
   querying schema"`): the redirect URL's decoded `error` param equals
   `SIGNIN_FALLBACK_MESSAGE` and contains none of the provider text; the raw
   error reached `console.error`.
2. `code: "invalid_credentials"`: the URL carries the mapped Polish message —
   the positive control proving the suite is not passing by blanket-genericizing.
3. Unconfigured client (`createClient: () => null`): Polish message, and
   `signInWithPassword` was never called.

**File**: `src/pages/api/auth/signup.test.ts` (new) — the same three cases
against `auth.signUp` and `SIGNUP_FALLBACK_MESSAGE`, since the two routes are
byte-identical in shape and a fix applied to only one is a realistic regression.

#### 2. Validation-leak test on the profile route

**File**: `src/pages/api/profile.test.ts` (new)

**Intent**: Prove the route's *validation* failure path (the leak's original
site) now emits Polish and nothing internal, driving the real `profileSchema`
with a real `FormData` body.

**Contract**: Mock only `@/lib/supabase` (returning a fake client that is never
reached on the validation path). Post a `FormData` with `age: "5"` (below the
authored minimum) and assert the redirect URL's decoded `error` param is
non-empty, is Polish, and matches none of the zod-default English vocabulary;
plus one control with a valid body reaching the (faked) upsert.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Lint passes: `npm run lint`
- Deliberate-break check: revert `signin.ts` to `error.message` and confirm case
  1 goes red; revert the revert.

#### Manual Verification:

- None — covered by Phase 3's manual rows.

---

## Phase 5: Cookbook + rollout documentation

### Overview

Fill §6.5 — the placeholder this phase exists to fill — record what shipped and
what remains in §6.6, close the rollout in §3/§5, and fix the stale testing
claim in `CLAUDE.md` that predates the whole rollout.

### Changes Required:

#### 1. §6.5 — Adding a test for a model-side failure path

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the TBD with the shipped pattern: extend
`plan-generator.test.ts` with a scripted fake passed as the `generatePlan`
parameter (no module mocking needed — the SDK is already injected); take the
expected outcome from the archived hard-failure contract, never from the
implementation; assert the error *type*, the call count (a hard failure must not
consume the retry budget), and `.cause` identity (the raw error must survive for
the log). Name the SDK response-shape guard and its limit. For the endpoint
layer, point at `generate.integration.test.ts` and the both-halves rule: a
sentinel in the fake provider error must be absent from the response body and
present in the `console.error` argument.

**Contract**: Prose replacing the §6.5 placeholder; no code.

#### 2. §6.6 — Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: One paragraph: the five-surface matrix and what each asserts; the
provider-shape guard that discharges Phase 1's explicit hand-off; the endpoint
contract test (first test of `generate.ts`, which had none); the Risk-#7 fix
(code change, not just a test — `src/lib/auth-errors.ts`, authored Polish
messages in `profileSchema`/`rename.ts`, five English literals replaced) and why
it was done at the schema rather than the route. Then the residual risks, each
with its reason: violations/`ok` not persisted so a soft-failure plan reopens
uncaveated; `?error=` silently dropped on `/dashboard`; read-path throws still
unhandled (not a disclosure path in production, but a broken page); the retry UI
covered by reading only.

#### 3. §3 status, §5 gate, freshness

**File**: `context/foundation/test-plan.md`

**Intent**: §3 Phase 4 Status → `complete`; update the header's "Last updated"
block per the file's existing convention; confirm §5's "integration (error
surfaces)" row now reads as enforced.

#### 4. Stale testing claim

**File**: `CLAUDE.md`

**Intent**: `CLAUDE.md:15` still says "no test runner is configured yet — there
is no `test` script and no Playwright/Vitest install", which is wrong in three
ways and actively misleads a future agent. Replace with the real commands
(`npm run test`, `npm run test:integration`, `npm run test:e2e`), the
filename-based suite split, the local-Supabase requirement for the integration
suite, and a pointer to `context/foundation/test-plan.md` §6 for how to add a
test.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run test` and `npm run test:integration` pass (full-suite confirmation
  after every preceding sub-phase)

#### Manual Verification:

- §6.5 no longer reads "TBD"; §6.6 names this phase's additions and its
  residual risks; §3 has no non-`complete` row; `CLAUDE.md` no longer claims
  there is no test runner.

---

## Testing Strategy

### Unit Tests:

- Five hard-failure surfaces + the never-a-partial-plan invariant + the soft-path
  positive control (Phase 1), extending `plan-generator.test.ts`.
- `@google/genai` response-shape guard (Phase 1).
- `authErrorMessage` mapping and its no-pass-through property (Phase 3).
- No-zod-default-message property on `profileSchema` (Phase 3).
- Route-level leak regressions for signin, signup, profile (Phase 4).

### Integration Tests:

- Generate-endpoint failure contract: three hard-failure classes → 500 +
  generic body + logged sentinel; 503; 422; 401; and the soft-failure 200
  characterization (Phase 2).

### Manual Testing Steps:

Only the two rows in Phase 3 (wrong password; JS-disabled invalid profile
submit), because those two paths render through `.astro` + island surfaces that
no automated layer in this project can reach today.

## Performance Considerations

None. Every new test either runs in-process with a scripted fake (unit) or
against the same local Supabase stack the integration suite already boots. No
real Gemini call is made anywhere, so no quota is consumed and no
non-determinism is introduced.

## Migration Notes

No database migration. Phase 3 changes message strings and adds one pure module;
no schema bound, nullability, or table shape changes — deliberately, so the
migration-pinned tests from rollout Phases 1 and 3 stay valid.

## References

- Related research: `context/changes/testing-model-failure-surfaces/research.md`
- Hard-failure contract (the oracle):
  `context/archive/2026-06-28-gemini-plan-generation/plan.md:104-108,166-171`
- Findings this phase covers rather than repairs:
  `context/archive/2026-06-28-gemini-plan-generation/reviews/impl-review.md`
  F1 (`:30-38`), F3 (`:50-58`)
- Obligation inherited: `context/archive/2026-08-02-testing-plan-soundness/plan.md:592-597`
- Endpoint-boundary pattern to reuse: `src/pages/api/plan/save.integration.test.ts:26-47`
- Accepted decision to characterize, not fail:
  `context/archive/2026-06-28-save-plan/plan.md` ("Saving works even when `ok === false`")
- Leak-convention origin: `context/archive/2026-06-27-training-profile/reviews/impl-review.md:33-51` (F3)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Hard-failure surface matrix + SDK response-shape guard (Risk #4, unit)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — f7e674e
- [x] 1.2 Lint passes: `npm run lint` — f7e674e
- [x] 1.3 Deliberate-break check: swallowing the hard-failure re-throw turns the new cases red (3 cases red: S2, S3, S5c) — f7e674e

### Phase 2: Generate-endpoint failure contract (Risks #4 + #7, integration)

#### Automated

- [x] 2.1 Integration tests pass: `npm run test:integration` — 1148db7
- [x] 2.2 Lint passes: `npm run lint` — 1148db7
- [x] 2.3 Deliberate-break check: returning `error.message` from `generate.ts` turns the leak assertion red (3 cases red) — 1148db7

### Phase 3: Remove the rendered error-detail leaks (Risk #7, code fix + unit)

#### Automated

- [x] 3.1 Unit tests pass: `npm run test` (103 tests) — 6afa244
- [x] 3.2 Integration tests unaffected: `npm run test:integration` (29 tests) — 6afa244
- [x] 3.3 Lint passes: `npm run lint` (plus `npm run typecheck`: 0 errors) — 6afa244

#### Manual

- [x] 3.4 Wrong password shows the mapped Polish message, not the provider string — verified end-to-end against `astro dev` + the local Supabase stack: `POST /api/auth/signin` redirects to `?error=Nieprawidłowy%20e-mail%20lub%20hasło.` and the rendered page contains that text, with no "Invalid login credentials" anywhere — 6afa244
- [x] 3.5 Invalid profile submit (no JS) shows a Polish message on `/training-profile` — verified end-to-end (real signup → signin → form POST): `age=5` renders "Minimalny wiek to 13 lat." and `goal=become_a_wizard` renders "Wybierz jedną z dostępnych opcji." instead of zod's enum-enumerating default — 6afa244

### Phase 4: Leak-direction regression tests at the route boundary (Risk #7, unit)

#### Automated

- [x] 4.1 Unit tests pass: `npm run test` (114 tests) — bdbec2e
- [x] 4.2 Lint passes: `npm run lint` — bdbec2e
- [x] 4.3 Deliberate-break check: reverting `signin.ts` to `error.message` turns the leak case red (2 cases red) — bdbec2e

### Phase 5: Cookbook + rollout documentation

#### Automated

- [x] 5.1 `npm run lint` passes — c4f62c6
- [x] 5.2 Full suites pass: `npm run test` and `npm run test:integration` (114 unit + 29 integration) — c4f62c6

#### Manual

- [x] 5.3 §6.5 no longer reads "TBD"; §6.6 names additions + residual risks; §3 fully `complete`; `CLAUDE.md` testing line corrected — c4f62c6

---

## Addendum — impl review (2026-08-03)

Full-plan review: `reviews/impl-review.md` — **APPROVED**, 0 critical, 6 warnings,
7 observations. Ten findings fixed, four accepted/skipped with reasons.

What the review changed beyond the plan as written:

1. **A leak the plan's own fix missed** (F1): `rename.ts`'s `name: z.string()` had
   no authored type-failure message, so a posted `File` surfaced zod's English
   default. Fixed, with a new `src/pages/api/plan/rename.test.ts` (5 cases) — a
   file this plan did not foresee, since Phase 4 scoped route leak tests to
   signin/signup/profile only.
2. **Two of this phase's own guards were weaker than their comments claimed**
   (F2, F3): the unit fake's overflow guard could not fail a case (the code under
   test wraps synchronous throws), which meant S4 would have missed a retry-budget
   regression; and the SDK shape guard could not see the two field names it claimed
   to protect, because they exist only in type declarations. Both fixed, both
   verified by mutation.
3. **A gate was added, contradicting research Open Question #3** (F4): CI now runs
   `npm run typecheck`. The research answered "not needed — the shape guard is a
   runtime assertion"; F3 proved the field-name half *cannot* be, so the guard
   needed a type gate to mean anything. Evidence-driven scope addition, recorded
   in `test-plan.md` §5.
4. **`profileSchema` gained one more authored message and the property guard five
   more payloads** (F5): the array-level type message was unauthored, and the
   guard's wrong-type/missing-field blind spot was exactly why that slipped
   through.
5. **Four more auth codes mapped** (F6) — `email_address_invalid` chief among
   them, whose absence was a genuine UX regression (retry the same rejected
   address forever) — plus a guard asserting every mapped code exists in the
   provider's own `ErrorCode` union (F7).

Accepted without change, with reasons in the report: violation messages carrying
enum identifiers (they double as LLM retry input — F11, recorded as residual risk
in §6.6), email addresses reachable in auth failure logs (F12), account
enumeration as a now-explicit contract (F13), and the integration suite's default
timeout against its signup count (F14).
