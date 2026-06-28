# Save a Generated Plan (S-03) — Plan Brief

> Full plan: `context/changes/save-plan/plan.md`

## What & Why

Roadmap slice **S-03** (FR-005, US-01): let a logged-in user **save** a generated
workout plan so it survives between sessions. Today a generated plan is shown but
lives only in React state — it vanishes on refresh or regeneration. Persistence is
what makes the plan useful beyond the moment of generation, and it is the
prerequisite for browsing (S-04).

## Starting Point

S-02 is done: `/plan` auto-generates and renders a plan held in `PlanView.tsx`
state (`PlanGenerationResult`, explicitly "never persisted"). The plan shape is
fixed and Zod-validated (`planSchema` → `WorkoutPlan = { sessions[] }`). The F-01
data conventions exist: deny-by-default RLS template, the `profiles` table as a
worked example, the `profile.ts` service pattern (`userId` always session-derived),
and migration tooling (`npm run db:migration` / `db:push` / `db:types`). No `plans`
table, save service, save endpoint, or save UI exists yet.

## Desired End State

A "Zapisz plan" button sits next to "Wygeneruj ponownie". Clicking it POSTs the
in-memory plan to `/api/plan/save`; the server re-validates it against `planSchema`,
snapshots the user's current profile, and inserts a new `plans` row. The button
becomes a disabled "Zapisano"; regenerating resets it. Soft-failure plans
(`ok === false`) are savable too. Saved rows are retrievable on every later login
and isolated per user by RLS. No browsing UI (that is S-04).

## Key Decisions Made

| Decision                     | Choice                                                   | Why (1 sentence)                                                       | Source |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| Plan storage shape           | Single `jsonb` column                                    | Plan is generated/validated/read as a whole and never edited — normalization is overhead. | Plan   |
| Rows per user                | Many (plain insert, no `unique`)                         | S-04 "browse saved plans" (FR-006) needs a history, not one row.       | Plan   |
| Metadata stored              | `created_at` + `profile_snapshot` (jsonb)                | Enables S-04 sorting/labels and keeps the plan understandable later.   | Plan   |
| Snapshot source              | Server-derived via `getProfile`, not client-sent         | Don't trust the client for profile data; keep `user_id` session-derived. | Plan   |
| Plan source + validation     | Client sends `plan`; server re-validates `planSchema`    | Saves exactly what the user sees, without trusting the client's shape. | Plan   |
| Saving an `ok === false` plan | Allowed                                                  | User decides; consistent with S-02 showing the best attempt.           | Plan   |
| Post-save UX                 | Confirmation + button → disabled "Zapisano"              | Clear feedback, no S-04 dependency, prevents double-saving same plan.  | Plan   |
| Scope boundary               | Save only; zero read/browse                              | Clean vertical slice; all read belongs to S-04.                        | Plan   |
| Not stored                   | title, `violations`/`ok`, `updated_at`                   | Derivable or unused now; plans are immutable (no edit path, PRD v2).   | Plan   |

## Scope

**In scope:** `plans` migration (jsonb plan + jsonb profile snapshot, many-per-user,
4 RLS policies, user_id index); regenerated `database.types.ts`; `SavedPlan`/DTO
types; `plans.ts` save service; `POST /api/plan/save` with `planSchema`
re-validation; "Zapisz plan" button + save state in `PlanView`.

**Out of scope:** browse/list/reopen UI + read endpoint (S-04); normalized tables;
plan editing; title/violations/updated_at columns; cross-save de-duplication.

## Architecture / Approach

Bottom-up vertical slice in three phases, mirroring S-01/S-02 (data → backend →
frontend). The save endpoint reuses `generate.ts`'s auth/config/profile guard
ladder: it parses the body, re-validates `body.plan` with `planSchema`, loads the
profile via `getProfile` to build the snapshot, then `savePlan()` inserts one row.
The island gains a save status (`idle → saving → saved/error`) tied to the current
plan so regeneration re-enables saving.

## Phases at a Glance

| Phase        | What it delivers                                          | Key risk                                              |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------- |
| 1. Data      | `plans` table + RLS + regenerated types + shared types    | RLS/migration correctness (mitigated by F-01 template) |
| 2. Backend   | `plans.ts` service + `POST /api/plan/save` with validation | Status-code/contract parity with `generate.ts`        |
| 3. Frontend  | "Zapisz plan" button + save state in `PlanView`            | Resetting save state on regeneration                  |

**Prerequisites:** S-02 done (it is); linked hosted Supabase (`npm run db:push`);
a signed-in test user with a saved profile.
**Estimated effort:** ~1–2 after-hours sessions across 3 phases (low risk).

## Open Risks & Assumptions

- **Snapshot drift:** the profile snapshot reflects the profile at *save* time, not
  strictly *generation* time. Negligible because both happen in the same view
  seconds apart; accepted to keep the snapshot server-derived and untrusted-input-free.
- **Violation trail not persisted:** a saved soft-failure plan loses its `violations`;
  acceptable since the user chose to save and S-04 can re-derive nothing from it.
- **No test runner** (consistent with S-01/S-02) — verification is manual + the
  reused pure `planSchema`.

## Success Criteria (Summary)

- A user generates a plan, clicks "Zapisz plan", and the plan is stored and survives
  re-login; the button confirms with "Zapisano".
- Regenerating re-enables saving; multiple saves create multiple rows; a second user
  cannot read the first user's plans (RLS).
- Soft-failure plans are savable; malformed/unauthenticated/no-profile requests fail
  with 400/401/422 respectively.
