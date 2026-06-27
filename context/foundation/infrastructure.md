---
project: Treningo
researched_at: 2026-06-27
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR)
  runtime: Cloudflare workerd (via @astrojs/cloudflare)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The repo is already wired for it — `@astrojs/cloudflare` adapter, `wrangler`, and GitHub Actions auto-deploy are in place — so this is the lowest-friction path to a running app. For a non-commercial MVP it is genuinely free: the Workers free tier covers 100k requests/day, and the headline CPU limit is a non-issue here because the plan generator's Anthropic calls are I/O-bound (time spent waiting on the API does not count as CPU time). It is edge-native, fully CLI-driven (`wrangler deploy` / `rollback` / `tail`), and ships GA MCP servers — clearing all five agent-friendly criteria. The decisive factors were the user's "free, non-commercial" constraint and the existing stack configuration.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass (GA) | 5 Pass |
| **Vercel** | Pass | Pass | Pass | Pass | Partial (beta, RO) | 4P / 1Part |
| **Render** | Pass | Pass | Pass | Pass | Pass (GA) | 5 Pass |
| Netlify | Pass | Pass | Pass | Pass | Pass (GA) | 5 Pass |
| Railway | Pass | Pass | Pass | Pass | Pass (GA) | 5 Pass |
| Fly.io | Pass | Partial | Partial | Pass | Partial (exp.) | 3P / 2Part |

Notes per platform:

- **Cloudflare Workers** — Astro 6 SSR runs via `@astrojs/cloudflare` (v14.x); Pages is no longer an adapter target, Workers is the canonical path. `wrangler` covers deploy/rollback/tail; docs publish `llms.txt`; MCP servers (docs, observability) are GA. Free tier (100k req/**day**) covers the MVP. Only caveat is the workerd ≠ Node surface (see risk register).
- **Vercel** — `@astrojs/vercel` (v11, GA) deploys to Node serverless functions (correct runtime for Anthropic SDK + `@supabase/ssr`). 300s function duration is ample for LLM generation. **Hobby tier is free but non-commercial only** — which fits Treningo's stated non-commercial intent, removing the cost objection. MCP is public beta (read-only). Strongest free runner-up; would require swapping the adapter.
- **Render** — Astro SSR as a Node web service (`@astrojs/node`). Mature GA CLI + GA MCP server (20+ tools). Free web service spins down after 15 min idle (~30–60s cold start) — a real UX wrinkle for an MVP; $7/mo removes it. No workerd quirks.
- **Netlify** — `@astrojs/netlify` (Node Functions). GA MCP server. Free tier's **10s function timeout** is a poor fit for LLM generation; mitigations (streaming, Background Functions) push toward paid Pro (~$19/mo).
- **Railway** — Excellent Node-server DX, official GA MCP. **No free tier** (Hobby $5/mo) — dropped under the "free" constraint.
- **Fly.io** — Cheapest always-on (~$1–2/mo) but **not free**, requires a Dockerfile, larger ops surface, and MCP is experimental. Dropped under the "free" constraint.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already configured in the repo; genuinely free for an I/O-bound LLM MVP; edge-native; full CLI control; GA MCP. Wins on zero migration cost + zero hosting cost.

#### 2. Vercel

Free Hobby tier is viable given non-commercial use; 300s function duration is ideal for plan generation; no workerd compatibility quirks; clean `@astrojs/vercel` Node runtime. Gap vs. recommendation: requires an adapter swap and MCP is only beta/read-only.

#### 3. Render

Free Node web service with a mature GA CLI and GA MCP server; no edge-runtime constraints. Gap vs. recommendation: free tier cold-starts (~30–60s) hurt first-request UX, and it requires an adapter swap.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Astro 6 + Workers + middleware + `nodejs_compat` → `[object Object]` on SSR pages** ([withastro/astro#15434](https://github.com/withastro/astro/issues/15434), [#14511](https://github.com/withastro/astro/issues/14511)). Hits Treningo directly because `src/middleware.ts` runs on every request for auth. Workaround: add `disable_nodejs_process_v2` to `compatibility_flags`. Dangerous because `astro dev` does not reproduce it — only `wrangler dev` or a real deploy does.
2. **Free-tier subrequest cap.** The validation-retry loop may issue several Anthropic calls per request; the free tier allows 50 subrequests/invocation (10,000 on paid). Fine for the MVP, but a runaway retry could hit it. (The CPU-time limit, by contrast, is **not** a real constraint — LLM calls are I/O-bound.)
3. **`tech-stack.md` says `cloudflare-pages`, but the adapter no longer targets Pages** — the canonical 2026 path is Workers. The foundation doc is stale relative to current tooling.
4. **workerd ≠ Node.** The Anthropic SDK and `@supabase/ssr` assume Node APIs; everything hinges on `nodejs_compat` plus a correct `compatibility_date`. Bumping the compat date can change Node-compat semantics.

### Pre-Mortem — How This Could Fail

The solo dev deployed Treningo to Workers because the adapter was already in the repo. Locally `astro dev` worked perfectly. After the first `wrangler deploy`, auth-protected pages rendered `[object Object]` — the middleware + `nodejs_compat` bug, masked entirely by dev mode. An evening was lost to debugging before the GitHub thread surfaced. Later, the plan generator intermittently misbehaved when the validation-retry loop fanned out into several Anthropic subrequests near the free-tier cap. None of these were fatal — each had a documented fix — but two undocumented (in marketing) workerd behaviors cost roughly a week of iteration. In a 3-week after-hours MVP, that is a third of the budget. The root error was trusting dev/prod parity that workerd does not actually provide.

### Unknown Unknowns

- **Dev/prod parity is an illusion**: `astro dev` runs on Vite/Node, not workerd. Only `wrangler dev` gives true runtime fidelity (bindings, secrets, compat flags) — use it before every deploy.
- **`compatibility_date` is a hidden variable**: Workers behavior depends on the compat date in `wrangler` config, not just the adapter version. It silently changes Node-compat semantics.
- **The free tier counts requests per DAY (100k/day), not per month** — generous for an MVP, but the "X requests/month" mental model does not match how Cloudflare meters and throttles.
- **Rollback can be blocked**: `wrangler rollback` refuses if D1/KV bindings changed between versions — it is not always "one command back."

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a preview version with its own URL; PR/branch previews can be wired through the existing GitHub Actions. Production publish is a separate `wrangler deploy`. Protect previews with Cloudflare Access if they expose real data.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY` set via `wrangler secret put` (stored in Workers Secrets); locally in `.dev.vars` (gitignored). CI reads them from GitHub repository secrets. Rotate by re-running `wrangler secret put`.
- **Rollback**: `wrangler rollback [version-id]` reverts to any of the last 100 versions. Time-to-revert is seconds. Caveat: blocked if D1/KV bindings changed; Supabase schema migrations do not roll back with the Worker.
- **Approval**: production `wrangler deploy` and primary secret rotation are human-gated. An agent may run `wrangler dev`, `wrangler tail`, preview uploads, and read-only inspection unattended.
- **Logs**: `wrangler tail` for live runtime logs; the Cloudflare observability MCP server (`https://observability.mcp.cloudflare.com/mcp`) gives structured read-only access. CI logs via the GitHub Actions run.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `[object Object]` on SSR pages (middleware + `nodejs_compat`) | Devil's advocate / Pre-mortem | H | H | Add `disable_nodejs_process_v2` to `compatibility_flags`; verify on `wrangler dev` before deploy; track #15434 |
| dev/prod parity gap masks workerd bugs | Unknown unknowns | M | H | Always smoke-test via `wrangler dev` (not just `astro dev`) before `wrangler deploy` |
| `compatibility_date` bump changes Node-compat behavior | Devil's advocate | M | M | Pin `compatibility_date` in `wrangler` config; change deliberately and re-test |
| Validation-retry loop hits 50-subrequest free-tier cap | Research finding | L | M | Cap retries (e.g. ≤3) in the validation layer; upgrade to paid ($5/mo) if needed |
| Stale `tech-stack.md` says Pages, not Workers | Devil's advocate | L | L | ✅ Resolved 2026-06-27 — `tech-stack.md` `deployment_target` updated to `cloudflare-workers` |
| Rollback blocked by binding changes | Unknown unknowns | L | M | Avoid coupling binding changes with risky deploys; keep migrations reversible/separate |

## Getting Started

The stack is already configured for Cloudflare; these steps assume `@astrojs/cloudflare` and `wrangler` are present (per CLAUDE.md).

1. Confirm `wrangler.toml`/`wrangler.jsonc` sets `compatibility_flags = ["nodejs_compat", "disable_nodejs_process_v2"]` and a pinned `compatibility_date` (≥ 2024-09-23). The second flag pre-empts the middleware SSR bug.
2. Set secrets: `npx wrangler secret put SUPABASE_URL`, `... SUPABASE_KEY`, `... ANTHROPIC_API_KEY`. Mirror them into `.dev.vars` for local dev.
3. Smoke-test on the real runtime: `npm run build && npx wrangler dev` — exercise an auth-protected route to confirm no `[object Object]`.
4. Deploy: `npm run build && npx wrangler deploy`.
5. Verify live + tail logs: `npx wrangler tail`; confirm rollback works with `npx wrangler rollback`.

## Deployment Outcome (first deploy — 2026-06-27)

The first production deploy was executed and verified live.

- **Live URL**: `https://treningo.franczakr066.workers.dev`
- **`[object Object]` mitigation confirmed**: with `disable_nodejs_process_v2` in `compatibility_flags`, the top risk did **not** materialize — `/`, `/auth/signin` render correct SSR HTML (0 occurrences), `/dashboard` returns `302 → /auth/signin` when unauthenticated. Verified both on `wrangler dev` and on the live Worker.
- **Supabase wired**: `SUPABASE_URL` + `SUPABASE_KEY` set via `wrangler secret put` (production); a bad-credential `POST /api/auth/signin` returns `Invalid login credentials` (not "Supabase is not configured"), confirming end-to-end connectivity. Secrets take effect on the live Worker with no redeploy.
- **KV binding gotcha (not in the original research)**: the Worker's `SESSION` KV namespace was first created by auto-provisioning during a failed deploy attempt. The retry then failed with `code 10014: a namespace with this title already exists`, because auto-provisioning tried to recreate it. **Fix**: bind the existing namespace explicitly in `wrangler.jsonc` (`kv_namespaces: [{ binding: "SESSION", id: "…" }]`) and rebuild so the binding lands in `dist/server/wrangler.json`. Lesson: pin the KV binding by id rather than relying on auto-provisioning across deploys.
- **One-time account setup encountered**: Cloudflare email verification (error `10034`) and `workers.dev` subdomain registration both had to be done once by the account owner before the first publish succeeded.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
