-- Adds a user-editable display name to saved plans (FR-008: rename a saved
-- plan). Nullable — existing/unnamed plans fall back to the goal label in the
-- UI. No RLS changes: the existing plans_update_own policy already covers
-- updates to this column.

alter table plans
  add column name text;
