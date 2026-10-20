# Creative Studio upgrade: audit and phased plan

October 2026. This document covers the state of the app before the upgrade, the limitations found, what Phase 1 implements, and what is planned later. Anything listed under "Later" is **not built**.

## 1. Audit of the app before the upgrade

### What already worked (kept as is)
- Next.js 16 App Router, Postgres via Drizzle with numbered migrations that run on every Vercel deploy (`vercel-build`).
- Sign-in through Auth.js: shared team password, Google, email links, plus local-only dev options. An allowlist is checked on every request (`src/proxy.ts`).
- Generation through Anthropic or OpenAI (`src/lib/ai.ts`): streamed, schema-validated output, one retry, usage logged per call. Mock mode for tests and demos.
- Claims library: green, amber and red claims per product, plus regex compliance terms per platform and product. Every generation is re-scanned on the server (`src/lib/compliance.ts`).
- Approval gate: no red flags, plus a ticked pre-launch checklist (`src/lib/qa.ts`).
- Designer tools: images at exact platform sizes, brand-kit text overlay, safe-zone previews, edit with words, all sizes, compare, storyboard, handoff ZIP, and a design checker.
- Results: verdicts, CSV import and a weekly brief.

### Functional limitations
| # | Finding | Impact |
|---|---|---|
| F1 | Generation wrote 2–4 full concepts at once; there was no step to choose a direction first. | Slow and expensive. The team reads a lot before knowing whether any direction is right. |
| F2 | Generated ideas disappeared on reload unless someone clicked Save. | Work was lost. |
| F3 | Saved ads could not be edited, only regenerated. | Small wording fixes needed a full regeneration. |
| F4 | There was no version history. | No audit trail, and no way to undo. |
| F5 | There was no campaign objective, and audience meant persona only. | Ads were not tuned to awareness versus conversion. |
| F6 | Product knowledge was flat: claim lists plus a story. It had no ingredients, messaging priorities, evidence for amber claims or product links. | The model and reviewers lacked evidence. |
| F7 | The image model redrew the pack from a reference photo. | Printed text and logos could be altered, which breaks "packaging must remain unchanged". |
| F8 | Claims were checked by regex only. The model's own claim list was never checked against the product library, and amber or uncertain claims had no sign-off. | Uncertain claims could reach Approved on a single checkbox. |
| F9 | There were no roles. Anyone signed in could approve, delete or change settings. | No separation of duties. |
| F10 | There was no generation metadata (prompt, model, source assets, mock or real, approver). | Ads could not be audited, and no future learning loop was possible. |
| F11 | Mock output was flagged only by a page banner. Once saved, it looked like real output. | Placeholder content could be mistaken for real work. |

### UX limitations
- `/create` was one long form above long cards, with no visible workflow and little sense of progress or state.
- Saved and unsaved states were unclear. There was no loading skeleton, and errors had no retry.
- The visual identity was generic (platform-tinted accent, Bricolage and Literata fonts) rather than Puŕ Fermé's palette and type.
- On mobile, the full form and cards were stacked with no guidance.

## 2. Phased plan

### Phase 1: workspace and workflow (implemented in this change)
1. **Design system:** Cream, Purple, Caramel, Gold and Soft Pink tokens, with Fraunces serif headings and Inter for interface text, in light and dark themes (`src/app/globals.css`). Every page has a new header and serif headings.
2. **Three-column `/create` workspace** (`src/components/workspace/`):
   - Left: the brief (product → objective → audience → platform and format → angle).
   - Middle: proposals and the creative preview.
   - Right: Check, Edit and History.
   - On mobile it becomes a guided 3-step flow.
   - It has loading skeletons, empty, error (with retry) and saved states.
3. **Two-stage generation:** three short proposals, then the chosen one is developed (`mode: "proposals" | "develop"` in `/api/generate`). Developing saves a Draft immediately, as version 1.
4. **Deliverables:** ad concept, UGC creator script, or ad copy set (the copy set includes 4 tested variants). Platform-specific limits are part of the prompt and the checks.
5. **Product knowledge:** ingredients, messaging priorities, evidence for amber claims, and product links. These are edited in Settings, used in prompts and shown to reviewers.
6. **Locked packaging:** by default, the image model paints the scene only. The original pack photo is then composited with sharp, scaled but never redrawn (`src/lib/pack-composite.ts`; a unit test checks the pack pixels are unchanged). AI edits of such images are refused unless the user explicitly accepts them for a draft, and the result is labelled "not for launch".
7. **Autosave and versions:**
   - Edits save as you type, with a debounce.
   - Failed saves retry with backoff, and a final save is sent when the tab is hidden or closed.
   - An edit from a stale tab is refused (HTTP 409) and the user chooses which version to keep.
   - Versions are stored in `creative_versions`, and quick autosaves are merged into one version.
   - Users can name a version and restore any earlier one. A restore creates a new version, so nothing is lost.
8. **Claims and brand validation** (`src/lib/validation.ts`), shared by the browser and the server:
   - Red terms and restricted product claims block approval.
   - Amber claims and claims missing from the library need an approver's sign-off, recorded by name and tied to the exact revision.
   - Brand notes are advisory: avoid-list phrases, headline length and "See more" truncation.
   - Changing the wording clears the sign-off and sends an approved ad back to Draft.
9. **Roles:** viewer, creator, approver and admin (`src/lib/roles.ts`).
   - They are enforced in every route handler and server action, and managed in Settings → Team roles.
   - While no roles are listed, everyone is an admin, so existing behaviour is unchanged.
   - `ADMIN_EMAILS` always grants admin, as a recovery path.
10. **Metadata:** each ad records provider, model, mock flag, prompt and prompt hash, source asset ids, the chosen proposal, objective, deliverable, creator, approver with time, and the claims reviewer with time. Assets record which assets they were made from.
11. **Honest mock mode:** mock output carries a "Sample output (mock mode)" badge on proposals, on the open ad and in the library.
12. **Library:** every draft appears automatically. Each one has an "Open in workspace" link, and the approval gate now includes sign-off. Revision and approver are shown.
13. **Tests:**
    - Unit tests cover validation, roles, versions, product-knowledge parsing, prompts and pixel-exact pack compositing.
    - End-to-end tests cover the full workflow: autosave and reload, restore, conflict, red-claim block, sign-off, demotion on edit, deliverables, roles and the locked pack.

### Phase 2: library and collaboration (next)
- A grid library with thumbnails, filters for objective, deliverable and "needs sign-off", and bulk export.
- Comments on an ad, "send for review" to a named approver, and notifications.
- Moving images from base64 in Postgres to Vercel Blob or S3, with signed URLs. This is needed before heavy image use, because Neon's free storage is small.
- Background-removal assist for pack photos that aren't cut-outs. Until then, upload a transparent PNG.

### Phase 3: performance data (prepared, not built)
- Meta Marketing API insights and Amazon Ads report importers, through the existing `ResultsImporter` interface in `src/lib/integrations/`.
- Linking platform ad IDs to creatives, then feeding winning patterns (angle, hook mechanism, persona, deliverable) from `results` + `generation_meta` back into the proposals prompt.
- Already in place: `results.creative_id`, the per-creative `generation_meta`, and objective and deliverable columns to group by.

### Phase 4: production
- Video assembly from the storyboard (scenes, captions, voiceover), and Amazon/Flipkart listing content (titles, bullets, A+ modules).

## 3. Implemented now vs. future

| Capability | Status |
|---|---|
| Three-column workspace, mobile guided flow, brand design system | Implemented |
| Proposals → develop → auto-saved draft | Implemented |
| Concept, UGC script, copy set deliverables | Implemented |
| Objective and audience in the brief and the prompt | Implemented |
| Structured product knowledge (ingredients, priorities, evidence, links) | Implemented |
| Original pack composited unchanged; AI pack edits gated | Implemented |
| Autosave, retry, conflict handling, version restore | Implemented |
| Server-side claims and brand validation, human sign-off for uncertain claims | Implemented |
| Roles enforced server-side | Implemented. With the shared team password, identity is self-declared, so use Google or email sign-in for roles you can rely on. |
| Generation metadata and audit fields | Implemented |
| Competitor discovery by web search per product category and focus, with sources checked against search results | Implemented (uses the AI provider's web search) |
| Competitor breakdown, used in briefs to stand apart; manual add by text or screenshot | Implemented |
| Reading competitors' live ads from Meta Ad Library | Later (needs Meta Ad Library API access and identity verification) |
| Pack sketch on proposals, real image per proposal, automatic first image, extra product photos | Implemented |
| Comments, assignments, notifications | Phase 2 |
| Object storage for images, background removal | Phase 2 |
| Meta/Amazon performance import, learning loop | Phase 3 (interfaces only) |
| Video rendering, listing content | Phase 4 |

Compliance checks support, but don't replace, review by a food-regulatory consultant.
