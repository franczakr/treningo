# Browse Saved Plans (S-04) Implementation Plan

## Overview

Roadmap slice **S-04** (FR-006, US-01): let a logged-in user **browse** their
saved workout plans and **reopen** any one to view it again. S-03 already
persists plans (the `plans` table, `savePlan` service, `POST /api/plan/save`) but
there is no read path — once the user navigates away from the generate view, a
saved plan is invisible. This slice adds the read functions, a `/plans` list, and
a `/plan/[id]` reopen page, closing the end-to-end loop in the Primary Success
Criterion. No new data model, no editing, no new HTTP endpoints.

## Current State Analysis

- **The data layer is complete.** `plans` (`20260628..._create_plans.sql`) has
  `id`, `user_id`, `plan` jsonb, `profile_snapshot` jsonb, `created_at`, the
  `plans_user_id_idx`, and all four deny-by-default RLS policies — including
  `plans_select_own` (`to authenticated`, `using (auth.uid() = user_id)`). The
  read side is already authorized; only application code is missing.
- **Service exposes only the write.** `src/lib/services/plans.ts` exports
  `savePlan(supabase, userId, plan, profileSnapshot)` with the
  `Client = SupabaseClient<Database>` alias. The read mirror does not exist yet.
- **The single-row read convention is set.** `src/lib/services/profile.ts`
  `getProfile` uses `.select("*").eq("user_id", userId).maybeSingle()` and
  **throws** on error. A multi-row read mirrors this with `.order(...)` and no
  `maybeSingle()`.
- **Domain types exist.** `src/types.ts` already defines `SavedPlan`
  (`Omit<Tables<"plans">, "plan" | "profile_snapshot"> & { plan: WorkoutPlan;
  profile_snapshot: ProfileSnapshot }`) and `ProfileSnapshot`. The read functions
  return these directly (cast from the generated `Json` row, as the save side
  already narrows).
- **Plan markup is inline in `PlanView.tsx`.** `SessionCard` (renders a session:
  numbered name, focus, exercise list) and `ExerciseRow` (name, `sets × reps`,
  `suggested_weight`, `rest_seconds` with Lucide `Dumbbell`/`Clock` icons) are
  declared **inside** `src/components/plan/PlanView.tsx`, not exported. Reopening
  a saved plan needs the same markup → extract them.
- **Page/route conventions are settled.** `src/pages/plan.astro` is the template:
  read `Astro.locals.user`, build the Supabase client, load data server-side via a
  service, redirect on a failed guard, mount an island (or render markup) inside a
  `<Layout>` + `bg-cosmic` centered wrapper. `dashboard.astro` shows the inline
  nav-link pattern (`<a href=…>` styled buttons) — there is **no** nav component.
- **Middleware already protects the routes.** `src/middleware.ts`
  `PROTECTED_ROUTES = ["/dashboard", "/training-profile", "/plan"]` matches with
  `startsWith`, so both `/plans` and `/plan/[id]` are already gated — **no
  middleware change needed**.
- **Goal labels already exist in Polish.** `src/types.ts` exports `GOAL_OPTIONS`
  (`{ value: Goal; label: string }[]`, e.g. `strength → "Siła"`). A private
  `labelFor(options, value)` helper in `src/lib/services/plan-prompt.ts:13`
  already does the lookup. No date util exists anywhere (no `Intl`/`date-fns`).

### Key Discoveries:

- `src/lib/services/plans.ts` — exact write-service shape to mirror for reads.
- `src/lib/services/profile.ts` — `getProfile` is the throw-on-error read pattern.
- `src/components/plan/PlanView.tsx` — `SessionCard`/`ExerciseRow` to extract; the
  list/`map` render at lines ~156–172 stays in `PlanView` after extraction.
- `src/pages/plan.astro` — the SSR page template (auth, client, service, redirect).
- `src/pages/dashboard.astro` — where the "Moje plany" link is added; inline-link style.
- `src/middleware.ts:5` — `PROTECTED_ROUTES` already covers `/plan*`.
- `src/types.ts:75-79` — `GOAL_OPTIONS` Polish labels; `SavedPlan`/`ProfileSnapshot`.

## Desired End State

A logged-in user opens **"Moje plany"** from the dashboard and lands on `/plans`,
which lists their saved plans newest-first, each row showing a Polish goal label
plus a `pl-PL`-formatted save date and linking to `/plan/<id>`. If they have none,
they see a friendly empty state with a button to `/plan` (generate). Clicking a
row opens `/plan/<id>`, a server-rendered page showing the full saved plan
(sessions, exercises, sets/reps/weight/rest) using the same markup as the
generate view, with a link back to the list. A plan id that doesn't belong to the
user (or doesn't exist) resolves to `null` (RLS) and redirects to `/plans`.

**Verification:** sign in as a user with ≥1 saved plan → dashboard shows "Moje
plany" → `/plans` lists their plans newest-first with goal + date → click one →
`/plan/<id>` renders the full plan → a second user cannot open the first user's
plan id (redirected to `/plans`). A user with zero plans sees the empty-state CTA.

## What We're NOT Doing

- **No new HTTP endpoints** — both pages load data in Astro frontmatter via the
  service (matches `plan.astro`/`training-profile`). No `GET /api/plan/*`.
- **No plan editing / deleting** — PRD v2 non-goal; the list is read + reopen only.
  (`plans_update_own`/`plans_delete_own` exist for convention but stay unused.)
- **No title column or stored label** — the list label is derived from
  `profile_snapshot.goal` + `created_at` at display time (per S-03 decision).
- **No pagination / search / filtering** — small data volume; a single ordered
  `select` is enough.
- **No middleware change** — `startsWith("/plan")` already gates both new routes.
- **No `PlanView` behavior change** — the extraction is markup-only; the generate
  flow (mount-effect, regenerate, save) is untouched.
- **No new shadcn components** — reuse inline Tailwind "cosmic" cards and `<a>`
  links, consistent with existing pages.

## Implementation Approach

A read-only vertical slice in three phases: **foundation → list → reopen**.
Phase 1 adds the data-access reads and extracts the shared plan markup (the
groundwork both pages consume). Phase 2 builds the `/plans` list and its dashboard
entry point. Phase 3 builds the `/plan/[id]` reopen page on top of the extracted
components. Data is loaded server-side in each Astro page (RLS-scoped via
`Astro.locals.user.id`), matching `plan.astro` — no client fetch, no loading
states, no new endpoints. The `SavedPlan` type and RLS make the service a thin,
authorized read.

## Critical Implementation Details

- **`getPlanById` must scope by `user_id` AND `id`.** RLS already blocks other
  users' rows, but the service query filters on both `eq("user_id", userId)` and
  `eq("id", planId)` and uses `.maybeSingle()`, so a foreign/nonexistent id
  returns `null` rather than throwing — the page treats `null` as "not found" and
  redirects to `/plans`. Defense in depth (RLS + explicit filter), consistent with
  every other service taking an explicit `userId`.
- **Extraction is markup-only and must keep `PlanView` working.** `SessionCard`
  and `ExerciseRow` move to a shared module and are imported back into
  `PlanView.tsx`; their props and JSX are unchanged so the generate view renders
  identically. This is a mechanical refactor — verify the generate page still
  renders after extraction (Phase 1 manual check), independent of the new pages.

## Phase 1: Foundation — read service + shared rendering

### Overview

Add `getPlans`/`getPlanById` to the plans service, extract the plan markup into a
shared component module, and add a small `pl-PL` date-format helper — the
groundwork the list and reopen pages both depend on.

### Changes Required:

#### 1. Read functions in the plans service

**File**: `src/lib/services/plans.ts`

**Intent**: Expose RLS-scoped reads mirroring `getProfile`, so the pages stay
thin. `getPlans` lists a user's plans newest-first; `getPlanById` fetches one by
id scoped to the user.

**Contract**: `getPlans(supabase: Client, userId: string): Promise<SavedPlan[]>`
— `.from("plans").select("*").eq("user_id", userId).order("created_at", {
ascending: false })`; throw on error; return `data as SavedPlan[]` (`[]` when
empty). `getPlanById(supabase: Client, userId: string, planId: string):
Promise<SavedPlan | null>` — same select with `.eq("user_id", userId).eq("id",
planId).maybeSingle()`; throw on error; return `data as SavedPlan | null`. Reuse
the existing `Client` alias and `SavedPlan` import; same throw-on-error convention
as `profile.ts`.

#### 2. Extract plan rendering into shared components

**File**: `src/components/plan/PlanCards.tsx` (new) and `src/components/plan/PlanView.tsx`

**Intent**: Move the `SessionCard` and `ExerciseRow` definitions (and their Lucide
imports) out of `PlanView` into a shared, exported module so both the generate
view and the reopen page render plans identically. `PlanView` imports them back.

**Contract**: New module exports `SessionCard({ session: PlanSession; index:
number })` and `ExerciseRow({ exercise: PlanExercise })` with the **exact** JSX and
Tailwind classes currently in `PlanView.tsx` (numbered session card with
name/focus, exercise `<li>` with `Dumbbell` `sets × reps`, `suggested_weight`,
`Clock` `rest_seconds s przerwy`). `PlanView.tsx` deletes the local definitions
and imports `SessionCard` from the new module; its render loop and all other state
(generate/regenerate/save) are unchanged. (File name is a suggestion — colocate
under `src/components/plan/` either way.)

#### 3. Date-format helper

**File**: `src/lib/format.ts` (new)

**Intent**: One place to format a Postgres ISO timestamp as a Polish date for the
list, since no date util exists yet.

**Contract**: Export `formatPlanDate(iso: string): string` returning a `pl-PL`
formatted date (e.g. `new Intl.DateTimeFormat("pl-PL", { day: "numeric", month:
"long", year: "numeric" }).format(new Date(iso))`). Pure, no deps.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking + lint pass: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] The generate view (`/plan`) still renders sessions/exercises identically
  after the extraction (no visual or behavioral regression).
- [ ] `formatPlanDate` returns a sensible Polish date for a known ISO string.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Saved-plans list — `/plans`

### Overview

A server-rendered list of the user's saved plans (goal label + formatted date,
newest first), an empty-state CTA, and a "Moje plany" entry point on the dashboard.

### Changes Required:

#### 1. Saved-plans list page

**File**: `src/pages/plans.astro` (new)

**Intent**: Show the user their saved plans newest-first, each linking to its
reopen page; show an empty-state with a generate CTA when there are none.

**Contract**: Frontmatter mirrors `plan.astro` — read `Astro.locals.user`, build
the Supabase client, call `getPlans(supabase, user.id)`. Render inside `<Layout
title="Moje plany">` + the `bg-cosmic` centered wrapper and a page heading
(matching `plan.astro`'s gradient `<h1>`). For each plan render an `<a
href={"/plan/" + plan.id}>` styled as a cosmic glass card showing the goal label
(`GOAL_OPTIONS.find(o => o.value === plan.profile_snapshot.goal)?.label ??
plan.profile_snapshot.goal`) and `formatPlanDate(plan.created_at)`. When the list
is empty, render a Polish empty-state (e.g. "Nie masz jeszcze zapisanych planów.")
with an `<a href="/plan">` button styled like the dashboard's "Generuj plan".
Route is auto-protected by middleware (`startsWith("/plan")`).

#### 2. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Make the saved-plans list reachable.

**Contract**: Add an `<a href="/plans">Moje plany</a>` link in the existing nav
link group, styled consistently with the sibling "Generuj plan" / "Edytuj profil
treningowy" links.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking + lint pass: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] As a user with ≥2 saved plans, `/plans` lists them newest-first, each with a
  Polish goal label and formatted date.
- [ ] Each row links to `/plan/<that id>`.
- [ ] A user with zero plans sees the empty-state and the "Generuj plan" CTA links
  to `/plan`.
- [ ] "Moje plany" appears on the dashboard and navigates to `/plans`.
- [ ] Signed-out access to `/plans` redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Reopen view — `/plan/[id]`

### Overview

A server-rendered page that loads one saved plan by id and renders it with the
shared plan components, with not-found handling and a link back to the list.

### Changes Required:

#### 1. Reopen page

**File**: `src/pages/plan/[id].astro` (new)

**Intent**: Show the full saved plan again, reusing the extracted markup so it
looks like the generate view.

**Contract**: Frontmatter mirrors `plan.astro` — read `Astro.locals.user`, build
the client, read the id from `Astro.params`, call `getPlanById(supabase, user.id,
id)`. If it returns `null`, `return Astro.redirect("/plans")`. Otherwise render
inside `<Layout title="...">` + `bg-cosmic` wrapper with a heading, map
`plan.plan.sessions` to the shared `SessionCard` (mount as an island with
`client:load`, since `SessionCard`/`ExerciseRow` are React — or wrap them in a
thin island component), and include an `<a href="/plans">` link back to the list.
Show `formatPlanDate(plan.created_at)` near the heading. Route auto-protected by
middleware. (Note: `/plan/[id]` is a distinct route from `/plan` — no conflict
with `plan.astro`.)

### Success Criteria:

#### Automated Verification:

- [ ] Type checking + lint pass: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Clicking a row in `/plans` opens `/plan/<id>` showing the full saved plan
  (sessions, exercises, sets/reps/weight/rest) rendered like the generate view.
- [ ] A back link returns to `/plans`.
- [ ] Visiting `/plan/<id>` for another user's plan id (or a random uuid) redirects
  to `/plans` (RLS returns `null`).
- [ ] Signed-out access to `/plan/<id>` redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- No test runner is configured (consistent with S-01/S-02/S-03). The new code is a
  thin RLS-scoped read plus presentational markup; the date helper is pure but does
  not justify standing up a runner here.

### Integration Tests:

- Covered by the manual checks: the list query (ordering, empty state, goal/date
  rendering), the by-id read (success + not-found redirect), and cross-user
  isolation (RLS).

### Manual Testing Steps:

1. Sign in as a user with ≥2 saved plans; open the dashboard; click "Moje plany".
2. Confirm `/plans` lists plans newest-first with Polish goal labels and dates.
3. Click a plan; confirm `/plan/<id>` renders the full plan and a back link.
4. Visit `/plan/<random-uuid>`; confirm redirect to `/plans`.
5. Sign in as a second user; visit the first user's `/plan/<id>`; confirm redirect
   to `/plans` (RLS isolation).
6. Sign in as a user with zero plans; confirm the empty-state CTA links to `/plan`.
7. Sign out; visit `/plans` and `/plan/<id>`; confirm redirect to `/auth/signin`.

## Performance Considerations

Negligible — `getPlans` is a single indexed (`plans_user_id_idx`) ordered select at
low volume; `getPlanById` is a point read. Both run server-side per page load. No
client fetch, no N+1.

## Migration Notes

None — no schema change. The `plans` table and its `plans_select_own` RLS policy
already exist from S-03.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD: FR-006 (must-have), US-01 (find a saved plan later)
- Prior slice (save): `context/archive/2026-06-28-save-plan/plan.md`
- Service pattern: `src/lib/services/profile.ts` (`getProfile`), `src/lib/services/plans.ts`
- Page pattern: `src/pages/plan.astro`, `src/pages/dashboard.astro`
- Markup to extract: `src/components/plan/PlanView.tsx` (`SessionCard`/`ExerciseRow`)
- Middleware: `src/middleware.ts` (`PROTECTED_ROUTES`)
- Goal labels & types: `src/types.ts` (`GOAL_OPTIONS`, `SavedPlan`, `ProfileSnapshot`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — read service + shared rendering

#### Automated

- [x] 1.1 Type checking + lint pass: `npm run lint`
- [x] 1.2 Build passes: `npm run build`

#### Manual

- [x] 1.3 Generate view still renders identically after extraction
- [x] 1.4 `formatPlanDate` returns a sensible Polish date

### Phase 2: Saved-plans list — `/plans`

#### Automated

- [ ] 2.1 Type checking + lint pass: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`

#### Manual

- [ ] 2.3 `/plans` lists plans newest-first with goal label + date
- [ ] 2.4 Each row links to `/plan/<id>`
- [ ] 2.5 Zero-plan user sees empty-state CTA linking to `/plan`
- [ ] 2.6 "Moje plany" on dashboard navigates to `/plans`
- [ ] 2.7 Signed-out `/plans` redirects to `/auth/signin`

### Phase 3: Reopen view — `/plan/[id]`

#### Automated

- [ ] 3.1 Type checking + lint pass: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`

#### Manual

- [ ] 3.3 Row click opens `/plan/<id>` rendering the full plan
- [ ] 3.4 Back link returns to `/plans`
- [ ] 3.5 Foreign/random id redirects to `/plans` (RLS null)
- [ ] 3.6 Signed-out `/plan/<id>` redirects to `/auth/signin`
