# Migrations & RLS convention

Migrations target the **hosted** Supabase project (no local Docker). See the
"Database migrations" section in `CLAUDE.md` for the `login` / `link` / `push`
workflow. This file is the canonical **deny-by-default RLS convention** that
every per-user table must follow — it is documentation, **not an applied
migration** (only `<timestamp>_name.sql` files are applied by `db push`).

## Naming

`supabase/migrations/<YYYYMMDDHHmmss>_<short_description>.sql` — created via
`npm run db:migration <short_description>`.

## Deny-by-default RLS template (per-user table)

Treningo's account-isolation and data-privacy guardrails require that a user can
only ever read or modify **their own** rows. Because the SSR client uses the
**anon key + the user's cookie session**, `auth.uid()` resolves to the logged-in
user inside policies — that is the isolation predicate. Enabling RLS with no
policy blocks *all* access (deny-by-default); we then grant exactly the per-user
access needed, to the `authenticated` role only. `anon` is never granted a
policy, so anonymous requests match zero rows.

Copy and adapt this into a new migration:

```sql
create table <table_name> (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ... domain columns ...
  created_at timestamptz not null default now()
);

-- Deny-by-default: RLS on, no policy yet = no access for anyone.
alter table <table_name> enable row level security;

-- Index the isolation predicate (every policy filters on user_id).
create index <table_name>_user_id_idx on <table_name> (user_id);

-- Granular, per-operation policies — authenticated role only.
create policy "<table_name>_select_own"
  on <table_name> for select
  to authenticated
  using (auth.uid() = user_id);

create policy "<table_name>_insert_own"
  on <table_name> for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "<table_name>_update_own"
  on <table_name> for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "<table_name>_delete_own"
  on <table_name> for delete
  to authenticated
  using (auth.uid() = user_id);
```

Rules:

- **One policy per operation** (`select` / `insert` / `update` / `delete`) — never a
  single `for all` policy. Granularity makes intent auditable.
- **`to authenticated`** on every policy; never add an `anon` policy to a per-user
  table.
- **`using`** filters which existing rows are visible/affected; **`with check`**
  validates new/updated row contents. `insert` needs `with check`; `update` needs
  both.
- `user_id` is `not null` and FK to `auth.users(id)` with `on delete cascade`.

## Verifying isolation (runs in S-01, on the first real table)

F-01 ships no table, so this is the procedure S-01 (`training-profile`) runs once
`profiles` exists. As **user A** (logged-in session), insert a row. As **user B**
(different session/JWT), confirm:

1. `select * from <table>` returns **zero** of user A's rows.
2. `update`/`delete` targeting user A's row affect **zero** rows.
3. A signed-out (`anon`) request returns zero rows for every operation.

S-01 turns this into an automated test against `profiles`.
