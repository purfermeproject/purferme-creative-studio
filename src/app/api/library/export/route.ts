import { requireUser } from "@/auth";
import { toCsv } from "@/lib/csv";
import { parseFilters, queryCreatives } from "@/lib/library";
import { getPlatform } from "@/lib/platform";
import { requiredQaItems } from "@/lib/qa";

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch {
    return new Response("Sign in first.", { status: 401 });
  }
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const filters = parseFilters(sp, await getPlatform());
  const rows = await queryCreatives(filters);
  const headers = [
    "id", "platform", "product", "creative_type", "status", "title", "persona", "angle", "format", "language", "hook",
    "headline", "primary_text", "variant", "cta", "frames", "claims", "red_flags", "amber_flags", "qa_done",
    "needs_real_person", "ai_label_needed", "why_it_fits", "ai_prompt", "created_by", "created_at",
  ];
  const data = rows.map(({ creative: c, productName }) => {
    const reds = c.scanResult.hits.filter((h) => h.severity === "red");
    const ambers = c.scanResult.hits.filter((h) => h.severity === "amber");
    const required = requiredQaItems(c.platform);
    return [
      c.id, c.platform, productName ?? "", c.creativeType, c.status, c.title, c.persona, c.angle, c.format, c.language, c.hook,
      c.copy.headline ?? "", c.copy.body ?? "", c.copy.body_alt ?? "", c.copy.cta ?? "",
      c.frames.map((f) => `[${f.slot}] ${f.visual} | ${f.onscreen}${f.audio ? ` | ${f.audio}` : ""}`).join("\n"),
      c.claims.map((cl) => `${cl.tier}: ${cl.text}`),
      reds.map((h) => `${h.label} (${h.matches.join(", ")})`),
      ambers.map((h) => `${h.label} (${h.matches.join(", ")})`),
      `${required.filter((i) => c.qaChecked.includes(i.n)).length}/${required.length}`,
      c.needsRealPerson ? "yes" : "no", c.aiLabelNeeded ? "yes" : "no", c.whyItFits, c.aiPrompt, c.createdBy,
      c.createdAt.toISOString(),
    ];
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(headers, data), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="purferme-creatives-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
