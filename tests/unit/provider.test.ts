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
