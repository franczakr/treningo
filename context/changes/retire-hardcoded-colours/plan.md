# Retire Starter Hardcoded Colours Implementation Plan

## Overview

Migrate the remaining 16 files off the 10x Astro Starter's dark cosmic/purple/blue theme onto the token system F-02 established, re-tuning (not removing) semantic status colours for a light palette. This is roadmap slice **S-08**, the last item in roadmap v2's second phase.

## Current State Analysis

Grepping `src/` for starter branding classes (`bg-cosmic`, `purple-*`, `blue-1``00``/200`, `indigo-*`, `pink-*`, `white/NN`) after F-02/S-06/S-07 already cleaned `global.css`, `button.tsx`, `Layout.astro`, `Welcome.astro`, `Topbar.astro`, and `signin.ts` returns 16 files:

- **Auth area (8 files)**: `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/components/auth/{FormField,PasswordToggle,SubmitButton,ServerError,SignUpForm}.tsx`
- **Protected page shells (5 files)**: `src/pages/{dashboard,training-profile,plan,plans}.astro`, `src/pages/plan/[id].astro`
- **Plan/profile components (3 files)**: `src/components/plan/{PlanCards,PlanView}.tsx`, `src/components/profile/TrainingProfileForm.tsx`

Additionally, `src/components/ui/LibBadge.astro` carries starter colours (`bg-blue-900/50`, `bg-purple-500/30`) but has zero imports anywhere in `src/` — confirmed via grep. It is dead scaffold from before Treningo's own components existed, not a rendered page.

One thing introduced *after* F-02 landed: `PlanView.tsx`'s "Zobacz zapisane plany" link (added in S-05, before F-02 existed) uses `text-blue-200 hover:text-blue-100` — exactly the "painted then repainted" case F-02's plan predicted for slices that couldn't wait on it.

## Desired End State

All 16 files render on F-02's tokens — no `bg-cosmic`, no purple/blue starter accents, no `white/NN` glass-card borders. Semantic error/success/warning colours are re-tuned to their light-palette equivalents (same hue family, inverted lightness), remaining exactly as distinguishable as before. `LibBadge.astro` is deleted.

Verify by loading every page in the app and confirming no cosmic/purple/blue starter styling remains, while error/success/warning states are still clearly coloured.

### Key Discoveries:

- Every dark-mode-tuned semantic colour combo in this codebase follows the same shape: a translucent dark background (`bg-red-900/30`) paired with light text (`text-red-100`/`text-red-300`) — designed to sit on the cosmic gradient. On a white/light-grey body these read as a leftover dark widget, not as "still red." Each needs inverting to a light-mode-appropriate pairing (light background, dark-enough text), not just left in place.
- `src/components/auth/SubmitButton.tsx` wraps the *already-tokenized* `Button` primitive (F-02) but overrides it with a hardcoded `bg-purple-600 ... hover:bg-purple-500` className — once that override is removed, it inherits `Button`'s default `variant="default"` styling (`bg-primary text-primary-foreground`) for free, exactly as F-02 anticipated.
- `PlanView.tsx`'s `SaveButton` already uses `bg-emerald-600`/`bg-emerald-600/80` on a solid (non-glass) button with `text-white` — that combination works identically regardless of page background and needs **no change**; only the glass/translucent-on-dark combinations need retuning.
- None of the English-language copy in the auth components (`"Email is required"`, etc.) is in scope — this plan touches colour classes only, not language.

## What We're NOT Doing

- **No translation of English auth-form copy to Polish** — out of scope; colours only.
- **No change to `SaveButton`'s green** — already background-agnostic, not a starter-branding artifact.
- **No new components** — this is a class-level migration of existing markup.
- **No change to `AppHeader.astro`, `Topbar.astro`, `Welcome.astro`, `Layout.astro`, or `global.css`** — already migrated by F-02/S-06/S-07.

## Implementation Approach

Four phases, grouped by area so each is independently verifiable: auth pages/forms, protected-page shells, plan/profile components, then a cleanup pass (dead-file removal + a final grep sweep confirming nothing was missed). All four phases apply the same class-substitution table below — no phase invents a new convention.

## Critical Implementation Details

**Colour mapping convention.** Every phase below applies this same table; it is written once here rather than repeated per file.

| Starter class(es) | Replacement | Where it appears |
| --- | --- | --- |
| `bg-cosmic` (page wrapper) | removed — page inherits `bg-background` from `global.css`'s `@layer base` | every page wrapper |
| `border-white/10 bg-white/10 ... backdrop-blur-xl` (glass card) | `border-border bg-card` (drop `backdrop-blur-xl` — no dark backdrop to blur) | every card/panel |
| `text-white` (on the glass card) | `text-foreground` | every card body |
| `bg-gradient-to-r from-blue-200 ?(via-purple-200)? to-purple-200 bg-clip-text text-transparent` (heading) | plain `text-foreground` | every page `<h1>` |
| `text-blue-100/60`, `/70`, `/80` | `text-muted-foreground` | secondary/muted text |
| `text-purple-200`, `text-purple-300` | `text-primary` | accent text/links |
| `border-white/20` | `border-input` | input/select borders |
| `bg-white/5`, `bg-white/10`, `bg-white/20` (hover backgrounds) | `hover:bg-accent` | hoverable rows/buttons |
| `focus:ring-purple-400` | `focus:ring-ring` | form inputs |
| `placeholder-white/40` | `placeholder:text-muted-foreground` | text inputs |
| `text-white/40` (icons) | `text-muted-foreground` | inline icons |
| `bg-purple-600 hover:bg-purple-500 text-white` (buttons) | `bg-primary text-primary-foreground hover:bg-primary/90` | CTA/regenerate buttons |
| `border-red-400/60 focus:ring-red-400`, `border-red-500/30 bg-red-900/30 text-red-300`, `text-red-100` | `border-red-200 bg-red-50 text-red-700` (icon `text-red-500`) | error states |
| `border-green-500/30 bg-green-900/30 text-green-300` | `border-green-200 bg-green-50 text-green-700` | success confirmation |
| `border-amber-500/40 bg-amber-900/20 text-amber-100` | `border-amber-200 bg-amber-50 text-amber-800` | plan-soundness warning |
| `bg-emerald-600`, `bg-emerald-600/80`, `text-white` (SaveButton) | **unchanged** | already background-agnostic |

---

## Phase 1: Auth pages and shared form components

### Overview

Migrate the sign-in/sign-up/confirm-email pages and every shared form primitive they use.

### Changes Required:

#### 1. Auth pages

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Apply the page-wrapper and heading rows from the mapping table (`bg-cosmic` → removed, glass card → `border-border bg-card`, gradient heading → `text-foreground`, muted body text → `text-muted-foreground`, `text-purple-300` links → `text-primary`).

**Contract**: No structural change — same layout, same copy, same conditional content (`confirm-email.astro`'s dev-vs-prod branching untouched).

#### 2. Shared form primitives

**Files**: `src/components/auth/FormField.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/ServerError.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: `FormField.tsx` — retint the shared `inputBase` string and its error/non-error border variants per the mapping table. `PasswordToggle.tsx` — `text-white/40 hover:text-white/70` → `text-muted-foreground hover:text-foreground`. `SubmitButton.tsx` — remove the hardcoded `bg-purple-600 ... hover:bg-purple-500` override entirely; the underlying `Button`'s default `variant="default"` (already `bg-primary text-primary-foreground`) takes over, so only the layout classes (`w-full rounded-lg px-4 py-2 font-medium transition-colors`) remain in the override. `ServerError.tsx` — apply the error mapping. `SignUpForm.tsx` — its one hardcoded class (`text-blue-100/50` on the password-length hint) → `text-muted-foreground`.

**Contract**: No prop or behavioural changes to any of the five components; class-level only.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `/auth/signin`, `/auth/signup`, `/auth/confirm-email` render on the light palette with no cosmic/purple/blue starter styling
- A validation error on either auth form is still clearly legible in red
- Password show/hide toggle still works and is visible against the light input

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Protected page shells

### Overview

Migrate the five signed-in pages' own wrapper/heading markup (their `AppHeader` mount from S-07 is untouched; only the page body underneath it changes).

### Changes Required:

#### 1. Protected pages

**Files**: `src/pages/dashboard.astro`, `src/pages/training-profile.astro`, `src/pages/plan.astro`, `src/pages/plans.astro`, `src/pages/plan/[id].astro`

**Intent**: Apply the page-wrapper, glass-card, and heading rows from the mapping table to each page's body content. `dashboard.astro`'s three action links (`bg-purple-600` primary / `border-white/20 bg-white/10` secondary) become `bg-primary text-primary-foreground hover:bg-primary/90` (primary) and `border-input bg-background text-foreground hover:bg-accent` (secondary), matching the CTA pattern established in `Welcome.astro`. `plans.astro`'s empty-state and list-row cards, and `plan/[id].astro`'s "← Moje plany" back-link, follow the same table.

**Contract**: No change to any data-loading logic, redirects, or the `AppHeader slot="nav"` mount added in S-07 — purely the body markup beneath it.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- All five protected pages render on the light palette with no cosmic/purple/blue starter styling
- `dashboard.astro`'s three action links and `plans.astro`'s empty-state CTA are still clearly primary/secondary
- A saved-plans list with at least one entry still renders legibly, and `plan/[id].astro`'s back-link still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Plan and profile components

### Overview

Migrate the shared plan-rendering components and the training profile form — the highest-detail phase, since it carries all three semantic status colours (error, success, warning).

### Changes Required:

#### 1. Plan card components

**File**: `src/components/plan/PlanCards.tsx`

**Intent**: Apply the glass-card and muted-text rows from the mapping table to `SessionCard` and `ExerciseRow`, shared by both `PlanView` (generation) and `/plan/[id]` (reopen), so a plan renders identically wherever it appears — unchanged from today's contract.

**Contract**: No prop or structural changes to either exported component.

#### 2. Plan generation view

**File**: `src/components/plan/PlanView.tsx`

**Intent**: Retint every state this component renders — loading, error, success, and the plan-soundness warning banner — per the mapping table, including the two semantic re-tunings (error → light red, warning → light amber). Also fix the "Zobacz zapisane plany" link added in S-05 (`text-blue-200 hover:text-blue-100`, written before F-02's tokens existed) to `text-primary hover:text-primary/80`, and retint `RegenerateButton` from `bg-purple-600 hover:bg-purple-500` to `bg-primary text-primary-foreground hover:bg-primary/90`. `SaveButton`'s emerald green is left exactly as-is per the mapping table.

**Contract**: No change to `requestPlan`, `savePlanRequest`, or any state-machine logic — purely the JSX class strings in the four render branches (`loading`, `error`, success plan view, `WarningBanner`).

#### 3. Training profile form

**File**: `src/components/profile/TrainingProfileForm.tsx`

**Intent**: Retint the "Profil zapisany." success banner (green, per the mapping table), every label/input/select's muted and border classes, the equipment checkboxes' `accent-purple-500`, and every field-level error message, per the mapping table.

**Contract**: No change to `profileSchema` validation, form state, or submission handling — class-level only.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- A generated plan (loading → success) renders on the light palette with legible session/exercise cards
- Triggering the plan-soundness warning banner (or inspecting its markup) shows it clearly in light amber, not the old dark-amber-on-glass combination
- Saving a plan shows the "Zobacz zapisane plany" link in the app's accent colour, not starter blue
- The training profile form's success banner, field errors, and equipment checkboxes render correctly on the light palette

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Cleanup and verification sweep

### Overview

Remove confirmed-dead starter scaffold and verify no starter colour classes remain anywhere in the app.

### Changes Required:

#### 1. Dead component removal

**File**: `src/components/ui/LibBadge.astro` (deleted)

**Intent**: This component carries starter colours (`bg-blue-900/50`, `bg-purple-500/30`) but has zero imports anywhere in `src/` (confirmed via grep before this plan was written) — it predates Treningo's own components and was never adopted. Retinting a component nothing renders has no user-visible effect; deleting confirmed-dead code is the more honest outcome than leaving starter-branded scaffold behind for a future reader to wonder about.

**Contract**: File removed; no other file imports it, so no other change is required.

### Success Criteria:

#### Automated Verification:

- `grep -rE "bg-cosmic|purple-|blue-1|blue-2|indigo-|pink-" src/ --include="*.astro" --include="*.tsx"` returns no matches
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- A full click-through of every page in the app (`/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/training-profile`, `/plan`, `/plans`, `/plan/[id]`) shows a single consistent light grey/white/steel-blue palette with no remaining starter branding anywhere

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

None. No test runner is installed in this repo.

### Integration Tests:

None, for the same reason.

### Manual Testing Steps:

1. Walk every page in the app in order: `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/training-profile`, `/plan`, `/plans`, `/plan/[id]` — confirm one consistent light palette throughout.
2. Trigger a validation error on the profile form and on an auth form — confirm both are legible in light red.
3. Save a training profile — confirm the "Profil zapisany." banner is legible in light green.
4. Generate a plan that trips a plan-soundness guardrail (or inspect `WarningBanner`'s markup) — confirm it's legible in light amber.
5. Save a plan and follow "Zobacz zapisane plany" — confirm it's styled as the app's accent colour, not starter blue.

## Performance Considerations

None — class-level changes only, no new dependencies, no additional network requests.

## Migration Notes

No schema or data change. Purely class-string substitution plus one dead-file removal; safe to revert by reverting the 16 files and restoring `LibBadge.astro` from git history.

## References

- Roadmap slice: `context/foundation/roadmap.md` → `S-08: Retire the stock starter colours`
- Requirement source: `context/foundation/prd.md` → US-01, NFR (visual identity)
- Token source and established conventions: `context/changes/gym-visual-identity/plan.md` (F-02), `context/changes/treningo-entry-point/plan.md` (S-06), `context/changes/app-header-nav/plan.md` (S-07)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth pages and shared form components

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 0a9770f
- [x] 1.2 Production build succeeds: `npm run build` — 0a9770f

#### Manual

- [x] 1.3 `/auth/signin`, `/auth/signup`, `/auth/confirm-email` render on the light palette with no cosmic/purple/blue starter styling — 0a9770f
- [x] 1.4 A validation error on either auth form is still clearly legible in red — 0a9770f
- [x] 1.5 Password show/hide toggle still works and is visible against the light input — 0a9770f

### Phase 2: Protected page shells

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build succeeds: `npm run build`

#### Manual

- [x] 2.3 All five protected pages render on the light palette with no cosmic/purple/blue starter styling
- [x] 2.4 `dashboard.astro`'s three action links and `plans.astro`'s empty-state CTA are still clearly primary/secondary
- [x] 2.5 A saved-plans list with at least one entry still renders legibly, and `plan/[id].astro`'s back-link still works

### Phase 3: Plan and profile components

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.3 A generated plan (loading → success) renders on the light palette with legible session/exercise cards
- [ ] 3.4 Triggering the plan-soundness warning banner shows it clearly in light amber
- [ ] 3.5 Saving a plan shows the "Zobacz zapisane plany" link in the app's accent colour
- [ ] 3.6 The training profile form's success banner, field errors, and equipment checkboxes render correctly on the light palette

### Phase 4: Cleanup and verification sweep

#### Automated

- [ ] 4.1 `grep` sweep for starter colour classes returns no matches
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.4 A full click-through of every page in the app shows one consistent light grey/white/steel-blue palette with no remaining starter branding anywhere
