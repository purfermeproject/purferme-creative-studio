import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { createHash } from "node:crypto";
import { errorMessage, isMock, MODEL, OPENAI_TEXT_MODEL, structuredCall, textProvider, UserFacingError } from "@/lib/ai";
import { conceptText, scan } from "@/lib/compliance";
import { ConflictError, createCreative, saveContent } from "@/lib/creative-store";
import { conceptToSnapshot } from "@/lib/versions";
import { scoreConcept } from "@/lib/concepts";
import { getBrand, getPlatformRule, getProduct, getTerms } from "@/lib/data";
import { loadReference } from "@/lib/images";
import { mockConcepts, mockDeveloped, mockProposals } from "@/lib/mocks";
import { buildDevelopPrompt, buildGenerationPrompt, buildVariationsPrompt } from "@/lib/prompts";
import { ConceptSchema, GenerationResponseSchema, ProposalSchema, ProposalsResponseSchema } from "@/lib/schemas";
import { DELIVERABLES, OBJECTIVES, PLATFORMS } from "@/lib/types";
import { findPlacement } from "@/lib/placements";
import { competitorContext } from "@/lib/competitors";

export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(["generate", "regenerate", "variations", "proposals", "develop"]).default("generate"),
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().trim().min(1).max(150),
  angle: z.string().trim().min(1).max(150),
  persona: z.string().trim().min(1).max(150),
  language: z.string().trim().min(1).max(60),
  n: z.number().int().min(2).max(4).default(3),
  extra: z.string().max(1000).optional(),
  inspiration: z.string().max(3000).optional(),
  placement: z.string().trim().max(100).optional(),
  image: z
    .object({ mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), base64: z.string().max(7_000_000) })
    .nullable()
    .optional(),
  concept: ConceptSchema.optional(),
  objective: z.enum(OBJECTIVES.map((o) => o.id) as [string, ...string[]]).or(z.literal("")).default(""),
  deliverable: z.enum(DELIVERABLES.map((d) => d.id) as [string, ...string[]]).default("concept"),
  proposal: ProposalSchema.optional(),
  /** develop only: write the result into this existing ad as a new version instead of a new ad. */
  creativeId: z.string().uuid().optional(),
  baseRevision: z.number().int().min(1).optional(),
  /** An analysed competitor ad to stand apart from. */
  competitorId: z.string().uuid().optional(),
  /** Images made from the proposal before developing; attached to the new ad. */
  imageIds: z.array(z.string().uuid()).max(10).optional(),
});

type Objective = (typeof OBJECTIVES)[number]["id"];
type Deliverable = (typeof DELIVERABLES)[number]["id"];

/**
 * Streams newline-delimited JSON:
 *   {type:"progress", chars, concepts} … then {type:"done", concepts:[…]} or {type:"error", message}.
 */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("generate"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return Response.json({ error: `Invalid request (${i.path.join(".")}: ${i.message}).` }, { status: 400 });
  }
  const input = parsed.data;

  const [brand, rule, product, terms] = await Promise.all([getBrand(), getPlatformRule(input.platform), getProduct(input.productId), getTerms()]);
  if (!product) return Response.json({ error: "That product no longer exists. Refresh the page." }, { status: 404 });
  if (product.status !== "ready") {
    return Response.json(
      { error: `${product.name} is on ${product.status} and can't be generated: ${product.statusReason || "no reason given"}` },
      { status: 409 },
    );
  }
  if ((input.mode === "regenerate" || input.mode === "variations") && !input.concept) {
    return Response.json({ error: "Missing the concept to regenerate or vary." }, { status: 400 });
  }
  if (input.mode === "develop" && !input.proposal) {
    return Response.json({ error: "Pick a proposal to develop first." }, { status: 400 });
  }
  if (input.creativeId && !input.baseRevision) {
    return Response.json({ error: "Missing the revision of the ad to replace." }, { status: 400 });
  }

  let image: Parameters<typeof structuredCall>[0]["image"] = input.image ?? null;
  if (!image && product.packImageUrl) {
    if (product.packImageUrl.startsWith("/")) {
      const ref = await loadReference(product.packImageUrl);
      const mt = ref?.mime;
      if (ref && (mt === "image/png" || mt === "image/jpeg" || mt === "image/webp" || mt === "image/gif")) {
        image = { mediaType: mt, base64: ref.data.toString("base64") };
      }
    } else {
      image = { url: product.packImageUrl };
    }
  }
  const known = findPlacement(input.platform, input.placement);
  const placement = input.placement ? { label: known?.label ?? input.placement, guidance: known?.guidance ?? "" } : null;
  const n = input.mode === "regenerate" || input.mode === "develop" ? 1 : input.mode === "variations" ? 6 : input.n;
  const objective = input.objective as Objective | "";
  const deliverable = input.deliverable as Deliverable;
  const competitor = input.competitorId ? await competitorContext(input.competitorId) : null;
  const common = {
    platform: input.platform,
    creativeType: input.creativeType,
    language: input.language,
    extra: input.extra,
    inspiration: input.inspiration,
    placement,
    hasPackImage: Boolean(image),
    objective,
    competitor,
  };
  let prompt: string;
  if (input.mode === "proposals") {
    prompt = buildGenerationPrompt(brand, product, rule, { ...common, n, angle: input.angle, persona: input.persona, output: "proposals" });
  } else if (input.mode === "develop") {
    prompt = buildDevelopPrompt(brand, product, rule, { ...common, deliverable, proposal: input.proposal! });
  } else if (input.mode === "variations") {
    prompt = buildVariationsPrompt(brand, product, rule, { platform: input.platform, creativeType: input.creativeType, concept: input.concept, placement });
  } else {
    const avoid =
      input.mode === "regenerate"
        ? ` Replace this concept with a genuinely different one (new hook and setting; keep the angle, persona and language unless they caused a problem): ${JSON.stringify({ title: input.concept!.title, hook: input.concept!.hook })}`
        : "";
    prompt = buildGenerationPrompt(brand, product, rule, {
      n: n,
      platform: input.platform,
      creativeType: input.creativeType,
      angle: input.angle,
      persona: input.persona,
      language: input.language,
      extra: `${input.extra ?? ""}${avoid}`,
      inspiration: input.inspiration,
      placement,
      hasPackImage: Boolean(image),
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let buffer = "";
      let lastSent = 0;
      const onText = (delta: string) => {
        buffer += delta;
        if (buffer.length - lastSent > 200) {
          lastSent = buffer.length;
          send({ type: "progress", chars: buffer.length, concepts: (buffer.match(/"(why_it_fits|why)"\s*:/g) ?? []).length });
        }
      };
      const meta = { user, kind: input.mode, platform: input.platform, productId: product.id };
      const mock = isMock();
      try {
        if (input.mode === "proposals") {
          const result = await structuredCall({
            schema: ProposalsResponseSchema,
            prompt,
            image,
            maxTokens: 16000,
            effort: "medium",
            meta,
            onText,
            mock: () => ({ proposals: mockProposals({ ...common, n, angle: input.angle, persona: input.persona }, product.greenClaims) }),
          });
          if (result.proposals.length === 0) throw new UserFacingError("The model returned no proposals. Try again.");
          const proposals = result.proposals.slice(0, n).map((p) => ({
            ...p,
            scan: scan(conceptText({ title: p.title, hook: p.hook, claims: p.claims, copy: { body: p.big_idea } }), input.platform, product.slug, terms),
          }));
          send({ type: "done", proposals, mock });
          return;
        }
        if (input.mode === "develop") {
          const proposal = input.proposal!;
          const result = await structuredCall({
            schema: GenerationResponseSchema,
            prompt,
            image,
            maxTokens: 32000,
            effort: "medium",
            meta,
            onText,
            mock: () => ({ concepts: [mockDeveloped({ ...common, n: 1, angle: proposal.angle, persona: proposal.persona, deliverable }, proposal, product.name, product.greenClaims)] }),
          });
          const concept = result.concepts[0];
          if (!concept) throw new UserFacingError("The model returned nothing to develop. Try again.");
          const provider = mock ? "mock" : textProvider();
          const packAsset = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(product.packImageUrl ?? "")?.[1];
          const genMeta = {
            provider,
            model: mock ? "mock" : provider === "openai" ? OPENAI_TEXT_MODEL : MODEL,
            mock,
            promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
            prompt,
            sourceAssetIds: !input.image && packAsset ? [packAsset] : [],
            proposal: { title: proposal.title, big_idea: proposal.big_idea },
            competitorId: competitor ? input.competitorId : undefined,
            generatedAt: new Date().toISOString(),
          };
          if (input.creativeId) {
            const saved = await saveContent({ id: input.creativeId, baseRevision: input.baseRevision!, snapshot: conceptToSnapshot(concept), user, source: "regenerated", note: `Re-developed “${proposal.title}”` });
            send({ type: "done", creative: { id: input.creativeId, revision: saved.revision, status: saved.status }, concept, mock });
          } else {
            const row = await createCreative({
              concept,
              platform: input.platform,
              product,
              creativeType: input.creativeType,
              placement: placement?.label ?? "",
              objective,
              deliverable,
              meta: genMeta,
              imageIds: input.imageIds,
              user,
            });
            send({ type: "done", creative: { id: row.id, revision: row.revision, status: row.status }, concept, mock });
          }
          return;
        }
        const result = await structuredCall({
          schema: GenerationResponseSchema,
          prompt,
          image,
          maxTokens: 48000,
          effort: "medium",
          meta,
          onText,
          mock: () => {
            const base = mockConcepts({ ...input, objective, deliverable, placement, n: Math.min(n, 4) }, product.name, product.greenClaims);
            if (input.mode === "variations") {
              return {
                concepts: [
                  { ...base[0], title: "Hook swap: " + base[0].title },
                  { ...base[1], title: "Persona swap: " + base[1].title },
                  { ...base[0], title: "For Amazon: " + base[0].title, format: "Sponsored Brands video (16:9, muted)" },
                ],
              };
            }
            return { concepts: base };
          },
        });
        if (result.concepts.length === 0) throw new UserFacingError("The model returned no concepts. Try again.");
        const concepts = result.concepts.slice(0, n).map((c) => scoreConcept(c, input.platform, product.slug, terms));
        send({ type: "done", concepts, mock });
      } catch (e) {
        if (e instanceof ConflictError) send({ type: "error", message: e.message, conflict: true });
        else send({ type: "error", message: errorMessage(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
