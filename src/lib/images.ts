import "server-only";
import { eq } from "drizzle-orm";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { db, schema } from "@/db";
import { UserFacingError, isMock } from "./ai";
import { storeAsset } from "./asset-store";
import { mockImageSvg } from "./image-prompt";
import { generationSizeFor } from "./image-specs";
import { compositePack as composite, layoutAd, PackPhotoError, paintAroundInputs, preparePack, type PackPosition, type PackScale } from "./pack-composite";
import { findInventedPacks } from "./pack-detect";

/** Composite, turning an unusable pack photo into a message the team can act on. */
async function compositePack(...args: Parameters<typeof composite>) {
  try {
    return await composite(...args);
  } catch (e) {
    if (e instanceof PackPhotoError) throw new UserFacingError(e.message);
    throw e;
  }
}

export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";

let client: OpenAI | null = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new UserFacingError("Images need an OpenAI key. Add OPENAI_API_KEY to .env.local and restart the app.");
  }
  client ??= new OpenAI();
  return client;
}

export type Reference = { data: Buffer; mime: string; name: string; label?: string } | null;

/** Fetches a saved pack image so it can be sent as the reference photo. */
export async function loadReference(url: string | null | undefined): Promise<Reference> {
  if (!url) return null;
  const local = /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(url);
  if (local) {
    const [a] = await db.select({ mime: schema.assets.mime, data: schema.assets.dataBase64, label: schema.assets.label }).from(schema.assets).where(eq(schema.assets.id, local[1]));
    return a ? { data: Buffer.from(a.data, "base64"), mime: a.mime, name: "pack", label: a.label } : null;
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
  /** Composite this original pack photo into the scene (the model never draws the pack). */
  lockedPack?: { data: Buffer; position: PackPosition; scale: PackScale; assetId?: string | null; liftBackdrop?: boolean } | null;
  /** With a locked pack: `prompt` paints the scene around the real pack; this one is for the older "leave a spot, paste after" method if that fails. */
  fallbackPrompt?: string;
  /** Designed layout: a photo with no pack, then our real pack standing on a brand panel (the model never sees the pack). */
  layoutPack?: { data: Buffer; position: PackPosition; panel: string; accent: string; assetId?: string | null; liftBackdrop?: boolean } | null;
  /** The prompt forbids added words (real text goes on afterwards): check the photo for any. */
  noWriting?: boolean;
  /** Called at each stage, so the team (and the server log) can see what is happening. */
  onStage?: (text: string) => void;
}) {
  const stage = (text: string) => {
    console.info(`[image] ${opts.label}: ${text}`);
    opts.onStage?.(text);
  };
  const layout = async (scene: Buffer) => {
    stage("Placing your real pack on the brand panel (unchanged, only scaled)");
    try {
      return (await layoutAd(scene, opts.layoutPack!.data, { ...opts.target, position: opts.layoutPack!.position, panel: opts.layoutPack!.panel, accent: opts.layoutPack!.accent, liftBackdrop: opts.layoutPack!.liftBackdrop })).data;
    } catch (e) {
      if (e instanceof PackPhotoError) throw new UserFacingError(e.message);
      throw e;
    }
  };
  const size = generationSizeFor(opts.target.w, opts.target.h);
  let mime: string;
  let data: string;
  let model = IMAGE_MODEL;
  let inputTokens = 0;
  let outputTokens = 0;
  let warning = "";

  // With an OpenAI key, images are always real, even while text generation is in mock mode.
  if (isMock() && !process.env.OPENAI_API_KEY) {
    mime = "image/svg+xml";
    data = Buffer.from(mockImageSvg(`${opts.target.w}x${opts.target.h}`, opts.label, { drawPack: !opts.lockedPack && !opts.layoutPack })).toString("base64");
    model = "mock";
    stage("Sample mode: using a placeholder photo instead of AI");
    if (opts.layoutPack) {
      const scene = await sharp(Buffer.from(data, "base64")).resize(opts.target.w, opts.target.h).png().toBuffer();
      mime = "image/jpeg";
      data = (await layout(scene)).toString("base64");
    } else if (opts.lockedPack) {
      // Placeholder scene, but the real pack is composited exactly as it would be for a real image.
      const scene = await sharp(Buffer.from(data, "base64")).resize(opts.target.w, opts.target.h).png().toBuffer();
      mime = "image/jpeg";
      data = (await compositePack(scene, opts.lockedPack.data, { ...opts.target, position: opts.lockedPack.position, scale: opts.lockedPack.scale, liftBackdrop: opts.lockedPack.liftBackdrop })).data.toString("base64");
    }
  } else {
    const openai = getClient();
    try {
      // A locked pack is composited afterwards, so the model gets no pack photo to redraw.
      const ref = opts.lockedPack ? null : opts.reference;
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
      /** paint = paint the scene around our pack; false = make the scene without any pack, then place ours (the model never sees it, so it can't copy it). */
      const once = async (prompt: string, fallbackPrompt: string | undefined, paint = true) => {
        let res;
        let paintedAround = false;
        if (opts.lockedPack && !paint) {
          res = await openai.images.generate({ model: IMAGE_MODEL, prompt: fallbackPrompt ?? prompt, size, n: 1 });
        } else if (opts.lockedPack) {
          // Best: give the model a canvas with our real pack already in place (protected by a mask)
          // and let it paint the scene around it, so scale, perspective, light and shadow fit.
          try {
            const prepared = await preparePack(opts.lockedPack.data, opts.lockedPack.liftBackdrop);
            const [gw, gh] = size.split("x").map(Number);
            const inputs = await paintAroundInputs(prepared.source, opts.target, { w: gw, h: gh }, opts.lockedPack.position, opts.lockedPack.scale);
            res = await openai.images.edit({
              model: IMAGE_MODEL,
              prompt,
              image: [await toFile(inputs.canvas, "canvas.png", { type: "image/png" })],
              mask: await toFile(inputs.mask, "mask.png", { type: "image/png" }),
              size,
              n: 1,
            });
            paintedAround = true;
          } catch (e) {
            if (e instanceof PackPhotoError) throw new UserFacingError(e.message);
            if (!(e instanceof OpenAI.BadRequestError || e instanceof OpenAI.UnprocessableEntityError)) throw e;
            console.warn("Painting around the pack failed; falling back to compositing:", e.message);
            res = await openai.images.generate({ model: IMAGE_MODEL, prompt: fallbackPrompt ?? prompt, size, n: 1 });
          }
        } else if (ref) {
          try {
            res = await edit(IMAGE_MODEL.startsWith("gpt-image-1"));
          } catch (e) {
            if (e instanceof OpenAI.BadRequestError && /input_fidelity/i.test(e.message)) res = await edit(false);
            else throw e;
          }
        } else {
          res = await openai.images.generate({ model: IMAGE_MODEL, prompt, size, n: 1 });
        }
        const b64 = res.data?.[0]?.b64_json;
        if (!b64) throw new UserFacingError("The image service returned no image. Try again.");
        inputTokens += res.usage?.input_tokens ?? 0;
        outputTokens += res.usage?.output_tokens ?? 0;
        const fitted = await fitToSize(Buffer.from(b64, "base64"), opts.target.w, opts.target.h);
        if (!opts.lockedPack) return { image: fitted, box: null };
        // Always put our original pack pixels back on top, so the pack is exactly the photo even if the model drifted.
        // When the model painted around it, the scene already has a real shadow, so we don't add ours.
        const placed = await compositePack(fitted, opts.lockedPack.data, {
          ...opts.target,
          position: opts.lockedPack.position,
          scale: opts.lockedPack.scale,
          liftBackdrop: opts.lockedPack.liftBackdrop,
          shadow: !paintedAround,
        });
        return { image: placed.data, box: placed.box };
      };

      stage(
        opts.layoutPack
          ? "AI is making the photo (it never sees or draws your pack)"
          : opts.lockedPack
            ? "AI is painting the scene around your real pack"
            : "AI is making the photo",
      );
      let made = await once(opts.prompt, opts.fallbackPrompt);
      if (opts.layoutPack) {
        // The photo must not contain any packaging of its own; redo once if the model drew some anyway.
        stage(opts.noWriting ? "Checking the photo for any packaging or text the AI drew" : "Checking the photo for any packaging the AI drew");
        const check = { checkWriting: opts.noWriting };
        const invented = await findInventedPacks(made.image, null, opts.user, check);
        if (invented.length) {
          stage(`Found ${invented.join("; ")}: making the photo again`);
          made = await once(
            `${opts.prompt}\n\nIMPORTANT: a previous attempt wrongly showed ${invented.join("; ")}. Show NO jar, box, pouch, packet, bottle or label anywhere, and NO written words, numbers, notes or signs; hands may only hold food, a spoon, toast or a cup.`,
            undefined,
          );
          if ((await findInventedPacks(made.image, null, opts.user, check)).length) warning = "The AI may have drawn packaging or text in the photo. Check the image, then make another.";
        }
        made = { image: await layout(made.image), box: null };
      } else if (opts.lockedPack) {
        // The model sometimes invents a second pack (e.g. in someone's hand). Check, and redo once if so.
        stage("Checking for any extra pack the AI drew");
        let invented = await findInventedPacks(made.image, made.box, opts.user);
        if (invented.length) {
          stage(`Found ${invented.join("; ")}: making it again without showing the AI your pack`);
          const fix = `\n\nIMPORTANT: a previous attempt wrongly showed ${invented.join("; ")}. Show NO other jar, box, pouch, packet, bottle or label anywhere, and nobody holds any container; hands may only hold food, a spoon, toast or a cup.`;
          // Second try without showing the model our pack at all, so it has nothing to copy.
          made = await once(opts.prompt + fix, opts.fallbackPrompt ? opts.fallbackPrompt + fix : undefined, !opts.fallbackPrompt);
          invented = await findInventedPacks(made.image, made.box, opts.user);
          if (invented.length) warning = `The AI may have added packaging that isn't ours (${invented.join("; ")}). Check the image, then make another or use Edit with words to remove it.`;
        }
      }
      mime = "image/jpeg";
      data = made.image.toString("base64");
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

  stage("Saving the image");
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
    sourceAssetIds: opts.lockedPack?.assetId ? [opts.lockedPack.assetId] : opts.layoutPack?.assetId ? [opts.layoutPack.assetId] : [],
  });
  await db.insert(schema.generationLogs).values({
    user: opts.user,
    kind: "image",
    promptHash: Buffer.from(opts.prompt).toString("base64").slice(0, 16),
    model,
    inputTokens,
    outputTokens,
  });
  return { id: stored.id, url: stored.url, w: opts.target.w, h: opts.target.h, warning };
}

/** Loads a stored image asset. */
export async function loadAsset(id: string) {
  const [a] = await db.select().from(schema.assets).where(eq(schema.assets.id, id));
  return a ?? null;
}

/** Changes an existing image from a plain-language instruction, keeping its exact size. */
export async function editImage(opts: { assetId: string; instruction: string; user: string; creativeId?: string | null }) {
  const a = await loadAsset(opts.assetId);
  if (!a || !a.mime.startsWith("image/")) throw new UserFacingError("That image no longer exists.");
  const lockedPack = a.sourceAssetIds.length > 0 || a.label.includes("original pack");
  if (lockedPack) {
    // An AI edit redraws the whole picture, including our real pack, so it isn't allowed.
    throw new UserFacingError("This image has your real pack in it, and an AI edit would redraw the pack. Make a new image instead (you can change the scene in Edit first).");
  }
  const w = a.width ?? 1080;
  const h = a.height ?? 1080;
  const label = `${a.label ? `${a.label} · ` : ""}edited`;
  const prompt = `Edit this advertising image: ${opts.instruction.trim()}
Keep everything else the same: the composition and the style. Do not add any product pack, box, pouch, jar, logo or brand name, and do not add new words, prices, badges or health claims.`;

  if (isMock() && !process.env.OPENAI_API_KEY) {
    return storeAsset({
      data: Buffer.from(mockImageSvg(`${w}x${h}`, `Edited: ${opts.instruction}`)),
      mime: "image/svg+xml",
      kind: "edit",
      label,
      user: opts.user,
      frameIndex: a.frameIndex,
      prompt,
      model: "mock",
      creativeId: opts.creativeId,
      size: { w, h },
    });
  }
  const openai = getClient();
  // Send a PNG of the current image at the closest generation size.
  const src = await sharp(Buffer.from(a.dataBase64, "base64")).png().toBuffer();
  let res;
  try {
    res = await openai.images.edit({
      model: IMAGE_MODEL,
      prompt,
      image: [await toFile(src, "current.png", { type: "image/png" })],
      size: generationSizeFor(w, h),
      n: 1,
    });
  } catch (e) {
    if (e instanceof OpenAI.APIError) throw new UserFacingError(`OpenAI returned an error${e.status ? ` (${e.status})` : ""}: ${e.message}`);
    throw e;
  }
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new UserFacingError("The image service returned no image. Try again.");
  const out = await fitToSize(Buffer.from(b64, "base64"), w, h);
  await db.insert(schema.generationLogs).values({
    user: opts.user,
    kind: "image-edit",
    promptHash: Buffer.from(prompt).toString("base64").slice(0, 16),
    model: IMAGE_MODEL,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
  });
  return storeAsset({ data: out, mime: "image/jpeg", kind: "edit", label, user: opts.user, frameIndex: a.frameIndex, prompt, model: IMAGE_MODEL, creativeId: opts.creativeId });
}

/** Smart-crops one image to every other size for a platform (no AI, no cost). */
export async function resizeToAll(opts: { assetId: string; specs: { w: number; h: number; label: string }[]; user: string; creativeId?: string | null }) {
  const a = await loadAsset(opts.assetId);
  if (!a || !a.mime.startsWith("image/")) throw new UserFacingError("That image no longer exists.");
  const src = Buffer.from(a.dataBase64, "base64");
  const out = [];
  for (const s of opts.specs) {
    if (s.w === a.width && s.h === a.height) continue;
    const data = await sharp(src, { density: 144 })
      .resize(s.w, s.h, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    out.push(
      await storeAsset({
        data,
        mime: "image/jpeg",
        kind: "resize",
        label: `${s.label}${a.label?.includes("with text") ? " · with text (check crop)" : ""}`,
        user: opts.user,
        frameIndex: a.frameIndex,
        creativeId: opts.creativeId,
      }),
    );
  }
  return out;
}
