# Training Profile Capture & Save — Plan Brief

> Full plan: `context/changes/training-profile/plan.md`

## What & Why

Roadmap slice **S-01**: let a logged-in user fill in and save a single, editable
**training profile** — goal, experience, body metrics, available equipment,
training days, and optionally key lifts. It's the first user-facing data slice
and the prerequisite for the north-star plan generator (S-02): without these
inputs there is nothing to personalize a plan from.

## Starting Point

Auth, middleware, the Supabase SSR client, and the F-01 data foundation
(migration loop, deny-by-default RLS template, `src/types.ts` shared-types
contract) are all in place. No app table exists yet — `public.Tables` is empty
and the migrations folder holds only the RLS convention README. The codebase uses
a native-`<form>`-POST → API-route → redirect pattern (no JSON fetch), with a
custom Tailwind `FormField` (only shadcn `button` is installed).

## Desired End State

A user opens `/training-profile`, sees the form (pre-filled if previously saved),
enters their profile, and saves; the data persists to a `profiles` row keyed on
their `user_id` and survives reloads, with re-submits overwriting the same row.
No other user can read or modify it (verified). Invalid input is rejected with a
friendly message and persists nothing.

## Key Decisions Made

| Decision                  | Choice                                                                 | Why (1 sentence)                                                              | Source |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Required vs optional      | Required: goal, experience, days, age, weight; optional: lifts + plank | Gives the generator body metrics while not blocking a beginner on lifts.     | Plan   |
| Goal taxonomy             | 4-value enum (strength / muscle gain / fat loss / general fitness)     | Bounded set keeps the S-02 soundness-validation contract enforceable.        | Plan   |
| Equipment model           | Fixed multi-select, stored as enum array                               | Bounded list the generator can trust for the equipment guardrail.            | Plan   |
| Current lifts             | Fixed key lifts (squat/bench/deadlift/OHP) + plank, optional numeric   | Lets generator derive starting weights; optional respects beginners.         | Plan   |
| Profile cardinality       | One editable row per user (upsert on `user_id`)                        | Matches "fill in / save profile"; no history (a PRD non-goal).               | Plan   |
| Validation                | Shared zod schema, server + client, with ranges                        | Honors CLAUDE.md; server is the trust boundary for persisted body data.      | Plan   |
| RLS verification          | Manual two-session test + committed SQL script                         | Proves the privacy guardrail now without spending the time budget on a runner.| Plan   |

## Scope

**In scope:** `profiles` table + RLS, generated + shared types, zod schema,
profile service, upsert API route, protected `/training-profile` page + React form
island, dashboard link, RLS isolation verification.

**Out of scope:** plan generation (S-02), profile history/versioning, a test
runner, shadcn form kit, profile deletion UI, free-text goal/equipment.

## Architecture / Approach

Bottom-up vertical slice in three phases — **data → backend → frontend**. Postgres
enums for bounded choices (flow into generated TS types + DB-enforced), nullable
`numeric` for optional lifts, `text[]` enum array for equipment. A single shared
zod schema is consumed by both the API route (server-side trust boundary) and the
React form (client mirror). The form is a native `<form method="POST">` island
posting to `/api/profile`, which validates, upserts on `user_id`, and redirects —
the same pattern the auth flow uses.

## Phases at a Glance

| Phase           | What it delivers                                              | Key risk                                                        |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| 1. Data layer   | `profiles` table + enums + RLS, regenerated + shared types   | RLS policy mistake would breach the privacy guardrail silently. |
| 2. Backend      | Shared zod schema, profile service, upsert API route         | DB nullability and zod drifting out of lock-step.               |
| 3. Frontend     | Protected page + form island (all field types, prefill)      | Native multi-select / numeric-string serialization edge cases.  |

**Prerequisites:** F-01 done (it is), Supabase project linked, signed-in test
users available.
**Estimated effort:** ~2–3 after-hours sessions across the 3 phases.

## Open Risks & Assumptions

- Enum value sets (esp. equipment) are assumed final enough for S-02; new values
  are additive via `alter type ... add value` if needed.
- RLS isolation is verified manually, not in CI, until the `/10x-e2e` test phase
  lands a runner.
- The S-02 generator must tolerate optional fields left blank (no lifts/plank).

## Success Criteria (Summary)

- A user can fill, save, reload (prefilled), and edit their profile end to end.
- A second user (and anonymous requests) can never read or modify that profile.
- Invalid input is rejected with a friendly message and nothing is persisted.
