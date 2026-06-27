# Data & account-isolation baseline (F-01) — Plan Brief

> Full plan: `context/changes/data-rls-baseline/plan.md`

## What & Why

Establish Treningo's data-layer foundation — migration workflow, type generation, shared-types location, and a reusable deny-by-default RLS convention — **without creating any app tables**. This fixes the PRD's account-isolation and data-privacy guardrails *once*, as a contract that the profile slice (S-01) and plans slice (S-03) each apply when they add their own tables.

## Starting Point

`supabase init` is half-done (`config.toml` exists, but no `migrations/` dir, no app tables — only `auth.users`). The Supabase CLI is installed; the SSR client already uses the anon key + cookie sessions, so `auth.uid()`-based RLS is the correct isolation mechanism. There are no `db:*` scripts and no `src/types.ts`.

## Desired End State

A developer/agent can create a migration, push it to the **hosted** Supabase project (no Docker), regenerate TS types into `src/db/database.types.ts`, and import shared types from `src/types.ts`. A documented RLS SQL template is copy-ready for per-user tables. No domain tables are created here.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| F-01 scope vs tables | Tooling + convention, **zero tables** | Respect roadmap progressive disclosure; profile/plans tables belong to S-01/S-03 | Roadmap |
| Migration workflow | Hosted-linked (`db push`), no Docker | Matches the hosted-first choice; avoids the ~7 GB Docker stack | Plan |
| Type layout | Generated → `src/db/database.types.ts`; hand-authored → `src/types.ts` | Regen never clobbers hand-authored types; one import surface | Plan |
| RLS convention artifact | SQL template doc + expanded CLAUDE.md rule | Reusable, reviewable contract that S-01/S-03 copy verbatim | Plan |
| `db:*` npm scripts | Add them | Discoverable, consistent workflow; flags like `--linked` not forgotten | Plan |
| Guardrail verification | Docs + manual SQL now; automated RLS tests in S-01 | No table to assert against yet; S-01 has the real `profiles` table | Plan |

## Scope

**In scope:** hosted-linked migration workflow, `db:*` scripts, `migrations/` dir, typegen pipeline → `src/db/database.types.ts`, `src/types.ts` scaffold, deny-by-default RLS template doc, expanded CLAUDE.md rule, manual isolation-check procedure.

**Out of scope:** any app/domain tables (`profiles`, `plans`), any applied/executable migration, automated RLS test harness, local Docker workflow, service-role key, changes to auth/middleware/SSR client.

## Architecture / Approach

Three lean phases against the hosted project: **(1)** complete the migration tooling + `db:*` scripts and document the interactive `login`/`link` prerequisites; **(2)** stand up typegen into a dedicated generated file plus the `src/types.ts` re-export surface; **(3)** capture the RLS convention as a non-applied SQL template (`supabase/migrations/README.md`, `.md` so `db push` never runs it) plus an expanded CLAUDE.md rule and a manual isolation check. The two credential-bearing steps (`supabase login`, `db:link`) are user-run — values never pass through the agent.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration tooling & workflow | Tracked `migrations/`, `db:*` scripts, documented hosted-linked loop | Link is interactive/credential-bearing (user step) |
| 2. Typegen pipeline & types scaffold | `db:types` → `src/db/database.types.ts`; `src/types.ts` re-export | Empty schema ⇒ near-empty generated type (expected) |
| 3. RLS convention artifact & docs | Deny-by-default SQL template + CLAUDE.md rule + manual check | Doc could drift if not used; mitigated by S-01 copying it next |

**Prerequisites:** a Supabase access token (`supabase login`) and the project ref + DB password (`db:link`) — user-run, one-time.
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- Assumes the hosted project from this session is the link target; the user holds the project ref + DB password.
- A "zero-tables" foundation is intentionally thin — its real validation is S-01 copying the RLS template onto `profiles` and the isolation check passing there.
- Typegen against an app-table-less `public` schema produces an empty `Tables` map; that is expected, not a failure.

## Success Criteria (Summary)

- The hosted-linked migration + typegen workflow runs end-to-end (`migration list --linked`, `db push` "no changes", `db:types` regenerates) and `npm run build` resolves `@/types`.
- A reviewer can copy the RLS template to create a correctly isolated per-user table without further research.
- No domain tables and no applied migration were introduced.
