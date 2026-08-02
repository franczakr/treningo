# Guided Path Forward Implementation Plan

## Overview

Close the two broken joints in the user journey so the PRD's Primary Success Criterion becomes something the app can actually demonstrate: a first-time user who saves their training profile is carried straight into generating a plan, and a user who saves a generated plan is given a visible route onward to their saved plans.

This is roadmap slice **S-05**, the north star of roadmap v2's second phase.

## Current State Analysis

Every must-have FR (FR-001…FR-006) is delivered and archived. The pages exist; they simply do not lead to one another.

- **Joint 1 — profile → generation.** `POST /api/profile` is a plain form post that ends in a server redirect back to the form it came from (`src/pages/api/profile.ts:58` → `/training-profile?saved=1`). The user sees a "Profil zapisany." banner (`src/components/profile/TrainingProfileForm.tsx:133`) and nothing else. Nothing suggests a plan can now be generated.
- **Joint 2 — saved plan → saved plans.** `POST /api/plan/save` returns `{ ok: true }` (`src/pages/api/plan/save.ts:70`). The island flips its button to "Zapisano" (`src/components/plan/PlanView.tsx:133`, rendered at `:197`) and stops there. The only controls on the page are Save and Regenerate (`:168-171`). `/plans` exists and works, but nothing links to it.

Constraints discovered while reading the code:

- **`upsertProfile` cannot tell you whether it inserted or updated.** It is a single Supabase `upsert` keyed on `user_id` (`src/lib/services/profile.ts:29`) returning only `{ error }`. Distinguishing a first save from an edit requires reading the profile before writing it.
- **`/plan` is not a neutral destination.** `PlanView` auto-generates on mount (`src/components/plan/PlanView.tsx:86`), so redirecting there immediately starts a Gemini call that takes on the order of ten-plus seconds and consumes free-tier quota. This is the entire reason the forward is gated on first save rather than applied to every save.
- **No loop risk.** `src/pages/plan.astro:16` redirects profile-less users back to `/training-profile`, but the forward only fires after a *successful* upsert, so the profile always exists by then.
- **Regenerate already resets save state.** `regenerate()` sets `saveStatus` back to `"idle"` (`src/components/plan/PlanView.tsx:112`), so a saved-state affordance disappears on regenerate with no extra work.
- **No test runner exists.** `package.json` has no `test` script and no Vitest/Playwright install. Automated verification is limited to `npm run lint` (ESLint with type-checked rules) and `npm run build`.

## Desired End State

A user who has never filled in a training profile completes the form, presses save, and arrives on the plan page with generation already under way — without being told to navigate anywhere. When they save that plan, a link to their saved plans appears beside the confirmation, and following it shows the plan they just saved at the top of the list.

A user who already has a profile and returns only to correct a value still lands back on the profile form with the existing "Profil zapisany." confirmation, and no generation is triggered.

Verify by walking both paths in the browser (see Testing Strategy) — there is no automated harness to assert them.

### Key Discoveries:

- `src/pages/api/profile.ts:58` is the single redirect that owns joint 1; the error paths at `:11` and `:19` are separate and stay untouched.
- `src/lib/services/profile.ts:13` already exports `getProfile`, so joint 1 needs no new service function — only an added import and an extra call.
- `src/components/plan/PlanView.tsx:133` is the only place `saveStatus` becomes `"saved"`; the affordance for joint 2 keys off that single state value.
- The codebase's established pattern for form endpoints is a server-side redirect carrying state in the query string (`src/pages/api/auth/signup.ts:19`, `src/pages/api/profile.ts:11`). Joint 1 follows it.
- The established pattern for islands is branching on distinct HTTP status codes and using `window.location.assign` only for auth redirects (`src/components/plan/PlanView.tsx:21-22, 46`). Joint 2 deliberately does *not* navigate — it renders a link.

## What We're NOT Doing

- **No persistent header or navigation chrome.** That is roadmap S-07 and sits behind F-02.
- **No restyling.** The new link inherits the surrounding hardcoded colours; retiring those is S-08.
- **No change to the `/api/plan/save` contract.** The endpoint keeps returning `{ ok: true }`; we are not adding a saved-plan id, because the chosen destination is the list, not a deep link.
- **No change to the landing page or post-sign-in redirect.** That is S-06.
- **No plan editing, no plan deletion, no multiple variants** — all PRD non-goals.
- **No test harness.** Introducing one is out of scope for this slice.

## Implementation Approach

Two phases, split by layer so each is independently verifiable: joint 1 is entirely server-side (one endpoint, one added read), joint 2 is entirely client-side (one island, one conditional element). Neither depends on the other, but doing the server side first means the guided path exists end to end before the affordance that completes it is added.

## Critical Implementation Details

**Timing & lifecycle.** The profile read must happen *before* the upsert — after it, the row always exists and the "first save" signal is destroyed. Equally important: a failing read must not fail the save. If `getProfile` throws, treat it as "not a first save" and fall back to the existing `?saved=1` redirect. The user's profile has been written either way, and losing the forward is a far smaller harm than turning a successful save into an error. The page already takes this posture on read failure (`src/pages/training-profile.astro:17-21` degrades rather than 500s).

---

## Phase 1: Forward into generation on the first profile save

### Overview

Teach `POST /api/profile` to recognise a first-ever profile save and send the user to plan generation, while leaving every other outcome exactly as it behaves today.

### Changes Required:

#### 1. Profile endpoint

**File**: `src/pages/api/profile.ts`

**Intent**: Detect whether the user already had a profile before this request wrote one, and use that to choose the success redirect. A first save carries the user forward into generation — the moment PRD §Business Logic describes — while a re-save keeps today's stay-on-the-form-with-a-banner behaviour, so someone correcting their body weight is never dropped into a Gemini generation they did not ask for.

**Contract**: `getProfile` is imported from `@/lib/services/profile` and called before `upsertProfile`, with a thrown read error swallowed and treated as "profile already existed". On success the redirect target becomes conditional: `/plan` when no profile existed beforehand, otherwise the current `${PROFILE_PATH}?saved=1`. The unauthenticated guard (`:19`), the Supabase-not-configured path (`:24`), the validation-failure path (`:47`) and the upsert-failure path (`:55`) are all unchanged. `upsertProfile`'s signature is unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- A user with no saved profile fills the form, saves, and lands on `/plan` with generation under way
- A user who already has a profile re-saves and stays on `/training-profile` with the "Profil zapisany." banner, and no generation starts
- A validation failure still returns to `/training-profile` with the error message shown
- An unauthenticated POST to `/api/profile` still redirects to `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Route onward from a saved plan

### Overview

Give the user a visible way from a just-saved plan to their collection of saved plans, without taking them off the plan they are reading.

### Changes Required:

#### 1. Plan view island

**File**: `src/components/plan/PlanView.tsx`

**Intent**: Once a plan has been saved, offer a link through to `/plans` alongside the existing controls, so the journey PRD §Business Logic describes ("which they can then save and revisit") has somewhere to go. A link rather than a redirect, because the generation page is the only place the user sees the full plan immediately after creating it, and yanking them away from it to prove the save worked is a worse trade than letting them choose.

**Contract**: A link to `/plans` renders in the existing control row (`:168-171`) only while `saveStatus === "saved"`. No props, no API calls, and no changes to `savePlanRequest` or its `SaveOutcome` type. Because `regenerate()` already resets `saveStatus` to `"idle"` (`:112`), the link disappears when a new plan is generated and returns only after that plan is saved — no additional state handling required.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Saving a plan reveals a link to saved plans beside the "Zapisano" confirmation
- Following that link opens `/plans` with the just-saved plan at the top of the list
- Pressing "Wygeneruj ponownie" hides the link again until the new plan is saved
- A failed save shows the existing error message and no link appears

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

None. No test runner is installed (`package.json` has no `test` script and no Vitest/Playwright dependency), and this slice deliberately does not introduce one. Stating this plainly rather than listing tests that cannot be run.

### Integration Tests:

None, for the same reason.

### Manual Testing Steps:

1. **First-save path.** Using an account with no profile row (or after deleting the row via Supabase Studio), fill in the training profile and save. Expect to land on `/plan` with the generating state visible.
2. **Save the plan.** Once generation finishes, press "Zapisz plan". Expect the button to read "Zapisano" and a link to saved plans to appear next to it.
3. **Follow the link.** Expect `/plans` to open with the plan just saved at the top (the list is ordered newest-first, `src/lib/services/plans.ts:38`).
4. **Edit path.** Return to `/training-profile`, change the body weight, save. Expect to stay on the profile page with the "Profil zapisany." banner and **no** generation.
5. **Regenerate.** Back on `/plan`, save a plan, then press "Wygeneruj ponownie". Expect the saved-plans link to disappear until the new plan is saved.
6. **Validation error.** Submit the profile form with a required field cleared (bypassing the client check, e.g. via devtools). Expect the existing error redirect, not a forward to `/plan`.

## Performance Considerations

Phase 1 adds one extra read per profile save, against `profiles.user_id`, which is unique and indexed (`supabase/migrations/20260627202445_create_profiles.sql`). At the PRD's stated scale — small user count, low qps — this is negligible.

The change is net positive for cost: gating the forward on first save is precisely what prevents every profile edit from triggering an unwanted Gemini generation, which the "always forward" alternative would have done.

## Migration Notes

No schema change, no data migration, nothing to roll back beyond reverting the two files.

One behavioural note worth stating: every existing account already has a profile row, so no existing user will ever see the forward. It is a first-run affordance by design. Reverting is safe at any point — neither phase changes stored data or an API contract.

## References

- Roadmap slice: `context/foundation/roadmap.md` → `S-05: Guided path forward (north star)`
- Requirement source: `context/foundation/prd.md` → §Business Logic, §Success Criteria (Primary), US-01 acceptance criteria
- Redirect pattern to follow: `src/pages/api/auth/signup.ts:19`, `src/pages/api/profile.ts:11`
- Island state-branching pattern to follow: `src/components/plan/PlanView.tsx:46-51`
- Saved-plans list this links into: `src/pages/plans.astro`, `src/lib/services/plans.ts:33`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Forward into generation on the first profile save

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 2cab15f
- [x] 1.2 Production build succeeds: `npm run build` — 2cab15f

#### Manual

- [x] 1.3 A user with no saved profile fills the form, saves, and lands on `/plan` with generation under way — 2cab15f
- [x] 1.4 A user who already has a profile re-saves and stays on `/training-profile` with the "Profil zapisany." banner, and no generation starts — 2cab15f
- [x] 1.5 A validation failure still returns to `/training-profile` with the error message shown — 2cab15f
- [x] 1.6 An unauthenticated POST to `/api/profile` still redirects to `/auth/signin` — 2cab15f

### Phase 2: Route onward from a saved plan

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build succeeds: `npm run build`

#### Manual

- [x] 2.3 Saving a plan reveals a link to saved plans beside the "Zapisano" confirmation
- [x] 2.4 Following that link opens `/plans` with the just-saved plan at the top of the list
- [x] 2.5 Pressing "Wygeneruj ponownie" hides the link again until the new plan is saved
- [x] 2.6 A failed save shows the existing error message and no link appears
