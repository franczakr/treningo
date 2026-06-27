---
project: Treningo
version: 1
status: draft
created: 2026-06-27
updated: 2026-06-27
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: Treningo

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Gym beginners have personal goals but don't know how to build a sound workout plan; the status quo (internet plans, PDFs, videos) is generic. Treningo's edge is **personalization** — a plan generated from the user's own goal, experience, equipment, training days, and current lifts, instead of a one-size-fits-all template. The riskiest assumption (the core hypothesis — the single belief that, if false, sinks the product) is that an automatically generated, parameter-respecting plan is good enough to beat a generic one.

## North star

**S-02: user generates and views a personalized plan from their profile** — this is the validation milestone (the smallest end-to-end slice whose successful delivery would prove the core product hypothesis; placed as early as Prerequisites allow because everything else only matters if this works). It is the moment of value in the PRD's Business Logic: the plan visibly reflects the inputs the user gave. Sequenced as early as its prerequisites (a logged-in user + a filled profile) permit.

## At a glance

| ID    | Change ID                      | Outcome (user can …)                                            | Prerequisites | PRD refs                  | Status   |
| ----- | ------------------------------ | --------------------------------------------------------------- | ------------- | ------------------------- | -------- |
| F-01  | data-rls-baseline              | (foundation) migration tooling + account-isolation RLS convention in place | —             | NFR (privacy), Access Control | ready    |
| S-01  | training-profile               | log in and fill in / save their training profile                | F-01          | FR-001, FR-002, US-01     | blocked  |
| S-02  | personalized-plan-generation   | generate and view a plan tailored to their profile (north star) | S-01          | FR-003, FR-004, US-01     | proposed |
| S-03  | save-plan                      | save a generated plan                                           | S-02, F-01    | FR-005, US-01             | proposed |
| S-04  | browse-saved-plans             | browse their saved plans and reopen one                         | S-03          | FR-006, US-01             | proposed |

## Baseline

What's already in place in the codebase as of `2026-06-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands + Tailwind 4 + shadcn/ui (`src/layouts/`, `src/components/ui/`; per `tech-stack.md`).
- **Backend / API:** present — Astro API routes, pattern established (`src/pages/api/auth/{signin,signup,signout}.ts`, `prerender = false`).
- **Data:** absent — no `supabase/migrations/`, no app tables, no `src/types.ts`; only Supabase `auth.users` exists.
- **Auth:** present — Supabase `@supabase/ssr`, `src/middleware.ts` guards `PROTECTED_ROUTES`, `/dashboard` redirects to signin; verified live this session.
- **Deploy / infra:** present — Cloudflare Workers, live at `treningo.franczakr066.workers.dev` (first deploy done 2026-06-27).
- **Observability:** partial — `observability.enabled` in `wrangler.jsonc` + `wrangler tail`; no app-level error tracking.

> Note for FR-003: no LLM SDK (Anthropic/OpenAI) is installed yet — the plan generator is introduced inside S-02, the first slice that needs it.

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
- **Status:** ready

## Slices

### S-01: Training profile

- **Outcome:** A logged-in user can fill in and save their training profile (goal, experience level, age, weight, available equipment, training days per week, current lifts, optional endurance metric).
- **Change ID:** training-profile
- **PRD refs:** FR-002 (must-have), FR-001 (must-have — login gate, satisfied by present auth baseline), US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Which profile fields are required vs optional, so the form doesn't block a beginner who doesn't know their current lifts or plank time — Owner: user. Block: yes.
- **Risk:** First user-facing data slice; applies the F-01 RLS convention to the profile table. Field-requiredness shapes the form's validation, so the open question gates a finalizable plan — hence blocked until resolved.
- **Status:** blocked

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
- **Status:** proposed

### S-03: Save a generated plan

- **Outcome:** A user can save a generated plan so it survives between sessions.
- **Change ID:** save-plan
- **PRD refs:** FR-005 (must-have), US-01, NFR (saved plan remains retrievable on every subsequent login)
- **Prerequisites:** S-02, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Adds the plans table under the F-01 RLS convention (account isolation). Low risk once F-01's pattern exists; the main care is persisting the generated plan structure faithfully.
- **Status:** proposed

### S-04: Browse saved plans

- **Outcome:** A user can browse their saved plans and reopen any one to view it again.
- **Change ID:** browse-saved-plans
- **PRD refs:** FR-006 (must-have), US-01
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Read-side of persistence; depends on saved plans existing. Closes the end-to-end loop in the Primary Success Criterion. Low risk.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                  | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------------ | ------------------------------------------------------ | --------------------- | ----- |
| F-01       | data-rls-baseline              | Data & account-isolation baseline (migrations + RLS)   | yes                   | Run `/10x-plan data-rls-baseline` |
| S-01       | training-profile               | Training profile capture & save                        | no                    | Blocked: resolve required-vs-optional fields first |
| S-02       | personalized-plan-generation   | Personalized plan generation + soundness validation    | no                    | Prereq S-01; north star |
| S-03       | save-plan                      | Save a generated plan                                  | no                    | Prereq S-02, F-01 |
| S-04       | browse-saved-plans             | Browse saved plans                                     | no                    | Prereq S-03 |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog.

## Open Roadmap Questions

1. **Which profile fields are required vs optional?** — so the input form doesn't block a true beginner who doesn't know their current lifts or plank time. Owner: user. Block: S-01 (and transitively the north star S-02). By: before plan-generation work starts.

## Parked

- **Manual plan editing** — Why parked: PRD §Non-Goals (deferred to v2; keeps MVP focused on generation + save).
- **Multiple plan variants (2–3 alternatives)** — Why parked: PRD §Non-Goals + Success Criteria §Secondary; v1 generates a single plan. With main_goal `speed`, this stays out of the must-have path.
- **Progress tracking / workout journal** — Why parked: PRD §Non-Goals (logging completed workouts, weight history, progression out of MVP scope).
- **Social / trainer features** — Why parked: PRD §Non-Goals (flat single-user-per-account model; no sharing, community, or roles).

## Done

(Empty on first generation. `/10x-archive` appends entries here when a change whose Change ID matches an item is archived.)
