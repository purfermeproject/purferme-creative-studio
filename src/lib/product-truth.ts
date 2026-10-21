/** The verified facts every listing and ad depends on (playbook: "finalise product truth" first). */
export const TRUTH_FIELDS = [
  ["netQuantity", "Net quantity", "e.g. 240 g (12 cookies)"],
  ["mrp", "MRP", "e.g. Rs 349"],
  ["sku", "SKU", "Your internal code"],
  ["gtin", "GTIN / EAN barcode", "13-digit barcode number"],
  ["shelfLife", "Shelf life", "e.g. 6 months from packing"],
  ["storage", "Storage", "e.g. Store in a cool, dry place"],
  ["fssaiLicence", "FSSAI licence no.", "As printed on the pack"],
  ["nutrition", "Nutrition (as printed)", "Per 100 g and per serving, exactly as on the label"],
] as const;
export type TruthKey = (typeof TRUTH_FIELDS)[number][0];

/** Which product-truth fields are still empty (ingredients count too). */
export function missingTruth(p: Partial<Record<TruthKey | "ingredients", string>>): string[] {
  const out: string[] = [];
  if (!p.ingredients?.trim()) out.push("Ingredients");
  for (const [k, label] of TRUTH_FIELDS) if (!p[k]?.trim()) out.push(label);
  return out;
}

/** "13 digits" check for EAN-13 / GTIN-13, with the standard check digit. */
export function validGtin(code: string): boolean {
  const d = code.replace(/\s/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
