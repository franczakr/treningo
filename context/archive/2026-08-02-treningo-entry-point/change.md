---
change_id: treningo-entry-point
title: Treningo entry point — home page & post-sign-in landing (roadmap S-06)
status: archived
created: 2026-08-02
updated: 2026-08-03
archived_at: 2026-08-03T10:19:22Z
---

## Notes

Roadmap slice S-06 (FR-001, US-01, Access Control, NFR visual identity).
Prerequisite F-02 (gym-visual-identity) is implemented and reviewed.

Today `/` is the 10x Astro Starter's stock landing page (`src/components/Welcome.astro`)
— literal "10x Astro Starter" branding, generic dev-tool feature cards, cosmic
dark-space decoration — and signing in redirects back to `/` (`src/pages/api/auth/signin.ts:19`)
instead of the dashboard. This closes both gaps using the tokens F-02 established.

Scope: `Welcome.astro` content + retint, `Topbar.astro` retint (embedded in
Welcome, same mechanism as today — wiring it into the shared shell's nav slot
is S-07's job, not this slice's), and the sign-in redirect target. Does not
touch `/auth/signin`, `/auth/signup`, or `/dashboard` styling — those are S-08.
