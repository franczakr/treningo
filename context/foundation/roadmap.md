---
project: Treningo
version: 2
status: draft
created: 2026-06-27
updated: 2026-08-03
prd_version: 2
main_goal: quality
top_blocker: none
---

# Roadmap: Treningo

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.
>
> **v2 (2026-08-02)** — edited in place, not regenerated. The MVP chain (F-01, S-01…S-04) shipped
> and is left untouched below. What v2 adds is a second phase: every must-have FR is `done`, yet
> the PRD's Primary Success Criterion — a new user going end to end — is still not met, because the
> pages that satisfy those FRs are not reachable from one another. Sequencing bias moved from
> `speed` to `quality` now that every must-have requirement is delivered and the work left is finishing it.
>
> **Phase 2 complete (2026-08-02):** S-05, F-02, S-06, S-07, and S-08 are all implemented and
> impl-reviewed (APPROVED) — none archived yet. Every roadmap item currently defined is `done`.
> The PRD's Primary Success Criterion is now something the app can actually demonstrate end to end,
> and one consistent visual identity replaces the starter's stock theme on every page. Next step
> for each: `/10x-archive <change-id>` when ready to close the loop; beyond that, see `## Parked`
> for what's deliberately not in scope, or open a new PRD requirement to start a third phase.
>
> **S-09 added (2026-08-03):** browsing a saved plan (S-04) had no way to remove one — the list only
> ever grows. Added FR-007 to the PRD and S-09 (delete-plan) here, hand-added rather than through a
> full `/10x-roadmap` regeneration since every other item is `done` and this is one incremental slice.

## Vision recap

Gym beginners have personal goals but don't know how to build a sound workout plan; the status quo (internet plans, PDFs, videos) is generic. Treningo's edge is **personalization** — a plan generated from the user's own goal, experience, equipment, training days, and current lifts, instead of a one-size-fits-all template. The riskiest assumption (the core hypothesis — the single belief that, if false, sinks the product) is that an automatically generated, parameter-respecting plan is good enough to beat a generic one.

## North star

**Delivered (v2) — S-05: after saving a profile the user is carried straight into generating a plan, and after saving a plan straight through to their saved plans.**

This was the validation milestone for the second phase — the smallest end-to-end slice whose successful delivery proves the phase worked. It had no Prerequisites, so it was sequenced first and ran alongside the visual foundation F-02 (blocked at the time). Implemented 2026-08-02 (`2cab15f`, `b5e51c0`); not yet archived.

Why this one and not the visual work: the PRD's Business Logic describes this exact chain sentence by sentence — "the user encounters the rule right after completing their profile: they request a plan and immediately see one tailored to their parameters, which they can then save and revisit". Both joints in that chain were broken (`src/pages/api/profile.ts:58` returned the user to the profile form; `src/components/plan/PlanView.tsx:133` left them on the plan page with no route onward) until this slice closed them, making the Primary Success Criterion something the app can now actually demonstrate.

**Delivered (v1) — S-02: user generates and views a personalized plan from their profile.** This was the first phase's validation milestone: the moment of value in the PRD's Business Logic, where the plan visibly reflects the inputs the user gave. Shipped and archived 2026-06-28.

## At a glance

| ID    | Change ID                      | Outcome (user can …)                                            | Prerequisites | PRD refs                  | Status   |
| ----- | ------------------------------ | --------------------------------------------------------------- | ------------- | ------------------------- | -------- |
| F-01  | data-rls-baseline              | (foundation) migration tooling + account-isolation RLS convention in place | —             | NFR (privacy), Access Control | done     |
| S-01  | training-profile               | log in and fill in / save their training profile                | F-01          | FR-001, FR-002, US-01     | done     |
| S-02  | personalized-plan-generation   | generate and view a plan tailored to their profile (north star) | S-01          | FR-003, FR-004, US-01     | done     |
| S-03  | save-plan                      | save a generated plan                                           | S-02, F-01    | FR-005, US-01             | done     |
| S-04  | browse-saved-plans             | browse their saved plans and reopen one                         | S-03          | FR-006, US-01             | done     |
| S-05  | guided-plan-flow               | be carried from saving a profile into generating a plan, and from saving a plan through to their saved plans | —             | FR-002, FR-003, FR-005, FR-006, US-01, Business Logic | done     |
| F-02  | gym-visual-identity            | (foundation) one gym-themed colour + type system and a shared page shell exist for pages to build on | —             | NFR (visual identity)     | done     |
| S-06  | treningo-entry-point           | arrive on a Treningo home page offering sign-in and registration, and land on the dashboard after signing in | F-02          | FR-001, US-01, Access Control, NFR (visual identity) | done     |
| S-07  | app-header-nav                 | reach their profile, plan generation, saved plans and sign-out from any page once signed in | F-02          | FR-002, FR-003, FR-006, US-01 | done     |
| S-08  | retire-hardcoded-colours       | see every remaining page in the Treningo palette instead of stock starter colours | F-02, S-06, S-07 | US-01, NFR (visual identity) | done     |
| S-09  | delete-plan                    | delete a saved plan they no longer want                         | S-04          | FR-007, US-01             | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                                            | Note                                                                                                        |
| ------ | ---------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| A      | MVP core (closed)      | `F-01` → `S-01` → `S-02` → `S-03` → `S-04`        | Phase one. All `done` and archived; listed for continuity only.                                             |
| B      | User path              | `S-05`                                           | Done 2026-08-02, not yet archived. Standalone — had no Prerequisites, so it started immediately without waiting on Stream C. |
| C      | Visual identity        | `F-02` → `S-06` / `S-07` (parallel) → `S-08`      | All four done 2026-08-02, not yet archived. Matches `main_goal: quality` — tokens landed before any painted surface. |

## Baseline

What's already in place in the codebase as of `2026-08-02` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands + Tailwind 4; nine page routes under `src/pages/`. Navigation is the gap, not the framework: `src/components/Topbar.astro` is the only nav component and it is mounted solely inside `src/components/Welcome.astro:28`, so `/dashboard`, `/plan`, `/plans`, `/training-profile` and `/plan/[id]` all render with no header at all.
- **Backend / API:** present — six POST endpoints (`src/pages/api/auth/{signin,signup,signout}.ts`, `api/profile.ts`, `api/plan/generate.ts`, `api/plan/save.ts`), all `prerender = false`, all zod-validated.
- **Data:** present — `profiles` (`supabase/migrations/20260627202445_create_profiles.sql`) and `plans` (`20260628105841_create_plans.sql`), both RLS-enabled with the four per-operation own-row policies from the F-01 convention; `src/db/database.types.ts` generated.
- **Auth:** present — Supabase `@supabase/ssr`; `src/middleware.ts:4` guards `PROTECTED_ROUTES = ["/dashboard", "/training-profile", "/plan"]` by prefix match, so `/plans` and `/plan/[id]` are covered too. No redirect-away rule for a signed-in user sitting on `/auth/*` or `/`.
- **Deploy / infra:** present — Cloudflare Workers, live at `treningo.franczakr066.workers.dev`; GitHub Actions CI runs lint + build.
- **Observability:** partial — `observability.enabled` in `wrangler.jsonc:16-18`; logging is bare `console.error` in the API routes; no error-tracking SDK and no 404/500 pages under `src/pages`.
- **Design system:** partial — `src/styles/global.css` carries the stock shadcn `neutral` tokens verbatim (`--primary: oklch(0.205 0 0)` etc.), and the only real primitive in `src/components/ui/` is `button.tsx`. Roughly 192 hardcoded colour classes are spread across 19 files (`Topbar.astro:13` `text-purple-300`, `auth/SubmitButton.tsx:18` `bg-purple-600`, `Banner.astro:28-30` raw hex), a `.dark` block exists at `global.css:41-73` with nothing anywhere able to toggle it, and there is no font or typography rule in the repo at all.
- **Testing:** absent — no runner in `package.json`, no `test` script, no test files. Unchanged since v1.

> Superseded from v1: the `Data: absent` line and the note that no LLM SDK was installed. Both were
> closed by S-01 through S-03; the plan generator now runs on `@google/genai` via `src/lib/gemini.ts`.

## Foundations

### F-01: Data & account-isolation baseline

- **Outcome:** (foundation) Supabase migration tooling is initialized, a deny-by-default RLS policy convention for per-user data is established, and `src/types.ts` exists as the shared-entity-type location. No app tables yet beyond proving the convention — each data slice adds and exercises its own table.
- **Change ID:** data-rls-baseline
- **PRD refs:** NFR (personal/body data visible only to owner), Access Control (flat per-user model), Guardrails (account isolation, data privacy)
- **Unlocks:** S-01 (profile table applies the RLS convention), S-03 (plans table applies it); reduces the account-isolation / data-privacy guardrail risk by fixing the pattern once.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every data-touching slice depends on the RLS/account-isolation contract; getting deny-by-default wrong once would silently break the privacy guardrail across all tables. Kept minimal (tooling + convention) so it does not turn into a full data-layer build ahead of user-facing work.
- **Status:** done

### F-02: Gym visual identity & shared page shell

- **Outcome:** (foundation) One silver / grey / white colour system — system font stack, no dark theme, one steel-blue accent for calls-to-action — exists as tokens in `src/styles/global.css`, and a shared page shell with a slot for navigation is available for pages to adopt. From this point on no page invents its own colour.
- **Change ID:** gym-visual-identity
- **PRD refs:** NFR (visual identity) — added in PRD v2
- **Unlocks:** S-06 and S-07 (both build new user-facing surface and would otherwise be painted in the stock purples and then repainted), S-08 (the migration target it defines).
- **Prerequisites:** —
- **Parallel with:** S-05 (done)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced ahead of the visual slices because `main_goal` is `quality` and both S-06 and S-07 create new painted surface; building them first means building them twice. Deliberately capped at tokens + typography + shell — it does **not** restyle the 19 existing files (that is S-08), so S-06 and S-07 still exercise it through real user-facing behaviour rather than it landing as a finished UI layer nobody has used.
- **Status:** done

## Slices

### S-01: Training profile

- **Outcome:** A logged-in user can fill in and save their training profile (goal, experience level, age, weight, available equipment, training days per week, current lifts, optional endurance metric).
- **Change ID:** training-profile
- **PRD refs:** FR-002 (must-have), FR-001 (must-have — login gate, satisfied by present auth baseline), US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Which profile fields are required vs optional~~ — resolved at `/10x-plan` (2026-06-27): required = goal, experience, training days, age, weight; optional = current lifts (squat/bench/deadlift/OHP) + plank time.
- **Risk:** First user-facing data slice; applies the F-01 RLS convention to the profile table. Field-requiredness is now resolved (see plan), so the plan is finalizable.
- **Status:** done

### S-02: Personalized plan generation (north star)

- **Outcome:** A user with a completed profile can request a plan and immediately view one workout plan whose sessions, exercises, sets, reps, and suggested starting weights match their goal, experience, available equipment, and chosen training days.
- **Change ID:** personalized-plan-generation
- **PRD refs:** FR-003 (must-have), FR-004 (must-have), US-01, Guardrail (plan soundness)
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Generation approach within the chosen stack (LLM via Anthropic SDK + post-generation validation/retry vs template/rules fallback) — Owner: user/team. Block: no (decided at `/10x-plan`; tech-stack favors the LLM-plus-validation path).
- **Risk:** Highest-effort, highest-risk slice (PRD flags FR-003) and the top_blocker (time) concentrates here. The plan-soundness guardrail — only available equipment, exactly the chosen training days, consistency with the stated goal — must be enforced by a validation layer with retry, not trusted to the generator. This slice proves the core hypothesis; everything downstream only matters if it works.
- **Status:** done

### S-03: Save a generated plan

- **Outcome:** A user can save a generated plan so it survives between sessions.
- **Change ID:** save-plan
- **PRD refs:** FR-005 (must-have), US-01, NFR (saved plan remains retrievable on every subsequent login)
- **Prerequisites:** S-02, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Adds the plans table under the F-01 RLS convention (account isolation). Low risk once F-01's pattern exists; the main care is persisting the generated plan structure faithfully.
- **Status:** done

### S-04: Browse saved plans

- **Outcome:** A user can browse their saved plans and reopen any one to view it again.
- **Change ID:** browse-saved-plans
- **PRD refs:** FR-006 (must-have), US-01
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Read-side of persistence; depends on saved plans existing. Closes the end-to-end loop in the Primary Success Criterion. Low risk.
- **Status:** done

### S-05: Guided path forward (north star)

- **Outcome:** A user who saves their training profile is carried straight into generating a plan, and a user who saves a generated plan is given a direct way through to their saved plans.
- **Change ID:** guided-plan-flow
- **PRD refs:** FR-002, FR-003, FR-005, FR-006, US-01 (acceptance criterion "the user can save the plan and find it later among their saved plans"), Business Logic
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - ~~Should the jump into plan generation fire on every profile save, or only when the user has no plan yet?~~ — resolved at `/10x-plan` (2026-08-02): only when no profile existed before the save. `/plan` auto-generates on mount, so forwarding on every save would fire a ten-plus-second Gemini call on each profile edit. Detected by reading the profile before the upsert; a failed read degrades to the existing behaviour rather than failing the save.
- **Risk:** The north star, and deliberately not held behind F-02 despite `main_goal: quality` — it changes two redirect targets and adds one link, so it creates almost no painted surface to repaint later, and holding it behind a blocked foundation would stall the whole phase. The real care is the Unknown above: the guided path must lead a first-time user without trapping a returning one.
- **Status:** done

### S-06: Treningo entry point

- **Outcome:** A visitor arrives on a Treningo home page that offers signing in and registering, and after signing in lands on the dashboard instead of being returned to the starter page.
- **Change ID:** treningo-entry-point
- **PRD refs:** FR-001, US-01, Access Control, NFR (visual identity)
- **Prerequisites:** F-02
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - Is the signed-out hub the home page `/` itself, or does `/` forward to `/dashboard` with the dashboard rendering a signed-out variant? The request supports either reading. Planning assumes the first — a public `/` and a protected `/dashboard` — because `src/middleware.ts:4` already protects `/dashboard` and inverting that would mean unpicking the guard. — Owner: user. Block: no.
- **Risk:** Touches the one route with no auth guard, so a mistake here is visible to anyone who opens the site. Two concrete things to remove rather than restyle: `src/components/Welcome.astro:35-38` still announces "10x Astro Starter", and `src/pages/api/auth/signin.ts:19` redirects to `/` on success, which is what makes signing in feel like it did nothing.
- **Status:** done

### S-07: Persistent app header

- **Outcome:** Once signed in, a user reaches their profile, plan generation, saved plans and sign-out from any page — not only from the home page.
- **Change ID:** app-header-nav
- **PRD refs:** FR-002, FR-003, FR-006, US-01
- **Prerequisites:** F-02
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low risk, high reach — it is the escape hatch that makes every destination reachable even where the guided path of S-05 does not apply. Sequenced after F-02 because the header is new painted surface and is the single most-seen component in the app; building it before the shell exists guarantees rework.
- **Status:** done

### S-08: Retire the stock starter colours

- **Outcome:** Every remaining page renders in the Treningo palette; no page carries stock starter colours or invents its own.
- **Change ID:** retire-hardcoded-colours
- **PRD refs:** US-01 (the pages this journey runs through), NFR (visual identity)
- **Prerequisites:** F-02, S-06, S-07
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The largest surface in the phase (~192 colour classes across 19 files) but the lowest conceptual risk, so it is sequenced last, where it sweeps a settled shape rather than chasing a moving one. One thing to watch: `src/components/plan/PlanView.tsx` alone holds 22 colour hits and some of them carry meaning — a validation warning that is currently legible only because it is red must stay distinguishable once the palette is greyscale.
- **Status:** done — implemented `2026-08-02` across 4 phases (`0a9770f`, `b33c82b`, `ddf2d02`, `1c3ffd9`); impl-reviewed (APPROVED, 1 observation, no action needed); not yet archived, see `context/changes/retire-hardcoded-colours/`. The semantic-colour risk noted above held: error/warning/success were re-tuned for the light palette (not dropped), staying exactly as distinguishable as before.

### S-09: Delete a saved plan

- **Outcome:** A user can delete a saved plan they no longer want; it stops appearing in their saved-plans list and can no longer be reopened.
- **Change ID:** delete-plan
- **PRD refs:** FR-007 (must-have, added v2 2026-08-03), US-01, Guardrails (account isolation — a user may only delete their own plan)
- **Prerequisites:** S-04 (the saved-plans list this adds a control to)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — the `plans_delete_own` RLS policy already exists (`supabase/migrations/20260628105841_create_plans.sql:41`) and is already exercised as a negative-control probe in `plans.integration.test.ts` (user B's delete of user A's plan is rejected), so the isolation guardrail is proven; this slice only needs to add the application-level path (service method, API route, UI control) that a real owner uses to trigger it.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                  | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------------ | ------------------------------------------------------ | --------------------- | ----- |
| F-01       | data-rls-baseline              | Data & account-isolation baseline (migrations + RLS)   | done                  | Archived 2026-06-27 |
| S-01       | training-profile               | Training profile capture & save                        | done                  | Archived 2026-06-28 |
| S-02       | personalized-plan-generation   | Personalized plan generation + soundness validation    | done                  | Archived 2026-06-28 |
| S-03       | save-plan                      | Save a generated plan                                  | done                  | Archived 2026-06-29 |
| S-04       | browse-saved-plans             | Browse saved plans                                     | done                  | Archived 2026-07-03 |
| S-05       | guided-plan-flow               | Guided path: profile → generate → saved plans          | done                  | Implemented 2026-08-02 (`2cab15f`, `b5e51c0`); run `/10x-archive guided-plan-flow` when ready |
| F-02       | gym-visual-identity            | Gym visual identity: colour + type tokens & page shell | done                  | Implemented 2026-08-02 (`8a6531d`, `f0468f1`); run `/10x-archive gym-visual-identity` when ready |
| S-06       | treningo-entry-point           | Treningo home page & post-sign-in landing              | done                  | Implemented 2026-08-02 (`3859411`, `9c82e98`); run `/10x-archive treningo-entry-point` when ready |
| S-07       | app-header-nav                 | Persistent app header on every signed-in page          | done                  | Implemented 2026-08-02 (`cad7779`, `9f99ad4`, `06d68b2`); run `/10x-archive app-header-nav` when ready |
| S-08       | retire-hardcoded-colours       | Retire ~192 hardcoded colour classes across 19 files   | done                  | Implemented 2026-08-02 across 4 phases; run `/10x-archive retire-hardcoded-colours` when ready |
| S-09       | delete-plan                    | Delete a saved plan                                    | yes                   | Added 2026-08-03 (FR-007) |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog.

## Open Roadmap Questions

_None open._

### Resolved

1. ~~**Which profile fields are required vs optional?**~~ — Resolved 2026-06-27 (`/10x-plan training-profile`): required = goal, experience, training days, age, weight; optional = current lifts + plank time. Unblocked S-01.
2. ~~**What does "silver / grey / white" actually resolve to as a design system?**~~ — Resolved 2026-08-02: (a) typeface — system font stack, no webfont load; (b) dark theme — removed, `global.css:41-73`'s `.dark` block is deleted rather than finished; (c) call-to-action colour — one steel-blue accent hue, not pure contrast. Unblocked F-02, and through it S-06, S-07, S-08.

## Parked

- **Manual plan editing** — Why parked: PRD §Non-Goals (deferred to v2; keeps MVP focused on generation + save).
- **Multiple plan variants (2–3 alternatives)** — Why parked: PRD §Non-Goals + Success Criteria §Secondary; v1 generates a single plan. Still parked under `main_goal: quality` — the second phase finishes the single-plan journey rather than widening it.
- **Error pages and app-level error tracking** — Why parked: no PRD requirement gates it, and the `Observability: partial` baseline line predates this phase. Surfaced by the v2 baseline probe (no 404/500 pages, logging is bare `console.error`); recorded here so it is a choice rather than an oversight.
- **Progress tracking / workout journal** — Why parked: PRD §Non-Goals (logging completed workouts, weight history, progression out of MVP scope).
- **Social / trainer features** — Why parked: PRD §Non-Goals (flat single-user-per-account model; no sharing, community, or roles).

## Done

- **F-01: (foundation) migration tooling + account-isolation RLS convention in place** — Archived 2026-06-27 → `context/archive/2026-06-27-data-rls-baseline/`. Lesson: —.
- **S-01: A logged-in user can fill in and save their training profile (goal, experience level, age, weight, available equipment, training days per week, current lifts, optional endurance metric).** — Archived 2026-06-28 → `context/archive/2026-06-27-training-profile/`. Lesson: —.
- **S-02: A user with a completed profile can request a plan and immediately view one workout plan whose sessions, exercises, sets, reps, and suggested starting weights match their goal, experience, available equipment, and chosen training days.** — Archived 2026-06-28 → `context/archive/2026-06-28-personalized-plan-generation/`. Lesson: —.
- **S-03: A user can save a generated plan so it survives between sessions.** — Archived 2026-06-29 → `context/archive/2026-06-28-save-plan/`. Lesson: —.
- **S-04: A user can browse their saved plans and reopen any one to view it again.** — Archived 2026-07-03 → `context/archive/2026-06-29-browse-saved-plans/`. Lesson: —.
- **S-05: A user who saves their training profile is carried straight into generating a plan, and a user who saves a generated plan is given a direct way through to their saved plans.** — Archived 2026-08-03 → `context/archive/2026-08-02-guided-plan-flow/`. Lesson: —.
- **F-02: (foundation) One silver / grey / white colour system — system font stack, no dark theme, one steel-blue accent for calls-to-action — exists as tokens in `src/styles/global.css`, and a shared page shell with a slot for navigation is available for pages to adopt. From this point on no page invents its own colour.** — Archived 2026-08-03 → `context/archive/2026-08-02-gym-visual-identity/`. Lesson: —.
- **S-06: A visitor arrives on a Treningo home page that offers signing in and registering, and after signing in lands on the dashboard instead of being returned to the starter page.** — Archived 2026-08-03 → `context/archive/2026-08-02-treningo-entry-point/`. Lesson: —.
- **S-07: Once signed in, a user reaches their profile, plan generation, saved plans and sign-out from any page — not only from the home page.** — Archived 2026-08-03 → `context/archive/2026-08-02-app-header-nav/`. Lesson: —.
