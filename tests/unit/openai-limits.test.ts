import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import OpenAI from "openai";
import { openAiLimitMessage } from "@/lib/ai";

const err = (code: string, message: string) => new OpenAI.RateLimitError(429, { code, message, type: code }, message, new Headers());

describe("OpenAI 429s are told apart", () => {
  it("a speed limit says to wait, not that credit ran out", () => {
    const m = openAiLimitMessage(err("rate_limit_exceeded", "Rate limit reached for gpt-image-1 on images per min (ipm): Limit 5"), "images");
    expect(m).toContain("speed limit");
    expect(m).toContain("images per min");
    expect(m).not.toMatch(/no quota/);
  });
  it("no quota points to the key's organization and project budget", () => {
    const m = openAiLimitMessage(err("insufficient_quota", "You exceeded your current quota, please check your plan and billing details."), "images");
    expect(m).toContain("no quota");
    expect(m).toContain("same organization as your credits");
  });
});
