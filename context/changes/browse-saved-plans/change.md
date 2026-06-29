---
change_id: browse-saved-plans
title: Browse saved plans (roadmap S-04)
status: implementing
created: 2026-06-29
updated: 2026-06-29
---

## Notes

Roadmap slice S-04 (FR-006, US-01) — the read side of persistence, closing the
end-to-end loop in the Primary Success Criterion. S-03 already landed the `plans`
table (RLS, many rows/user), the `savePlan` service, and `POST /api/plan/save`,
but there is no way to see saved plans afterwards.

This change adds read functions (`getPlans`/`getPlanById`) to the existing
`plans` service, a server-rendered `/plans` list (goal label + formatted date,
newest first, empty-state CTA), and a server-rendered `/plan/[id]` reopen page
that reuses the plan markup extracted from `PlanView`. No new endpoints (data is
loaded in the Astro page frontmatter); no plan editing (PRD v2 non-goal).
