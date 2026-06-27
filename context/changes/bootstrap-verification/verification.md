---
bootstrapped_at: 2026-06-27T13:44:36Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: treningo
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim from `context/foundation/tech-stack.md`:

```yaml
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
```

**Why this stack:** A solo developer shipping Treningo as a 3-week, after-hours MVP needs a battle-tested, agent-friendly starter that delivers auth, a PostgreSQL database, and edge deploy out of the box — exactly the must-haves behind account isolation (FR-001), data privacy, and plan persistence (FR-005/006). Astro+Supabase+Cloudflare is the recommended default for `(web, js)` and clears all four agent-friendly gates (typed, convention-based, popular, well-documented), with TypeScript-first Zod schemas at boundaries that suit AI-assisted work. Auth and AI are the forcing features flagged; payments, realtime, and background jobs are out of scope per PRD non-goals. The plan generator (FR-003) uses an LLM via the Anthropic SDK with structured outputs, wrapped in a post-generation validation layer that enforces the FR-003 guardrails (available equipment, chosen training days, stated goal) and retries on violation; a rules/template engine remains a zero-per-request-cost fallback. CI runs on GitHub Actions with auto-deploy-on-merge to Cloudflare Pages — what the starter ships with. Bootstrapper confidence is first-class.

## Pre-scaffold verification

| Signal       | Value                                          | Severity | Notes                                              |
| ------------ | ---------------------------------------------- | -------- | -------------------------------------------------- |
| npm package  | not run                                        | —        | cmd_template starts with `git clone`; no npm CLI to check |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh | from card.docs_url; within last 3 months |

Note: `gh` CLI was not authenticated; the `pushed_at` timestamp was retrieved via the public GitHub API instead.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 18 (top-level entries)
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (existing project CLAUDE.md preserved)
**.gitignore handling**: append-merged (12 new patterns appended under a `# from 10x-astro-starter` separator)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up so the starter's history did not leak)

Move details:
- `src/` — merged into cwd's pre-existing empty `src/`; no file-level conflicts.
- Moved silently (not present in cwd): `.env.example`, `.github`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `supabase`, `tsconfig.json`, `wrangler.jsonc`.
- `context/` — scaffold carried no `context/`; cwd's `context/` untouched (canonical).

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 6 HIGH, 10 MODERATE, 2 LOW (18 total)
**Direct vs transitive**: 0/1/—/— direct of total 0 CRITICAL / 6 HIGH (1 HIGH is a direct dependency; the remainder are transitive). npm exit code was non-zero (vulnerabilities present) — informational only, not a halt.

#### CRITICAL findings

None.

#### HIGH findings

Affected packages (6): `astro`, `devalue`, `miniflare`, `undici`, `vite`, `ws`. These are predominantly transitive dependencies of the build/dev/edge toolchain (Astro, Vite, Cloudflare miniflare/workerd). Run `npm audit` for the full advisory chains; `npm audit fix` addresses the non-breaking subset.

#### MODERATE findings

10 advisories (transitive; log-only). See `npm audit` output for the full list.

#### LOW / INFO findings

2 advisories (log-only).

Note: bootstrapper does not run `npm audit fix` or otherwise modify the tree — informing only. Address per your risk tolerance.

## Hints recorded but not acted on

| Hint                    | Value             |
| ----------------------- | ----------------- |
| bootstrapper_confidence | first-class       |
| quality_override        | false             |
| path_taken              | standard          |
| self_check_answers      | null              |
| team_size               | solo              |
| deployment_target       | cloudflare-pages  |
| ci_provider             | github-actions    |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true              |
| has_payments            | false             |
| has_realtime            | false             |
| has_ai                  | true              |
| has_background_jobs     | false             |

v1 surfaces these but takes no compensating action. No CI/CD scaffolding and no agent-context files are generated in v1; `has_ai: true` and `has_auth: true` are recorded for a future skill to act on.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. In particular, reconcile `CLAUDE.md.scaffold` (the starter's agent instructions) with your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log (`npm audit` for advisory chains, `npm audit fix` for the non-breaking subset).
- Copy `.env.example` to `.env` and fill in Supabase / Cloudflare credentials before running the dev server.
