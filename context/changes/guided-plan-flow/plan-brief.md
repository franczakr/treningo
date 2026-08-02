# Guided Path Forward — Plan Brief

> Full plan: `context/changes/guided-plan-flow/plan.md`
> Roadmap slice: `context/foundation/roadmap.md` → S-05 (north star, roadmap v2)

## What & Why

Every must-have requirement in the PRD is delivered, yet the Primary Success Criterion — "a new user can sign up, fill in their profile, receive a plan, save it, and browse it later — end to end" — is still not something the app can demonstrate, because the pages that satisfy those requirements do not lead to one another. PRD §Business Logic describes the chain sentence by sentence; both of its joints are broken. This change closes them.

## Starting Point

Saving a training profile returns the user to the form they just submitted (`src/pages/api/profile.ts:58`), with a confirmation banner and no hint that a plan can now be generated. Saving a generated plan flips a button to "Zapisano" (`src/components/plan/PlanView.tsx:133`) and stops — `/plans` exists and works, but nothing links to it.

## Desired End State

A first-time user completes the profile form, presses save, and arrives on the plan page with generation already running — no navigation required of them. When they save that plan, a link to their saved plans appears beside the confirmation. A returning user who edits their profile still lands back on the form with today's banner, and no generation fires.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| When the profile save forwards to generation | Only when no profile existed before | `/plan` auto-generates on mount, so forwarding on every save would fire a ten-plus-second Gemini call and burn free-tier quota every time someone corrects their body weight. | Plan |
| How to detect a first save | Read the profile before upserting | `upsertProfile` returns only `{ error }` and cannot report insert-vs-update; the pre-read is one indexed query on a unique column. | Plan |
| What happens if that pre-read fails | Treat as "not a first save", never fail the save | The profile has been written either way; losing the forward is a far smaller harm than turning a successful save into an error. | Plan |
| Route onward after saving a plan | A visible link to `/plans`, not a redirect | The generation page is the only place the user sees the full plan right after creating it; yanking them away to prove the save worked is a worse trade than letting them choose. | Plan |
| Link target | The list `/plans`, not `/plan/{id}` | A deep link would need a new id in the endpoint contract and would only show a copy of what is already on screen — the list is what proves the plan joined their collection. | Plan |
| Scope boundary | These two joints only | Navigation chrome is S-07 and the palette is F-02/S-08, both blocked on open design decisions. | Roadmap |

## Scope

**In scope:**
- Conditional success redirect in `POST /api/profile` (first save → `/plan`)
- A saved-state link to `/plans` in the plan view island

**Out of scope:**
- Persistent header / navigation chrome (S-07)
- Any restyling — the new link inherits surrounding colours (S-08)
- Changes to the `/api/plan/save` response contract
- Landing page and post-sign-in redirect (S-06)
- A test harness

## Architecture / Approach

Two phases split by layer, so each is independently verifiable and neither depends on the other. Phase 1 is server-side: one added `getProfile` call before the existing upsert in `src/pages/api/profile.ts`, and a conditional redirect target. Phase 2 is client-side: one conditional link in `src/components/plan/PlanView.tsx`, keyed off the `saveStatus === "saved"` state that already exists. No schema change, no new endpoint, no new service function.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Forward into generation on first profile save | A first-time user is carried from profile straight into plan generation | The read must precede the upsert — after it, the first-save signal is gone; and a failed read must degrade rather than fail the save |
| 2. Route onward from a saved plan | A saved plan offers a visible way through to saved plans | Low — `regenerate()` already resets `saveStatus`, so the link's disappearance needs no new state handling |

**Prerequisites:** None. S-05 has no roadmap dependencies and is the only `ready` item; it deliberately does not wait on the blocked F-02.
**Estimated effort:** Two small phases, two files touched.

## Open Risks & Assumptions

- **No automated safety net.** There is no test runner in the repo, so both phases are verified by lint, build, and manual walkthrough only. A regression in these redirects would not be caught by CI.
- **No existing account will ever see the forward**, since every current user already has a profile row. Testing phase 1 requires an account without one (or deleting the row in Supabase Studio).
- **Assumption:** landing on a page that immediately starts a ten-plus-second generation reads as progress rather than as a hang. If manual testing says otherwise, the fix belongs to the plan page's loading state, not to this redirect.

## Success Criteria (Summary)

- A user with no profile goes profile → generation → save → saved plans without typing a URL or being told where to click
- A user editing an existing profile is not dropped into generation and sees no behaviour change
- The PRD's Primary Success Criterion becomes a path that can be walked and shown
