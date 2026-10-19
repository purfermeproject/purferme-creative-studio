"use client";

import type { BrandFont } from "@/lib/brand-kit";

const loaded = new Map<string, Promise<void>>();

/** Makes a brand font available to <canvas> and previews: uploaded file or Google Fonts by name. */
export function loadBrandFont(font: BrandFont): Promise<void> {
  const key = `${font.name}|${font.url ?? ""}`;
  let p = loaded.get(key);
  if (!p) {
    p = (async () => {
      if (font.url) {
        const face = new FontFace(font.name, `url(${font.url})`);
        await face.load();
        document.fonts.add(face);
      } else {
        const id = `gf-${font.name.replace(/\\W+/g, "-")}`;
        if (!document.getElementById(id)) {
          const link = document.createElement("link");
          link.id = id;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.name)}:wght@400;700;800&display=swap`;
          document.head.appendChild(link);
          await new Promise((r) => {
            link.onload = r;
            link.onerror = r;
          });
        }
        await Promise.all([document.fonts.load(`700 48px "${font.name}"`), document.fonts.load(`400 24px "${font.name}"`)]);
      }
    })().catch(() => undefined);
    loaded.set(key, p);
  }
  return p;
}

/** Uploads a file to the asset store and returns its local URL. */
export async function uploadAsset(file: Blob, fields: Record<string, string>, fileName = "upload"): Promise<{ id: string; url: string; w: number | null; h: number | null; label: string }> {
  const fd = new FormData();
  fd.append("file", file, fileName);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch("/api/assets", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed. Try again.");
  return data;
}
