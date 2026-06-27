-- Verify account-isolation RLS on `profiles` (S-01).
--
-- Implements the "Verifying isolation" procedure from
-- supabase/migrations/README.md against the first real per-user table.
--
-- Runs as plain SQL (no psql meta-commands) so it works in the Supabase Studio
-- SQL editor as well as psql:
--   psql "$DATABASE_URL" -f supabase/scripts/verify-profiles-rls.sql
--
-- The script simulates two authenticated users (A and B) and an anonymous
-- request by setting the role + JWT claims that RLS policies read via
-- auth.uid(). It holds the two user ids in custom GUCs so you edit them in ONE
-- place. Replace both UUIDs below with real ids from auth.users in your
-- project (the FK on profiles.user_id requires them to exist). Everything runs
-- in a transaction and is rolled back, so it leaves no trace.

begin;

-- ⬇⬇ EDIT THESE TWO: real auth.users ids for two different users ⬇⬇
select set_config('myapp.user_a', '00000000-0000-0000-0000-00000000000a', true);
select set_config('myapp.user_b', '00000000-0000-0000-0000-00000000000b', true);

-- ── As user A: insert a profile row ───────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('myapp.user_a'), 'role', 'authenticated')::text,
  true
);

insert into profiles (user_id, goal, experience_level, age, weight_kg, training_days_per_week, equipment)
values (current_setting('myapp.user_a')::uuid, 'strength', 'beginner', 30, 80, 3, array['barbell']::equipment_item[]);

-- Sanity: A sees exactly its own row.
select 'A sees own rows (expect 1)' as check, count(*) as rows from profiles;

-- ── As user B: must see / affect zero of A's rows ─────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('myapp.user_b'), 'role', 'authenticated')::text,
  true
);

select 'B select of A rows (expect 0)' as check, count(*) as rows
from profiles where user_id = current_setting('myapp.user_a')::uuid;

with del as (
  delete from profiles where user_id = current_setting('myapp.user_a')::uuid returning 1
)
select 'B delete of A rows (expect 0)' as check, count(*) as rows from del;

with upd as (
  update profiles set age = 99 where user_id = current_setting('myapp.user_a')::uuid returning 1
)
select 'B update of A rows (expect 0)' as check, count(*) as rows from upd;

-- ── As anon: must see zero rows ───────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', null, true);

select 'anon select (expect 0)' as check, count(*) as rows from profiles;

rollback;
