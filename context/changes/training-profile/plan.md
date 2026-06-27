# Training Profile Capture & Save — Implementation Plan

## Overview

Let a logged-in Treningo user fill in and save a single, editable **training
profile** — the inputs that drive personalized plan generation (S-02). This is
roadmap slice **S-01** and the first user-facing data slice: it creates the
`profiles` table under the established F-01 deny-by-default RLS convention, adds
the shared entity/DTO types and a shared zod schema, a profile service, an upsert
API route, and a protected profile page with a React form island.

## Current State Analysis

- **Data conventions exist but no app table does yet.** `supabase/migrations/`
  holds only `README.md` (the canonical deny-by-default RLS template) and a
  `.gitkeep`. `src/db/database.types.ts` is generated and currently empty
  (`public.Tables` resolves to `never`). `src/types.ts` is wired to build on the
  generated types and explicitly anticipates *"S-01 adds the first entries (e.g.
  TrainingProfile, ProfileDto)"*.
- **Migration loop is documented** (`CLAUDE.md`): `npm run db:migration <desc>` →
  `npm run db:push` → `npm run db:types`. Targets the hosted Supabase project
  (no local Docker); linkage is a one-time `db:link` already assumed done by F-01.
- **Form pattern is native-form-POST, not JSON fetch.** Auth pages mount a React
  island (`src/components/auth/SignInForm.tsx`) wrapping a native
  `<form method="POST" action="/api/auth/...">`; the API route creates the
  Supabase client, performs the action, and `context.redirect()`s (303). Errors
  surface via a `?error=` query param read in the `.astro` page. Client-side
  validation is `useState`-based; `SubmitButton` uses `useFormStatus()` for the
  pending state. Reusable field primitives live in
  `src/components/auth/{FormField,SubmitButton,ServerError,PasswordToggle}.tsx`.
- **shadcn has only `button`.** No `input`/`select`/`form`/`label`/`checkbox` —
  the codebase builds custom Tailwind fields (`FormField.tsx`) rather than the
  shadcn form kit.
- **Auth routes skip server-side zod** (they delegate to Supabase), but
  `CLAUDE.md` mandates zod validation on API routes. For persisted body data,
  server-side validation is the correct trust boundary.
- **Middleware** (`src/middleware.ts`) resolves `context.locals.user` on every
  request and guards `PROTECTED_ROUTES = ["/dashboard"]` via `startsWith` prefix
  match, redirecting to `/auth/signin`.
- **Supabase client** (`src/lib/supabase.ts`) is created per-request from request
  headers + cookies via `@supabase/ssr`; `auth.uid()` inside RLS policies
  resolves to the logged-in user (the isolation predicate).

## Desired End State

A logged-in user visits `/training-profile`, sees the form (pre-filled if they
saved before), enters their goal, experience level, age, weight, available
equipment, training days per week, and optionally their key lifts and plank time,
submits, and the profile is persisted to a `profiles` row keyed on their
`user_id`. Re-visiting shows the saved values; re-submitting overwrites them.
Another user can never read or modify that row (verified). Verified by:

- `npm run build` + `npm run lint` pass; `src/db/database.types.ts` contains the
  `profiles` table and the `goal` / `experience_level` / `equipment_item` enums.
- Manual two-session test + committed SQL script confirm RLS isolation.
- Manual UI test: fill, save, reload (values persist), edit, save again (values
  update); submitting invalid data shows a friendly error and persists nothing.

### Key Discoveries:

- Deny-by-default RLS template + isolation-verification procedure:
  `supabase/migrations/README.md` (copy verbatim, do not hand-roll policies).
- Shared-types contract and the `Tables<>`/`TablesInsert<>`/`TablesUpdate<>`
  aliases: `src/types.ts:9-26` (already present; resolve to `never` until the
  migration lands and types are regenerated).
- Native-form-POST → redirect pattern to mirror: `src/pages/api/auth/signin.ts`,
  `src/pages/auth/signin.astro:16` (`client:load`), `src/components/auth/SignInForm.tsx:43`.
- Protected-route registration: `src/middleware.ts:4` (`PROTECTED_ROUTES`).
- Reusable field primitive: `src/components/auth/FormField.tsx` (text/number
  inputs); native `<select>`/checkboxes serialize into the POST body without
  controlled state — fits the pattern, no shadcn `select` needed.

## What We're NOT Doing

- **No plan generation** — that is S-02 (`personalized-plan-generation`). This
  slice only captures the inputs.
- **No profile history / versioning** — one editable row per user (PRD non-goal:
  progress tracking).
- **No new test runner** — RLS isolation is verified manually + via a committed
  SQL script; automated test infra is deferred to the `/10x-e2e` phase.
- **No shadcn form kit** — we extend the existing custom `FormField` pattern with
  native selects/checkboxes.
- **No profile deletion UI** — out of scope for the capture/save slice.
- **No free-text goal or equipment** — both are bounded enums to keep the S-02
  soundness-validation contract enforceable.

## Implementation Approach

Vertical slice built bottom-up in three phases: **data → backend → frontend.**
Each phase is independently verifiable. The data model uses Postgres enum types
for the bounded choice fields (so they flow into generated TS types and are
enforced at the DB), nullable `numeric` columns for the optional lifts, a
`smallint` for plank seconds, and a `text[]` (enum array) for equipment. A single
shared zod schema (`src/lib/schemas/profile.ts`) is the source of truth for
validation, consumed by both the API route (server-side, the trust boundary) and
the React form (client-side mirror). The form follows the established
native-`<form>`-POST → API-route-upsert → `redirect` pattern rather than a
fetch/JSON flow.

## Critical Implementation Details

- **Field requiredness drives both DB nullability and zod.** Required: `goal`,
  `experience_level`, `training_days_per_week`, `age`, `weight_kg` (NOT NULL).
  Optional: `squat_kg`, `bench_kg`, `deadlift_kg`, `ohp_kg`, `plank_seconds`
  (nullable). Equipment is required but may be a non-empty array. Keep DB
  nullability and the zod schema in lock-step — a mismatch lets the API accept a
  payload the DB rejects (or vice versa).
- **Upsert keys on `user_id`, not `id`.** There is one profile per user. The
  service must `upsert(..., { onConflict: "user_id" })`, so `user_id` needs a
  unique constraint. RLS `with check (auth.uid() = user_id)` already prevents
  writing another user's row; the service sets `user_id` from
  `locals.user.id`, never from the client payload.
- **Native multi-select serialization.** Equipment checkboxes share a `name`
  (e.g. `equipment`); the API route reads `formData.getAll("equipment")`. Numeric
  fields arrive as strings — coerce in zod (`z.coerce.number()`), and treat empty
  optional fields as `undefined`/`null` rather than `0`.

## Phase 1: Data Layer

### Overview

Create the `profiles` table with bounded enums and RLS per the F-01 convention,
regenerate the generated types, add the shared entity/DTO/enum types, and verify
account isolation.

### Changes Required:

#### 1. Migration: `profiles` table + enums + RLS

**File**: `supabase/migrations/<timestamp>_create_profiles.sql` (via `npm run db:migration create_profiles`)

**Intent**: Define the profile schema and lock in account isolation by applying
the canonical deny-by-default RLS template to the first app table.

**Contract**: Three Postgres enum types — `goal` (`strength`, `muscle_gain`,
`fat_loss`, `general_fitness`), `experience_level` (`beginner`, `intermediate`,
`advanced`), `equipment_item` (`barbell`, `dumbbells`, `machines`, `pull_up_bar`,
`kettlebell`, `resistance_bands`, `bodyweight_only` — adapt as sensible). Table
`profiles`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null unique
references auth.users(id) on delete cascade`, `goal goal not null`,
`experience_level experience_level not null`, `age smallint not null`,
`weight_kg numeric not null`, `training_days_per_week smallint not null`,
`equipment equipment_item[] not null`, `squat_kg numeric`, `bench_kg numeric`,
`deadlift_kg numeric`, `ohp_kg numeric`, `plank_seconds smallint`,
`created_at timestamptz not null default now()`, `updated_at timestamptz not null
default now()`. Then the README template verbatim: `enable row level security`,
`profiles_user_id_idx`, and the four per-operation policies
(`select`/`insert`/`update`/`delete` own) `to authenticated` filtered on
`auth.uid() = user_id`. The `user_id unique` constraint backs the upsert
`onConflict`. Optionally add CHECK constraints for sane ranges as defense in
depth (zod is the primary guard).

#### 2. Regenerate generated types

**File**: `src/db/database.types.ts` (regenerated, never hand-edited)

**Intent**: Surface the new table + enums into the typed Supabase client.

**Contract**: Run `npm run db:push` then `npm run db:types`. Afterward
`public.Tables` includes `profiles` and `public.Enums` includes the three enums.

#### 3. Shared entity, DTO, and enum types

**File**: `src/types.ts`

**Intent**: Provide hand-authored domain types built on the generated schema, per
the file's own S-01 placeholder note.

**Contract**: Export `TrainingProfile = Tables<"profiles">`, an insert/update DTO
(`ProfileUpsertDto`) for the API boundary, and convenience aliases for the enums
(`Goal`, `ExperienceLevel`, `EquipmentItem`) plus the canonical option lists used
by the form (e.g. `GOAL_OPTIONS`, `EXPERIENCE_OPTIONS`, `EQUIPMENT_OPTIONS`) so
the UI and validation share one source.

#### 4. RLS isolation verification script

**File**: `supabase/migrations/README.md` is the procedure; add a runnable
`supabase/scripts/verify-profiles-rls.sql` (or documented psql snippet) under the
change folder if a SQL home is preferred.

**Intent**: Prove the privacy guardrail now without standing up a test runner.

**Contract**: A committed SQL script following the README's "Verifying isolation"
steps against `profiles`: as user A insert a row; as user B confirm `select`
returns zero of A's rows and `update`/`delete` of A's row affect zero rows; as
`anon` confirm zero rows for every operation.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npm run db:push`
- [ ] Types regenerate and include `profiles` + enums: `npm run db:types`
- [ ] Type checking passes: `npm run build` (runs `astro check`)
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Two-session RLS test passes: user B sees zero of user A's rows;
      `update`/`delete` of A's row affect zero rows; `anon` sees zero rows.
- [ ] `profiles` row visible in Supabase Studio with expected columns/enums.

**Implementation Note**: After automated verification passes, pause for manual
confirmation that the RLS isolation test succeeded before proceeding to Phase 2.

---

## Phase 2: Backend (schema, service, API route)

### Overview

Add the shared zod schema, a profile service (read + upsert), and the upsert API
route that validates server-side and redirects.

### Changes Required:

#### 1. Shared zod schema

**File**: `src/lib/schemas/profile.ts`

**Intent**: Single source of truth for profile validation, consumed by both the
API route and the React form.

**Contract**: A `profileSchema` (zod) matching the table: required `goal`
(enum), `experience_level` (enum), `age` (int, sane bounds e.g. 13–100),
`weight_kg` (positive, bounded), `training_days_per_week` (int 1–7), `equipment`
(non-empty array of the equipment enum); optional nullable `squat_kg`,
`bench_kg`, `deadlift_kg`, `ohp_kg`, `plank_seconds`. Use `z.coerce.number()` for
numeric fields (form posts strings) and normalize empty optionals to
`undefined`. Export the inferred type for reuse.

#### 2. Profile service

**File**: `src/lib/services/profile.ts`

**Intent**: Encapsulate the Supabase reads/writes so the API route and page stay
thin.

**Contract**: `getProfile(supabase, userId): Promise<TrainingProfile | null>`
(single row by `user_id`) and `upsertProfile(supabase, userId, dto):
Promise<{ error?: ... }>` performing `.from("profiles").upsert({ ...dto, user_id
}, { onConflict: "user_id" })`. `user_id` is always set from the authenticated
user, never the payload.

#### 3. Upsert API route

**File**: `src/pages/api/profile.ts`

**Intent**: Accept the form POST, validate, persist, redirect — mirroring the
auth-route pattern but with server-side zod.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`.
Read `formData` (incl. `getAll("equipment")`), parse with `profileSchema`; on
failure `redirect("/training-profile?error=<msg>")`; on success call
`upsertProfile` with `locals.user.id` and `redirect("/training-profile?saved=1")`
(or back to dashboard — see Phase 3). Guard against missing `locals.user`
(401/redirect to signin), consistent with middleware.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] POST with valid data via curl/UI creates a row; second POST updates the
      same row (no duplicate).
- [ ] POST with invalid data (e.g. `training_days_per_week=9`) persists nothing
      and redirects with an error.
- [ ] POST while signed out is rejected (redirect to signin), writes nothing.

**Implementation Note**: After automated verification passes, pause for manual
confirmation before proceeding to Phase 3.

---

## Phase 3: Frontend (protected page + form island)

### Overview

Add the protected `/training-profile` page, the React form island covering all
field types with prefill and pending state, register the protected route, and
link it from the dashboard.

### Changes Required:

#### 1. Register protected route

**File**: `src/middleware.ts`

**Intent**: Gate `/training-profile` behind auth like `/dashboard`.

**Contract**: Add `"/training-profile"` to `PROTECTED_ROUTES`.

#### 2. Profile page

**File**: `src/pages/training-profile.astro`

**Intent**: Server-render the page, load any existing profile, and mount the form
island.

**Contract**: Read `Astro.locals.user`, call `getProfile` with the request-scoped
Supabase client, read `?error` / `?saved` query params, import `Layout`, and
mount `<TrainingProfileForm initial={profile} serverError={error} saved={saved}
client:load />`.

#### 3. Profile form island

**File**: `src/components/profile/TrainingProfileForm.tsx` (+ any small field
helpers reused from `src/components/auth/` or extracted to
`src/components/profile/`)

**Intent**: Render the native-`<form method="POST" action="/api/profile">` with
all field types, pre-filled from `initial`, with client-side validation mirroring
the zod schema and a `useFormStatus` submit button.

**Contract**: Fields — `goal` and `experience_level` as native `<select>`
(options from the shared `*_OPTIONS` lists); `age`, `weight_kg`,
`training_days_per_week` as number inputs (reuse `FormField`); `equipment` as a
checkbox group sharing `name="equipment"`; optional lifts + `plank_seconds` as
number inputs. Pre-fill from `initial` when present. Surface `serverError` via the
`ServerError` component and a success notice when `saved`. Client validation
mirrors `profileSchema` ranges (server remains the trust boundary).

#### 4. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Give the user a way to reach the profile form.

**Contract**: Add a link/button to `/training-profile` (e.g. "Wypełnij profil
treningowy" / "Edytuj profil").

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Signed-out visit to `/training-profile` redirects to signin.
- [ ] Fill all required fields + save → values persist after reload (prefill).
- [ ] Edit a value + save → updated value shown; still one row in DB.
- [ ] Leaving optional lifts blank saves successfully (stored null, not 0).
- [ ] Submitting an out-of-range value shows a friendly error, persists nothing.
- [ ] Equipment multi-select round-trips correctly (selected items re-checked).

**Implementation Note**: After automated verification passes, pause for manual
confirmation that the end-to-end UI flow works.

---

## Testing Strategy

### Manual Testing Steps:

1. Apply migration, regenerate types, run the RLS two-session verification
   (Phase 1).
2. POST valid/invalid/unauthenticated payloads to `/api/profile` (Phase 2).
3. Full UI round-trip: fill → save → reload → edit → save; verify prefill,
   optional-null handling, equipment multi-select, and error display (Phase 3).

### Edge Cases:

- Empty optional lift fields persist as `null`, not `0`.
- Equipment requires at least one selection (zod non-empty array).
- `training_days_per_week` constrained to 1–7 both client- and server-side.
- Re-submit overwrites the existing row (no duplicate, `onConflict: user_id`).

## Performance Considerations

Single-row read and upsert per request; negligible at the PRD's small scale. The
`profiles_user_id_idx` (+ unique constraint) covers the only access path.

## Migration Notes

First app table; no existing data to migrate. Migration is forward-only via
`db:push` against the hosted project. Enums are additive — future values can be
appended with `alter type ... add value`.

## References

- Roadmap slice S-01: `context/foundation/roadmap.md:67`
- PRD FR-002 / US-01: `context/foundation/prd.md:64,45`
- RLS convention + isolation procedure: `supabase/migrations/README.md`
- Shared-types contract: `src/types.ts`
- Native-form-POST pattern: `src/pages/api/auth/signin.ts`,
  `src/components/auth/SignInForm.tsx`, `src/pages/auth/signin.astro`
- Protected routes: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:push`
- [x] 1.2 Types regenerate and include `profiles` + enums: `npm run db:types`
- [x] 1.3 Type checking passes: `npm run build`
- [x] 1.4 Linting passes: `npm run lint`

#### Manual

- [x] 1.5 Two-session RLS test passes (user B and anon see zero of user A's rows)
- [x] 1.6 `profiles` row visible in Supabase Studio with expected columns/enums

### Phase 2: Backend (schema, service, API route)

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 Valid POST creates a row; second POST updates the same row (no duplicate)
- [ ] 2.4 Invalid POST persists nothing and redirects with an error
- [ ] 2.5 POST while signed out is rejected, writes nothing

### Phase 3: Frontend (protected page + form island)

#### Automated

- [ ] 3.1 Type checking passes: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 Signed-out visit to `/training-profile` redirects to signin
- [ ] 3.4 Fill required fields + save → values persist after reload (prefill)
- [ ] 3.5 Edit a value + save → updated value shown; still one row in DB
- [ ] 3.6 Blank optional lifts save successfully (stored null, not 0)
- [ ] 3.7 Out-of-range value shows friendly error, persists nothing
- [ ] 3.8 Equipment multi-select round-trips correctly
