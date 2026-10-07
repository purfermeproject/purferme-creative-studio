import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));

const { textProvider } = await import("@/lib/ai");

afterEach(() => vi.unstubAllEnvs());

describe("textProvider", () => {
  it("uses Anthropic when its key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-x");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-x");
    expect(textProvider()).toBe("anthropic");
  });

  it("uses OpenAI when only the OpenAI key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-x");
    expect(textProvider()).toBe("openai");
  });

  it("respects AI_PROVIDER", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-x");
    vi.stubEnv("AI_PROVIDER", "openai");
    expect(textProvider()).toBe("openai");
  });
});

describe("dropNulls", () => {
  it("lets a concept with null optional fields pass validation", async () => {
    const { dropNulls } = await import("@/lib/ai");
    const { ConceptSchema } = await import("@/lib/schemas");
    const raw = {
      title: "t", persona: "p", angle: "a", format: "f", language: "English", hook: "h",
      frames: [{ slot: "0–2s", visual: "v", onscreen: "o", audio: null }],
      copy: { headline: "h", body: null, body_alt: null, cta: "Shop now" },
      ai_prompt: "x", needs_real_person: false, ai_label_needed: false,
      claims: [{ text: "No maida", tier: "green" }], why_it_fits: "w",
    };
    expect(ConceptSchema.safeParse(raw).success).toBe(false);
    expect(ConceptSchema.safeParse(dropNulls(raw)).success).toBe(true);
  });
});

describe("toOpenAIStrictSchema", () => {
  it("makes every property required, optional ones nullable, and forbids extra keys at every level", async () => {
    const { toOpenAIStrictSchema } = await import("@/lib/ai");
    const { z } = await import("zod");
    const { GenerationResponseSchema, DeepCheckSchema, WeeklyBriefSchema } = await import("@/lib/schemas");
    const check = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(check);
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object" && n.properties) {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      Object.values(n).forEach(check);
    };
    for (const schema of [GenerationResponseSchema, DeepCheckSchema, WeeklyBriefSchema]) {
      const out = toOpenAIStrictSchema(z.toJSONSchema(schema)) as Record<string, unknown>;
      check(out);
    }
    const gen = toOpenAIStrictSchema(z.toJSONSchema(GenerationResponseSchema)) as {
      properties: { concepts: { items: { properties: Record<string, { anyOf?: unknown[] }> } } };
    };
    const concept = gen.properties.concepts.items.properties;
    expect(concept.format.anyOf).toBeUndefined(); // required stays required
    expect(JSON.stringify(concept.frames)).toContain('"type":"null"'); // audio is optional -> nullable
  });
});
