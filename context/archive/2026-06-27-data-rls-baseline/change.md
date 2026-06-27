---
id: data-rls-baseline
title: Data & account-isolation baseline
status: archived
created: 2026-06-27
updated: 2026-06-27
archived_at: 2026-06-27T19:35:36Z
roadmap_ref: F-01
---

# Data & account-isolation baseline (F-01)

Foundation: establish the Supabase migration workflow (hosted-linked, no Docker),
the typegen pipeline, the shared-types location, and a reusable deny-by-default
RLS convention — **without creating any app/domain tables**. The profile table
lands in S-01 (`training-profile`) and the plans table in S-03 (`save-plan`),
each applying the convention this change establishes.

See `plan-brief.md` for the two-pager and `plan.md` for the full plan.
