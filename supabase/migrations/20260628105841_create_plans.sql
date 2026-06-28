-- Saved plans (S-03). Persists a generated workout plan plus a snapshot of the
-- profile it was generated from, under deny-by-default RLS per
-- supabase/migrations/README.md. Unlike profiles, user_id is NOT unique: a user
-- accumulates many saved plans (S-04 browses the list). The plan is stored whole
-- as jsonb (generated/validated/read as a unit, never edited in v1).

-- Table ---------------------------------------------------------------------
create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The generated WorkoutPlan, stored verbatim.
  plan jsonb not null,
  -- Snapshot of the profile inputs the plan was generated from (server-derived).
  profile_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- Deny-by-default: RLS on, no policy yet = no access for anyone.
alter table plans enable row level security;

-- Index the isolation predicate (every policy filters on user_id).
create index plans_user_id_idx on plans (user_id);

-- Granular, per-operation policies — authenticated role only.
create policy "plans_select_own"
  on plans for select
  to authenticated
  using (auth.uid() = user_id);

create policy "plans_insert_own"
  on plans for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "plans_update_own"
  on plans for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plans_delete_own"
  on plans for delete
  to authenticated
  using (auth.uid() = user_id);
