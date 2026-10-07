import { describe, expect, it } from "vitest";
import { SEED_TERMS } from "@/db/seed-data";
import { scan } from "@/lib/compliance";
import { csvCell, toCsv } from "@/lib/csv";
import { approvalGate, canMoveTo, requiredQaItems } from "@/lib/qa";

const all11 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

describe("approval gate", () => {
  it("blocks a creative with a red flag even when QA is complete", () => {
    const scanResult = scan("Gluten free cookies for your chai", "meta", "choc", SEED_TERMS);
    const gate = approvalGate({ platform: "meta", scanResult, qaChecked: all11 });
    expect(gate.ok).toBe(false);
    expect(gate.missing[0]).toMatch(/Fix 1 red flag: Gluten free/);
  });

  it("lists unticked QA items", () => {
    const gate = approvalGate({ platform: "meta", scanResult: { hits: [] }, qaChecked: [1, 2, 3] });
    expect(gate.ok).toBe(false);
    expect(gate.missing).toEqual(["Tick QA items 4, 5, 6, 7, 8, 9, 10, 11."]);
  });

  it("passes with zero reds and all items, and amber alone does not block", () => {
    const scanResult = scan("Wholesome millet cookies", "meta", "choc", SEED_TERMS);
    expect(scanResult.hits.length).toBe(1);
    expect(approvalGate({ platform: "meta", scanResult, qaChecked: all11 }).ok).toBe(true);
  });

  it("requires item 12 on Amazon only", () => {
    expect(requiredQaItems("amazon").map((i) => i.n)).toContain(12);
    expect(requiredQaItems("flipkart").map((i) => i.n)).not.toContain(12);
    expect(approvalGate({ platform: "amazon", scanResult: { hits: [] }, qaChecked: all11 }).missing).toEqual(["Tick QA item 12."]);
  });

  it("gates post-approval statuses but not Draft or Killed", () => {
    const c = { platform: "meta" as const, scanResult: { hits: [] }, qaChecked: [] };
    expect(canMoveTo("Draft", c).ok).toBe(true);
    expect(canMoveTo("Killed", c).ok).toBe(true);
    expect(canMoveTo("Approved", c).ok).toBe(false);
    expect(canMoveTo("Live", c).ok).toBe(false);
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(["x", "y"])).toBe("x; y");
  });

  it("neutralises formula-looking cells", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-5% off")).toBe("'-5% off");
  });

  it("joins rows with CRLF and keeps unicode", () => {
    expect(toCsv(["a", "b"], [["Puŕ Fermé", 2]])).toBe("a,b\r\nPuŕ Fermé,2\r\n");
  });
});
