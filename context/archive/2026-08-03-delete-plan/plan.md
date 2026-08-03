# Delete a Saved Plan — Implementation Plan

## Overview

Let a signed-in user delete a saved plan they no longer want, from both the saved-plans list (`dashboard.astro`) and the plan detail page (`plan/[id].astro`). Implements roadmap S-09 / PRD FR-007.

## Current State Analysis

- `src/lib/services/plans.ts` has `savePlan`, `getPlans`, `getPlanById` — all thin wrappers around Supabase, scoped by `user_id` (defense in depth alongside RLS). There is no `deletePlan`.
- The `plans_delete_own` RLS policy already exists (`supabase/migrations/20260628105841_create_plans.sql:41`) and is already exercised as a negative-control probe in `src/lib/services/plans.integration.test.ts:99` ("user B cannot delete user A's plan") — the isolation guardrail is proven. Nothing at the database layer needs to change.
- `src/pages/dashboard.astro` renders the saved-plans list as a plain Astro page: each plan is a full-row `<a href="/plan/{id}">` inside an `<li>` (lines 56-68). There is no React island here.
- `src/pages/plan/[id].astro` renders a single saved plan, also plain Astro, with a "← Panel" link back to the dashboard.
- Every existing mutation in this app (`src/pages/api/auth/{signup,signin}.ts`, `src/pages/api/profile.ts`) uses a plain `<form method="POST">` that redirects on completion — never a fetch-based JSON API — except `src/pages/api/plan/save.ts`, which returns JSON specifically because its caller, `PlanView.tsx`, is an interactive React island that branches on status code. Delete has no such island, so the plain-form + redirect convention applies directly.
- `src/pages/api/profile.ts` establishes the redirect-on-error pattern this plan follows: a local `redirectWithError` helper that redirects to a fixed path with an `?error=` query param; a fixed success redirect target.

## Desired End State

A signed-in user can delete any of their own saved plans, triggered from either the dashboard list or the plan's detail page, with a native browser confirmation before it fires. After deleting, they land on the dashboard and the plan is gone from the list and no longer reachable at `/plan/{id}` (redirects to the dashboard, matching the existing not-found behavior). Deleting another user's plan is impossible (already enforced by RLS; this plan adds no new attack surface since the API route always derives `user_id` from the session).

Verify: sign in, save a plan (existing flow), see it on the dashboard, delete it from the list (confirm dialog fires, plan disappears) — then save another plan, open its detail page, delete it from there (redirects to dashboard, plan gone). `npm run test:integration` passes including the new owner-delete case.

### Key Discoveries:

- `getPlanById(supabase, userId, planId)` (`src/lib/services/plans.ts:42`) already double-filters on `user_id` AND `id` — the new `deletePlan` follows the identical shape.
- `plans.integration.test.ts` shares one `planId` across all its `it` blocks via `beforeAll` (`src/lib/services/plans.integration.test.ts:49-60`), and its last test ("user B cannot delete user A's plan", line 99) asserts that shared row **still exists** afterward. A new "owner can delete their own plan" test must NOT reuse that shared `planId` and must NOT run in a position that deletes it before later tests need it — see Critical Implementation Details below.

## What We're NOT Doing

- No bulk / multi-select delete — single-plan delete only (roadmap S-09 outcome, PRD FR-007).
- No custom styled confirmation dialog/modal — native `confirm()`, matching this app's existing zero-modal-infrastructure style.
- No soft-delete / undo / trash — a delete is permanent, matching how every other mutation in this app already works (no undo anywhere).
- No changes to RLS policies or migrations — `plans_delete_own` already exists and is already proven by the existing negative-control test.

## Implementation Approach

Add a `deletePlan` service function mirroring the existing `plans.ts` functions, a `POST /api/plan/delete` route following `profile.ts`'s redirect-on-error convention, and plain `<form>` + `confirm()` delete controls on both surfaces — no new client-side JS framework usage, no new API response shape.

## Critical Implementation Details

- **Test ordering / shared state**: `plans.integration.test.ts`'s existing tests share one seeded plan (`planId`) across the whole `describe` block via `beforeAll`, and the last test depends on that row still existing. The new owner-delete positive-control test must create and delete its **own** plan (either a second `savePlan` call for `userA` inside its own `it` block, or its own dedicated test user) — never the shared `planId` — so it has no ordering dependency on the other tests in the file.

## Phase 1: Delete service, API route, and positive-control test

### Overview

Add the data-access function, the API route that drives it, and prove a real owner-delete actually works end to end against the database (closing the one gap the existing negative-control test doesn't cover).

### Changes Required:

#### 1. Delete service function

**File**: `src/lib/services/plans.ts`

**Intent**: Add `deletePlan` so the API route has a thin, testable data-access call, matching the existing `savePlan` / `getPlanById` shape and doc-comment style in this file.

**Contract**: `deletePlan(supabase: Client, userId: string, planId: string): Promise<{ error: PostgrestError | null }>` — deletes from `plans` filtered on both `.eq("user_id", userId)` and `.eq("id", planId)` (same double-filter defense-in-depth as `getPlanById`), returning `{ error }` in the same shape as `savePlan`.

#### 2. Delete API route

**File**: `src/pages/api/plan/delete.ts` (new)

**Intent**: Auth-guard the mutation, read the plan id from the posted form, call `deletePlan`, and redirect — following `src/pages/api/profile.ts`'s exact pattern (auth guard via `context.locals.user` redirecting to `/auth/signin`, a local `redirectWithError` helper redirecting to a fixed path with `?error=`, `export const prerender = false`).

**Contract**:
- `POST /api/plan/delete`, form field `plan_id` (string).
- No auth (`context.locals.user` missing) → redirect to `/auth/signin`, matching `profile.ts`.
- Missing/empty `plan_id` → redirect to `/dashboard?error=` with a friendly message (e.g. "Nie udało się usunąć planu.") — treat as the same failure class as a DB error rather than a separate case.
- `deletePlan` error → `console.error` the raw error server-side (matching the `// eslint-disable-next-line no-console -- deliberate server-side error log` pattern already used in `profile.ts` and `plan/save.ts`), redirect to `/dashboard?error=` with a friendly Polish message.
- Success → redirect to `/dashboard` (no query param). Fixed target regardless of which page the form was submitted from, matching `profile.ts`'s fixed `PROFILE_PATH` redirect precedent — no `return_to` field.

#### 3. Positive-control integration test

**File**: `src/lib/services/plans.integration.test.ts`

**Intent**: Prove `deletePlan` actually removes the owner's row — today only the cross-account negative control exists, so nothing currently proves the happy path works.

**Contract**: A new `it` block (e.g. inside the existing `describe("plans account isolation", …)` or a sibling `describe`) that: saves a second plan for `userA` via `savePlan`, reads its id back via `getPlans` (filter out the shared `planId` from `beforeAll`, or take the newly-returned row), calls `deletePlan(userA.client, userA.userId, <that id>)`, asserts `{ error: null }`, then asserts `getPlanById(userA.client, userA.userId, <that id>)` now returns `null`. Must not touch the shared `planId` from `beforeAll` (see Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes, including the new owner-delete case
- `npm run lint` passes on all new/changed files
- `npm run test` (unit suite) remains unaffected

#### Manual Verification:

- Calling `POST /api/plan/delete` with a valid session and a plan id you own actually removes the row (spot-check via the dashboard list before/after)

---

## Phase 2: Delete controls on the list and detail page

### Overview

Wire the API route into both surfaces the roadmap slice names: the dashboard's saved-plans list, and the individual plan detail page.

### Changes Required:

#### 1. Dashboard list delete control

**File**: `src/pages/dashboard.astro`

**Intent**: Add a delete action to each plan row without breaking the existing full-row link to `/plan/{id}`.

**Contract**: Each `<li>` (currently a single `<a>` wrapping the whole row, lines 56-68) becomes a flex container holding the existing `<a>` alongside a small `<form method="POST" action="/api/plan/delete">` with a hidden `plan_id` input and a submit button, `onsubmit="return confirm('Usunąć ten plan?')"`. An HTML `<form>` cannot be nested inside an `<a>`, so the form is a sibling of the `<a>`, not a child — keep both inside the same `<li>`.

#### 2. Detail page delete control

**File**: `src/pages/plan/[id].astro`

**Intent**: Let a user delete the plan they're currently viewing.

**Contract**: Add the same `<form method="POST" action="/api/plan/delete">` pattern (hidden `plan_id` input set to `saved.id`, `onsubmit="return confirm('Usunąć ten plan?')"`) near the existing "← Panel" link.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on both changed files
- `npm run build` succeeds

#### Manual Verification:

- From the dashboard, deleting a plan shows a confirm dialog; confirming removes it from the list and the page ends up back on `/dashboard`
- Cancelling the confirm dialog leaves the plan untouched
- From a plan's detail page, deleting it redirects to `/dashboard` and the plan is gone from the list
- Attempting to open a deleted plan's URL directly (`/plan/{deleted-id}`) redirects to `/dashboard` (existing not-found behavior in `plan/[id].astro:18-20`, unchanged but now reachable via a real deleted id)

---

## Testing Strategy

### Integration Tests:

- New owner-delete positive control in `plans.integration.test.ts` (Phase 1) — proves the happy path a mock could never prove.
- Existing negative-control test (cross-account delete rejected) continues to pass unmodified.

### Manual Testing Steps:

1. Sign in, save a plan, confirm it appears on the dashboard.
2. Delete it from the dashboard list; confirm dialog appears; accept; plan disappears; page is on `/dashboard`.
3. Save another plan, open its detail page, delete it from there; confirm dialog appears; accept; redirected to `/dashboard`; plan is gone.
4. Save a third plan, click delete, cancel the confirm dialog; plan is still present.

## Migration Notes

None — no schema or RLS changes; `plans_delete_own` already exists.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-09
- PRD requirement: `context/foundation/prd.md` FR-007
- Existing RLS delete policy: `supabase/migrations/20260628105841_create_plans.sql:41`
- Existing negative-control test: `src/lib/services/plans.integration.test.ts:99`
- Redirect-on-error convention to follow: `src/pages/api/profile.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Delete service, API route, and positive-control test

#### Automated

- [x] 1.1 `npm run test:integration` passes, including the new owner-delete case — 93345fb
- [x] 1.2 `npm run lint` passes on all new/changed files — 93345fb
- [x] 1.3 `npm run test` (unit suite) remains unaffected — 93345fb

#### Manual

- [x] 1.4 Calling `POST /api/plan/delete` with a valid session and a plan id you own actually removes the row — 93345fb

### Phase 2: Delete controls on the list and detail page

#### Automated

- [x] 2.1 `npm run lint` passes on both changed files — 20aeffb
- [x] 2.2 `npm run build` succeeds — 20aeffb

#### Manual

- [x] 2.3 Dashboard delete: confirm dialog fires, confirming removes the plan and lands on `/dashboard` — 20aeffb
- [x] 2.4 Cancelling the confirm dialog leaves the plan untouched — 20aeffb
- [x] 2.5 Detail-page delete redirects to `/dashboard` and the plan is gone — 20aeffb
- [x] 2.6 Opening a deleted plan's URL directly redirects to `/dashboard` — 20aeffb
