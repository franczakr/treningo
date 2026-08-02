# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-02 (§3 Phase 1 marked complete — implemented and
> impl-reviewed, APPROVED; §2 risk wording + response guidance, §4 unit row
> and §7 backported from `context/changes/testing-plan-soundness/research.md`)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: **none — the scan was run and
found non-discriminating.** The full git history is 40 commits across three
consecutive days (2026-06-27 → 2026-06-29) with zero commits since; scoped to
`src/` and `supabase/migrations/`, per-file counts (1–7) reflect how many
greenfield slices touched a file, not maintenance churn. The highest count
(`src/` shared types, 7) is an artifact of the one-shared-types-file
convention in `CLAUDE.md`. Likelihood ratings below therefore rest on the
PRD, the archived slice plans and impl reviews, and the Phase 2 interview —
not on churn.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A signed-in user reaches another account's saved plan or body metrics (age, weight, lifts) | High | Medium | PRD §Guardrails (account isolation), §Access Control, §NFR (owner-only body data); interview Q1; `context/archive/2026-06-27-data-rls-baseline/plan.md` — "No automated RLS test harness — deferred to S-01"; `context/archive/2026-06-27-training-profile/plan.md` — deferred again to `/10x-e2e`; `context/archive/2026-06-29-browse-saved-plans/plan.md` — read path scopes by user_id AND id as defense in depth |
| 2 | A generated plan uses equipment the user does not have or the wrong number of training days — and the softening decision silently widens: the save endpoint re-validates shape only, so a plan that never came from the generator persists and reopens with no trace. Goal-consistency has no enforcement at all | High | High | PRD FR-003, §Guardrails (plan soundness), §Success Criteria; interview Q1 and Q3; `context/archive/2026-06-28-personalized-plan-generation/plan.md` — "Guardrail softening (accepted)", "goal check is intentionally lenient", "Assumes the model tags reliably"; **that slice has no impl review** — the code owning this risk was never reviewed, a stronger likelihood signal than the (discarded) hot-spot data; `context/archive/2026-06-28-save-plan/plan.md` — "Saving works even when `ok === false`" (accepted decision, not a defect) |
| 3 | A saved plan does not come back on a later login, or comes back in a different shape than it was saved in | High | Medium | PRD §NFR ("a saved plan remains retrievable on every subsequent login and is not lost"); interview Q3; `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F1 (snapshot shape drift between row and insert types); `context/archive/2026-06-29-browse-saved-plans/reviews/impl-review.md` F1 (a genuine DB error becomes a 500 — accepted, still open) |
| 4 | A model-side failure ends as a 500 or a blank screen instead of a clean, retryable error — or worse, a partial plan the user believes is real | High | Medium | `context/archive/2026-06-28-gemini-plan-generation/plan.md` (five distinct hard-failure surfaces mapped); same slice's `reviews/impl-review.md` F1 (a stop reason can fire without a block reason and falls through to the empty-text guard) and F3 (thinking tokens count against the output cap, so a long plan can truncate) |
| 5 | A payload passes server-side schema validation but is rejected by a database constraint — or the reverse, the schema accepts what the database will not | Medium | High | `context/archive/2026-06-27-training-profile/reviews/impl-review.md` F1 — **this already happened once** (a zero value passed both validation layers and failed at insert); `context/archive/2026-06-27-training-profile/plan.md` — "Keep DB nullability and the zod schema in lock-step"; interview Q3 |
| 6 | A signed-in user persists an arbitrarily large but schema-valid plan into jsonb storage | Medium | Medium | `context/archive/2026-06-28-save-plan/reviews/impl-review.md` F3 — raised, then **SKIPPED as "low risk, authenticated-only endpoint"; the gap is live**: the plan schema has no array-length caps |
| 7 | An unexpected server error shows the user raw internal detail (database message, provider error body) instead of a generic message | Medium | Low | `context/archive/2026-06-27-training-profile/reviews/impl-review.md` F3 — already happened once and was fixed; `context/archive/2026-06-29-browse-saved-plans/reviews/impl-review.md` F1 — read paths still have no error handling, accepted as convention |

Abuse / security lens coverage: **#1** authorization / ownership (IDOR),
**#5** server-side validation parity, **#6** resource abuse, **#7** internal
detail disclosure.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | User B, holding a valid session, requests a plan id belonging to user A and receives nothing — not a 200 with A's data. Same for profile reads. | "RLS is enabled" is not "isolation holds." Policies can exist and still not be exercised on the path the app actually takes. | Which client carries the end-user session vs. a privileged one; whether the anon key + RLS is the only defense or an explicit ownership filter also runs; how a missing/foreign id is expected to surface. | Integration, against a real database with two distinct real users. | Testing isolation through a mocked database client. A mock returns whatever you told it to — it can prove nothing about a policy. |
| #2 | For a profile stating specific equipment and a day count, no plan the system reports as acceptable contains equipment outside that list or a different number of sessions. Goal-consistency is out of scope — see the challenge cell. | "The validator returned ok" is not "the plan honors the guardrail" — and the goal check is not merely lenient, it is **absent**: the validator never reads the user's goal, so what is filed under `goal` is a goal-independent volume-sanity check. Separately, soft-failure plans being shown and savable is an *accepted decision*, so a test must characterize it, not fail on it. | The violation contract and its categories; what soft vs. hard failure means downstream; whether save accepts a plan carrying violations; whether equipment is decided by a structured tag or by parsing exercise names. | Unit — the validation logic is a pure function; table-driven cases over profile/plan pairs. Better still, drive the whole decision: the generator takes its model client as a parameter, so a fake client exercises the retry loop and the `ok` computation at the same cost. | **The oracle problem.** A test that re-derives the expected result by re-implementing the validator, then compares the validator to itself, green-lights current behavior including current bugs. The oracle must come from the input profile and the PRD guardrail, never from the code under test. |
| #3 | A plan saved in one session, read back in a later one, is structurally identical and still parses against the current schema. | "It returned 200" is not "it comes back the same." Snapshot shape drift between write-time and read-time types is documented, and older stored rows were written under the older shape. | The stored document shape and whether it is versioned; what happens to rows written before the shape changed; how a read-time database error is surfaced today. | Integration — a real write-then-read round trip. | Asserting only on id or row count. That passes while the document silently loses or renames fields. |
| #4 | Each documented model-side failure path ends in the defined error type plus a retryable UI — never a partial plan, never an unhandled 500. | "No block reason was set" is not "generation succeeded." A stop reason can end generation without one, and truncation produces text that fails to parse. | How provider responses map to the app's error type; the retry cap and its interaction with the platform's per-invocation subrequest limit; which failures are hard vs. soft. | Unit, with substituted responses at the provider SDK boundary. | Over-mocking internal modules instead of the SDK boundary; covering the happy path plus one error and calling it done. There are at least five distinct surfaces. |
| #5 | Split by direction, because only one half is provable without a database. **Rejection direction (unit, Phase 1):** every value a database constraint rejects is rejected earlier by the schema, and the suite goes red the moment the migration text changes. **Acceptance direction (integration, Phase 3):** every value the schema accepts is actually accepted by the database. | "The schema passed" is not "the database will take it." The two are maintained by hand and have drifted before. Also: a database CHECK that *looks* correct may not fire at all, so "the constraint exists" is not "the constraint holds." | The actual constraints and nullability declared in the migrations, next to what the schema permits — especially boundary values (zero, empty, absent vs. explicit null) and array non-emptiness. | Unit on the schema for boundaries, plus integration against the real database for the values where they could disagree. | Testing the schema in isolation. That is an implementation mirror — it proves the schema does what the schema does, and cannot detect drift from the database. |
| #6 | A plan with an absurd number of sessions or exercises is rejected before anything is persisted. | "The endpoint is behind auth" is not "it cannot be abused." One authenticated account is all it takes. | Whether any length or size cap exists anywhere on that path; at what point the request body is parsed relative to validation. | Integration on the write endpoint. | Asserting on byte size rather than on collection cardinality — the schema constrains shape, not length, so cardinality is the property that is actually unbounded. |
| #7 | A forced database or provider error produces a generic user-facing message, with the specific detail reaching only the server log. | "We fixed that one leak" is not "every error path is clean." Read paths are documented as still having no handling. | Which paths translate errors and which let them propagate; what the user-facing error surface actually renders. | Integration. | Asserting only on the status code. A 500 with a leaked message and a 500 with a generic one are the same status. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Runner bootstrap + plan soundness | Stand up the test runner and prove that a plan the system reports as acceptable actually honors the user's equipment, day count, and goal; wire the suite into CI so the floor is locked from the first test | #2, #5 (schema side) | unit, CI gate | complete | `context/changes/testing-plan-soundness/` |
| 2 | Account isolation | Prove automatically — not by two manual SQL sessions — that one account can never read another's plans or body metrics | #1 | integration | planned | `context/changes/testing-account-isolation/` |
| 3 | Persistence round-trip + boundary contracts | Prove a saved plan returns unchanged, and close the gap between what the schema accepts and what the database and storage will take | #3, #5, #6 | integration | not started | — |
| 4 | Model failure surfaces | Prove every documented model-side failure ends in a clean retryable error, and that no error path leaks internal detail | #4, #7 | unit, integration | not started | — |

Order rationale: the project has **no test base at all**, so Phase 1 must
bootstrap the runner — and it does so against Risk #2, the only High × High
row, whose subject is a pure function and therefore costs no test
infrastructure. Risk #1 outranks it as a product guardrail and is the user's
stated top fear, but proving it needs a live database and two real users; that
cost is paid in Phase 2, once the runner exists. Phases 3 and 4 reuse the
infrastructure the first two phases stand up.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 4.1.10 (checked: 2026-08-02) | `environment: "node"`, no Astro Vite plugin needed — the plan-validator, both zod schemas and the generator were shown by import-graph analysis to pull in `zod` alone, with no `astro:*` virtual module in the closure. The only config Vitest must supply that Astro gives for free is the `@/` → `./src` alias (tsconfig paths only). Peer `vite ^6\|^7\|^8` against the installed 7.3.6; engines allow CI's Node 22 |
| Workers-runtime tests | none yet — evaluate in §3 Phase 3 | — | `@cloudflare/vitest-pool-workers` runs tests inside workerd; v0.13.0 requires Vitest ≥ 4.1 and configures via a Vite plugin. Only justified if a risk genuinely needs runtime fidelity — the infrastructure note records that a past bug reproduced only under `wrangler dev`, never `astro dev` |
| database / isolation | none yet — see §3 Phase 2 | — | Needs two real authenticated users against a real project; the app deliberately holds no service-role key, so tests must go through the same anon-key + RLS path as production |
| e2e | none yet — evaluate in §3 Phase 2 | — | Playwright is the stack default, but Phase 2's risk may be provable at integration level for far less cost. Decide from research, not by default |
| accessibility | not planned | — | No risk in §2 points at it |
| AI-native | not planned | — | No §2 risk is cheaper to catch with a model than deterministically. Revisit only if one appears |

**Stack grounding tools (current session):**

- Docs: none — no Context7 or framework-docs MCP is available in this session; official documentation was reached through web search instead; checked: 2026-08-02
- Search: web search — verified the Workers Vitest integration's current version requirements and plugin-based configuration, and Astro's current testing guidance (Container API is still flagged experimental and may break in minor releases); checked: 2026-08-02
- Runtime/browser: none — no Playwright or browser MCP is exposed in this session. Playwright remains available as a library dependency, but not as an agent-driven tool; checked: 2026-08-02
- Provider/platform: no GitHub, Supabase, or Cloudflare MCP. The `gh` CLI (2.89) is installed and can drive CI gates; a JetBrains IDE MCP is exposed and can run lint, build, and inspections locally; checked: 2026-08-02

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local (pre-commit) + CI | required — already wired | syntactic / type drift |
| build | CI | required — already wired | broken SSR build, missing env schema |
| unit | local + CI | required after §3 Phase 1 | plan-soundness and schema-boundary regressions |
| integration (isolation) | CI | required after §3 Phase 2 | cross-account data exposure |
| integration (persistence + boundaries) | CI | required after §3 Phase 3 | round-trip drift, unbounded writes, schema/database disagreement |
| integration (error surfaces) | CI | required after §3 Phase 4 | model failures degrading badly, internal detail leaking |
| pre-prod smoke under the real runtime | between merge and prod | optional | environment-specific failures the local dev server cannot reproduce |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

Canonical example: `src/lib/services/plan-validator.test.ts` and
`src/lib/services/plan-generator.test.ts` (shipped in §3 Phase 1,
`context/changes/testing-plan-soundness/`).

Pattern: build a literal `(profile, plan)` fixture, then write the expected
guardrail set (or `ok`/`violations` shape) by hand from the profile and the
PRD guardrail sentence — never by calling the code under test and comparing
it to itself. This is the oracle-problem trap: a test that re-derives its
expected value from the same predicate it's checking will green-light
current behavior, bugs included. Assert on guardrail *categories*, not on
message text, unless the text itself is a functional contract (e.g. it is
fed back to an LLM as retry-correction input). Include at least one sound
negative control and single-property mutations off it, so the fixture is
provably sensitive to the property under test.

When the unit under test calls an external SDK (as `generatePlan` calls
`@google/genai`), prefer testing through the real orchestration with a
hand-written fake substituted only at the SDK-call boundary, over testing
the inner pure function alone — it costs the same and proves the guardrail
holds through retries and tie-breaks, not just in isolation. If the
behavior under test is a documented, *accepted* product decision (e.g. a
soft-failure plan being returned rather than thrown), write it as a
characterization test and say so in the test name/comment — don't fail the
suite on shipped, intentional behavior.

### 6.2 Adding a schema-boundary test

Canonical example: `src/lib/schemas/profile.test.ts` (shipped in §3 Phase 1,
`context/changes/testing-plan-soundness/`).

Pattern: transcribe each database CHECK constraint's bound into the test
with the exact SQL line quoted in a comment or describe title, then assert
boundary values (one just inside, one just outside) against the zod schema.
The migration file — not the schema's own source — is the oracle; testing
the schema in isolation is an implementation mirror and cannot detect drift.
Add a small guard alongside the boundary tests that reads the migration
`.sql` file at test time (resolve the path via
`fileURLToPath(new URL(...))`, not `__dirname`/`process.cwd()`, since this
repo is ESM) and asserts each transcribed clause still appears verbatim —
so an edited migration forces the test to be revisited.

**Know the guard's limit**: it detects drift (the transcription and the file
disagreeing), not incorrectness. A CHECK clause that was wrong from the
start — Postgres's `array_length(x, 1) >= 1` is a documented no-op for an
empty array, since `array_length('{}', 1)` is `NULL` and a CHECK passes on
`NULL` — will pass this guard forever, because its text never changes. State
that limitation inline wherever the pattern is reused, so it isn't mistaken
for proof the constraint actually holds. This class of bug (a value passing
both the schema and reaching the database, or the reverse) already shipped
once — see the training-profile impl review's zero-value finding.

### 6.3 Adding an account-isolation test

TBD — see §3 Phase 2. Will cover the pattern for exercising a route as two
distinct real users through the production auth path, and why a mocked
database client cannot substitute.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 3. Will cover the pattern for asserting the request →
response contract *and* the persisted side-effect, including the status matrix
each endpoint already documents.

### 6.5 Adding a test for a model-side failure path

TBD — see §3 Phase 4. Will cover the pattern for substituting provider
responses at the SDK boundary to drive each documented hard-failure surface.

### 6.6 Per-rollout-phase notes

(Filled in by each phase as it lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Visual layer and styling** — component appearance, utility-class output,
  responsiveness. Snapshot and visual tests here break constantly and catch
  little. Re-evaluate if a rendering regression ever reaches a user.
- **The Supabase and Gemini SDKs themselves** — third-party libraries are not
  under test. Only this project's code *at the boundary* with them is: error
  mapping, schema contracts, session handling.
- **Whether a plan is good training advice** — exercise selection quality,
  progression sensibility, coaching soundness. Not automatable. Only the
  formal guardrails are tested: equipment and day count.
  Re-evaluate only if the product starts making stronger quality claims.
- **Goal-consistency of a generated plan** — added 2026-08-02 after Phase 1
  research. The validator does not read the user's goal at all; the check
  labelled `goal` is a goal-independent volume-sanity band. Since nothing
  enforces goal-consistency, there is nothing to test, and the `goal` label
  must not be mistaken for coverage. Re-evaluate if a real goal check is
  ever implemented.
- **Astro component and SSR markup rendering** — the Container API is still
  experimental and may break in minor releases; the cost of tracking it
  exceeds the signal. Re-evaluate when that API is declared stable.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-02
- Stack versions last verified: 2026-08-02
- AI-native tool references last verified: 2026-08-02 (none adopted)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
