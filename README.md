<p align="center">
  <img src="./public/logo.svg" alt="Treningo logo" width="360" />
</p>

# Treningo

**Your first personal trainer, minus the price tag.** Treningo turns a short
training profile into a workout plan built specifically for you — not another
generic PDF pulled off the internet.

## Why Treningo

Starting at the gym is intimidating. You have a goal — lose fat, build muscle,
get stronger — but no idea which exercises to do, how often, or how heavy to
go. The usual options are all flawed: generic plans and YouTube routines
ignore the equipment you actually have access to and the schedule you can
realistically stick to; a personal trainer solves that, but costs real money
every month.

Treningo closes that gap. Tell it your goal, experience level, available
equipment, how many days a week you can train, and your current lifts — and
within seconds you get back a complete workout plan built around exactly
those constraints: the right exercises, sets, reps, and starting weights,
using only the equipment you marked as available and matching the exact
number of training days you chose. No generic templates, no guesswork, no
subscription. Save it, come back to it, rename it, drop it once you've
outgrown it, and generate the next one.

It's built for the person who is motivated to train but doesn't yet know how
to turn that motivation into a plan — the first months at the gym, where good
guidance matters most.

## What it does

Treningo generates a personalized gym workout plan for beginners. You fill in a
short training profile — goal, experience level, available equipment, training
days per week, current lifts — and get one workout plan back, tailored to those
parameters, that you can save and browse later.

The problem it solves: generic, one-size-fits-all plans found online don't
account for what equipment you actually have, how many days you can train, or
your current strength level. Treningo asks for those inputs up front and builds
a plan around them instead.

See [`context/foundation/prd.md`](./context/foundation/prd.md) for the full
product requirements and [`context/foundation/tech-stack.md`](./context/foundation/tech-stack.md)
for why this stack was chosen.

## How it works

1. Sign up / log in (Supabase Auth).
2. Fill in your training profile (goal, experience, equipment, training days,
   current lifts).
3. Generate a plan — an LLM (Google Gemini, `gemini-2.5-flash`) produces a
   structured workout plan from your profile, which is then checked against
   plan-soundness guardrails (only your available equipment, exactly your
   chosen number of training days) and retried automatically if it violates
   them.
4. Save the plan, browse your saved plans later, rename or delete them.

## Tech Stack

- [Astro](https://astro.build/) v6 - Server-first rendering, deployed to Cloudflare Workers
- [React](https://react.dev/) v19 - Interactive UI islands
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) - Styling and components
- [Supabase](https://supabase.com/) - Auth and Postgres persistence (RLS-scoped per user)
- [Google Gemini](https://ai.google.dev/) (`@google/genai`) - Structured-output plan generation
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone <this-repo-url>
cd treningo
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Add your `GEMINI_API_KEY` (get one from [Google AI Studio](https://aistudio.google.com/apikey)) to both `.env` and `.dev.vars`.

6. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` / `npm run lint:fix` - ESLint (type-checked rules)
- `npm run typecheck` - `astro check`
- `npm run format` - Prettier
- `npm run test` - Unit tests (Vitest)
- `npm run test:integration` - Integration tests against a real local Supabase instance
- `npm run test:e2e` - End-to-end tests (Playwright)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── lib/ # Services / business logic (plan generation, validation, Supabase access)
├── supabase/migrations/ # Database schema (Postgres, RLS per user)
├── context/ # Product/foundation docs (PRD, tech stack, test plan, roadmap)
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication and for
persisting training profiles and saved plans. Environment variables are
declared via Astro's `astro:env` schema and are treated as **server-only
secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Database migrations (hosted-linked)

Migrations target the hosted Supabase project directly (no local Docker
required for this step):

```bash
npx supabase login
npm run db:link -- --project-ref <project-ref>   # subdomain of SUPABASE_URL
npm run db:migration <short_description>          # new supabase/migrations/<timestamp>_<desc>.sql
npm run db:push                                    # apply pending migrations
npm run db:types                                   # regenerate src/db/database.types.ts
```

See `supabase/migrations/README.md` for the RLS policy convention used for
every per-user table.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                       |
| `/auth/signup`        | Email/password sign-up form                                       |
| `/auth/confirm-email` | Post-signup "check your inbox" page                               |
| `/dashboard`          | Saved-plans list (redirects to `/auth/signin` if unauthenticated) |
| `/training-profile`   | Training profile form                                             |
| `/plan`               | Generate a new plan                                               |
| `/plan/[id]`          | View a saved plan                                                 |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `GEMINI_API_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, unit tests, and build on
every push and PR to `master`, plus a separate job running integration tests
against a real local Supabase stack. Configure `SUPABASE_URL` and
`SUPABASE_KEY` as repository secrets in GitHub.

## License

MIT
