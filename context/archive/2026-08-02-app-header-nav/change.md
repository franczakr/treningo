---
change_id: app-header-nav
title: Persistent app header on every signed-in page (roadmap S-07)
status: archived
created: 2026-08-02
updated: 2026-08-03
archived_at: 2026-08-03T10:20:00Z
---

## Notes

Roadmap slice S-07 (FR-002, FR-003, FR-006, US-01). Prerequisite F-02
(gym-visual-identity) is implemented and reviewed — its `Layout.astro` `nav`
slot exists but nothing fills it yet.

Today `/dashboard`, `/training-profile`, `/plan`, `/plans`, and `/plan/[id]`
render with no navigation at all beyond whatever links their own page body
happens to include (`dashboard.astro` has some, the other four have none).
This adds one new `AppHeader.astro` component — distinct from `Topbar.astro`,
which serves the public landing page's signed-in/signed-out toggle — and
mounts it into all five protected pages via the `nav` slot.

Does not touch any page's existing body content, cards, or hardcoded colours
(S-08's job) — purely additive.
