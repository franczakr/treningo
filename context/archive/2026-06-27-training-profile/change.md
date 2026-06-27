---
id: training-profile
title: Training profile capture & save
status: archived
created: 2026-06-27
updated: 2026-06-28
archived_at: 2026-06-27T22:08:38Z
roadmap_ref: S-01
---

# Training profile capture & save (S-01)

First user-facing data slice: a logged-in user fills in and saves a single,
editable training profile (goal, experience level, age, weight, available
equipment, training days per week, optional current lifts and plank time). Adds
the `profiles` table applying the F-01 deny-by-default RLS convention, the shared
entity/DTO types, a shared zod schema, a profile service, an upsert API route,
and a protected profile page with a React form island.

See `plan-brief.md` for the two-pager and `plan.md` for the full plan.
