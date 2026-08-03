# Account Isolation Integration Tests — Plan Brief

> Full plan: `context/changes/testing-account-isolation/plan.md`
> Research: `context/changes/testing-account-isolation/research.md`

## What & Why

No automated test proves that one Treningo account can never read or modify
another account's saved plans or body metrics (age, weight, lifts) — every
prior slice verified this manually and deferred automation to "the `/10x-e2e`
phase," which never ran. This change closes that loop: a real-database
integration suite, running against a local Supabase stack with two real
signed-in users, exercises the actual RLS policies and service-layer
defense-in-depth the app relies on in production.

## Starting Point

Phase 1 of the test rollout (`context/changes/testing-plan-soundness/`)
delivered Vitest 4.1.10 for pure-function unit tests — zero database, zero
env vars. This change adds a second, separate test layer on top: a local
Docker Supabase stack, two real throwaway users, and direct calls to the
app's own service functions (`getProfile`, `getPlanById`, etc.), which
research confirmed already apply an explicit `userId` filter alongside RLS
consistently across every read/write path.

## Desired End State

`npm run test:integration` runs a real-database suite that fails loudly if
user B ever reads, updates, or deletes user A's profile or plan row — through
the app's real service functions and the raw RLS policies that have zero
coverage today (update/delete, since no app UI edits plans or profiles after
creation). CI provisions Docker + Supabase and runs this suite in its own
job, independent of the existing fast lint/unit/build gate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test layer | Vitest + local Docker Supabase, not Playwright/e2e | The risk is a database-policy question; Playwright would still need the same Postgres+RLS backend underneath, just with browser flake added on top for the same signal | Research |
| Env loading | Node's native `process.loadEnvFile()` | Zero new dependency; Node 22 already supports it | Research |
| Test user lifecycle | Once per suite (`beforeAll`) | One local-stack boot pays for the whole suite; RLS isolation is deterministic per pair regardless of reuse | Plan |
| Test scope | Read + write isolation (select, update, delete) | Same infrastructure cost as read-only; the RLS policies explicitly cover all four operations and currently have zero test coverage on update/delete | Plan |
| Suite separation | Dedicated `test:integration` script + CI job | Keeps Phase 1's fast unit gate untouched by Docker availability/boot time | Plan |
| Existing manual script | Not reused/automated as-is | It manipulates Postgres GUCs directly, bypassing real GoTrue JWT issuance — a weaker proof than real `auth.signUp` | Research |

## Scope

**In scope:**
- Separate `vitest.integration.config.ts` + env-loading setup file
- A shared `createTestUser()` helper (real signup against local Supabase)
- Read/update/delete isolation tests for `profiles` and `plans`, plus
  anon-sees-nothing and same-user-succeeds baselines
- A dedicated CI job provisioning Docker + Supabase CLI
- `test-plan.md` §6.3 cookbook fill-in

**Out of scope:**
- Playwright/e2e testing of this risk
- Touching the hosted Supabase project in any way
- New app-level update/delete UI or endpoints for plans/profiles (tests call
  Postgrest directly for these)
- Automating the existing `verify-profiles-rls.sql` script

## Architecture / Approach

A second, independent Vitest config targets `*.integration.test.ts` files
only; Phase 1's `vitest.config.ts` gets an explicit exclude so the two
suites never overlap. Both `profiles` and `plans` isolation tests reuse one
shared helper for creating real, signed-in throwaway users against a local
Docker Supabase stack, then call the app's actual service functions (plus
raw Postgrest for update/delete, which no service function exposes) — never
a mocked client.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Infra bootstrap | Separate config, env loading, test-user helper, CI job, one smoke test | Docker unavailable in the planning sandbox — implementation must run/verify on a machine with Docker |
| 2. Profile isolation | select/update/delete cross-user tests + baselines | Silently swallowing an error could look like a pass without proving isolation |
| 3. Plan isolation | list/single-item/update/delete cross-user tests + baselines | Oracle for the "not found" case must match the real route's actual behavior, not an assumption |
| 4. Cookbook update | `test-plan.md` §6.3 filled in | None — documentation only |

**Prerequisites:** Docker installed locally (or CI's native Docker), Supabase
CLI (already a devDependency), `supabase/config.toml` already checked in.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- The exact Supabase CLI GitHub Action name/version for CI is unverified in
  this planning session (no Docker/live web access); confirm the current
  tag when wiring the CI job.
- The local anon key is intentionally not hardcoded anywhere — a one-time
  local setup cost per developer machine.
- `.env.test.local` must be added to `.gitignore` alongside the existing
  `.env`/`.dev.vars` entries.

## Success Criteria (Summary)

- `npm run test:integration` fails if any cross-user read/update/delete
  ever succeeds, and passes today given the current RLS + service-layer
  design.
- The existing `npm run test` unit suite and its CI gate are completely
  unaffected by this change.
- CI independently proves isolation on every push/PR without touching the
  hosted project.
