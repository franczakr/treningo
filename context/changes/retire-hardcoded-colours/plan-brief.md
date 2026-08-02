# Retire Starter Hardcoded Colours — Plan Brief

> Full plan: `context/changes/retire-hardcoded-colours/plan.md`
> Roadmap: `context/foundation/roadmap.md` → S-08

## What & Why

16 files still render the 10x Astro Starter's dark cosmic/purple/blue theme instead of F-02's tokens — the last gap before Treningo has one consistent visual identity everywhere. This is the final item in roadmap v2.

## Starting Point

F-02 (tokens + shell), S-06 (entry point), and S-07 (persistent header) migrated `global.css`, `button.tsx`, `Layout.astro`, `Welcome.astro`, `Topbar.astro`, `AppHeader.astro`, and `signin.ts`. Everything else — auth pages/forms, the five protected pages' own bodies, and the plan/profile components — still carries the starter theme.

## Desired End State

Every page in the app renders on one consistent light grey/white/steel-blue palette. Semantic error/success/warning colours are re-tuned for the light background (same hue, inverted lightness), not removed — they stay exactly as distinguishable as before.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Semantic status colours | Re-tuned to light-mode equivalents, not left as-is | Dark-mode-tuned combos (dark red background, light red text) would read as a broken leftover dark widget on a white page, not simply "still red." | Plan |
| `SaveButton`'s green | Left unchanged | Already a solid, background-agnostic button — not a starter-branding artifact. | Plan |
| `LibBadge.astro` | Deleted, not retinted | Confirmed zero imports anywhere in `src/` — retinting dead code has no user-visible effect; deleting it is the more honest outcome. | Plan |
| `SubmitButton.tsx`'s hardcoded purple | Removed entirely (not replaced) | It overrides the already-tokenized `Button` primitive; removing the override lets it inherit `Button`'s default steel-blue styling for free. | Plan |
| Auth-form English copy | Untouched | Out of scope — this slice is colours only. | Plan |

## Scope

**In scope:**
- 16 files: 3 auth pages, 5 shared form components, 5 protected page shells, 3 plan/profile components
- Deleting the confirmed-dead `LibBadge.astro`

**Out of scope:**
- Auth-form copy/language
- `SaveButton`'s green
- Anything already migrated by F-02/S-06/S-07

## Architecture / Approach

One consistent class-substitution table (documented once in the plan's Critical Implementation Details) applied across four phases grouped by area: auth, protected-page shells, plan/profile components, then cleanup + a grep sweep confirming nothing was missed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Auth pages & forms | Sign-in/sign-up/confirm-email on the light palette | None — mechanical substitution |
| 2. Protected page shells | Dashboard/profile/plan/plans/plan-detail bodies migrated | `dashboard.astro`'s two action-button styles must map to distinct primary/secondary treatments |
| 3. Plan & profile components | The highest-detail phase — all three semantic status colours | Getting the light-mode error/warning/success re-tuning right so they stay as legible as before |
| 4. Cleanup | Dead file removed, grep sweep confirms zero stragglers | None |

**Prerequisites:** F-02, S-06, S-07 (all implemented, reviewed).
**Estimated effort:** Four phases, 17 files touched (16 migrated + 1 deleted) — the largest slice in this roadmap phase by file count, but each change is mechanical.

## Open Risks & Assumptions

- **No automated visual regression tooling** — verified by a full click-through of every page.
- **Assumption:** the light-mode re-tuning values (`-50`/`-200`/`-700` Tailwind steps) read as clearly as the original dark-mode ones — if not, adjusting them is a class-string change with no structural rework.

## Success Criteria (Summary)

- Every page in the app shares one consistent palette; nothing looks like it belongs to a different product
- Error, success, and warning states remain exactly as legible as before, just re-tuned for a light background
