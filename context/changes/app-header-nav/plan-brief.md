# Persistent App Header — Plan Brief

> Full plan: `context/changes/app-header-nav/plan.md`
> Roadmap: `context/foundation/roadmap.md` → S-07

## What & Why

`/dashboard`, `/training-profile`, `/plan`, `/plans`, and `/plan/[id]` render with no persistent navigation — a signed-in user reaching any page other than `/dashboard` has no way back except the browser. This adds one header, reachable from every signed-in page, using the `nav` slot F-02 built for exactly this purpose.

## Starting Point

`Layout.astro`'s `nav` slot (added by F-02) is unfilled. `Topbar.astro` exists but is scoped to the public landing page's signed-in/signed-out toggle — it doesn't link to training profile, plan generation, or saved plans, and its signed-out branch is dead weight on a protected route where a user is always present.

## Desired End State

A new `AppHeader.astro`, styled on F-02's tokens, appears on all five protected pages with links to Dashboard, Profil treningowy, Generuj plan, Moje plany, and sign-out.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| New component vs. reusing `Topbar` | New `AppHeader.astro` | `Topbar` is purpose-built for the public page's dual signed-in/signed-out state and is missing three of the four links this slice needs. | Plan |
| How it gets user context | Reads `Astro.locals.user` directly | Matches `Topbar.astro`'s existing self-contained pattern; no props needed since it's only ever rendered on protected routes. | Plan |
| `dashboard.astro`'s existing inline links | Left untouched | Removing them as "now redundant" would edit page-body content that's S-08's job; keeping them is harmless. | Plan |
| Active-link highlighting | Not included | Not required by the roadmap Outcome ("reach ... from any page"); would add scope with no stated need. | Plan |

## Scope

**In scope:**
- New `AppHeader.astro` component (tokens, four links, sign-out)
- Mounting it via `slot="nav"` on all five protected pages

**Out of scope:**
- Any page's existing body content or hardcoded colours (S-08)
- Changes to `Topbar.astro` or the public landing page
- Active-link highlighting

## Architecture / Approach

One new self-contained Astro component (no props, reads its own auth context), adopted by adding a single `<AppHeader slot="nav" />` line to each of the five protected pages' existing `<Layout>` usage.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. `AppHeader` component | The header itself, standalone | None — new file, no existing behaviour touched |
| 2. Mount on all five pages | Header appears everywhere it's needed | Missing one of the five pages would leave a gap the roadmap explicitly calls out |

**Prerequisites:** F-02 (implemented, reviewed).
**Estimated effort:** Two small phases, six files touched (one new, five one-line additions).

## Open Risks & Assumptions

- **No automated visual regression tooling** — verified by loading each of the five pages.
- **Assumption:** leaving `dashboard.astro`'s duplicate inline links in place (rather than removing them) is acceptable until S-08 touches that page's content.

## Success Criteria (Summary)

- From any of the five signed-in pages, a user can reach every other one and sign out without using the browser back button
