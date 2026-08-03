# Delete a Saved Plan — Plan Brief

> Full plan: `context/changes/delete-plan/plan.md`

## What & Why

A signed-in user can delete a saved plan they no longer want. Roadmap slice S-09 and PRD FR-007 (added 2026-08-03): browsing saved plans (FR-006) had no way to remove one, so the list only ever grows.

## Starting Point

`src/lib/services/plans.ts` has `savePlan`/`getPlans`/`getPlanById` but no delete. The `plans_delete_own` RLS policy already exists and is already proven by a negative-control test (cross-account delete rejected) — only the application-level path (service + route + UI) is missing. Both surfaces that need a delete control — `dashboard.astro` (the list) and `plan/[id].astro` (the detail page) — are plain server-rendered Astro pages, no React island.

## Desired End State

From the dashboard list or a plan's detail page, a user can click delete, confirm a native dialog, and the plan is gone — removed from the list and no longer reachable at its URL (redirects to the dashboard, same as any other missing/foreign plan id today).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Bulk delete | Single-plan only | Matches the roadmap outcome and PRD FR-007 exactly; bulk isn't asked for anywhere. | Plan (user-confirmed) |
| Placement | Both dashboard list and detail page | Covers both moments a user decides to delete — skimming the list, or after opening a plan. | Plan (user-confirmed) |
| Confirmation UX | Native `confirm()` | Zero new UI, consistent with this app's plain-HTML-form mutation style everywhere else; no undo exists anywhere in the app. | Plan (user-confirmed) |
| Test depth | Add an owner-delete integration test | Today's only delete test is a negative control (wrong user rejected) — nothing proves the happy path actually works. | Plan (user-confirmed) |
| Mutation shape | Plain `<form method="POST">` + redirect, not a JSON API | Matches every mutation in this app except `/api/plan/save`, which only differs because its caller is an interactive React island. | Plan |
| Success redirect | Always `/dashboard`, no `return_to` | Matches `profile.ts`'s fixed-target redirect precedent; avoids new state for a rare error path. | Plan |

## Scope

**In scope:** `deletePlan` service function, `POST /api/plan/delete` route, delete controls on both `dashboard.astro` and `plan/[id].astro`, one new integration test.

**Out of scope:** bulk delete, soft-delete/undo/trash, custom styled confirmation dialog, any RLS/migration changes (the policy already exists).

## Architecture / Approach

Thin service function → plain-form API route (auth guard, redirect-on-error, matching `profile.ts`) → two small UI additions on already-existing pages. No new client-side framework usage.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Delete service, route, positive-control test | `deletePlan`, `/api/plan/delete`, and a real owner-delete test | The new test must not reuse the shared `planId` other tests in the file depend on still existing |
| 2. Delete controls on list + detail page | Confirm-then-delete UI on both surfaces | `<form>` can't nest inside the existing row `<a>` — must be a sibling |

**Prerequisites:** S-04 (browse-saved-plans) — the list and detail pages this adds controls to.
**Estimated effort:** Small — 2 phases, no new data model or auth logic.

## Open Risks & Assumptions

- Assumes deleting from the detail page redirecting to `/dashboard` (rather than back to wherever the user came from) is acceptable — this matches existing app precedent (`profile.ts`'s fixed redirect target) rather than adding a `return_to` field.

## Success Criteria (Summary)

- A user can delete their own saved plan from either the list or its detail page, with a confirmation step.
- A deleted plan is gone from the list and its URL redirects to the dashboard.
- Automated: `npm run test:integration`, `npm run lint`, `npm run build` all pass.
