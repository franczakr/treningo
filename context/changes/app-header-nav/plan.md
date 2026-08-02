# Persistent App Header Implementation Plan

## Overview

Give every signed-in page a header that reaches training profile, plan generation, saved plans, and sign-out — using the `nav` slot F-02 added to `Layout.astro`. This is roadmap slice **S-07**.

## Current State Analysis

- `src/layouts/Layout.astro:38` has `<slot name="nav" />`, added by F-02, filled by nothing yet.
- Five pages are guarded by `src/middleware.ts:4`'s `PROTECTED_ROUTES` (`/dashboard`, `/training-profile`, `/plan` — the last covers `/plan`, `/plans`, `/plan/[id]` by prefix match): `dashboard.astro`, `training-profile.astro`, `plan.astro`, `plans.astro`, `plan/[id].astro`. None of them render any navigation beyond their own body content — `dashboard.astro` alone has inline links to `/plan`, `/plans`, `/training-profile`, and a sign-out form; the other four have no way back to anything except the browser's back button (`plan/[id].astro` has one `← Moje plany` link and nothing else).
- `Topbar.astro` already exists but is purpose-built for the public landing page: it branches on signed-in vs. signed-out and only links to `/dashboard` + sign-out. On a protected route the user is always signed in (middleware guarantees it), so that branch is dead weight, and it's missing links to `/training-profile`, `/plan`, `/plans` entirely — it isn't the right component to reuse here.

## Desired End State

A new `AppHeader.astro` component, styled on F-02's tokens, appears at the top of all five protected pages via the `nav` slot, with links to Dashboard, Profil treningowy, Generuj plan, Moje plany, and a sign-out control. No page's existing body content changes.

Verify by loading each of the five protected pages while signed in and confirming the header appears with working links.

### Key Discoveries:

- Every protected page already imports `Layout` and has `Astro.locals.user` available in frontmatter (middleware guarantees it) — `AppHeader.astro` can read `Astro.locals.user` itself, the same pattern `Topbar.astro` already uses, needing no props from its callers.
- Astro renders a slotted child via a `slot="nav"` attribute directly on the component tag inside `<Layout>` — no wrapping `<Fragment>` required.
- `dashboard.astro`'s own inline links and sign-out form are left exactly as they are; removing them as "now redundant" would edit page-body content that S-08 is scoped to migrate, and isn't necessary to satisfy the Outcome ("reach ... from any page").

## What We're NOT Doing

- **No changes to any page's existing body content, cards, or hardcoded colours** — S-08 migrates those.
- **No de-duplication of `dashboard.astro`'s existing inline links** — leaving them is harmless; removing them is out of scope.
- **No active-link highlighting or current-page indication** — not required by the Outcome, would add scope without a stated need.
- **No change to `Topbar.astro`** — it continues to serve only the public landing page.

## Implementation Approach

Two phases: build the header component, then adopt it on all five protected pages. The component is genuinely new (not a copy of `Topbar`), built directly on F-02's tokens.

---

## Phase 1: `AppHeader` component

### Overview

A new, signed-in-only header component styled on F-02's tokens.

### Changes Required:

#### 1. Header component

**File**: `src/components/AppHeader.astro`

**Intent**: One persistent header every protected page can mount, giving reach to the account's core destinations and a way to sign out, without duplicating `Topbar`'s signed-out branch (irrelevant on a protected route).

**Contract**: Reads `const { user } = Astro.locals;` directly (same pattern as `Topbar.astro`). Renders a `border-border bg-card` bar containing: the user's email (`text-muted-foreground`), and links — `/dashboard` "Dashboard", `/training-profile` "Profil treningowy", `/plan` "Generuj plan", `/plans` "Moje plany" — styled `text-primary hover:text-primary/80`, plus a `POST /api/auth/signout` form with a "Wyloguj" button in the same style. No props; no client-side JS.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Component renders standalone with a signed-in user's email and all four links plus sign-out

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Mount the header on every protected page

### Overview

Fill the `nav` slot with `AppHeader` on all five signed-in pages.

### Changes Required:

#### 1. Protected pages

**Files**: `src/pages/dashboard.astro`, `src/pages/training-profile.astro`, `src/pages/plan.astro`, `src/pages/plans.astro`, `src/pages/plan/[id].astro`

**Intent**: Every page a signed-in user can reach now carries the same header, closing the "no way back except the browser" gap the roadmap named.

**Contract**: Each file imports `AppHeader` from `@/components/AppHeader.astro` and adds `<AppHeader slot="nav" />` as a direct child of the page's `<Layout>` element (alongside its existing body content, which is otherwise untouched).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `AppHeader` appears at the top of all five pages, above each page's existing content
- Every link (Dashboard, Profil treningowy, Generuj plan, Moje plany) navigates correctly from any of the five pages
- Sign-out from the header works from any of the five pages
- No existing page content shifted or changed beyond the header appearing above it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

None. No test runner is installed in this repo.

### Integration Tests:

None, for the same reason.

### Manual Testing Steps:

1. Sign in, land on `/dashboard` — confirm the header appears above the existing dashboard card.
2. From the header, visit `/training-profile`, `/plan`, `/plans` in turn — confirm the header persists on each and every link still works.
3. Save a plan, visit `/plans`, open a saved plan (`/plan/[id]`) — confirm the header appears there too, above the existing "← Moje plany" link.
4. Sign out from the header on any of the five pages — confirm it works identically to `dashboard.astro`'s existing sign-out form.

## Migration Notes

No schema or data change. Purely additive (one new component, one attribute added per page); safe to revert by reverting the six files.

## References

- Roadmap slice: `context/foundation/roadmap.md` → `S-07: Persistent app header`
- Requirement source: `context/foundation/prd.md` → FR-002, FR-003, FR-006, US-01
- Slot this fills: `src/layouts/Layout.astro:38` (added by F-02)
- Pattern to follow (self-contained `Astro.locals.user` read): `src/components/Topbar.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: `AppHeader` component

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — cad7779
- [x] 1.2 Production build succeeds: `npm run build` — cad7779

#### Manual

- [x] 1.3 Component renders standalone with a signed-in user's email and all four links plus sign-out — cad7779

### Phase 2: Mount the header on every protected page

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build succeeds: `npm run build`

#### Manual

- [x] 2.3 `AppHeader` appears at the top of all five pages, above each page's existing content
- [x] 2.4 Every link navigates correctly from any of the five pages
- [x] 2.5 Sign-out from the header works from any of the five pages
- [x] 2.6 No existing page content shifted or changed beyond the header appearing above it
