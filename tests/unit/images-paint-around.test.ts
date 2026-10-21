import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { insert: () => ({ values: async () => undefined }) }, schema: { generationLogs: {} } }));
const stored: Buffer[] = [];
vi.mock("@/lib/asset-store", () => ({
  storeAsset: async (o: { data: Buffer }) => {
    stored.push(o.data);
    return { id: "a1", url: "/api/assets/a1", w: 1080, h: 1350, label: "" };
  },
}));
const calls: { kind: string; args: Record<string, unknown> }[] = [];
vi.mock("openai", async () => {
  const actual = await vi.importActual<typeof import("openai")>("openai");
  class FakeOpenAI {
    images = {
      edit: async (args: Record<string, unknown>) => {
        calls.push({ kind: "edit", args });
        // The "model" paints the whole canvas green, including over the pack (as a careless model might).
        const png = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#3a7d44" } }).png().toBuffer();
        return { data: [{ b64_json: png.toString("base64") }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
      generate: async (args: Record<string, unknown>) => {
        calls.push({ kind: "generate", args });
        throw new Error("should not be called");
      },
    };
  }
  return { ...actual, default: Object.assign(FakeOpenAI, actual.default), toFile: actual.toFile };
});

process.env.OPENAI_API_KEY = "sk-test";
const { generateImage } = await import("@/lib/images");

describe("generateImage with our real pack", () => {
  it("asks the model to paint around the pack with a mask, then restores the pack's exact pixels", async () => {
    const pack = await sharp({ create: { width: 300, height: 450, channels: 3, background: "#6b3f2a" } }).png().toBuffer();
    await generateImage({
      prompt: "paint around",
      fallbackPrompt: "leave a spot",
      target: { w: 1080, h: 1350 },
      reference: null,
      user: "t",
      label: "Feed",
      lockedPack: { data: pack, position: "right", scale: "medium", liftBackdrop: false },
    });
    expect(calls.map((c) => c.kind)).toEqual(["edit"]);
    expect(calls[0].args.mask).toBeTruthy();
    expect(calls[0].args.prompt).toBe("paint around");
    const out = stored.at(-1)!;
    const { packBox } = await import("@/lib/pack-composite");
    const box = packBox({ w: 1080, h: 1350 }, { w: 300, h: 450 }, "right", "medium");
    const px = await sharp(out).extract({ left: box.left + Math.floor(box.width / 2), top: box.top + Math.floor(box.height / 2), width: 1, height: 1 }).raw().toBuffer();
    // Our pack colour is back on top (JPEG allows a tiny difference), not the model's green.
    expect(Math.abs(px[0] - 0x6b)).toBeLessThan(6);
    expect(Math.abs(px[1] - 0x3f)).toBeLessThan(6);
  });
});
