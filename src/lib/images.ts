import "server-only";
import OpenAI, { toFile } from "openai";
import { db, schema } from "@/db";
import { UserFacingError, isMock } from "./ai";
import { mockImageSvg, type ImageSize } from "./image-prompt";

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
export async function generateImage(opts: { prompt: string; size: ImageSize; reference: Reference; user: string; label: string }) {
  let mime: string;
  let data: string;
  let model = IMAGE_MODEL;
  let inputTokens = 0;
  let outputTokens = 0;

  if (isMock()) {
    mime = "image/svg+xml";
    data = Buffer.from(mockImageSvg(opts.size, opts.label)).toString("base64");
    model = "mock";
  } else {
    const openai = getClient();
    try {
      const res = opts.reference
        ? await openai.images.edit({
            model: IMAGE_MODEL,
            prompt: opts.prompt,
            image: [await toFile(opts.reference.data, `${opts.reference.name}.${opts.reference.mime.split("/")[1] ?? "png"}`, { type: opts.reference.mime })],
            input_fidelity: "high",
            size: opts.size,
            n: 1,
          })
        : await openai.images.generate({ model: IMAGE_MODEL, prompt: opts.prompt, size: opts.size, n: 1 });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new UserFacingError("The image service returned no image. Try again.");
      mime = "image/png";
      data = b64;
      inputTokens = res.usage?.input_tokens ?? 0;
      outputTokens = res.usage?.output_tokens ?? 0;
    } catch (e) {
      if (e instanceof UserFacingError) throw e;
      if (e instanceof OpenAI.AuthenticationError) throw new UserFacingError("OpenAI rejected the key. Check OPENAI_API_KEY in .env.local.");
      if (e instanceof OpenAI.RateLimitError) throw new UserFacingError("OpenAI is rate-limiting or your credit has run out. Check your OpenAI billing, then try again.");
      if (e instanceof OpenAI.NotFoundError) throw new UserFacingError(`Image model "${IMAGE_MODEL}" isn't available on your OpenAI account. Set OPENAI_IMAGE_MODEL (e.g. gpt-image-1) in .env.local.`);
      if (e instanceof OpenAI.BadRequestError) throw new UserFacingError(`OpenAI refused this image: ${e.message}`);
      if (e instanceof OpenAI.APIError) throw new UserFacingError(`The image service had a problem (${e.status ?? "network"}). Try again in a moment.`);
      throw e;
    }
  }

  const [row] = await db
    .insert(schema.assets)
    .values({ mime, dataBase64: data, prompt: opts.prompt, model, createdBy: opts.user })
    .returning({ id: schema.assets.id });
  await db.insert(schema.generationLogs).values({
    user: opts.user,
    kind: "image",
    promptHash: Buffer.from(opts.prompt).toString("base64").slice(0, 16),
    model,
    inputTokens,
    outputTokens,
  });
  return { id: row.id, url: `/api/assets/${row.id}` };
}
