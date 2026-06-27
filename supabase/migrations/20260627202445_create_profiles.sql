-- Training profile (S-01). One editable row per user; deny-by-default RLS per
-- supabase/migrations/README.md. Bounded choice fields are Postgres enums so they
-- flow into generated TS types and are enforced at the database.

-- Enum types ----------------------------------------------------------------
create type goal as enum ('strength', 'muscle_gain', 'fat_loss', 'general_fitness');

create type experience_level as enum ('beginner', 'intermediate', 'advanced');

create type equipment_item as enum (
  'barbell',
  'dumbbells',
  'machines',
  'pull_up_bar',
  'kettlebell',
  'resistance_bands',
  'bodyweight_only'
);

-- Table ---------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Required inputs.
  goal goal not null,
  experience_level experience_level not null,
  age smallint not null check (age between 13 and 100),
  weight_kg numeric not null check (weight_kg > 0 and weight_kg <= 500),
  training_days_per_week smallint not null check (training_days_per_week between 1 and 7),
  equipment equipment_item[] not null check (array_length(equipment, 1) >= 1),
  -- Optional inputs (a beginner may not know these yet).
  squat_kg numeric check (squat_kg is null or (squat_kg > 0 and squat_kg <= 1000)),
  bench_kg numeric check (bench_kg is null or (bench_kg > 0 and bench_kg <= 1000)),
  deadlift_kg numeric check (deadlift_kg is null or (deadlift_kg > 0 and deadlift_kg <= 1000)),
  ohp_kg numeric check (ohp_kg is null or (ohp_kg > 0 and ohp_kg <= 1000)),
  plank_seconds smallint check (plank_seconds is null or (plank_seconds > 0 and plank_seconds <= 3600)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deny-by-default: RLS on, no policy yet = no access for anyone.
alter table profiles enable row level security;

-- Index the isolation predicate (every policy filters on user_id).
create index profiles_user_id_idx on profiles (user_id);

-- Granular, per-operation policies — authenticated role only.
create policy "profiles_select_own"
  on profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "profiles_delete_own"
  on profiles for delete
  to authenticated
  using (auth.uid() = user_id);
