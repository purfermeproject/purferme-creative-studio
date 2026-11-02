import JSZip from "jszip";
import { z } from "zod";
import { authErrorStatus, requireRole } from "@/auth";
import { errorMessage, isMock, structuredCall, UserFacingError } from "@/lib/ai";
import { getProducts } from "@/lib/data";
import { comparisonRows, guessKind, importFromDocxXml, importFromText, matchProduct, type ImportedTable } from "@/lib/plan-import";

export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024;

const ReadSchema = z.object({
  tables: z.array(
    z.object({
      title: z.string().describe("The product the table is about, if written above it; else empty"),
      slides: z.array(z.object({ header: z.string(), sub: z.string(), feature: z.string(), photo: z.string(), reference: z.string() })),
    }),
  ),
});

/** Excel: the first sheet's cells as rows. */
async function xlsxRows(zip: JSZip): Promise<string[][]> {
  const shared = await zip.file("xl/sharedStrings.xml")?.async("string");
  const strings = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")) : [];
  const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
  if (!sheet) return [];
  const col = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const out: string[] = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const inner = c[3] ?? "";
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("");
      out[col(c[1])] = / t="s"/.test(c[2]) ? (strings[Number(v)] ?? "") : v;
    }
    return Array.from(out, (x) => (x ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  });
}

/**
 * Reads the team's image-stack table from a paste, a Word, Excel or CSV file, or a screenshot, and says
 * which of our products each table is for. Nothing is saved: the page shows it first.
 */
export async function POST(req: Request) {
  let user: string;
  try {
    ({ user } = await requireRole("edit"));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: authErrorStatus(e) });
  }
  try {
    let tables: ImportedTable[] = [];
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File)) throw new UserFacingError("Choose a file.");
      if (file.size > MAX_BYTES) throw new UserFacingError("That file is over 10 MB.");
      const name = file.name.toLowerCase();
      const bytes = Buffer.from(await file.arrayBuffer());
      if (name.endsWith(".docx") || name.endsWith(".xlsx")) {
        const zip = await JSZip.loadAsync(bytes).catch(() => null);
        if (!zip) throw new UserFacingError("That file couldn't be opened. Save it again as .docx or .xlsx.");
        if (name.endsWith(".docx")) {
          const xml = await zip.file("word/document.xml")?.async("string");
          tables = xml ? importFromDocxXml(xml) : [];
        } else {
          tables = importFromText((await xlsxRows(zip)).map((r) => r.join("\t")).join("\n"));
        }
      } else if (/\.(csv|tsv|txt|md)$/.test(name)) {
        tables = importFromText(bytes.toString("utf8"));
      } else if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
        if (isMock()) throw new UserFacingError("Reading a screenshot needs the AI, and sample mode is on. Paste the table, or upload the Word or Excel file.");
        const read = await structuredCall({
          schema: ReadSchema,
          prompt: `This is a screenshot of a team's product image plan: a table with columns like Slide No, Header, Sub header, Feature (technical, shown next to product), What kind of photo?, Reference ASIN.
Copy every row exactly as written (keep their wording, numbers and punctuation; don't fix or improve anything). Put each column in the matching field; empty string if a column is missing. If the screenshot shows more than one table, return each separately, with the product name written above it as the title.`,
          image: { mediaType: file.type as "image/png", base64: bytes.toString("base64") },
          maxTokens: 6000,
          meta: { user, kind: "plan-import" },
          mock: () => ({ tables: [] }),
        });
        tables = read.tables.map((t) => ({
          title: t.title,
          mainNote: "",
          slides: t.slides
            .filter((s) => s.header.trim())
            .map((s) => {
              const kind = guessKind(s.feature, s.photo);
              return {
                header: s.header,
                sub: s.sub,
                feature: s.feature,
                scene: s.photo,
                kind,
                ...(s.reference ? { reference: s.reference } : {}),
                ...(kind === "comparison" ? { comparison: { us: "PurFerme", them: "Regular version", rows: comparisonRows(s.feature) } } : {}),
              };
            }),
        }));
      } else {
        throw new UserFacingError("Use a Word (.docx), Excel (.xlsx) or CSV file, or a screenshot (PNG or JPG). Or paste the table.");
      }
    } else {
      const body = z.object({ text: z.string().max(200_000) }).safeParse(await req.json().catch(() => null));
      if (!body.success || !body.data.text.trim()) throw new UserFacingError("Paste the table first.");
      tables = importFromText(body.data.text);
    }
    tables = tables.filter((t) => t.slides.length);
    if (!tables.length) throw new UserFacingError("No slide table found. It needs at least a Header column (and ideally Sub header, Feature and What kind of photo).");
    const ours = (await getProducts()).map((p) => ({ id: p.id, name: p.name }));
    return Response.json({ tables: tables.map((t) => ({ ...t, productId: matchProduct(t.title, ours) })) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
