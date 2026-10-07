"use client";

import Link from "next/link";
import { useState } from "react";
import { ConceptCard } from "@/components/ConceptCard";
import { conceptToText, type ScoredConcept } from "@/lib/concepts";
import type { Concept } from "@/lib/schemas";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";
import { saveCreative } from "./actions";

type ProductOption = { id: string; name: string; status: "ready" | "hold" | "blocked"; statusReason: string; hasPackImage: boolean };
type Img = { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string; name: string };
type Item = { key: string; concept: ScoredConcept; badge?: string; saved?: string; busy?: string; error?: string };
type Progress = { chars: number; concepts: number; total: number; label: string } | null;

let keySeq = 0;
const nextKey = () => `c${++keySeq}`;

async function readNdjson(res: Response, onProgress: (chars: number, concepts: number) => void): Promise<ScoredConcept[]> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `The server returned ${res.status}. Try again.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") onProgress(msg.chars, msg.concepts);
      if (msg.type === "error") throw new Error(msg.message);
      if (msg.type === "done") return msg.concepts;
    }
  }
  throw new Error("The connection closed before the concepts arrived. Try again.");
}

function stripScored(c: ScoredConcept): Concept {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { platform, scan, ...rest } = c;
  return rest;
}

export function CreateClient({
  platform,
  products,
  creativeTypes,
  angles,
  personas,
  languages,
}: {
  platform: Platform;
  products: ProductOption[];
  creativeTypes: string[];
  angles: string[];
  personas: string[];
  languages: string[];
}) {
  const firstReady = products.find((p) => p.status === "ready");
  const [productId, setProductId] = useState(products.find((p) => p.name.startsWith("Chocolate") && p.status === "ready")?.id ?? firstReady?.id ?? "");
  const [creativeType, setCreativeType] = useState(creativeTypes[0] ?? "");
  const [angle, setAngle] = useState(angles[0] ?? "");
  const [persona, setPersona] = useState(personas[0] ?? "");
  const [language, setLanguage] = useState(languages[0] ?? "English");
  const [n, setN] = useState(3);
  const [extra, setExtra] = useState("");
  const [image, setImage] = useState<Img | null>(null);
  const [imageError, setImageError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const product = products.find((p) => p.id === productId);
  const blocked = product && product.status !== "ready";
  const busy = progress !== null;

  const baseBody = () => ({ platform, productId, creativeType, angle, persona, language, n, extra: extra || undefined, image: image ? { mediaType: image.mediaType, base64: image.base64 } : null });

  async function generate() {
    setError("");
    setProgress({ chars: 0, concepts: 0, total: n, label: "Writing concepts" });
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "generate", ...baseBody() }) });
      const concepts = await readNdjson(res, (chars, concepts) => setProgress({ chars, concepts, total: n, label: "Writing concepts" }));
      setItems(concepts.map((c) => ({ key: nextKey(), concept: c })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed. Try again.");
    } finally {
      setProgress(null);
    }
  }

  function patch(key: string, p: Partial<Item>) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }

  async function regenerate(item: Item) {
    patch(item.key, { busy: "Regenerating…", error: undefined });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "regenerate", ...baseBody(), concept: stripScored(item.concept) }),
      });
      const [c] = await readNdjson(res, () => {});
      setItems((list) => list.map((it) => (it.key === item.key ? { key: nextKey(), concept: c, badge: it.badge } : it)));
    } catch (e) {
      patch(item.key, { busy: undefined, error: e instanceof Error ? e.message : "Regenerate failed." });
    }
  }

  async function variations(item: Item) {
    patch(item.key, { busy: "Making variations…", error: undefined });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "variations", ...baseBody(), concept: stripScored(item.concept) }),
      });
      const concepts = await readNdjson(res, () => {});
      setItems((list) => {
        const i = list.findIndex((it) => it.key === item.key);
        const added = concepts.map((c) => ({ key: nextKey(), concept: c, badge: `Variation of “${item.concept.title}”` }));
        const copy = [...list];
        copy[i] = { ...copy[i], busy: undefined };
        copy.splice(i + 1, 0, ...added);
        return copy;
      });
    } catch (e) {
      patch(item.key, { busy: undefined, error: e instanceof Error ? e.message : "Variations failed." });
    }
  }

  async function save(item: Item) {
    patch(item.key, { busy: "Saving…", error: undefined });
    const res = await saveCreative({ concept: stripScored(item.concept), platform, productId, creativeType });
    if (res.ok) patch(item.key, { busy: undefined, saved: res.id });
    else patch(item.key, { busy: undefined, error: res.message });
  }

  async function copyText(item: Item) {
    await navigator.clipboard.writeText(conceptToText(item.concept));
    setCopiedKey(item.key);
    setTimeout(() => setCopiedKey(""), 1500);
  }

  function onImage(file: File | undefined) {
    setImageError("");
    if (!file) return setImage(null);
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) return setImageError("Use a PNG, JPG, WebP or GIF image.");
    if (file.size > 5 * 1024 * 1024) return setImageError("That image is over 5 MB. Use a smaller photo.");
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      setImage({ mediaType: file.type as Img["mediaType"], base64, name: file.name });
    };
    reader.readAsDataURL(file);
  }

  const select = (id: string, label: string, value: string, set: (v: string) => void, options: string[]) => (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form
        className="card h-fit space-y-4 lg:sticky lg:top-4"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
        aria-label="Brief"
      >
        <div>
          <label htmlFor="product" className="label">
            Product
          </label>
          <select id="product" className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status !== "ready" ? ` (${p.status})` : ""}
              </option>
            ))}
          </select>
          {blocked ? (
            <p role="alert" className={`mt-2 rounded-lg border p-3 text-sm ${product.status === "blocked" ? "border-red/30 bg-red-bg text-red" : "border-amber/30 bg-amber-bg text-amber"}`} data-testid="product-blocked">
              <strong>{product.status === "blocked" ? "Blocked" : "On hold"}:</strong> {product.statusReason || "No reason given."} It can&apos;t be generated until an admin sets it to ready.
            </p>
          ) : null}
        </div>
        {select("ctype", "Creative type", creativeType, setCreativeType, creativeTypes)}
        {select("angle", "Angle", angle, setAngle, angles)}
        {select("persona", "Persona", persona, setPersona, personas)}
        {select("language", "Language", language, setLanguage, languages)}
        <fieldset>
          <legend className="label">Number of concepts</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
            {[2, 3, 4].map((k) => (
              <label key={k} className={`cursor-pointer rounded-md py-1.5 text-center font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent ${n === k ? "bg-accent text-accent-ink" : "text-ink-soft"}`}>
                <input type="radio" name="n" value={k} checked={n === k} onChange={() => setN(k)} className="sr-only" />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="extra" className="label">
            Extra direction <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <textarea id="extra" className="input" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Diwali gifting, 10% off this week" />
        </div>
        <div>
          <label htmlFor="photo" className="label">
            Product photo <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input id="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="text-sm" onChange={(e) => onImage(e.target.files?.[0])} />
          <p className="hint mt-1">
            {image
              ? `Using ${image.name} so render prompts match the real pack.`
              : product?.hasPackImage
                ? "Using the saved pack image from Admin. Upload one to override."
                : "Attach the pack so render prompts describe it accurately."}
          </p>
          {imageError ? <p className="mt-1 text-sm text-red">{imageError}</p> : null}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy || !product || Boolean(blocked) || !creativeType}>
          {busy ? "Generating…" : `Generate ${n} concepts`}
        </button>
      </form>

      <section aria-label="Concepts" aria-live="polite" aria-busy={busy} className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-red/30 bg-red-bg p-4 text-red">
            {error}
          </p>
        ) : null}
        {progress ? (
          <div className="card space-y-3" data-testid="progress">
            <p className="font-semibold">
              {progress.concepts >= progress.total
                ? "Checking concepts against the claims library…"
                : `${progress.label}: ${Math.min(progress.concepts + 1, progress.total)} of ${progress.total}`}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.concepts} aria-label="Concepts written">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(5, (progress.concepts / progress.total) * 100)}%` }} />
            </div>
            <p className="hint">{progress.chars > 0 ? `${progress.chars.toLocaleString()} characters received` : "Waiting for the model…"}</p>
          </div>
        ) : null}
        {!progress && items.length === 0 && !error ? (
          <div className="card border-dashed text-center">
            <p className="text-lg font-bold">No concepts yet</p>
            <p className="hint mt-1">Pick a product and creative type, then generate. Every concept is scanned against the claims library before you see it.</p>
          </div>
        ) : null}
        {items.map((it, idx) => (
          <ConceptCard
            key={it.key}
            testId={`concept-${idx}`}
            concept={it.concept}
            platform={it.concept.platform}
            scan={it.concept.scan}
            badge={it.badge ? <span className="chip border-jaggery/40 text-jaggery">{it.badge}</span> : null}
            actions={
              <>
                {it.saved ? (
                  <Link href={`/library?highlight=${it.saved}`} className="btn-secondary">
                    Saved · open in library
                  </Link>
                ) : (
                  <button className="btn-primary" onClick={() => save(it)} disabled={Boolean(it.busy)}>
                    Save to library
                  </button>
                )}
                <button className="btn-secondary" onClick={() => copyText(it)}>
                  {copiedKey === it.key ? "Copied" : "Copy as text"}
                </button>
                <button className="btn-secondary" onClick={() => regenerate(it)} disabled={Boolean(it.busy) || busy || Boolean(blocked)}>
                  Regenerate this one
                </button>
                <button className="btn-secondary" onClick={() => variations(it)} disabled={Boolean(it.busy) || busy || Boolean(blocked)}>
                  Make variations
                </button>
                {it.concept.platform !== platform ? <span className="hint self-center">Saved as a {PLATFORM_LABELS[it.concept.platform]} creative.</span> : null}
                {it.busy ? <span className="hint self-center animate-pulse">{it.busy}</span> : null}
                {it.error ? (
                  <span role="alert" className="self-center text-sm text-red">
                    {it.error}
                  </span>
                ) : null}
              </>
            }
          />
        ))}
      </section>
    </div>
  );
}
