# Data & account-isolation baseline (F-01) Implementation Plan

## Overview

Establish the data-layer foundation for Treningo **without creating any application/domain tables**: a hosted-linked Supabase migration workflow (no Docker), a type-generation pipeline, the shared-types location (`src/types.ts`), and a reusable **deny-by-default Row-Level-Security (RLS) convention** for per-user data. This fixes the account-isolation and data-privacy guardrails *once*, as a contract that S-01 (`training-profile`) and S-03 (`save-plan`) will each apply when they add their own tables.

## Current State Analysis

- **`supabase init` already done** — `supabase/config.toml` + `supabase/.gitignore` exist; **no `supabase/migrations/` directory** and no app tables (only Supabase's built-in `auth.users`).
- **Supabase CLI is a devDependency** (`supabase` `^2.23.4`); `@supabase/ssr` `^0.10.3` and `@supabase/supabase-js` `^2.99.1` are installed.
- **No `db:*` npm scripts** in `package.json` (only astro/lint/format).
- **SSR client uses the anon/publishable key with cookie-based sessions** (`src/lib/supabase.ts:9`, `createServerClient`), so the user's JWT flows with each request → RLS policies keyed on `auth.uid()` will work correctly.
- **`src/types.ts` does not exist**; the path alias `@/*` → `./src/*` is configured.
- **Hosted Supabase is the target** (production secrets `SUPABASE_URL`/`SUPABASE_KEY` set this session); local stack needs Docker (~7 GB) which the user chose to avoid.
- **CLAUDE.md already states** migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql` and "always enable RLS with granular per-operation, per-role policies" — this change makes that rule concrete and reusable.

### Key Discoveries:

- `src/lib/supabase.ts:9` — anon key + cookie session ⇒ `auth.uid()`-based RLS is the correct isolation mechanism (no service-role key in the request path).
- `supabase/config.toml` present, `supabase/migrations/` absent ⇒ tooling is half-initialized; this change completes the migration + typegen workflow.
- CLAUDE.md migration/RLS rule already exists ⇒ expand it into an explicit template rather than inventing a new convention.

## Desired End State

A developer (or agent) can: create a timestamped migration, push it to the hosted Supabase project, regenerate TypeScript types into `src/db/database.types.ts`, and import shared entity types from `src/types.ts`. A single, documented deny-by-default RLS SQL template exists that S-01/S-03 copy verbatim for their tables. **No domain tables are created in this change.** Verify by: `supabase migration list --linked` shows linkage, `npm run db:types` regenerates types cleanly, `npm run build`/`lint` pass, and the RLS template is reviewable in the repo.

## What We're NOT Doing

- **No app/domain tables** — no `profiles`, no `plans`. Those belong to S-01 and S-03.
- **No executable migration that mutates the hosted DB** — the RLS pattern ships as a non-applied template (a `.md` doc, not a `.sql` migration file), so `db push` has nothing to apply.
- **No automated RLS test harness** — deferred to S-01, which has a real table (`profiles`) to assert deny-by-default against. F-01 covers it via the reviewed template + documented manual SQL check.
- **No local Docker / `supabase start` workflow** — hosted-linked only.
- **No changes to auth, middleware, or the existing SSR client.**
- **No service-role key introduction** — the app stays on the anon key + RLS.

## Implementation Approach

Three lean, independently verifiable phases: (1) wire the hosted-linked migration workflow and `db:*` scripts; (2) stand up the typegen pipeline and the `src/db/database.types.ts` + `src/types.ts` type locations; (3) capture the deny-by-default RLS convention as a reusable, documented SQL template plus an expanded CLAUDE.md rule, with a manual verification procedure. The migration and typegen steps talk to the hosted project, so the two genuinely interactive, credential-bearing steps (`supabase login`, `supabase link`) are run by the user and called out as prerequisites.

## Critical Implementation Details

- **Template must not be an applied migration.** Any file matching `supabase/migrations/<timestamp>_*.sql` is applied by `supabase db push`. The RLS template therefore lives in a non-`.sql` file (`supabase/migrations/README.md`) so it documents the pattern without ever executing or creating tables.
- **`supabase link` is credential-bearing and interactive.** It needs the project ref + database password and a prior `supabase login` (access token). These are run by the user (values never pass through the agent), mirroring how `wrangler login`/secrets were handled. Linkage state is stored under `supabase/.temp/` (gitignored by Supabase's own `.gitignore`).
- **Typegen against an app-table-less schema yields a near-empty `Database` type.** `supabase gen types typescript --linked` targets the `public` schema, which currently has no app tables — the generated file will contain the `Database` scaffold with empty `Tables`. That is expected and correct; S-01 regenerates it after adding `profiles`.

## Phase 1: Migration tooling & workflow

### Overview

Complete the half-initialized Supabase tooling: create the tracked `migrations/` directory, add `db:*` npm scripts wrapping the CLI, and document the interactive `login`/`link` prerequisites — yielding a working migration pipeline against the hosted project.

### Changes Required:

#### 1. Tracked migrations directory

**File**: `supabase/migrations/.gitkeep`

**Intent**: Create the directory CLAUDE.md already references so timestamped migrations have a home and the empty dir is tracked in git.

**Contract**: New empty tracked file `supabase/migrations/.gitkeep`. No `.sql` migration is added in this change.

#### 2. Database workflow npm scripts

**File**: `package.json`

**Intent**: Make the hosted-linked workflow discoverable and consistent for solo-dev + agents, wrapping `npx supabase` so flags (notably `--linked`) aren't forgotten.

**Contract**: Add to `scripts`:
- `db:link` → `supabase link` (one-time project linkage)
- `db:migration` → `supabase migration new` (create a timestamped migration)
- `db:push` → `supabase db push` (apply pending migrations to the linked hosted project)
- `db:types` → generates types into `src/db/database.types.ts` (see Phase 2 for the exact command/contract)

#### 3. Prerequisite documentation

**File**: `CLAUDE.md` (Local setup section)

**Intent**: Document that the migration workflow is hosted-linked (no Docker) and that `supabase login` + `db:link` are one-time user-run, credential-bearing steps.

**Contract**: Prose addition under the existing "Local setup" section describing: `supabase login`, `npm run db:link` (needs project ref + DB password), then the `db:migration` → `db:push` → `db:types` loop. Note linkage state lives in `supabase/.temp/` and is gitignored.

### Success Criteria:

#### Automated Verification:

- `supabase/migrations/` exists and is tracked: `test -d supabase/migrations`
- `db:*` scripts present: `npm run db:push --silent --dry-run 2>/dev/null` is defined (script exists), or `node -e "process.exit(require('./package.json').scripts['db:push']?0:1)"`
- Lint passes: `npm run lint`

#### Manual Verification:

- After user runs `supabase login` + `npm run db:link`, `npx supabase migration list --linked` prints the (empty) migration history without error, confirming linkage to the hosted project.
- `npm run db:push` reports "no changes" (no pending migrations to apply — confirms the pipeline works without mutating the DB).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that linkage + `db push` were verified before proceeding.

---

## Phase 2: Type generation pipeline & types scaffold

### Overview

Stand up the typegen pipeline and the two type locations: machine-generated DB types in `src/db/database.types.ts`, hand-authored shared entities/DTOs in `src/types.ts` (which re-exports the `Database` type). Regeneration never clobbers hand-authored types.

### Changes Required:

#### 1. Typegen script

**File**: `package.json`

**Intent**: One command regenerates DB types from the linked hosted schema into a dedicated generated file.

**Contract**: `scripts.db:types` → `supabase gen types typescript --linked > src/db/database.types.ts`. The `--linked` flag targets the hosted project (no local DB).

#### 2. Generated DB types

**File**: `src/db/database.types.ts`

**Intent**: Hold the Supabase-generated `Database` type; treated as generated output (do not hand-edit).

**Contract**: Output of `npm run db:types`. With no app tables yet, this is the `Database` scaffold with empty `Tables`. File header should note it is generated.

#### 3. Shared types location

**File**: `src/types.ts`

**Intent**: Establish the hand-authored shared-entity/DTO location per CLAUDE.md, re-exporting the generated `Database` type so consumers have one import surface for app types.

**Contract**: Re-export `Database` (and helper aliases like `Tables<...>`) from `@/db/database.types`; leave a documented placeholder section for entity/DTO types that S-01 will populate. No domain entities defined yet.

### Success Criteria:

#### Automated Verification:

- `npm run db:types` produces a non-empty `src/db/database.types.ts`: `test -s src/db/database.types.ts`
- `src/types.ts` exists: `test -f src/types.ts`
- Type checking passes: `npm run build` (Astro's `astro check` / tsc resolves `@/types` and `@/db/database.types`)
- Lint passes: `npm run lint`

#### Manual Verification:

- Re-running `npm run db:types` is idempotent (no spurious diff beyond schema changes).
- `import type { Database } from "@/types"` resolves in an editor without error.

**Implementation Note**: After completing this phase and automated verification, pause for human confirmation before proceeding.

---

## Phase 3: RLS convention artifact & docs

### Overview

Capture the deny-by-default, per-user RLS convention as a reusable SQL template plus an expanded CLAUDE.md rule, and document the manual SQL verification that stands in for automated RLS tests until S-01.

### Changes Required:

#### 1. RLS convention template

**File**: `supabase/migrations/README.md`

**Intent**: Provide the canonical deny-by-default per-user RLS SQL that S-01/S-03 copy when creating `profiles`/`plans`. Lives in `migrations/` for discoverability but as `.md` so it is never applied.

**Contract**: Markdown doc containing: the migration naming convention (`YYYYMMDDHHmmss_short_description.sql`), and a commented SQL template establishing — for a per-user table — a `user_id uuid not null references auth.users(id)` column, `alter table ... enable row level security;`, and **granular per-operation policies** (`select`/`insert`/`update`/`delete`) restricted to the `authenticated` role with `auth.uid() = user_id` (and `anon` granted nothing → deny-by-default). Include the `with check` clause on insert/update. This SQL is illustrative (a template), not an applied migration.

#### 2. Expanded RLS rule

**File**: `CLAUDE.md` (Conventions → Supabase migrations bullet)

**Intent**: Turn the existing one-line rule into an explicit pointer to the template and the deny-by-default contract, so future work can't drift.

**Contract**: Edit the existing "Supabase migrations" convention bullet to reference `supabase/migrations/README.md` as the source of the RLS pattern and state the deny-by-default per-user invariant in one sentence.

#### 3. Manual verification procedure

**File**: `context/changes/data-rls-baseline/plan.md` (Testing Strategy, below) + `supabase/migrations/README.md`

**Intent**: Document the manual SQL check that proves isolation once a table exists, so S-01 inherits a ready procedure (F-01 itself has no table to run it against).

**Contract**: A short "verifying isolation" subsection in `supabase/migrations/README.md`: as user A, insert a row; as user B (different session/JWT), confirm `select` returns zero rows and `update`/`delete` affect zero rows. Note this runs in S-01 against `profiles`.

### Success Criteria:

#### Automated Verification:

- Template exists: `test -f supabase/migrations/README.md`
- CLAUDE.md references the template: `grep -q "migrations/README.md" CLAUDE.md`
- Lint/format pass on changed Markdown: `npm run lint`

#### Manual Verification:

- A reviewer reading `supabase/migrations/README.md` can copy the template to create a new per-user table with correct deny-by-default RLS without further research.
- The documented isolation check is concrete enough to run verbatim in S-01.

**Implementation Note**: After completing this phase and automated verification, pause for human confirmation. This is the final phase.

---

## Testing Strategy

### Unit Tests:

- None — this change ships no application code paths (no runtime logic, no components). Verification is tooling + type-resolution + document review.

### Integration Tests:

- None in F-01. The first integration of the RLS convention (insert/select isolation across two users) is exercised in S-01 against the real `profiles` table.

### Manual Testing Steps:

1. Run `supabase login` then `npm run db:link` (provide project ref + DB password) — one-time.
2. `npx supabase migration list --linked` → prints empty history, no error (linkage OK).
3. `npm run db:push` → "no changes" (pipeline OK, DB untouched).
4. `npm run db:types` → `src/db/database.types.ts` regenerates; `npm run build` resolves `@/types`.
5. Read `supabase/migrations/README.md` → confirm the RLS template is copy-ready and the isolation check is unambiguous.

## Migration Notes

No data migration. No schema change applied to the hosted DB in this change. The migration *workflow* is what's being established; the first applied migration arrives in S-01.

## References

- Roadmap item: `context/foundation/roadmap.md` → F-01 (`data-rls-baseline`)
- PRD guardrails: `context/foundation/prd.md` → Success Criteria §Guardrails (account isolation, data privacy), §Access Control, §NFRs
- Existing SSR client: `src/lib/supabase.ts:9` (anon key + cookie session → `auth.uid()` RLS)
- Convention source to expand: `CLAUDE.md` → Conventions → Supabase migrations

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration tooling & workflow

#### Automated

- [ ] 1.1 `supabase/migrations/` exists and is tracked
- [ ] 1.2 `db:*` scripts present in package.json
- [ ] 1.3 Lint passes

#### Manual

- [ ] 1.4 Linkage verified: `migration list --linked` succeeds after user login + db:link
- [ ] 1.5 `db:push` reports "no changes"

### Phase 2: Type generation pipeline & types scaffold

#### Automated

- [ ] 2.1 `npm run db:types` produces non-empty `src/db/database.types.ts`
- [ ] 2.2 `src/types.ts` exists
- [ ] 2.3 Type checking passes (`npm run build`)
- [ ] 2.4 Lint passes

#### Manual

- [ ] 2.5 `npm run db:types` is idempotent
- [ ] 2.6 `import type { Database } from "@/types"` resolves

### Phase 3: RLS convention artifact & docs

#### Automated

- [ ] 3.1 `supabase/migrations/README.md` exists
- [ ] 3.2 CLAUDE.md references the template
- [ ] 3.3 Lint/format pass on changed Markdown

#### Manual

- [ ] 3.4 Template is copy-ready for a new per-user table
- [ ] 3.5 Documented isolation check is runnable verbatim in S-01
