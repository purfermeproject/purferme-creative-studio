import type { Slide, SlideKind } from "./listing-plan";

/**
 * Reading the team's image-stack table (Slide No | Header | Sub header | Feature | What kind of photo |
 * Reference) from whatever they paste or upload: Word/Docs/Sheets tables (tab-separated), CSV, Markdown,
 * or the tables of a .docx. Pure, so it can be tested with real pastes.
 */

export type ImportedTable = { title: string; mainNote: string; slides: Slide[] };

const COLUMNS: [keyof Omit<Slide, "kind" | "comparison" | "photoId">, RegExp][] = [
  ["header", /^header|^headline|^title/i],
  ["sub", /sub|tagline|support/i],
  ["feature", /feature|technical|callout|proof|claim/i],
  ["scene", /photo|image|visual|scene|shot|kind of/i],
  ["reference", /reference|asin|inspir|competitor/i],
];

/** Splits pasted text into rows of cells: tab-separated (with quoted multi-line cells), CSV or Markdown. */
export function parseCells(text: string): string[][] {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  const lines = t.split("\n");
  if (lines.filter((l) => l.trim().startsWith("|")).length >= 2) {
    return lines
      .filter((l) => l.trim().startsWith("|") && !/^\s*\|?\s*:?-{2,}/.test(l))
      .map((l) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim()),
      );
  }
  const sep = t.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c));
}

/** Close-up, comparison or a person in a setting, from what the team wrote. */
export function guessKind(feature: string, scene: string): SlideKind {
  if (/^comparison\b/i.test(feature.trim()) || /\b(green ticks?|red cross|vs\.?|versus|compar)/i.test(scene)) return "comparison";
  if (/\bclose[\s-]?up\b|macro|\bgrid\b|tile/i.test(scene)) return "closeup";
  return "lifestyle";
}

const BAD = /maida|palm oil|refined sugar|white sugar|sugar|preservative|trans fat|hydrogenated|artificial|stabiliser|stabilizer|colour|color|flavour|flavor|msg/i;

/** "Comparison: Maida / Palm Oil / Fibre" → rows worded so ✓ is the good answer ("No maida ✓ | ✗"). */
export function comparisonRows(feature: string): { label: string; us: string; them: string }[] {
  const list = feature.replace(/^comparison\s*:?\s*/i, "").split(/\s*[/|,]\s*/).map((x) => x.trim()).filter(Boolean);
  return list.slice(0, 6).map((x) => {
    const lower = x.toLowerCase();
    return BAD.test(x) && !/^no\b/i.test(x) ? { label: `No ${lower}`, us: "✓", them: "✗" } : { label: x.charAt(0).toUpperCase() + x.slice(1), us: "✓", them: "✗" };
  });
}

/** Rows (first one may be the header row) → slides. Columns are matched by name, or by position if there's no header row. */
export function slidesFromRows(rows: string[][]): Slide[] {
  if (!rows.length) return [];
  const head = rows[0].map((c) => c.toLowerCase());
  const hasHeader = head.some((c) => /header|feature|photo|sub/.test(c));
  const index: Partial<Record<(typeof COLUMNS)[number][0], number>> = {};
  if (hasHeader) {
    const used = new Set<number>();
    for (const [key, re] of COLUMNS) {
      const i = head.findIndex((c, k) => !used.has(k) && re.test(c) && !(key === "header" && /sub/.test(c)));
      if (i >= 0) {
        index[key] = i;
        used.add(i);
      }
    }
  } else {
    // No header row: Slide no. first if the first cells are numbers, then header, sub, feature, photo, reference.
    const offset = rows.every((r) => /^\d+\.?$/.test(r[0] ?? "")) ? 1 : 0;
    (["header", "sub", "feature", "scene", "reference"] as const).forEach((k, i) => (index[k] = offset + i));
  }
  const get = (r: string[], k: keyof typeof index) => (index[k] !== undefined ? (r[index[k]!] ?? "").replace(/\s+/g, " ").trim() : "");
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r) => {
      const header = get(r, "header");
      const feature = get(r, "feature");
      const scene = get(r, "scene");
      const kind = guessKind(feature, scene);
      const slide: Slide = { header, sub: get(r, "sub"), feature, scene, kind };
      const ref = get(r, "reference");
      if (ref) slide.reference = ref;
      if (kind === "comparison") slide.comparison = { us: "PurFerme", them: comparisonThem(header, scene), rows: comparisonRows(feature) };
      return slide;
    })
    .filter((s) => s.header);
}

/** The generic side of a comparison, from the header or photo ("Better Than Regular Biscuits" → "Regular biscuits"). */
function comparisonThem(header: string, scene: string): string {
  const word = "(regular|ordinary|typical|usual|generic|other)";
  // From the header first ("Better Than Regular Biscuits"), then the photo ("a plain “regular biscuit” pack").
  const m = new RegExp(`${word}\\s+([a-z][a-z ]{2,30})$`, "i").exec(header.trim()) ?? new RegExp(`${word}\\s+([a-z][a-z]{2,20}(?: [a-z]{3,20})?)`, "i").exec(scene);
  if (!m) return "Regular version";
  return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toLowerCase().replace(/\s+(pack|jar|box|with|on)$/, "").trim()}`;
}

/** Pasted text → one table. */
export function importFromText(text: string): ImportedTable[] {
  const slides = slidesFromRows(parseCells(text));
  return slides.length ? [{ title: "", mainNote: "", slides }] : [];
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const textOf = (xml: string) =>
  decode(
    [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
      .map((p) => [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""))
      .filter(Boolean)
      .join(" "),
  ).trim();

/**
 * A Word document's image-stack tables, each with the product it's about (the nearest heading above
 * that names a product) and the "Main image" note written before it.
 */
export function importFromDocxXml(xml: string): ImportedTable[] {
  const out: ImportedTable[] = [];
  const parts = xml.split(/(<w:tbl>[\s\S]*?<\/w:tbl>)/);
  let before = "";
  for (const part of parts) {
    if (!part.startsWith("<w:tbl>")) {
      before += ` ${part}`;
      continue;
    }
    const rows = [...part.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => textOf(c[0])));
    const slides = slidesFromRows(rows);
    if (slides.length) {
      const paras = [...before.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) => textOf(p[0])).filter(Boolean);
      // The product: the nearest heading above with an Amazon ASIN ("Name (240g) – B0FP51G837"), else one with a pack size.
      const short = [...paras].reverse().filter((p) => p.length < 140);
      const title = short.find((p) => /\bB0[A-Z0-9]{8}\b/.test(p)) ?? short.find((p) => /\d+\s?(g|kg|ml)\b/i.test(p)) ?? "";
      const mainIdx = paras.findLastIndex((p) => /^main image/i.test(p));
      const mainNote = mainIdx >= 0 ? paras.slice(mainIdx + 1).find((p) => p.length > 20 && !/^pdp$/i.test(p)) ?? "" : "";
      out.push({ title, mainNote, slides });
    }
    before = "";
  }
  return out;
}

/** Which of our products a table is about, from its title (best word overlap), or null. */
export function matchProduct(title: string, products: { id: string; name: string }[]): string | null {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["and", "with", "the", "pack"].includes(w)));
  const t = words(title);
  let best: { id: string; score: number } | null = null;
  for (const p of products) {
    const w = words(p.name);
    const score = [...w].filter((x) => t.has(x) || t.has(`${x}s`) || t.has(x.replace(/s$/, ""))).length / Math.max(1, w.size);
    if (!best || score > best.score) best = { id: p.id, score };
  }
  return best && best.score >= 0.34 ? best.id : null;
}
