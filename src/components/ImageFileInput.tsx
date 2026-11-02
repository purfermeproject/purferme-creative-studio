"use client";

import { useState, type InputHTMLAttributes } from "react";

/** Largest side after resizing: plenty for 2000×2000 listings, small enough to upload quickly. */
const MAX_SIDE = 2600;
/** Uploads above this are shrunk (servers and Vercel cap request size). */
const MAX_BYTES = 3 * 1024 * 1024;

async function hasTransparency(bmp: ImageBitmap): Promise<boolean> {
  const c = document.createElement("canvas");
  const w = Math.min(256, bmp.width);
  const h = Math.max(1, Math.round((bmp.height / bmp.width) * w));
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/**
 * Makes a phone photo uploadable: shrinks it to at most 2600 px on the long side and re-encodes it
 * (PNG or WebP when it has transparency, so cut-outs stay cut out; JPEG otherwise). Small files pass as they are.
 */
export async function shrinkForUpload(file: File): Promise<{ file: File; note: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return { file, note: "" };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    if (file.size <= MAX_BYTES && /^image\/(png|jpeg|webp)$/.test(file.type)) return { file, note: "" };
    throw new Error("This browser can't open that photo (iPhone HEIC photos often can't be). Save it as JPG or PNG and try again.");
  }
  const tooBig = file.size > MAX_BYTES || Math.max(bmp.width, bmp.height) > MAX_SIDE || !/^image\/(png|jpeg|webp)$/.test(file.type);
  if (!tooBig) return { file, note: "" };
  const alpha = file.type !== "image/jpeg" && (await hasTransparency(bmp));
  let k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  let w = 0;
  let h = 0;
  let blob: Blob | null = null;
  // Encode, and if it's still too big (very detailed photos), step the size down until it fits.
  for (let attempt = 0; attempt < 6; attempt++) {
    w = Math.round(bmp.width * k);
    h = Math.round(bmp.height * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return { file, note: "" };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const encode = (type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
    blob = alpha ? await encode("image/png") : await encode("image/jpeg", 0.9);
    if (blob && blob.size > MAX_BYTES) blob = alpha ? await encode("image/webp", 0.92) : await encode("image/jpeg", 0.82);
    if (!blob || blob.size <= MAX_BYTES) break;
    k *= 0.8;
  }
  if (!blob) return { file, note: "" };
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const name = `${file.name.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  return { file: new File([blob], name, { type: blob.type }), note: `Resized for upload: ${bmp.width}×${bmp.height}, ${mb(file.size)} → ${w}×${h}, ${mb(blob.size)}.` };
}

/** A file field for photos that shrinks large ones before the form sends them. */
export function ImageFileInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange">) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <input
        {...props}
        type="file"
        onChange={async (e) => {
          const input = e.currentTarget;
          setNote("");
          setError("");
          const f = input.files?.[0];
          if (!f) return;
          // Block the form from sending until the shrunk copy is in place.
          input.setCustomValidity("Preparing the photo… try again in a moment.");
          setNote("Preparing the photo…");
          try {
            const { file, note } = await shrinkForUpload(f);
            if (file !== f) {
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
            }
            setNote(note || "Ready to upload.");
          } catch (err) {
            input.value = "";
            setNote("");
            setError(err instanceof Error ? err.message : "That photo couldn't be read.");
          } finally {
            input.setCustomValidity("");
          }
        }}
      />
      {note ? (
        <span className="text-xs text-ink-soft" data-testid="photo-note">
          {note}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-red">
          {error}
        </span>
      ) : null}
    </span>
  );
}
