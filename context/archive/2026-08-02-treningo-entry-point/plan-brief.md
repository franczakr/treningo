# Treningo Entry Point — Plan Brief

> Full plan: `context/changes/treningo-entry-point/plan.md`
> Roadmap: `context/foundation/roadmap.md` → S-06

## What & Why

Today `/` is still the 10x Astro Starter's stock landing page — literal "10x Astro Starter" branding, generic dev-tool feature cards, cosmic dark-space decoration — and signing in redirects back to `/` instead of the dashboard. This closes both gaps: a Treningo-branded entry point built on F-02's tokens, and a sign-in that actually lands the user where their account's content is.

## Starting Point

`src/components/Welcome.astro` shows starter copy on a `bg-cosmic` dark gradient with hardcoded purple accents. `Topbar.astro`, embedded inside it, is the only nav element on this page. `src/pages/api/auth/signin.ts` redirects a successful sign-in to `/`.

## Desired End State

A visitor sees Treningo's actual value proposition (personalized plans, private data, save-and-revisit) on the light grayscale palette with a steel-blue CTA. Signing in lands on `/dashboard`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Feature-card content | Personalization / data privacy / save-and-revisit | Each traces directly to a PRD requirement (FR-003, NFR privacy, FR-005/006) rather than inventing marketing copy. | Plan |
| Decorative orbs/star-field | Removed, not retinted | They only read as intentional against a dark cosmic background; on the new light palette they'd be colourful shapes floating with no purpose. | Plan |
| `Topbar`'s wiring mechanism | Left embedded directly in `Welcome.astro`, only retinted | Migrating it to the shared shell's `nav` slot is S-07's job across every page; doing it here would need redoing when S-07 lands. | Plan |
| Sign-up redirect | Unchanged (`/auth/confirm-email`) | Unrelated to this slice — a new account still needs email confirmation before landing anywhere. | Plan |
| `/auth/*` and `/dashboard` styling | Untouched | Out of scope — S-08 migrates the remaining hardcoded-colour pages. | Roadmap |

## Scope

**In scope:**
- `Welcome.astro` content rewrite + retint (drop cosmic background/orbs, use F-02 tokens)
- `Topbar.astro` retint (same embedding mechanism as today)
- `signin.ts` success-redirect target (`/` → `/dashboard`)

**Out of scope:**
- Auth page styling, dashboard styling (S-08)
- Persistent nav via the shared shell (S-07)
- Sign-up flow

## Architecture / Approach

Two independent phases: a content/styling rewrite of one Astro component pair, then a one-line redirect-target change in an API route. No new components, no schema change.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Treningo-branded landing page | Starter branding gone, F-02 tokens applied | Removing the cosmic background without also removing the orbs/star-field would leave decorative shapes with no dark backdrop |
| 2. Post-sign-in redirect | Sign-in lands on `/dashboard` | None — one-line change, error path untouched |

**Prerequisites:** F-02 (implemented, reviewed).
**Estimated effort:** Two small phases, three files touched.

## Open Risks & Assumptions

- **No automated visual regression tooling** — "no starter branding, correct palette" is verified by loading the page, not a screenshot diff.
- **Assumption:** reusing the existing icon shapes (recoloured) rather than sourcing new ones is acceptable for this slice — precise icon selection can be revisited without any structural rework.

## Success Criteria (Summary)

- A first-time visitor's first impression is Treningo, not a starter template
- Signing in lands where the user's own content is, not back where they came from
