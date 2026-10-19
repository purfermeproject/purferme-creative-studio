import { describe, expect, it } from "vitest";
import { can, resolveRole } from "@/lib/roles";
import { changedFields, conceptToSnapshot, shouldCoalesce, snapshotToConcept, SnapshotSchema } from "@/lib/versions";
import { parseEvidence, parseUrls } from "@/lib/product-knowledge";

describe("roles", () => {
  const r = (o: Partial<Parameters<typeof resolveRole>[0]>) => resolveRole({ email: "a@x.com", listed: null, totalListed: 0, adminEmails: [], ...o });
  it("everyone is admin until roles are set up", () => expect(r({})).toBe("admin"));
  it("listed people get their role; others get the default", () => {
    expect(r({ listed: "viewer", totalListed: 2 })).toBe("viewer");
    expect(r({ totalListed: 2 })).toBe("creator");
    expect(r({ totalListed: 2, defaultRole: "viewer" })).toBe("viewer");
    expect(r({ totalListed: 2, defaultRole: "superuser" })).toBe("creator");
  });
  it("ADMIN_EMAILS always wins", () => expect(r({ listed: "viewer", totalListed: 3, adminEmails: ["a@x.com"] })).toBe("admin"));
  it("permissions are ordered", () => {
    expect(can("viewer", "generate")).toBe(false);
    expect(can("creator", "edit")).toBe(true);
    expect(can("creator", "approve")).toBe(false);
    expect(can("approver", "review")).toBe(true);
    expect(can("approver", "settings")).toBe(false);
    expect(can("admin", "roles")).toBe(true);
  });
});

const concept = {
  title: "T", persona: "P", angle: "A", format: "F", language: "English", hook: "H",
  frames: [{ slot: "0–2s", visual: "v", onscreen: "o" }], copy: { headline: "h", cta: "Shop now" },
  ai_prompt: "p", needs_real_person: false, ai_label_needed: false, claims: [], why_it_fits: "w",
};

describe("versions", () => {
  it("round-trips concept ↔ snapshot and validates", () => {
    const s = conceptToSnapshot(concept);
    expect(snapshotToConcept(s)).toEqual(concept);
    expect(SnapshotSchema.safeParse(s).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...s, title: "" }).success).toBe(false);
  });
  it("names what changed, ignoring key order", () => {
    const a = conceptToSnapshot(concept);
    expect(changedFields(a, { ...a, copy: { cta: "Shop now", headline: "h" } })).toEqual([]);
    expect(changedFields(a, { ...a, hook: "New", copy: { ...a.copy, body: "x" } })).toEqual(["hook", "copy"]);
  });
  it("coalesces quick autosaves by the same person only", () => {
    const now = new Date("2026-10-19T10:05:00Z");
    const latest = { source: "autosave", createdBy: "a", createdAt: new Date("2026-10-19T10:00:00Z") };
    expect(shouldCoalesce(latest, "a", now)).toBe(true);
    expect(shouldCoalesce(latest, "b", now)).toBe(false);
    expect(shouldCoalesce({ ...latest, source: "generated" }, "a", now)).toBe(false);
    expect(shouldCoalesce(latest, "a", new Date("2026-10-19T10:30:00Z"))).toBe(false);
  });
});

describe("product knowledge parsing", () => {
  it("parses evidence lines", () => {
    expect(parseEvidence("Fibre | 4 g per serving | Lab 1\nno evidence here\n")).toEqual([{ claim: "Fibre", evidence: "4 g per serving", source: "Lab 1" }]);
  });
  it("keeps only http(s) links", () => {
    const r = parseUrls("Site | https://purferme.com/x\njavascript:alert(1)\nnot a url");
    expect(r.urls).toEqual([{ label: "Site", url: "https://purferme.com/x" }]);
    expect(r.invalid).toHaveLength(2);
  });
});
