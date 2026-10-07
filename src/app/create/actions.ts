"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db, schema } from "@/db";
import { scoreConcept } from "@/lib/concepts";
import { getProduct, getTerms } from "@/lib/data";
import { ConceptSchema } from "@/lib/schemas";
import { PLATFORMS } from "@/lib/types";

const SaveInput = z.object({
  concept: ConceptSchema,
  platform: z.enum(PLATFORMS),
  productId: z.string().uuid(),
  creativeType: z.string().min(1),
  imageIds: z.array(z.string().uuid()).max(20).default([]),
});

export async function saveCreative(input: z.input<typeof SaveInput>): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const user = await requireUser();
    const v = SaveInput.parse(input);
    const product = await getProduct(v.productId);
    if (!product) return { ok: false, message: "That product no longer exists." };
    // Re-scan on the server; never trust a scan result sent from the browser.
    const scored = scoreConcept(v.concept, v.platform, product.slug, await getTerms());
    const c = v.concept;
    const [row] = await db
      .insert(schema.creatives)
      .values({
        platform: scored.platform,
        productId: product.id,
        creativeType: scored.platform === v.platform ? v.creativeType : c.format,
        title: c.title,
        persona: c.persona,
        angle: c.angle,
        format: c.format,
        language: c.language,
        hook: c.hook,
        frames: c.frames,
        copy: c.copy,
        aiPrompt: c.ai_prompt,
        needsRealPerson: c.needs_real_person,
        aiLabelNeeded: c.ai_label_needed,
        claims: c.claims,
        whyItFits: c.why_it_fits,
        scanResult: scored.scan,
        imageIds: v.imageIds,
        createdBy: user,
      })
      .returning({ id: schema.creatives.id });
    revalidatePath("/library");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't save. Try again." };
  }
}
