# Save a Generated Plan (S-03) Implementation Plan

## Overview

Roadmap slice **S-03** (FR-005, US-01): let a logged-in user **save** a generated
workout plan so it survives between sessions. Today the plan is generated and
shown but lives only in React state (`PlanView.tsx`) — it is lost on refresh or
regeneration. This slice adds a `plans` table, a save service, a
`POST /api/plan/save` endpoint, and a "Zapisz plan" button. Browsing/reopening
saved plans is explicitly **S-04** and out of scope here.

## Current State Analysis

- **Plan is ephemeral.** `src/components/plan/PlanView.tsx` auto-generates on
  mount and holds the result in `useState` (`result: PlanGenerationResult | null`);
  the in-code comment at `PlanView.tsx:32-34` states it is "never persisted".
- **Plan shape is fixed and Zod-validated.** `src/lib/schemas/plan.ts` defines
  `planSchema` → `WorkoutPlan = { sessions: PlanSession[] }`; each session has
  `name`, `focus`, `exercises[]`; each exercise has `name`, `equipment` (enum),
  `sets` (int 1–20), `reps` (string), `suggested_weight` (string),
  `rest_seconds` (int 0–1200). Types are re-exported in `src/types.ts:39-41`.
- **Generation API.** `POST /api/plan/generate` (`src/pages/api/plan/generate.ts`)
  returns `{ plan, violations, ok }` and uses distinct status codes
  (401/422/503/500/200) the island branches on.
- **Data convention is established (F-01).** `supabase/migrations/README.md` holds
  the canonical deny-by-default RLS template; `profiles`
  (`20260627202445_create_profiles.sql`) is the reference: `user_id uuid not null
  references auth.users (id) on delete cascade`, `enable row level security`,
  `<table>_user_id_idx`, and four granular per-operation policies (`select`/
  `insert`/`update`/`delete`) `to authenticated` filtered on `auth.uid() = user_id`.
- **Service convention.** `src/lib/services/profile.ts` takes `(supabase, userId,
  …)` explicitly; `userId` is **always** derived from the session, never the
  client payload. RLS is the hard boundary.
- **Key difference from `profiles`.** `profiles.user_id` is `unique` (one row per
  user). `plans` is **many rows per user** (no `unique`) — S-04 browses a list.

### Key Discoveries:

- `PlanView.tsx:14-30` — `requestPlan()` shows the exact fetch/branch pattern the
  save call should mirror.
- `src/pages/api/plan/generate.ts:24-58` — the auth/config/profile guard ladder and
  `json()` helper to copy for the save endpoint.
- `src/lib/services/profile.ts` — `getProfile(supabase, userId)` returns the full
  `TrainingProfile | null`; the save flow reuses it to build the profile snapshot
  server-side (not trusting the client for profile data).
- `src/types.ts:29` — `ProfileUpsertDto = Omit<TablesInsert<"profiles">, "id" |
  "user_id" | "created_at" | "updated_at">` is exactly the snapshot shape we want.

## Desired End State

A user viewing a generated plan sees a "Zapisz plan" button. Clicking it POSTs the
in-memory plan to `/api/plan/save`; the server re-validates it against `planSchema`,
loads the user's current profile, and inserts a new `plans` row (`plan` jsonb +
`profile_snapshot` jsonb + `created_at`). On success the button becomes a disabled
"Zapisano" with a confirmation; regenerating resets it. Saving works even when
`ok === false` (a soft-failure plan). The saved row is retrievable on every later
login (verifiable in the DB / via RLS-scoped query). No browsing UI is added.

**Verification:** sign in → generate → click "Zapisz plan" → button reads
"Zapisano" → a new row exists in `plans` for that user with the shown plan as
`plan` and the current profile fields as `profile_snapshot`; a second user cannot
read it (RLS).

## What We're NOT Doing

- **No browse/list/reopen UI or read endpoint** — that is S-04.
- **No normalized sessions/exercises tables** — plan is stored as a single `jsonb`.
- **No plan editing** — PRD non-goal (v2).
- **No title column** — a label can be derived from `goal` + `created_at` at
  display time in S-04; not stored now.
- **No `violations`/`ok` columns** — soft-failure plans are saved as-is; the
  violation trail is intentionally not persisted (user chose to save anyway).
- **No `updated_at`** — plans are immutable once saved (no edit path).
- **No de-duplication of identical plans across separate saves** — only the
  in-view "Zapisano" state prevents double-saving the *same* shown plan.

## Implementation Approach

Bottom-up vertical slice in three phases mirroring S-01/S-02 (data → backend →
frontend). The plan is stored as one `jsonb` column because it is generated and
validated as a whole, never edited, read whole, and at low volume — normalization
would be pure overhead. The client sends only the `plan` (the ephemeral object it
already holds); the server re-validates the shape with `planSchema` (don't trust
the client) and derives the `profile_snapshot` itself from `getProfile` (don't
trust the client for profile data, and keep `user_id` session-derived). Many rows
per user (plain `insert`, no `unique`) so S-04 can list a history.

## Critical Implementation Details

- **Profile snapshot is server-derived, not client-sent.** The save endpoint calls
  `getProfile(supabase, user.id)` and stores the relevant profile fields as
  `profile_snapshot`. This keeps body-tampering off the table and means the snapshot
  reflects the profile as the server sees it at save time (generation and save
  happen seconds apart in the same view, so drift is negligible). If the profile is
  missing at save time, return 422 (same contract as generate).
- **Server re-validation must mirror the generation contract.** Validate `body.plan`
  with the *same* `planSchema` used for generation (`safeParse`), so the persisted
  shape and the enum/bounds set stay in lock-step. A parse failure is a 400
  (malformed plan), distinct from 422 (no profile).
- **Save-state must reset on regeneration.** `PlanView` regenerate() and the
  mount-effect both produce a new plan; the save status must return to `idle` so the
  new plan can be saved. Tie the save state to the current `result`.

## Phase 1: Data — `plans` table, types

### Overview

Add the `plans` table following the F-01 RLS convention, regenerate DB types, and
expose the shared TS entity/DTO types.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_create_plans.sql` (via `npm run db:migration create_plans`)

**Intent**: Create the per-user plans table that persists a generated plan plus a
snapshot of the profile it was generated from, under deny-by-default RLS. Many
rows per user (no `unique` on `user_id`).

**Contract**: Columns — `id uuid pk default gen_random_uuid()`; `user_id uuid not
null references auth.users (id) on delete cascade` (**no** `unique`); `plan jsonb
not null`; `profile_snapshot jsonb not null`; `created_at timestamptz not null
default now()`. No `updated_at`. `enable row level security`; index
`plans_user_id_idx on plans (user_id)`; four granular policies
(`plans_select_own`, `plans_insert_own`, `plans_update_own`, `plans_delete_own`)
`to authenticated`, all filtered on `auth.uid() = user_id` (`insert` uses `with
check`, `update` uses both `using` + `with check`, `select`/`delete` use `using`).
Copy the template in `supabase/migrations/README.md` verbatim. (All four policies
are created for convention-completeness even though S-03 only exercises `insert`;
S-04 uses `select`.)

#### 2. Regenerate generated types

**File**: `src/db/database.types.ts`

**Intent**: Pick up the new `plans` table in the generated Supabase types.

**Contract**: Run `npm run db:types` after the migration is pushed. Do not
hand-edit; `plans.Row/Insert/Update` should appear with `plan`/`profile_snapshot`
typed as `Json`.

#### 3. Shared entity + DTO types

**File**: `src/types.ts`

**Intent**: Expose a typed `SavedPlan` entity and the save-payload DTO, mirroring
the `TrainingProfile`/`ProfileUpsertDto` pattern, and type the jsonb columns to the
domain shapes (`WorkoutPlan`, profile snapshot) rather than raw `Json`.

**Contract**: Add `SavedPlan` (the `Tables<"plans">` row with `plan: WorkoutPlan`
and `profile_snapshot: ProfileSnapshot` narrowed from `Json`), `ProfileSnapshot`
(alias of `ProfileUpsertDto` — the profile input fields), and a client→server
payload type `SavePlanRequest = { plan: WorkoutPlan }`. Keep these next to the
existing plan types (`src/types.ts:36-57`).

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npm run db:push`
- [ ] Types regenerate without error and include `plans`: `npm run db:types`
- [ ] Type checking passes: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] In Supabase Studio, `plans` exists with RLS enabled and four policies; a
  query as user A cannot see user B's rows.
- [ ] `user_id` has no `unique` constraint (two inserts for one user both succeed).

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation before proceeding.

---

## Phase 2: Backend — save service + endpoint

### Overview

Add the data-access service and the `POST /api/plan/save` route that validates the
incoming plan, snapshots the profile, and inserts a row.

### Changes Required:

#### 1. Plans service

**File**: `src/lib/services/plans.ts`

**Intent**: Encapsulate the insert so the route stays thin, mirroring
`profile.ts`. Always derives `user_id` from the passed session id and builds the
profile snapshot from the loaded profile.

**Contract**: `savePlan(supabase: Client, userId: string, plan: WorkoutPlan,
profileSnapshot: ProfileSnapshot): Promise<{ error: PostgrestError | null }>` —
inserts `{ user_id: userId, plan, profile_snapshot: profileSnapshot }` into
`plans`. No `upsert` (many rows per user). Same `Client = SupabaseClient<Database>`
type alias as `profile.ts`.

#### 2. Save endpoint

**File**: `src/pages/api/plan/save.ts`

**Intent**: Auth-guarded endpoint that re-validates the client-sent plan, loads the
current profile for the snapshot, and persists. Reuse the guard ladder and `json()`
helper from `generate.ts`.

**Contract**: `POST`, `prerender = false`. Flow: 401 if no `context.locals.user`;
503 if Supabase client missing; parse body and `planSchema.safeParse(body.plan)` →
400 `{ error: "invalid_plan" }` on failure; `getProfile` → 500 on load error, 422
`{ error: "profile_required" }` if null; build `profile_snapshot` by stripping
`id`/`user_id`/`created_at`/`updated_at` from the profile (the `ProfileUpsertDto`
shape); `savePlan(...)` → 500 `{ error: "save_failed" }` on DB error; 200
`{ ok: true }` on success. Polish `message` strings consistent with `generate.ts`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking + lint pass: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] `curl`/devtools POST with a valid plan body returns 200 and creates a row
  whose `profile_snapshot` matches the signed-in user's current profile.
- [ ] POST with a malformed plan returns 400; POST while signed-out returns 401;
  POST with no profile returns 422.
- [ ] Two saves create two rows for the same user.

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation before proceeding.

---

## Phase 3: Frontend — "Zapisz plan" button

### Overview

Add a save affordance to `PlanView` with idle → saving → saved/error states that
resets when a new plan is generated.

### Changes Required:

#### 1. Save button + state in PlanView

**File**: `src/components/plan/PlanView.tsx`

**Intent**: Let the user persist the shown plan. Add a save status independent of
the generation `status`, a `savePlan()` callback that POSTs `{ plan: result.plan }`
to `/api/plan/save`, and render a "Zapisz plan" button next to "Wygeneruj ponownie"
that becomes a disabled "Zapisano ✓" on success and shows an inline error on
failure. Available whenever a plan is shown, including `ok === false`.

**Contract**: Add `saveStatus: "idle" | "saving" | "saved" | "error"` state, reset
to `"idle"` in both `regenerate()` and the mount-effect success branch (a new plan
must be re-savable). `savePlan()` mirrors `requestPlan()`'s try/catch + status
branch (401 → redirect to signin). Update the existing comment at
`PlanView.tsx:32-34` to reflect that the plan can now be persisted on demand.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking + lint pass: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Generate → click "Zapisz plan" → button shows "Zapisano" (disabled); a row
  appears in `plans`.
- [ ] "Wygeneruj ponownie" → button returns to savable "Zapisz plan"; saving the
  new plan creates a second row.
- [ ] A soft-failure plan (warning banner / `ok === false`) is still savable.
- [ ] A network/server error surfaces an inline message without losing the plan.

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- No test runner is configured (consistent with S-01/S-02). The save endpoint's
  validation reuses the existing pure `planSchema`, which is exercised by the
  generation path; no new pure logic warrants a runner here.

### Integration Tests:

- Covered by the manual endpoint checks in Phase 2 (status-code matrix) and the
  Phase 3 UI flow.

### Manual Testing Steps:

1. Sign in as a user with a saved profile; go to `/plan`; wait for generation.
2. Click "Zapisz plan"; confirm the button reads "Zapisano" and a `plans` row was
   created with the shown plan and the current profile snapshot.
3. Click "Wygeneruj ponownie"; confirm the save button resets; save again; confirm
   a second row.
4. Force a soft-failure plan (e.g. a constrained profile) and confirm it is savable.
5. Sign in as a second user; confirm they cannot read the first user's rows (RLS).

## Performance Considerations

Negligible — a single small `jsonb` insert per save at low QPS. The `plans_user_id_idx`
index already serves the S-04 list query. No CPU-bound work (Cloudflare Workers
limit is a non-issue).

## Migration Notes

New table only; no data backfill. RLS is deny-by-default, so the table is
inaccessible until the four policies are in place within the same migration.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD: FR-005, US-01, NFR (saved plan retrievable on every login)
- RLS convention: `supabase/migrations/README.md`
- Reference table: `supabase/migrations/20260627202445_create_profiles.sql`
- Service pattern: `src/lib/services/profile.ts`
- Endpoint pattern: `src/pages/api/plan/generate.ts`
- Plan schema/types: `src/lib/schemas/plan.ts`, `src/types.ts:36-57`
- Ephemeral plan UI: `src/components/plan/PlanView.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data — `plans` table, types

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:push` — b4148bd
- [x] 1.2 Types regenerate and include `plans`: `npm run db:types` — b4148bd
- [x] 1.3 Type checking + lint pass: `npm run lint` — b4148bd
- [x] 1.4 Build passes: `npm run build` — b4148bd

#### Manual

- [x] 1.5 `plans` exists with RLS + four policies; cross-user read blocked — b4148bd
- [x] 1.6 `user_id` has no `unique` constraint (two inserts for one user succeed) — b4148bd

### Phase 2: Backend — save service + endpoint

#### Automated

- [x] 2.1 Type checking + lint pass: `npm run lint` — 4bca6f4
- [x] 2.2 Build passes: `npm run build` — 4bca6f4

#### Manual

- [x] 2.3 Valid POST returns 200 and creates a row with correct `profile_snapshot` — 4bca6f4
- [x] 2.4 Malformed → 400, signed-out → 401, no profile → 422 — 4bca6f4
- [x] 2.5 Two saves create two rows for the same user — 4bca6f4

### Phase 3: Frontend — "Zapisz plan" button

#### Automated

- [x] 3.1 Type checking + lint pass: `npm run lint` — 5d0ae74
- [x] 3.2 Build passes: `npm run build` — 5d0ae74

#### Manual

- [x] 3.3 Save → "Zapisano" (disabled); row appears in `plans` — 5d0ae74
- [x] 3.4 Regenerate resets the button; saving the new plan creates a second row — 5d0ae74
- [x] 3.5 Soft-failure plan (`ok === false`) is still savable — 5d0ae74
- [x] 3.6 Network/server error surfaces inline without losing the plan — 5d0ae74
