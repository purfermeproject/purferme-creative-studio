import type { ClaimEvidence, ProductUrl } from "@/db/schema";

/** "Claim | evidence | source" per line. Lines without evidence are dropped. */
export function parseEvidence(text: string): ClaimEvidence[] {
  return text
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter(([claim, evidence]) => claim && evidence)
    .map(([claim, evidence, source]) => ({ claim: claim.slice(0, 300), evidence: evidence.slice(0, 1000), ...(source ? { source: source.slice(0, 300) } : {}) }))
    .slice(0, 50);
}

export const formatEvidence = (list: ClaimEvidence[]) => list.map((e) => [e.claim, e.evidence, e.source].filter(Boolean).join(" | ")).join("\n");

/** "Label | https://…" per line. Only http(s) links are kept. */
export function parseUrls(text: string): { urls: ProductUrl[]; invalid: string[] } {
  const urls: ProductUrl[] = [];
  const invalid: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [a, b] = line.includes("|") ? line.split("|").map((x) => x.trim()) : ["", line];
    try {
      const u = new URL(b);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
      urls.push({ label: (a || u.hostname).slice(0, 80), url: u.toString() });
    } catch {
      invalid.push(line);
    }
  }
  return { urls: urls.slice(0, 20), invalid };
}

export const formatUrls = (list: ProductUrl[]) => list.map((u) => `${u.label} | ${u.url}`).join("\n");
