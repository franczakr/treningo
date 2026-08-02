# Gym Visual Identity & Shared Page Shell — Plan Brief

> Full plan: `context/changes/gym-visual-identity/plan.md`
> Roadmap: `context/foundation/roadmap.md` → F-02

## What & Why

Treningo has never had a deliberate visual identity — its tokens are stock shadcn scaffold, and 19 files paint over them with hardcoded purple/blue starter colours. This foundation lays down the silver/grey/white gym palette, one typography choice, and a navigation slot in the shared shell — the minimal enabler S-06, S-07, and S-08 all need before they can build or migrate anything.

## Starting Point

`src/styles/global.css` carries shadcn's `neutral` base palette — already pure grayscale for background/foreground/card/border, but with no accent colour, a half-finished `.dark` theme nothing toggles, dead `--chart-*`/`--sidebar-*` tokens, and no explicit font choice. `src/layouts/Layout.astro` has no navigation slot at all.

## Desired End State

The token file expresses a clean grayscale body with one steel-blue accent for calls-to-action, no dark-theme code, and an explicit system-font token. `Layout.astro` exposes a named slot ready for S-07's header. No existing page's appearance changes — this plan has zero visible surface today.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Typeface | System font stack | Zero webfont loading, native feel, matches solo/after-hours MVP constraints. | Roadmap (user, 2026-08-02) |
| Dark theme | Removed entirely | Nothing toggles it today; keeping it half-finished doubles token work for no requirement. | Roadmap (user, 2026-08-02) |
| CTA accent | One steel-blue hue | Reads as an extension of "silver/grey/white", not a departure from it, while giving buttons a distinct colour. | Roadmap (user, 2026-08-02) |
| Which token carries the accent | Retint `--primary`/`--primary-foreground`/`--ring` only | Everything else is already pure grayscale from the `neutral` shadcn base (`components.json:9`); only the CTA slot was missing a hue. | Plan |
| Blast radius check | Confirmed zero — the one `<Button>` consumer (`SubmitButton.tsx`) already overrides `bg-primary` with a hardcoded class | Verified by grepping every `<Button` usage in `src/` before committing to the retint. | Plan |
| `bg-cosmic` utility | Left untouched | Six pages still use it; deleting it now would visually regress them ahead of S-08's migration. | Plan |
| Unused chart/sidebar tokens | Removed | No chart or sidebar component exists anywhere in the app — dead tokens pointing at a deleted dark palette. | Plan |

## Scope

**In scope:**
- Retinted `--primary`/`--primary-foreground`/`--ring`, removed `.dark` block and `@custom-variant dark`, removed dead `--chart-*`/`--sidebar-*` tokens, added `--font-sans`
- Removed now-hazardous `dark:` variant classes from `button.tsx`
- Added a named `nav` slot to `Layout.astro`

**Out of scope:**
- Restyling the 19 files with hardcoded colours (S-08)
- The `bg-cosmic` utility and the pages using it
- Building the actual navigation component (S-07)
- The landing page and dashboard (S-06)

## Architecture / Approach

Two independent phases: a CSS-token + one-component rewrite, then a three-line shell addition. Both are pure infrastructure — nothing in the app consumes the new tokens or slot yet, so the change is verifiable purely by "nothing looks different" plus a clean build.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Palette, typography, dark-theme removal | Steel-blue accent token, system font, dark mode fully removed | `dark:` classes on `button.tsx` reactivating under OS dark-mode preference if not stripped together with the token removal |
| 2. Navigation slot | `Layout.astro` ready for S-07's header | None — Astro renders an unfilled named slot as nothing |

**Prerequisites:** None — F-02 has no roadmap prerequisites and was unblocked by resolving its three design decisions.
**Estimated effort:** Two small phases, three files touched, zero visible change.

## Open Risks & Assumptions

- **No automated visual regression tooling exists.** "No page looks different" is verified by loading each page, not by a screenshot diff.
- **Assumption:** the steel-blue values (`oklch(0.45 0.06 235)` primary / `oklch(0.65 0.06 235)` ring) read as "steel" rather than "vivid" — if S-06/S-07 surfaces disagree once painted, retuning these two values is a one-file change with no ripple effect, since nothing else consumes them yet.

## Success Criteria (Summary)

- `npm run build` succeeds and every existing page is pixel-identical to before this plan
- The token file and shell are ready for S-06 and S-07 to build on without further foundation work
