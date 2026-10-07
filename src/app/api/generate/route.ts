import { z } from "zod";
import { requireUser } from "@/auth";
import { errorMessage, structuredCall, UserFacingError } from "@/lib/ai";
import { scoreConcept } from "@/lib/concepts";
import { getBrand, getPlatformRule, getProduct, getTerms } from "@/lib/data";
import { loadReference } from "@/lib/images";
import { mockConcepts } from "@/lib/mocks";
import { buildGenerationPrompt, buildVariationsPrompt } from "@/lib/prompts";
import { ConceptSchema, GenerationResponseSchema } from "@/lib/schemas";
import { PLATFORMS } from "@/lib/types";

export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(["generate", "regenerate", "variations"]).default("generate"),
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().min(1),
  angle: z.string().min(1),
  persona: z.string().min(1),
  language: z.string().min(1),
  n: z.number().int().min(2).max(4).default(3),
  extra: z.string().max(1000).optional(),
  image: z
    .object({ mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), base64: z.string().max(7_000_000) })
    .nullable()
    .optional(),
  concept: ConceptSchema.optional(),
});

/**
 * Streams newline-delimited JSON:
 *   {type:"progress", chars, concepts} … then {type:"done", concepts:[…]} or {type:"error", message}.
 */
export async function POST(req: Request) {
  let user: string;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 401 });
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
  if (!rule.creativeTypes.includes(input.creativeType)) {
    return Response.json({ error: `"${input.creativeType}" isn't a ${input.platform} creative type. Pick one from the list.` }, { status: 400 });
  }
  if (input.mode !== "generate" && !input.concept) {
    return Response.json({ error: "Missing the concept to regenerate or vary." }, { status: 400 });
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
  const n = input.mode === "regenerate" ? 1 : input.mode === "variations" ? 6 : input.n;
  let prompt: string;
  if (input.mode === "variations") {
    prompt = buildVariationsPrompt(brand, product, rule, { platform: input.platform, creativeType: input.creativeType, concept: input.concept });
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
      hasPackImage: Boolean(image),
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let buffer = "";
      let lastSent = 0;
      try {
        const result = await structuredCall({
          schema: GenerationResponseSchema,
          prompt,
          image,
          maxTokens: 48000,
          effort: "medium",
          meta: { user, kind: input.mode, platform: input.platform, productId: product.id },
          onText: (delta) => {
            buffer += delta;
            if (buffer.length - lastSent > 200) {
              lastSent = buffer.length;
              send({ type: "progress", chars: buffer.length, concepts: (buffer.match(/"why_it_fits"\s*:/g) ?? []).length });
            }
          },
          mock: () => {
            const base = mockConcepts({ ...input, n: Math.min(n, 4) }, product.name, product.greenClaims);
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
        send({ type: "done", concepts });
      } catch (e) {
        send({ type: "error", message: errorMessage(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
