# Browse Saved Plans (S-04) — Plan Brief

> Full plan: `context/changes/browse-saved-plans/plan.md`

## What & Why

Roadmap slice **S-04** (FR-006, US-01): let a logged-in user browse their saved
workout plans and reopen any one to view it again. S-03 made plans persist but
gave no way to see them afterwards — this closes the end-to-end loop in the
Primary Success Criterion (sign up → profile → generate → save → **browse later**).

## Starting Point

The `plans` table, its `select` RLS policy, the `savePlan` service, and `POST
/api/plan/save` already exist (S-03). The `SavedPlan`/`ProfileSnapshot` types and
the Polish `GOAL_OPTIONS` labels already exist in `src/types.ts`. The only gap is
read-side application code — there is no service read, no list page, no reopen
page, and the plan markup is locked inside `PlanView.tsx`.

## Desired End State

From the dashboard, "Moje plany" opens `/plans` — the user's saved plans
newest-first, each showing a Polish goal label + formatted save date and linking
to `/plan/<id>`, which re-renders the full plan exactly like the generate view. A
zero-plan user sees an empty-state with a "Generuj plan" CTA; a foreign/unknown id
redirects to `/plans`.

## Key Decisions Made

| Decision               | Choice                                  | Why (1 sentence)                                                              | Source |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Reopen mechanism       | Separate route `/plan/[id]`             | Mirrors the existing SSR page pattern; gives a bookmarkable per-plan URL.     | Plan   |
| Data fetch             | Server-side in the Astro page           | Matches `plan.astro`; RLS-scoped, no loading states, no new endpoints.        | Plan   |
| Render reuse           | Extract `SessionCard`/`ExerciseRow`     | One source of truth for plan markup; reopen view stays trivial.               | Plan   |
| List-item label        | Goal label + `pl-PL` date               | No title is stored; goal+date is meaningful and scannable.                    | Plan   |
| Entry point + route    | `/plans` + dashboard "Moje plany" link  | Already protected by middleware; matches how the dashboard links other pages. | Plan   |
| Empty state            | Message + CTA to `/plan`                | Guides the user back to the value loop, no dead end.                          | Plan   |

## Scope

**In scope:** `getPlans`/`getPlanById` service reads; extract shared plan markup;
`pl-PL` date helper; `/plans` list (goal+date, newest-first, empty-state CTA);
dashboard "Moje plany" link; `/plan/[id]` reopen page with not-found redirect.

**Out of scope:** new HTTP endpoints; plan editing/deleting; pagination/search;
title column; middleware change; any change to the generate flow's behavior.

## Architecture / Approach

Read-only vertical slice, server-rendered throughout. Both pages load data in
Astro frontmatter via the service (`Astro.locals.user.id` + RLS) — no client
fetch. `SessionCard`/`ExerciseRow` are extracted from `PlanView` into a shared
module imported by both the generate view and the reopen page. Middleware's
`startsWith("/plan")` already gates `/plans` and `/plan/[id]`.

## Phases at a Glance

| Phase                          | What it delivers                                              | Key risk                                              |
| ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------- |
| 1. Foundation                  | `getPlans`/`getPlanById`, extracted plan markup, date helper | Extraction regressing the working generate view       |
| 2. List `/plans`               | SSR list (goal+date), empty-state, dashboard link            | Goal-label/date derivation edge cases                 |
| 3. Reopen `/plan/[id]`         | SSR reopen page, not-found redirect, back link               | Foreign-id handling; React island mount in Astro page |

**Prerequisites:** S-03 (done) — `plans` table, RLS, save flow all in place.
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- The `SessionCard`/`ExerciseRow` extraction must be markup-identical so the
  generate view is unchanged (verified in Phase 1).
- `getPlanById` returns `null` for foreign/unknown ids (RLS + explicit `user_id`
  filter); the page treats `null` as a redirect to `/plans`.
- Rendering the shared React components in the reopen `.astro` page needs an island
  (`client:load`) or a thin island wrapper — the page itself is static.

## Success Criteria (Summary)

- A user can open "Moje plany", see their saved plans newest-first, and reopen any
  one to view the full plan.
- A user never sees or opens another user's plan (RLS; foreign id → `/plans`).
- A user with no saved plans gets a clear CTA back to plan generation.
