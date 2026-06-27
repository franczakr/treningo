---
starter_id: 10x-astro-starter
package_manager: npm
project_name: treningo
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo developer shipping Treningo as a 3-week, after-hours MVP needs a
battle-tested, agent-friendly starter that delivers auth, a PostgreSQL database,
and edge deploy out of the box — exactly the must-haves behind account isolation
(FR-001), data privacy, and plan persistence (FR-005/006). Astro+Supabase+
Cloudflare is the recommended default for `(web, js)` and clears all four
agent-friendly gates (typed, convention-based, popular, well-documented), with
TypeScript-first Zod schemas at boundaries that suit AI-assisted work. Auth and
AI are the forcing features flagged; payments, realtime, and background jobs are
out of scope per PRD non-goals. The plan generator (FR-003) uses an LLM via the
Anthropic SDK with structured outputs, wrapped in a post-generation validation
layer that enforces the FR-003 guardrails (available equipment, chosen training
days, stated goal) and retries on violation; a rules/template engine remains a
zero-per-request-cost fallback. CI runs on GitHub Actions with
auto-deploy-on-merge to Cloudflare Pages — what the starter ships with.
Bootstrapper confidence is first-class.
