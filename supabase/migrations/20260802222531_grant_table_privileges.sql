-- Table-level GRANTs for profiles/plans.
--
-- Discovered running `supabase start` for the first time against a fresh
-- local stack (this project had never been run locally before — every prior
-- migration only ran against the hosted project, which auto-provisions
-- schema-level default privileges for anon/authenticated/service_role at
-- project creation; that provisioning is NOT part of any migration file and
-- is NOT replayed by a fresh `supabase start`). Without these GRANTs, a
-- fresh local instance returns "permission denied for table X" for every
-- query — RLS policies are never even reached, because Postgres checks
-- table-level privileges before evaluating row security.
--
-- `anon` gets SELECT only (matching the deny-by-default design documented in
-- supabase/migrations/README.md: "anon is never granted a policy, so
-- anonymous requests match zero rows" — the intent is a query that runs and
-- returns zero rows via RLS, not a hard permission error).
-- `authenticated` gets full CRUD; RLS policies (already in place) are what
-- actually scope each row to its owner.
grant select on profiles, plans to anon;
grant select, insert, update, delete on profiles, plans to authenticated;
