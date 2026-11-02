import { describe, expect, it } from "vitest";
import { comparisonRows, guessKind, importFromDocxXml, importFromText, matchProduct, parseCells } from "@/lib/plan-import";

const HEAD = ["Slide No", "Header", "Sub header", "Feature (technical, shown next to product)", "What kind of photo?", "Reference ASIN"];
const ROWS = [
  ["3", "Stay Full For Longer", "Millets and oats keep hunger away till lunch", "High Fibre – 9g per 100g | Foxtail Millet + Rolled Oats", "Young professional at an office desk at 11 am", "B089X784PL (Artinci)"],
  ["4", "Real Nuts, Real Crunch", "Almonds and cashews in every single bite", "Almonds, Cashews, Cocoa", "Close-up of a cookie being snapped in half", "B0D4DYRMVT (Midbreak)"],
  [
    "7",
    "Better Than Regular Biscuits",
    "See why families are making the switch",
    "Comparison: Maida / Palm Oil / Refined Sugar / Fibre / Preservatives",
    "PurFerme box with green ticks on the left, a plain unbranded “regular biscuit” pack with red crosses on the right",
    "B089X784PL (Artinci)",
  ],
];

describe("reading the team's image-stack table", () => {
  it("reads a table pasted from Word, Docs or Sheets (tab-separated)", () => {
    const [t] = importFromText([HEAD, ...ROWS].map((r) => r.join("\t")).join("\n"));
    expect(t.slides.map((s) => [s.header, s.kind])).toEqual([
      ["Stay Full For Longer", "lifestyle"],
      ["Real Nuts, Real Crunch", "closeup"],
      ["Better Than Regular Biscuits", "comparison"],
    ]);
    expect(t.slides[0]).toMatchObject({ sub: "Millets and oats keep hunger away till lunch", feature: "High Fibre – 9g per 100g | Foxtail Millet + Rolled Oats", reference: "B089X784PL (Artinci)" });
    expect(t.slides[2].comparison).toEqual({
      us: "PurFerme",
      them: "Regular biscuits",
      rows: [
        { label: "No maida", us: "✓", them: "✗" },
        { label: "No palm oil", us: "✓", them: "✗" },
        { label: "No refined sugar", us: "✓", them: "✗" },
        { label: "Fibre", us: "✓", them: "✗" },
        { label: "No preservatives", us: "✓", them: "✗" },
      ],
    });
  });

  it("reads Markdown tables and CSV with quoted, multi-line cells", () => {
    const md = [`| ${HEAD.join(" | ")} |`, `|${HEAD.map(() => "---").join("|")}|`, ...ROWS.map((r) => `| ${r.join(" | ")} |`)].join("\n");
    expect(importFromText(md)[0].slides).toHaveLength(3);
    const csv = 'Header,Sub header,Feature,Photo\n"Stay Full, For Longer","Line one\nline two",Fibre,Desk at 11 am';
    expect(parseCells(csv)).toEqual([
      ["Header", "Sub header", "Feature", "Photo"],
      ["Stay Full, For Longer", "Line one\nline two", "Fibre", "Desk at 11 am"],
    ]);
    expect(importFromText(csv)[0].slides[0]).toMatchObject({ header: "Stay Full, For Longer", sub: "Line one line two", scene: "Desk at 11 am" });
  });

  it("works without a header row (slide number, header, sub, feature, photo, reference)", () => {
    const [t] = importFromText(ROWS.map((r) => r.join("\t")).join("\n"));
    expect(t.slides[1]).toMatchObject({ header: "Real Nuts, Real Crunch", scene: "Close-up of a cookie being snapped in half" });
  });

  it("reads every table in a Word document, with its product and main-image note", () => {
    const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const table = (rows: string[][]) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
    const xml = `<w:body>${p("ASINs:")}${p("Millet &amp; Oats Breakfast Cookies B0FP51G837")}${p("Millet &amp; Oats Breakfast Cookies (240g, 12 cookies) – B0FP51G837")}${p("12 cookies (240g), easy to carry")}${p("Main image.")}${p("Make “12 COOKIES • 240 g” more prominent and readable at thumbnail size.")}${p("PDP")}${table([HEAD, ...ROWS])}${p("Ragi &amp; Cocoa Peanut Butter with Jaggery (Creamy, 500g) – B0GR4T9K8J")}${table([HEAD, ROWS[0]])}</w:body>`;
    const out = importFromDocxXml(xml);
    expect(out.map((t) => [t.title, t.slides.length])).toEqual([
      ["Millet & Oats Breakfast Cookies (240g, 12 cookies) – B0FP51G837", 3],
      ["Ragi & Cocoa Peanut Butter with Jaggery (Creamy, 500g) – B0GR4T9K8J", 1],
    ]);
    expect(out[0].mainNote).toContain("12 COOKIES • 240 g");
  });

  it("matches a table to one of our products by name", () => {
    const ours = [
      { id: "b", name: "Breakfast Cookies, millet & oats, 240g" },
      { id: "r", name: "Ragi & Cocoa Peanut Butter with jaggery 500g" },
      { id: "c", name: "Chocolate Cookies, millet & oats, 240g" },
    ];
    expect(matchProduct("Millet & Oats Breakfast Cookies (240g, 12 cookies) – B0FP51G837", ours)).toBe("b");
    expect(matchProduct("Ragi & Cocoa Peanut Butter with Jaggery (Creamy, 500g)", ours)).toBe("r");
    expect(matchProduct("Something else entirely", ours)).toBeNull();
  });

  it("guesses the slide type and words comparison rows so ✓ is good", () => {
    expect(guessKind("Comparison: Protein / Palm Oil", "")).toBe("comparison");
    expect(guessKind("x", "4-tile grid: toast, pancakes")).toBe("closeup");
    expect(comparisonRows("Comparison: Protein / White Sugar / No Stabilisers")).toEqual([
      { label: "Protein", us: "✓", them: "✗" },
      { label: "No white sugar", us: "✓", them: "✗" },
      { label: "No Stabilisers", us: "✓", them: "✗" },
    ]);
  });
});
