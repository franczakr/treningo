# Treningo Entry Point Implementation Plan

## Overview

Replace the starter-template landing page with Treningo-specific content built on F-02's tokens, and send a signed-in user to the dashboard instead of back to the page they signed in from. This is roadmap slice **S-06**.

## Current State Analysis

- `src/components/Welcome.astro` (rendered by `src/pages/index.astro` inside `Layout`) is the stock 10x Astro Starter landing page: headline literally reads "10x Astro Starter" (`:35`), subtext describes the starter kit itself (`:37-39`), and three feature cards describe "Authentication Ready / Modern Stack / Developer Experience" (`:74-121`) — none of it about Treningo. It wraps in `bg-cosmic` (dark navy gradient) with three blurred decorative "orbs" and a star-field overlay (`:5-25`), all hardcoded Tailwind palette classes (`purple-500/20`, `blue-500/15`, etc.), sized for a dark background.
- `src/components/Topbar.astro` is embedded directly inside `Welcome.astro:28` (not via any shell slot) and is the only place a signed-in user sees a "Dashboard" link or sign-out control on this page. Its links use hardcoded `text-purple-300` (`:13,17,27,30`).
- `src/pages/api/auth/signin.ts:19` redirects every successful sign-in to `/` — the page the user is trying to leave, not the dashboard.
- F-02 (implemented, reviewed) established: pure grayscale body tokens, one steel-blue `--primary`/`--ring` accent, no dark theme, and a `nav` slot on `Layout.astro` that nothing fills yet.

## Desired End State

A visitor lands on `/` and sees Treningo's own value proposition — grounded in the PRD's Vision and Business Logic, not starter-kit marketing — with sign-in and sign-up calls to action, rendered in the F-02 palette (light, grayscale body, steel-blue primary action). Signing in successfully lands the user on `/dashboard`, not back on `/`.

Verify by loading `/` (signed out and signed in) and by completing a sign-in.

### Key Discoveries:

- `src/pages/index.astro` needs no change — it already just renders `<Layout><Welcome /></Layout>` and `Layout`'s default title is already `"Treningo"` (`Layout.astro:10`), not the starter's.
- `Topbar.astro`'s embedding inside `Welcome.astro` (rather than `Layout`'s new `nav` slot) is left exactly as-is — wiring the shared shell's nav slot into every signed-in page is S-07's job; changing the mechanism here would create rework when S-07 lands.
- The decorative orbs and star-field overlay (`Welcome.astro:6-25`) only make sense against the dark `bg-cosmic` gradient; since the palette is now light grayscale, they are removed along with `bg-cosmic` rather than left as colourful shapes floating on a plain background.
- `/auth/signin`, `/auth/signup`, `/dashboard` keep their current hardcoded-colour styling — out of scope, migrated in S-08.

## What We're NOT Doing

- **No changes to `/auth/signin.astro`, `/auth/signup.astro`, or `/dashboard.astro` styling** — S-08.
- **No wiring of `Layout`'s `nav` slot** — S-07 builds the persistent header; this slice keeps `Topbar` embedded in `Welcome.astro` exactly as today.
- **No change to the sign-up success redirect** (`/auth/confirm-email`) — unrelated to this slice; a new account still needs email confirmation before landing anywhere.
- **No new components, no new dependencies.**

## Implementation Approach

Two phases: rewrite the landing page's content and retint it (plus its embedded `Topbar`) using F-02's tokens, then flip the one-line sign-in redirect target. Independent of each other; the content phase is the larger of the two.

---

## Phase 1: Treningo-branded, token-styled landing page

### Overview

Replace the starter copy and cosmic styling in `Welcome.astro` with Treningo content on the new palette, and retint the `Topbar` it embeds.

### Changes Required:

#### 1. Landing page content and styling

**File**: `src/components/Welcome.astro`

**Intent**: Replace every trace of starter-kit branding with copy grounded in the PRD's Vision ("a workout plan personalized to your own goal, instead of a generic template") and Business Logic (personalization, private data, save-and-revisit), and re-render the page on F-02's tokens instead of the cosmic/purple starter theme.

**Contract**: Headline and subtext describe Treningo's value proposition in Polish (matching the rest of the app's UI language). The two CTAs keep their hrefs (`/auth/signin`, `/auth/signup`) but restyle to `bg-primary text-primary-foreground` (primary) and a bordered `text-foreground` variant (secondary), following the button sizing already used on `dashboard.astro` (`rounded-lg px-6 py-3 text-base font-medium`). The three feature cards keep their existing icon markup (recoloured via `text-primary`/`currentColor` instead of `text-purple-300`) but describe: personalized plans (FR-003), private data visible only to the account owner (NFR / Access Control), and saving/revisiting a plan (FR-005/FR-006) — each traceable to a PRD requirement, not invented. The outer wrapper drops `bg-cosmic` and the decorative orb/star-field markup (`:6-25`), relying on the page body's token-driven background (`bg-background`/`text-foreground`, already global via `global.css`'s `@layer base`).

#### 2. Embedded top bar

**File**: `src/components/Topbar.astro`

**Intent**: Retint the only nav element this page shows so it matches the new palette instead of standing out in the old starter purple.

**Contract**: Replace `text-purple-300`/`hover:text-purple-100` (`:13,17,27,30`) with `text-primary`/`hover:text-primary/80` (or equivalent token-driven classes); the surrounding `border-white/10 bg-white/5` wrapper (`:6`) becomes a token-driven card-style surface (`border-border bg-card`). No structural or behavioural change — same conditional signed-in/signed-out branching, same links.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `/` shows Treningo-specific copy with no "10x Astro Starter" text anywhere
- `/` renders on the light grayscale palette with a steel-blue primary CTA, no cosmic/purple styling remaining
- Signed-in and signed-out states of the embedded `Topbar` both still render correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Land on the dashboard after signing in

### Overview

Send a successful sign-in to `/dashboard` instead of back to `/`.

### Changes Required:

#### 1. Sign-in endpoint

**File**: `src/pages/api/auth/signin.ts`

**Intent**: A signed-in user should land where the account's own content is, not back on the public landing page they were trying to leave.

**Contract**: The success redirect (`:19`) changes from `context.redirect("/")` to `context.redirect("/dashboard")`. The error redirect (`:11,16`) and the Supabase-not-configured guard (`:11`) are unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Signing in with valid credentials lands on `/dashboard`
- Signing in with invalid credentials still returns to `/auth/signin?error=...`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

None. No test runner is installed in this repo.

### Integration Tests:

None, for the same reason.

### Manual Testing Steps:

1. Load `/` signed out — confirm Treningo copy, no starter branding, light palette, steel-blue CTA.
2. Sign in — confirm landing on `/dashboard`.
3. Load `/` again while signed in — confirm `Topbar` shows "Dashboard" and sign-out, retinted.
4. Attempt sign-in with a wrong password — confirm the error path is unaffected.

## Migration Notes

No schema or data change. Purely presentational plus one redirect target; safe to revert by reverting the three files.

## References

- Roadmap slice: `context/foundation/roadmap.md` → `S-06: Treningo entry point`
- Requirement source: `context/foundation/prd.md` → Vision & Problem Statement, Business Logic, FR-001, Access Control, NFR (visual identity)
- Token source: `context/changes/gym-visual-identity/plan.md` (F-02)
- Button sizing pattern to follow: `src/pages/dashboard.astro:18-35`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Treningo-branded, token-styled landing page

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 3859411
- [x] 1.2 Production build succeeds: `npm run build` — 3859411

#### Manual

- [x] 1.3 `/` shows Treningo-specific copy with no "10x Astro Starter" text anywhere — 3859411
- [x] 1.4 `/` renders on the light grayscale palette with a steel-blue primary CTA, no cosmic/purple styling remaining — 3859411
- [x] 1.5 Signed-in and signed-out states of the embedded `Topbar` both still render correctly — 3859411

### Phase 2: Land on the dashboard after signing in

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 9c82e98
- [x] 2.2 Production build succeeds: `npm run build` — 9c82e98

#### Manual

- [x] 2.3 Signing in with valid credentials lands on `/dashboard` — 9c82e98
- [x] 2.4 Signing in with invalid credentials still returns to `/auth/signin?error=...` — 9c82e98
