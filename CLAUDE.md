# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime via `@astrojs/cloudflare`)
- `npm run build` — production SSR build
- `npm run preview` — preview the production build locally
- `npm run lint` / `npm run lint:fix` — ESLint (type-checked rules); `:fix` auto-fixes
- `npm run format` — Prettier (with `prettier-plugin-astro` + `prettier-plugin-tailwindcss`)

Pre-commit: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

**Tests:** no test runner is configured yet — there is no `test` script and no Playwright/Vitest install. E2E tests are introduced via the `/10x-e2e` skill, which scaffolds Playwright; until then there is no single-test command to run.

## Local setup

Environment variables are declared through Astro's `astro:env` schema as **server-only secrets** (`SUPABASE_URL`, `SUPABASE_KEY`) and are never exposed to the client. Two secret files are used: `.env` (Node) and `.dev.vars` (Cloudflare local dev, gitignored).

Local Supabase (requires Docker, ~7 GB RAM):

```bash
cp .env.example .env          # and: cp .env.example .dev.vars
npx supabase init             # creates supabase/ config
npx supabase start            # prints SUPABASE_URL + anon key -> paste into .env and .dev.vars
```

Auth uses only Supabase's built-in `auth.users` table. In local dev, disable **Authentication → Email → Confirm email** in Supabase Studio (`http://localhost:54323`) to sign in immediately after signup.

### Database migrations (hosted-linked, no Docker)

Migrations target the **hosted** Supabase project directly — no local Docker stack. Two one-time, credential-bearing steps (run by you, values stay local):

```bash
npx supabase login                              # access token (browser)
npm run db:link -- --project-ref <project-ref>  # needs project ref + DB password
```

The `<project-ref>` is the subdomain of `SUPABASE_URL` (e.g. `https://abcd.supabase.co` → `abcd`). Linkage state lives in `supabase/.temp/` (gitignored).

Then the per-change loop:

```bash
npm run db:migration <short_description>   # new supabase/migrations/<timestamp>_<desc>.sql
npm run db:push                            # apply pending migrations to the linked project
npm run db:types                           # regenerate src/db/database.types.ts from the schema
```

RLS convention for per-user tables: see `supabase/migrations/README.md`.

## Architecture

**Astro 6 SSR app** — React 19 islands, Tailwind 4, Supabase auth, shadcn/ui ("new-york" variant). Deployed to Cloudflare Workers. Vite is pinned to ^7 via `overrides`; React Compiler is enabled through `eslint-plugin-react-compiler`.

### Rendering

Full server-side rendering (`output: "server"`). Pages are server-rendered by default; API routes must export `const prerender = false`.

### Auth flow (the part that spans files)

- `src/lib/supabase.ts` — Supabase SSR client (`@supabase/ssr`, cookie-based sessions); reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server`.
- `src/middleware.ts` — runs on every request, resolves the current user onto `context.locals.user`, and redirects unauthenticated requests away from paths in the `PROTECTED_ROUTES` array. **Add new protected paths there.**
- Endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`. Pages: `src/pages/auth/{signin,signup,confirm-email}.astro`. Protected example: `src/pages/dashboard.astro`.
- `src/lib/config-status.ts` gates UI/behavior on whether Supabase env vars are configured.

### Conventions

- **Path alias** `@/*` → `./src/*`.
- **Astro components** for static content/layout; **React components** only where interactivity is needed (no Next.js directives like `"use client"`). Extract React hooks to `src/components/hooks/`.
- **Tailwind**: merge classes with the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) — never concatenate class strings by hand.
- **shadcn/ui**: components in `src/components/ui/`; add new ones via `npx shadcn@latest add [name]`.
- **API routes**: uppercase `GET` / `POST` exports; validate input with zod.
- **Supabase migrations** (when you add tables): `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql` (via `npm run db:migration`). Every per-user table is **deny-by-default**: enable RLS, then grant granular per-operation policies (`select`/`insert`/`update`/`delete`) to the `authenticated` role only, filtered on `auth.uid() = user_id`. Copy the canonical template in `supabase/migrations/README.md` — do not hand-roll policies.
- **Services/business logic** → `src/lib/` (or `src/lib/services/`); **shared types** (entities, DTOs) → `src/types.ts`.

### Environment & deploy

- Node v22.14.0 (`.nvmrc`).
- Deploy to Cloudflare: `npm run build` then `npx wrangler deploy`; set `SUPABASE_URL` / `SUPABASE_KEY` / `GEMINI_API_KEY` via `npx wrangler secret put` (or the Cloudflare dashboard).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push and PR to `master`. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

## Project context (Treningo)

This repository is **Treningo** — a personalized workout-plan generator — built on the 10x Astro Starter. The product spec and architecture decisions live under `context/foundation/`:

- `prd.md` — product requirements (auth, training profile, plan generation FR-003, persistence).
- `tech-stack.md` — why this stack was chosen.
- The plan generator (FR-003) is built with an LLM via the **Google Gemini SDK** (`@google/genai`, model `gemini-2.5-flash`) using **structured outputs** (`responseJsonSchema` derived from the Zod `planSchema`), plus a post-generation **validation layer** enforcing the plan-soundness guardrails (only available equipment, exactly the chosen training days, consistency with the stated goal), with retry on violation — not a hand-authored rules engine. (Provider note: originally specified as the Anthropic SDK in `tech-stack.md`; deliberately switched to Gemini's free tier to keep the MVP zero-cost — see `context/changes/gemini-plan-generation/`.)

The `context/` directory is the 10x toolkit's working trail (changes, plans, foundation docs) — preserve it; do not treat it as application source.