# Gym Visual Identity & Shared Page Shell Implementation Plan

## Overview

Establish the silver / grey / white gym palette, a single typography choice, and a navigation slot in the shared page shell — as tokens and shell infrastructure only. This is roadmap foundation **F-02**: the smallest cross-cutting enabler S-06, S-07, and S-08 need, not a restyle of any existing page.

## Current State Analysis

- `src/styles/global.css` carries the stock shadcn "neutral" token set verbatim. Critically, `--background`, `--foreground`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--border`, `--input` are **already pure grayscale** (`oklch(x 0 0)` — zero chroma) because `components.json:9` set `baseColor: "neutral"` at scaffold time. The "silver/grey/white" body of the palette already exists; nothing there needs to change.
- What's actually missing: (a) any accent hue for calls-to-action — `--primary` is today a neutral near-black (`oklch(0.205 0 0)`), i.e. pure contrast, not the steel-blue accent the design decision calls for; (b) a `.dark` block (`global.css:41-73`) and a `@custom-variant dark` override (`:4`) that nothing toggles; (c) `dark:` variant utility classes on the one component that reads tokens correctly (`src/components/ui/button.tsx:14,16,18`), which would silently activate under OS-level `prefers-color-scheme: dark` once the class-based override is removed; (d) unused `--chart-1..5` / `--sidebar-*` tokens — no chart or sidebar component exists anywhere in `src/components/`; (e) no explicit typography token — the repo has no font rule at all, so it renders on Tailwind's built-in default sans stack today, undocumented.
- `src/components/ui/button.tsx` is the **only** component in the app that consumes the semantic colour tokens (`bg-primary`, `bg-secondary`, `bg-destructive`, `bg-accent`, etc. via `buttonVariants`). It is used in exactly one place: `src/components/auth/SubmitButton.tsx:18`, which passes `className="... bg-purple-600 ... hover:bg-purple-500"` — `cn()` (clsx + tailwind-merge) resolves the conflict in favour of that later, hardcoded class, so `bg-primary` is already being overridden today. **Retinting `--primary` therefore changes nothing visible anywhere in the app right now** — the one consumer already ignores it. This is what makes F-02 safe to land with zero regression risk.
- `src/layouts/Layout.astro` wraps every page: config-error `Banner`s, then `<slot />`. It has no navigation slot at all. `Topbar.astro` — the only nav component that exists — is wired directly into `Welcome.astro:28`, not into `Layout`.
- `@utility bg-cosmic` (`global.css:113-115`) is the dark navy gradient background used by six pages (`Welcome.astro`, `dashboard.astro`, `plan.astro`, `plans.astro`, `plan/[id].astro`, `training-profile.astro`). None of the pages that use it are touched by this plan.

## Desired End State

`src/styles/global.css` defines a pure grayscale body palette plus one steel-blue accent for primary actions and focus rings, no dark-theme tokens, and an explicit system-font token. `src/components/ui/button.tsx` no longer carries dead `dark:` variant classes. `src/layouts/Layout.astro` exposes a named slot a page can fill with navigation.

No existing page changes appearance. Verify with `npm run build` (compiles cleanly) and by loading any existing page — pixel-identical to before, because nothing yet consumes the new tokens or the new slot.

### Key Discoveries:

- `components.json:9` (`baseColor: "neutral"`) is why the existing palette is already grayscale — this plan retints only `--primary`/`--primary-foreground`/`--ring`, not the whole system.
- `src/components/auth/SubmitButton.tsx:18` overriding `bg-primary` with a hardcoded class is the reason this plan has no blast radius today — confirmed by grepping for every `<Button` usage in `src/`.
- `src/components/ui/button.tsx:8` defines `buttonVariants` with `dark:` classes at `:14,16,18` — these must be removed together with the `.dark` block, or they reactivate under `prefers-color-scheme: dark` once the class-scoped override (`@custom-variant dark`) is gone.
- No component in `src/components/` renders a chart or a sidebar, so `--chart-1..5` and `--sidebar-*` tokens (and their `@theme inline` mappings) are dead weight being carried since scaffold — removed alongside the dark-theme cleanup rather than left as confusing leftovers pointing at a palette that no longer exists.

## What We're NOT Doing

- **No restyling of the 19 files carrying hardcoded colour classes** (`Topbar.astro`, `SubmitButton.tsx`, `PlanView.tsx`, etc.) — that is S-08.
- **No touching `@utility bg-cosmic`** — six pages still use it; removing or changing it now would visually regress them ahead of S-08's migration.
- **No navigation component** — S-07 builds the header. This plan only adds the slot it will render into.
- **No landing page or dashboard changes** — S-06.
- **No `lang="en"` → `lang="pl"` fix on `Layout.astro`** — real but unrelated to colour/type/shell; out of scope for this NFR.
- **No new shadcn components.**

## Implementation Approach

Two phases: token/typography rewrite first (self-contained in `global.css` + one class-list edit in `button.tsx`), then the shell slot (a three-line addition to `Layout.astro`). Neither depends on the other; both are pure infrastructure with no user-visible surface until S-06/S-07/S-08 consume them.

---

## Phase 1: Palette, typography, and dark-theme removal

### Overview

Rewrite the token set in `global.css` to the resolved design decisions, and strip the now-hazardous `dark:` classes from `button.tsx`.

### Changes Required:

#### 1. Design tokens

**File**: `src/styles/global.css`

**Intent**: Retint the one token that carries call-to-action meaning (`--primary`, plus its foreground and the `--ring` focus colour) to a steel-blue accent, while every other token — already pure grayscale from the `neutral` shadcn base — stays as-is. Remove the `.dark` block and the `@custom-variant dark` override entirely (the decision was to delete dark-mode support, not leave it half-finished), and drop the unused `--chart-*`/`--sidebar-*` tokens along with their `@theme inline` mappings, since nothing in the app renders a chart or a sidebar. Add an explicit `--font-sans` system-font-stack token and apply it on `body`, making today's de-facto default an intentional, documented choice.

**Contract**: `:root` keeps `--background`, `--foreground`, `--card(-foreground)`, `--popover(-foreground)`, `--secondary(-foreground)`, `--muted(-foreground)`, `--accent(-foreground)`, `--destructive`, `--border`, `--input` at their current values. `--primary` becomes a muted steel-blue (`oklch(0.45 0.06 235)`), `--primary-foreground` near-white (`oklch(0.98 0 0)`), `--ring` a lighter steel-blue (`oklch(0.65 0.06 235)`) so focus rings stay tied to the accent. The `.dark` rule block and the `@custom-variant dark (&:is(.dark *));` line are deleted. `--chart-1..5` and `--sidebar-*` (both in `:root` and their `@theme inline` colour mappings) are deleted. A new `--font-sans` entry is added to `@theme inline` holding the system stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`), and the existing `body { @apply bg-background text-foreground; }` rule in `@layer base` gains `font-family: var(--font-sans);`. `@utility bg-cosmic` is untouched.

#### 2. Button primitive

**File**: `src/components/ui/button.tsx`

**Intent**: Remove the `dark:` variant utility classes now that dark-mode tokens no longer exist — left in place, they would silently activate under OS-level `prefers-color-scheme: dark` once the class-scoped `@custom-variant dark` override is gone, applying dark-flavoured overrides on top of a palette that has no dark values defined.

**Contract**: In `buttonVariants`, remove `dark:aria-invalid:ring-destructive/40` (base classes), and the `dark:focus-visible:ring-destructive/40 dark:bg-destructive/60` suffix from the `destructive` variant and `dark:bg-input/30 dark:border-input dark:hover:bg-input/50` from `outline` and `dark:hover:bg-accent/50` from `ghost`. Every remaining (non-`dark:`) class stays exactly as-is; variant names, `cva` structure, and the component's exported signature are unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Every existing page (`/`, `/dashboard`, `/training-profile`, `/plan`, `/plans`, `/auth/signin`, `/auth/signup`) renders visually identical to before this phase
- The sign-in/sign-up submit button (the only current `<Button>` consumer) is unchanged, since its hardcoded `bg-purple-600` still wins over `bg-primary`
- Toggling OS-level dark mode no longer changes any part of the app's appearance

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Navigation slot in the shared shell

### Overview

Give `Layout.astro` a named slot a page can fill with navigation, so S-07's header has somewhere to attach without any page needing structural changes beyond passing content into the slot.

### Changes Required:

#### 1. Shared layout

**File**: `src/layouts/Layout.astro`

**Intent**: Add a named slot rendered between the config-error banners and the page's own content, so a page that wants a persistent header passes it into that slot while pages that don't (none yet — S-07 is the first) render exactly as today.

**Contract**: A `<slot name="nav" />` is added inside `<body>`, after the `Banner` mapping and before the existing default `<slot />`. Astro renders a named slot as nothing when a consuming page supplies no matching `Fragment`, so every current page — none of which will pass a `nav` slot yet — is byte-for-byte unaffected.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Every existing page still renders with no visible change (no page yet fills the `nav` slot)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

None. No test runner is installed in this repo.

### Integration Tests:

None, for the same reason.

### Manual Testing Steps:

1. Run `npm run dev` and open each existing page; confirm no visual change from before this plan.
2. Inspect `SubmitButton` on `/auth/signin` — still solid purple, confirming the token retint has no effect until S-08 removes the override.
3. Toggle the OS colour scheme to dark and reload a page; confirm no part of the UI shifts (proving the `dark:` cleanup was complete).
4. Inspect `Layout.astro`'s rendered HTML for any page — no empty nav wrapper element should appear where the slot was added (Astro omits unfilled named slots entirely).

## Migration Notes

No schema change, no data migration. Purely additive/renaming at the CSS-token and component level; safe to revert by reverting the two files in Phase 1 and the one file in Phase 2.

## References

- Roadmap foundation: `context/foundation/roadmap.md` → `F-02: Gym visual identity & shared page shell`
- Requirement source: `context/foundation/prd.md` → NFR (visual identity, v2)
- Token scaffold origin: `components.json:9` (`baseColor: "neutral"`)
- Only current token consumer: `src/components/auth/SubmitButton.tsx:18`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Palette, typography, and dark-theme removal

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 8a6531d
- [x] 1.2 Production build succeeds: `npm run build` — 8a6531d

#### Manual

- [x] 1.3 Every existing page renders visually identical to before this phase — 8a6531d
- [x] 1.4 The sign-in/sign-up submit button is unchanged — 8a6531d
- [x] 1.5 Toggling OS-level dark mode no longer changes any part of the app's appearance — 8a6531d

### Phase 2: Navigation slot in the shared shell

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — f0468f1
- [x] 2.2 Production build succeeds: `npm run build` — f0468f1

#### Manual

- [x] 2.3 Every existing page still renders with no visible change — f0468f1
