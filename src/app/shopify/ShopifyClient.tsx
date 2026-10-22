"use client";

import { useState } from "react";
import { addTextAutomatically, defaultOverlay } from "@/components/OverlayEditor";
import { makeFactsCard } from "@/components/shopify-render";
import type { BrandKit } from "@/lib/brand-kit";
import type { ScanHit } from "@/lib/compliance";
import { requestImageWithStages } from "@/lib/image-client";
import { readNdjson } from "@/lib/ndjson";
import { can } from "@/lib/roles";
import type { ShopifyListing } from "@/lib/schemas";
import { auditProduct, isCombo, SHOPIFY_IMAGE, type ShopifyProduct, type StoreSnapshot } from "@/lib/shopify-parse";
import type { Role } from "@/lib/types";

type Img = { id: string; url: string; label: string };
export type SavedSet = { id: string; listing: ShopifyListing; mock: boolean; images: Img[]; hits?: ScanHit[] };
type Ours = { id: string; name: string; hasPack: boolean };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data as T;
}

const Swatch = ({ label, colour }: { label: string; colour: string }) => (
  <span className="flex items-center gap-2 text-xs">
    <span className="size-6 rounded-md border border-line" style={{ background: colour }} aria-hidden />
    <span>
      <span className="block font-semibold text-ink">{label}</span>
      <span className="text-ink-soft">{colour}</span>
    </span>
  </span>
);

const priceRange = (p: ShopifyProduct) => {
  const prices = p.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return "";
  const [lo, hi] = [Math.min(...prices), Math.max(...prices)];
  return lo === hi ? `₹${lo}` : `₹${lo}–₹${hi}`;
};

export function ShopifyClient({ role, initialStore, products, kit, saved }: { role: Role; initialStore: StoreSnapshot | null; products: Ours[]; kit: BrandKit; saved: Record<string, SavedSet> }) {
  const [store, setStore] = useState(initialStore);
  const [url, setUrl] = useState(initialStore?.storeUrl.replace(/^https:\/\//, "") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const canRun = can(role, "generate");

  async function fetchStore() {
    setBusy(true);
    setError("");
    try {
      const { snapshot } = await post<{ snapshot: StoreSnapshot }>("/api/shopify/fetch", { storeUrl: url });
      setStore(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the store.");
    } finally {
      setBusy(false);
    }
  }

  const shown = store?.products.filter((p) => !filter || p.title.toLowerCase().includes(filter.toLowerCase())) ?? [];

  return (
    <div className="space-y-6">
      <section className="card space-y-3" aria-label="Your store" data-testid="shopify-store">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1">
            <span className="label">Store web address</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="purferme.com or your-store.myshopify.com" />
          </label>
          <button type="button" className="btn-primary" onClick={fetchStore} disabled={busy || !canRun || !url.trim()}>
            {busy ? "Reading your store…" : store ? "Fetch again" : "Fetch from live store"}
          </button>
        </div>
        <p className="hint">
          Reads the public product list Shopify publishes for every store ({"/products.json"}): titles, descriptions, prices, variants and images. Nothing on your store is changed.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        ) : null}
        {store ? (
          <div className="flex flex-wrap items-center gap-5 border-t border-line pt-3" data-testid="store-colours">
            <span className="text-sm">
              <span className="font-semibold">{store.products.length} products</span> from {store.storeUrl} ·{" "}
              {new Date(store.fetchedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </span>
            <Swatch label="Image background" colour={store.imageBackground} />
            <Swatch label="Page background" colour={store.theme.background} />
            <Swatch label="Text" colour={store.theme.text} />
            <Swatch label="Accent" colour={store.theme.accent} />
          </div>
        ) : null}
      </section>

      {store ? (
        <section className="space-y-3" aria-label="Store products">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Products on your store</h2>
            <input className="input w-64" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter products" />
          </div>
          {shown.map((p) => (
            <ProductRow key={p.handle} p={p} store={store} setStore={setStore} products={products} kit={kit} saved={saved[p.handle]} canRun={canRun} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ProductRow({
  p,
  store,
  setStore,
  products,
  kit,
  saved,
  canRun,
}: {
  p: ShopifyProduct;
  store: StoreSnapshot;
  setStore: (s: StoreSnapshot) => void;
  products: Ours[];
  kit: BrandKit;
  saved?: SavedSet;
  canRun: boolean;
}) {
  const audit = auditProduct(p);
  const issues = audit.images.length + audit.listing.length;
  const links = store.links[p.handle] ?? [];
  const [set, setSet] = useState<SavedSet | null>(saved ?? null);
  const [stages, setStages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function link(ids: string[]) {
    setError("");
    try {
      const r = await post<{ links: Record<string, string[]> }>("/api/shopify/link", { handle: p.handle, productIds: ids });
      setStore({ ...store, links: r.links });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  async function generate() {
    setBusy(true);
    setError("");
    const steps: string[] = [];
    const add = (t: string) => {
      steps.push(t);
      setStages([...steps]);
    };
    try {
      const res = await fetch("/api/shopify/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: p.handle }) });
      const done = await readNdjson<{ id: string; listing: ShopifyListing; hits: ScanHit[]; mock: boolean; images: Img[] }>(res, () => {}, add);
      let images = done.images;
      setSet({ id: done.id, listing: done.listing, mock: done.mock, images, hits: done.hits });
      add("Adding the product name and facts in your brand fonts");
      const base = images.find((i) => i.label === "Shopify facts base");
      if (base) {
        const bg = store.theme.background === "#ffffff" ? store.imageBackground : store.theme.background;
        const facts = await makeFactsCard({ baseUrl: base.url, kit, theme: store.theme, background: bg, title: done.listing.title, facts: done.listing.facts });
        await post(`/api/shopify/listings/${done.id}/images`, { assetId: facts.id });
        images = [...images, facts];
        setSet({ id: done.id, listing: done.listing, mock: done.mock, images, hits: done.hits });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the Shopify set.");
    } finally {
      setBusy(false);
      setStages([]);
    }
  }

  /** An AI lifestyle photo with the real pack on a brand panel, square for Shopify. */
  async function lifestyle() {
    if (!set || !links[0]) return;
    setBusy(true);
    setError("");
    const steps: string[] = [];
    try {
      const L = set.listing;
      const img = await requestImageWithStages(
        {
          platform: "meta",
          productId: links[0],
          creativeType: "Static image ad (1:1)",
          concept: {
            title: L.title,
            persona: "",
            angle: "",
            format: "Shopify product image",
            language: "English",
            hook: L.facts[0] ?? L.title,
            frames: [{ slot: "Lifestyle", visual: `An everyday Indian moment where someone enjoys ${L.title}: real hands, real food, warm natural light`, onscreen: L.facts[0] ?? "" }],
            copy: { headline: L.title },
            ai_prompt: `Lifestyle photo for a product page: ${L.title}. Appetising, natural, uncluttered.`,
            needs_real_person: false,
            ai_label_needed: false,
            claims: [],
            why_it_fits: "",
          },
          custom: { w: SHOPIFY_IMAGE, h: SHOPIFY_IMAGE },
          packMode: "layout",
          textMode: "overlay",
        },
        (t) => {
          steps.push(t);
          setStages([...steps]);
        },
      );
      const withText = await addTextAutomatically({
        imageUrl: img.url,
        kit,
        options: { ...defaultOverlay(kit, { headline: L.facts[0] ?? "", sub: L.title, cta: "" }, "panel"), showCta: false },
        label: "Shopify lifestyle",
      });
      await post(`/api/shopify/listings/${set.id}/images`, { assetId: withText.id });
      setSet({ ...set, images: [...set.images, withText] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the lifestyle image.");
    } finally {
      setBusy(false);
      setStages([]);
    }
  }

  const shownImages = set?.images.filter((i) => i.label !== "Shopify facts base") ?? [];
  const L = set?.listing;
  return (
    <article className="card space-y-4" data-testid={`shopify-${p.handle}`} aria-label={p.title}>
      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="grid grid-cols-3 gap-1 self-start">
          {p.images.slice(0, 6).map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.src} src={img.src} alt={img.alt || p.title} className="aspect-square w-full rounded border border-line bg-surface-2 object-contain" />
          ))}
          {!p.images.length ? <span className="col-span-3 rounded-lg bg-surface-2 p-4 text-center text-xs text-ink-soft">No images</span> : null}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{p.title}</h3>
            {isCombo(p) ? <span className="chip-amber">Combo</span> : null}
            <span className="text-sm text-ink-soft">
              {priceRange(p)} · {p.images.length} image{p.images.length === 1 ? "" : "s"}
            </span>
          </div>
          <details className="text-sm" data-testid="audit">
            <summary className="cursor-pointer font-semibold">{issues ? `${issues} thing${issues === 1 ? "" : "s"} to fix on the live listing` : "Live listing looks complete"}</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-soft">
              {audit.listing.map((x) => (
                <li key={x}>{x}</li>
              ))}
              {audit.images.map((x, k) => (
                <li key={k}>
                  Image {x.position}: {x.problem}
                </li>
              ))}
            </ul>
          </details>
          <fieldset className="text-sm" data-testid="links">
            <legend className="font-semibold">Which of our products does it show?{isCombo(p) ? " (tick each one in the combo)" : ""}</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {products.map((o) => (
                <label key={o.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={links.includes(o.id)}
                    disabled={!canRun}
                    onChange={(e) => link(e.target.checked ? [...links, o.id] : links.filter((x) => x !== o.id))}
                  />
                  {o.name}
                  {!o.hasPack ? <span className="text-xs text-red">(no pack photo)</span> : null}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={generate} disabled={busy || !canRun || !links.length}>
              {busy ? "Working…" : set ? "Make the Shopify set again" : "Make the Shopify set"}
            </button>
            {set ? (
              <>
                <button type="button" className="btn-secondary" onClick={lifestyle} disabled={busy || !canRun}>
                  Add a lifestyle image (AI)
                </button>
                <a className="btn-secondary" href={`/api/shopify/listings/${set.id}/zip`} download data-testid="shopify-zip">
                  Download for Shopify (.zip)
                </a>
              </>
            ) : null}
          </div>
          {busy && stages.length ? (
            <ol className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm" aria-label="What is happening now" data-testid="shopify-stages">
              {stages.map((s, k) => (
                <li key={k} className={k === stages.length - 1 ? "font-semibold" : "text-ink-soft"}>
                  {k === stages.length - 1 ? "⏳ " : "✓ "}
                  {s}
                </li>
              ))}
            </ol>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {set && L ? (
        <div className="space-y-3 border-t border-line pt-4" data-testid="shopify-set">
          {set.mock ? <span className="chip-amber">Sample text (mock mode)</span> : null}
          {set.hits?.length ? (
            <p className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red" role="alert">
              Check before publishing: {set.hits.map((h) => `${h.label} (“${h.matches.join("”, “")}”)`).join("; ")}
            </p>
          ) : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="shopify-images">
            {shownImages.map((img, k) => (
              <li key={img.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={L.image_alts[k] ?? L.title} className="aspect-square w-full rounded-lg border border-line object-cover" />
                <p className="text-xs text-ink-soft">
                  {k + 1}. {img.label.replace(/^Shopify /, "").replace(/ · with text$/, "")} · {SHOPIFY_IMAGE}×{SHOPIFY_IMAGE}
                </p>
              </li>
            ))}
          </ul>
          <dl className="grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
            {(
              [
                ["Title", L.title, 70],
                ["SEO title", L.seo_title, 70],
                ["SEO description", L.seo_description, 160],
                ["Type", L.product_type, 0],
                ["Tags", L.tags.join(", "), 0],
              ] as const
            ).map(([k, v, max]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-ink-soft">{k}</dt>
                <dd>
                  {v}
                  {max ? <span className={`ml-2 text-xs ${v.length > max ? "text-red" : "text-ink-soft"}`}>{`${v.length}/${max}`}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Description</summary>
            <div className="prose-sm mt-2 space-y-2 rounded-xl bg-surface-2 p-3 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitise(L.body_html) }} />
          </details>
        </div>
      ) : null}
    </article>
  );
}

/** Keeps only the simple tags the listing is written with (the HTML comes from the AI). */
function sanitise(html: string): string {
  return html
    .replace(/<(\/?)(p|h3|ul|li|strong|br)\b[^>]*>/gi, "\u0000$1$2\u0001")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\u0000/g, "<")
    .replace(/\u0001/g, ">");
}
