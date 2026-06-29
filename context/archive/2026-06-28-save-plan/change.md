---
change_id: save-plan
title: Save a generated workout plan (roadmap S-03)
status: archived
created: 2026-06-28
updated: 2026-06-29
archived_at: 2026-06-29T07:26:02Z
---

## Notes

Roadmap slice S-03 (FR-005, US-01). Persist the currently-ephemeral generated
plan so it survives between sessions. Adds a `plans` table under the F-01
deny-by-default RLS convention (many plans per user, jsonb plan + jsonb profile
snapshot), a save service + `POST /api/plan/save` endpoint that re-validates the
plan against `planSchema`, and a "Zapisz plan" button in `PlanView`. Read/browse
is out of scope — that is S-04.
