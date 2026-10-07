# Puŕ Fermé Creative Studio

Internal tool for the Puŕ Fermé Project team. It generates ad creatives for **Meta, Amazon and Flipkart**, explains how each platform differs, checks every line of copy against the claims library, stores creatives with an approval gate, and turns performance numbers into verdicts and a weekly brief.

> Compliance checks support, but don't replace, review by a food-regulatory consultant.

## What's in it

| Page | What it does |
|---|---|
| **Create ads** (`/create`) | Pick product, creative type (depends on platform), angle, persona, language and 2–4 concepts. Streams generation, validates the JSON, scans every concept against the compliance terms. Save, copy, regenerate one, or make structural variations (including the same angle adapted for the other two platforms). Products on hold or blocked can't be generated. |
| **Platform guide** (`/guide`) | Comparison table of the three platforms (selected one highlighted) and the selected platform's guide. |
| **Claim checker** (`/check`) | Instant inline highlighting of red/amber terms, plus a model "deep check" (FSSAI Advertising & Claims Regulations 2018, ASCI incl. AI-content labelling, IMS Act) returning a verdict, issues and a rewrite. |
| **Library** (`/library`) | Saved creatives with filters, search, status, persisted QA checklist and CSV export. A creative can only move to Approved (or later stages) with **zero red flags** (re-scanned with current terms) **and every QA item ticked**. |
| **Results** (`/results`) | Manual inputs with live verdicts (Meta: hook rate, CTR, CPA, frequency; Amazon/Flipkart: ACoS, CTR, conversion, clicks), CSV upload with column mapping, saved results, and a weekly brief from the last 7 days. |
| **Admin** (`/admin`) | Edit products (status, claims, pack image), brand settings, angles/personas/languages, platform rules and guides, compliance terms, verdict thresholds. |
| **Usage** (`/admin/usage`) | Tokens and estimated cost per day, user and call type. |

The **platform switch** at the top of every page changes creative types, the rules sent to the model, the guide, the compliance terms and how results are judged.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Postgres via Drizzle ORM (any Postgres works; Neon from the Vercel Marketplace is the suggested host)
- Auth.js (NextAuth v5): Google sign-in and/or email magic link (Resend), restricted to `ALLOWED_EMAILS`
- Anthropic API via `@anthropic-ai/sdk`, server-side only, streaming + structured output validated with zod (one retry on invalid JSON)
- Vercel Blob for pack images (optional)
- Vitest (scanner, verdicts, gate, CSV, prompt builders) and Playwright (smoke + accessibility)

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. Never prefix secrets with `NEXT_PUBLIC_`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Use the **pooled** URL on Vercel. |
| `ANTHROPIC_API_KEY` | yes (unless mock) | From console.anthropic.com. Server-side only. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5-5`. |
| `ANTHROPIC_MOCK` | no | `true` returns sample output with no API calls (tests, demos). A banner shows when it's on. |
| `AUTH_SECRET` | yes | `npx auth secret` or `openssl rand -base64 32`. |
| `ALLOWED_EMAILS` | yes | Comma-separated team emails. Anyone else is refused. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | one sign-in method | Google OAuth client (see below). |
| `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | one sign-in method | Email magic links via Resend; needs a verified sending domain. |
| `AUTH_DEV_LOGIN` | no | `true` shows a password-less "dev sign-in" for local runs/tests. Ignored on Vercel. |
| `BLOB_READ_WRITE_TOKEN` | no | Enables pack-image upload in Admin. Without it, paste an image URL. |

## Run locally

Requires Node 20+ and a Postgres database (local, Docker, or a free Neon project).

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL, AUTH_SECRET, ALLOWED_EMAILS
                                # set ANTHROPIC_MOCK=true and AUTH_DEV_LOGIN=true to try it with no keys
npm run db:migrate              # create tables
npm run db:seed                 # products, brand settings, platform rules, compliance terms
npm run dev                     # http://localhost:3000
```

`npm run db:seed` never overwrites edits made in Admin. `npm run db:reset-seed` restores the original seed for settings, rules, terms and products.

## Tests and checks

```bash
npm test               # unit tests (Vitest)
npm run test:e2e       # Playwright smoke + accessibility tests (builds the app; needs Postgres)
npm run lint
npm run typecheck
npm run build && npm run check:bundle   # fails if any secret or the Anthropic SDK reaches client JS
```

The e2e tests use a **separate database** (`E2E_DATABASE_URL`, default `postgres://postgres:postgres@localhost:5432/studio_test`) which is wiped and re-seeded on each run, and they run with mock AI, so they cost nothing. If Playwright can't find a browser, run `npx playwright install chromium` or set `PW_CHROMIUM_PATH`.

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on pushes to `main` and on pull requests.

## Deploy to Vercel

1. **Import the repo** at vercel.com/new (framework: Next.js; defaults are fine).
2. **Database:** in the project, *Storage → Marketplace → Neon* (free tier is enough to start). It sets `DATABASE_URL`.
3. **Pack images (optional):** *Storage → Blob → Create*. It sets `BLOB_READ_WRITE_TOKEN`.
4. **Environment variables** (*Settings → Environment Variables*): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AUTH_SECRET`, `ALLOWED_EMAILS`, and your sign-in method's variables. Do not set `AUTH_DEV_LOGIN` or `ANTHROPIC_MOCK` in production.
5. **Sign-in:**
   - *Google:* Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). Authorised redirect URI: `https://<your-domain>/api/auth/callback/google`. Put the ID and secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
   - *Email link:* create a Resend API key, verify your domain, set `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM` (e.g. `Studio <studio@yourdomain.com>`).
6. **Create tables and seed** once, from your machine, pointing at the production database:
   ```bash
   DATABASE_URL="<neon url>" npm run db:migrate
   DATABASE_URL="<neon url>" npm run db:seed
   ```
7. **Deploy.** Generation routes allow up to 300 s (`maxDuration`), which needs Vercel's fluid compute (on by default for new projects).

When the schema changes later: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, and run `npm run db:migrate` against production.

## How generation stays compliant

1. **Up front:** the prompt (built server-side in `src/lib/prompts.ts` from database content only) includes the brand's hard rules, the product's green/amber/red claims and the platform's rules.
2. **After generation:** every concept is re-scanned server-side (`src/lib/compliance.ts`) with the compliance terms for that platform and product. The model's own claim list is never trusted alone.
3. **Before approval:** status changes re-scan with the current terms and require zero red hits plus a complete QA checklist (`src/lib/qa.ts`).

## Project layout

```
src/app/            pages and API routes (generate, check, brief, library export, auth)
src/lib/compliance.ts   scanner + highlighter (pure, unit-tested)
src/lib/verdicts.ts     results verdict logic (pure, unit-tested)
src/lib/prompts.ts      prompt builders
src/lib/ai.ts           Anthropic calls: streaming, structured output, retry, usage logging, mock mode
src/lib/integrations/   extension points for Meta/Amazon API imports and AI video rendering (not built yet)
src/db/                 Drizzle schema, client, seed data
drizzle/                SQL migrations
tests/unit, tests/e2e   Vitest and Playwright
```

## Later (extension points ready, not built)

- Meta Marketing API insights import and Amazon Ads API report import: implement `ResultsImporter` in `src/lib/integrations/` and feed rows into `saveResults`.
- AI video generation from a creative's `ai_prompt` with the pack image attached: implement `VideoRenderer`. Check the provider's current API docs first.
