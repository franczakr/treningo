# E2E Testing Rules

Read this before writing or regenerating any spec under `tests/e2e/`.

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to
  `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions:
  `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., a timestamp/random suffix) for test data —
  Treningo's local Supabase stack persists its Docker volume across
  `start`/`stop`, so a fixed email collides with "User already registered"
  on the second run.
- Use `storageState` for authentication in tests that don't test the auth
  flow itself — never log in through the UI in individual tests. (The
  signup/signin journey itself is the one legitimate exception — that flow
  is what `seed.spec.ts` protects.)

## Project-specific grounding

- **Never point this suite at the hosted Supabase project.** This suite
  drives `astro dev` under the Cloudflare adapter, which reads
  `SUPABASE_URL`/`SUPABASE_KEY` from **`.dev.vars`** (Wrangler's
  local-secrets file) — NOT from `process.env`, NOT from `.env`, and NOT
  from anything passed via Playwright's `webServer.env`. This is a
  different mechanism from the Vitest integration suite (which constructs
  its own client directly and reads `.env.test.local`). `.dev.vars` points
  at the HOSTED project by default (per CLAUDE.md's Node/Cloudflare env
  split). `tests/e2e/global-setup.ts` refuses to run this suite at all
  unless `.dev.vars` is confirmed to contain `127.0.0.1`/`localhost` — do
  not remove or weaken that guard. Run `supabase start` and point
  `.dev.vars` at it before running `npm run test:e2e` locally (or let CI's
  job do it, once that job exists).
- **Don't generate E2E tests from scratch.** Start from
  `context/foundation/test-plan.md`: pick the highest risk that genuinely
  crosses several boundaries (auth, routing, API, DB) or exists only in the
  rendered UI. If an isolated function or an integration test could prove
  it, that's the cheaper, correct tool — see Risk #1 in `test-plan.md`,
  explicitly proven via integration (`context/changes/testing-account-isolation/`),
  not E2E, for exactly this reason.
- **Mock only expensive/non-deterministic external APIs, and only at the
  boundary where the app actually calls them.** Treningo's plan-generation
  step calls Gemini **server-side** (`src/lib/services/plan-generator.ts`) —
  browser-level `page.route()` cannot intercept a server-side fetch. A spec
  that needs to get past plan generation either accepts a real (slow,
  non-deterministic, quota-consuming) Gemini call, or scopes itself to a
  flow that doesn't need one. Prefer the latter.
- **Name the test after the risk**: `test('profile data persists across a
  fresh navigation after first save', ...)`, not `test('test 1', ...)`.
- **Control question for every assertion**: would this fail if the
  `test-plan.md` risk came true? If not, it's decorative.
