import "server-only";
import { eq } from "drizzle-orm";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { db, schema } from "@/db";
import { UserFacingError, isMock } from "./ai";
import { storeAsset } from "./asset-store";
import { mockImageSvg } from "./image-prompt";
import { generationSizeFor } from "./image-specs";

export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";

let client: OpenAI | null = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new UserFacingError("Images need an OpenAI key. Add OPENAI_API_KEY to .env.local and restart the app.");
  }
  client ??= new OpenAI();
  return client;
}

export type Reference = { data: Buffer; mime: string; name: string } | null;

/** Fetches a saved pack image so it can be sent as the reference photo. */
export async function loadReference(url: string | null | undefined): Promise<Reference> {
  if (!url) return null;
  const local = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(url);
  if (local) {
    const [a] = await db.select({ mime: schema.assets.mime, data: schema.assets.dataBase64 }).from(schema.assets).where(eq(schema.assets.id, local[1]));
    return a ? { data: Buffer.from(a.data, "base64"), mime: a.mime, name: "pack" } : null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
    if (!mime.startsWith("image/")) return null;
    return { data: Buffer.from(await res.arrayBuffer()), mime, name: "pack" };
  } catch {
    return null;
  }
}

/** Generates one image, stores it, logs usage, and returns the asset id. */
/** Centre-crop and resize to the exact platform size; JPEG keeps photos small enough to store. */
export async function fitToSize(png: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(png).resize(w, h, { fit: "cover", position: "centre" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

export async function generateImage(opts: {
  prompt: string;
  target: { w: number; h: number };
  reference: Reference;
  user: string;
  label: string;
  frameIndex?: number | null;
}) {
  const size = generationSizeFor(opts.target.w, opts.target.h);
  let mime: string;
  let data: string;
  let model = IMAGE_MODEL;
  let inputTokens = 0;
  let outputTokens = 0;

  // With an OpenAI key, images are always real, even while text generation is in mock mode.
  if (isMock() && !process.env.OPENAI_API_KEY) {
    mime = "image/svg+xml";
    data = Buffer.from(mockImageSvg(`${opts.target.w}x${opts.target.h}`, opts.label)).toString("base64");
    model = "mock";
  } else {
    const openai = getClient();
    try {
      const ref = opts.reference;
      const edit = async (withFidelity: boolean) =>
        openai.images.edit({
          model: IMAGE_MODEL,
          prompt: opts.prompt,
          image: [await toFile(ref!.data, `${ref!.name}.${ref!.mime.split("/")[1] ?? "png"}`, { type: ref!.mime })],
          // Only the gpt-image-1 family accepts input_fidelity; newer models keep the reference faithfully by default.
          ...(withFidelity ? { input_fidelity: "high" as const } : {}),
          size,
          n: 1,
        });
      let res;
      if (ref) {
        try {
          res = await edit(IMAGE_MODEL.startsWith("gpt-image-1"));
        } catch (e) {
          if (e instanceof OpenAI.BadRequestError && /input_fidelity/i.test(e.message)) res = await edit(false);
          else throw e;
        }
      } else {
        res = await openai.images.generate({ model: IMAGE_MODEL, prompt: opts.prompt, size, n: 1 });
      }
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new UserFacingError("The image service returned no image. Try again.");
      mime = "image/jpeg";
      data = (await fitToSize(Buffer.from(b64, "base64"), opts.target.w, opts.target.h)).toString("base64");
      inputTokens = res.usage?.input_tokens ?? 0;
      outputTokens = res.usage?.output_tokens ?? 0;
    } catch (e) {
      if (e instanceof UserFacingError) throw e;
      if (e instanceof OpenAI.AuthenticationError) throw new UserFacingError("OpenAI rejected the key. Check OPENAI_API_KEY in .env.local.");
      if (e instanceof OpenAI.RateLimitError) throw new UserFacingError("OpenAI is rate-limiting or your credit has run out. Check your OpenAI billing, then try again.");
      if (e instanceof OpenAI.NotFoundError) throw new UserFacingError(`Image model "${IMAGE_MODEL}" isn't available on your OpenAI account. Set OPENAI_IMAGE_MODEL (e.g. gpt-image-1) in .env.local.`);
      if (e instanceof OpenAI.BadRequestError) throw new UserFacingError(`OpenAI refused this image: ${e.message}`);
      if (e instanceof OpenAI.APIConnectionError) {
        console.error("OpenAI image connection error:", e, (e as { cause?: unknown }).cause);
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        throw new UserFacingError(`Couldn't reach OpenAI from this computer (${cause?.code ?? cause?.message ?? e.message}). Check your internet, VPN, proxy or antivirus, then try again.`);
      }
      if (e instanceof OpenAI.APIError) {
        console.error("OpenAI image error:", e);
        throw new UserFacingError(`OpenAI returned an error${e.status ? ` (${e.status})` : ""}: ${e.message}`);
      }
      throw e;
    }
  }

  const stored = await storeAsset({
    data: Buffer.from(data, "base64"),
    mime,
    kind: "generated",
    label: opts.label,
    user: opts.user,
    frameIndex: opts.frameIndex ?? null,
    prompt: opts.prompt,
    model,
    size: opts.target,
  });
  await db.insert(schema.generationLogs).values({
    user: opts.user,
    kind: "image",
    promptHash: Buffer.from(opts.prompt).toString("base64").slice(0, 16),
    model,
    inputTokens,
    outputTokens,
  });
  return { id: stored.id, url: stored.url, w: opts.target.w, h: opts.target.h };
}
