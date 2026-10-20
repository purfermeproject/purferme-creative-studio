# Puŕ Fermé Creative Studio

Internal tool for the Puŕ Fermé Project team. It generates ad creatives for **Meta, Amazon and Flipkart**, explains how each platform differs, checks every line of copy against the claims library, stores creatives with an approval gate, and turns performance numbers into verdicts and a weekly brief.

> Compliance checks support, but don't replace, review by a food-regulatory consultant.

## What's in it

| Page | What it does |
|---|---|
| **Create** (`/create`) | A three-column workspace (a guided 3-step flow on mobile). **Brief** (product → objective → audience → platform and format → angle) → **3 proposals** → **develop** one as an ad concept, a UGC creator script or an ad copy set. The draft saves immediately and autosaves while you edit. The right-hand panel has **Check** (claims and brand validation, sign-off, approval), **Edit** (every line) and **History** (restore any version). Images, variations and the handoff ZIP all work from the open ad. Products on hold or blocked can't be generated. |
| **Competitors** (`/competitors`) | **Find competitors**: pick one of our products (which fills in the category, editable), what to look at (everything, ads and hooks, claims, pricing, packaging, reviews) and how many brands. The AI searches the web (India) and saves each brand it finds, with source links: ✓ means the page came back from the search tool, ? means double-check it. Brands already on the list are skipped. Each one is then broken down: hook, angle, their claims rated against our rules, what works, white space and counter-ideas. You can also add an ad by hand (text or screenshot). **How the research is used:**
1. Every brief for a researched product automatically includes the competitive landscape: their hooks to avoid, angles they own, risky claims never to follow, and open ground to lean into. It can be switched off in the brief.
2. **Develop this idea** turns any counter-idea into a full ad.
3. The Check panel flags any line that sounds like a competitor's, and an approver must confirm it.
4. **Focus on one competitor** narrows a brief to a single competitor. Running ads in Meta's Ad Library aren't read directly; that needs Meta API access. **What's working on Amazon or Flipkart**: set "Where to look" to Amazon.in or Flipkart and it reads the best-selling listings for the category (titles, image order, A+ content, ratings, reviews, badges, price per 100 g, offers, what reviewers praise and complain about). It saves a playbook (title formula, keywords, image stack, A+ modules, price and pack, review doubts to answer, ad practices, changes for our listing) that Amazon/Flipkart briefs use automatically. A switch in the brief turns that off. |
| **Platform guide** (`/guide`) | Comparison table of the three platforms (selected one highlighted) and the selected platform's guide. |
| **Claim checker** (`/check`) | Instant inline highlighting of red/amber terms, plus a model "deep check" (FSSAI Advertising & Claims Regulations 2018, ASCI incl. AI-content labelling, IMS Act) returning a verdict, issues and a rewrite. |
| **Library** (`/library`) | Every draft, with filters, search, status, CSV export and **Open in workspace**. An ad can only move to Approved (or later) when it has **no red flags or restricted claims**, its **uncertain claims are signed off by an approver**, and **every QA item is ticked**. |
| **Results** (`/results`) | Manual inputs with live verdicts (Meta: hook rate, CTR, CPA, frequency; Amazon/Flipkart: ACoS, CTR, conversion, clicks), CSV upload with column mapping, saved results, and a weekly brief from the last 7 days. |
| **Admin** (`/admin`) | Products (status, claims, **ingredients, messaging priorities, evidence for amber claims, product links**, original pack photo), brand settings, angles, personas and languages, platform rules and guides, compliance terms, verdict thresholds, and **team roles**. |
| **Usage** (`/admin/usage`) | Tokens and estimated cost per day, user and call type. |

The **platform switch** at the top of every page changes creative types, the rules sent to the model, the guide, the compliance terms and how results are judged.

See [docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md) for the audit, the phased plan and what is implemented now versus later.

## Roles

Viewer (look, check copy) → Creator (make and edit ads) → Approver (sign off uncertain claims, approve, change status, delete) → Admin (settings, roles). Every server action and API route enforces them.

- While **Settings → Team roles** is empty, everyone is an admin (the original behaviour). The person who adds the first entry is kept as an admin.
- `ADMIN_EMAILS` (comma-separated) are always admins, as a recovery path. `DEFAULT_ROLE` sets the role for unlisted people once roles are on (default: creator).
- With the shared team password, people are identified by the name they type, so roles are only as strong as that. Use Google sign-in or email links when roles must be relied on.

## Packaging stays original

Proposals show an instant, free **sketch** with your real pack photo and the hook, clearly labelled "not an AI image". **Make a real image** creates one for a proposal, and it moves into the ad when you develop it. With **Make the first image automatically** ticked (the default), every developed ad opens with an image. Extra product photos (back of pack, product out of the pack…) can be added under each product in Settings and chosen in Images. Photos must be at least 300 px on each side.

By default, images are made in two steps. The AI paints the scene with an empty spot, then the original pack photo from Settings is composited in with sharp, scaled but never redrawn. A transparent PNG cut-out looks best. "AI redraws it" is available for mood boards and is labelled as unsafe for launch. AI edits of an image containing the original pack are refused unless you explicitly allow it for a draft.

## Designer tools

- **Brand kit** (Tools → Settings → Brand kit): logo, colours, headline/body fonts (Google Fonts name or uploaded font file).
- **Make image** at exact platform sizes (or a custom size). "Text: add crisp brand text after" makes a text-free picture; **Add text & logo** then places headline, sub-line, button and logo in your fonts and colours, inside platform safe zones.
- **Preview** shows an image in Reels/Stories, feed, Amazon search/listing and Flipkart card mock-ups with safe-zone overlays.
- **Edit with words** (AI edit at the same size), **All sizes** (free smart-crop to every size for the platform), **Compare** (2–4 side by side).
- **Make all scenes** builds a storyboard for video ideas; **Handoff pack (.zip)** bundles images (named by scene and size), script, printable storyboard and the pack photo.
- **Check a finished design** (Claim checker): upload artwork; the app reads all text in it, runs the claims scan and checks the pixel size for the platform.

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
| `ANTHROPIC_API_KEY` | one AI key | From console.anthropic.com. When set, Claude writes the ads. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5-5`. |
| `ANTHROPIC_MOCK` | no | `true` returns sample output with no API calls (tests, demos). A banner shows when it's on. |
| `OPENAI_API_KEY` | one AI key | Powers **Make image**, and writes the ads too when there's no Anthropic key. |
| `OPENAI_MODEL` | no | Text model when OpenAI writes the ads. Defaults to `gpt-5.5`. |
| `AI_PROVIDER` | no | `openai` or `anthropic` to force which service writes the ads. |
| `OPENAI_IMAGE_MODEL` | no | Defaults to `gpt-image-2.5-flare`. |
| `TEAM_PASSWORD` | one sign-in method | Simplest login: everyone types this shared password (plus their name, shown in Usage and saved ads). Change it to lock everyone out. |
| `AUTH_SECRET` | yes | `npx auth secret` or `openssl rand -base64 32`. |
| `ALLOWED_EMAILS` | yes | Comma-separated team emails. Anyone else is refused. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | one sign-in method | Google OAuth client (see below). |
| `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | one sign-in method | Email magic links via Resend; needs a verified sending domain. |
| `AUTH_DISABLED` | no | `true` skips the login screen entirely on your own computer. Ignored on Vercel. |
| `AUTH_DEV_LOGIN` | no | `true` shows a password-less "dev sign-in" for local runs/tests. Ignored on Vercel. |
| `BLOB_READ_WRITE_TOKEN` | no | Stores pack photos in Vercel Blob. Without it they're stored in the database. |
| `ADMIN_EMAILS` | no | Comma-separated emails that are always admins (role recovery). |
| `DEFAULT_ROLE` | no | Role for people not listed in Team roles once roles are on: `viewer`, `creator` (default), `approver` or `admin`. |

## Run locally

Requires Node 20+ and a Postgres database (local, Docker, or a free Neon project).

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL, AUTH_SECRET, ALLOWED_EMAILS
                                # set ANTHROPIC_MOCK=true and AUTH_DISABLED=true to try it with no keys and no login
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
4. **Environment variables** (*Settings → Environment Variables*): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AUTH_SECRET`, `ALLOWED_EMAILS`, and your sign-in method's variables. Do not set `AUTH_DISABLED`, `AUTH_DEV_LOGIN` or `ANTHROPIC_MOCK` in production (the first two are ignored on Vercel anyway).
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
