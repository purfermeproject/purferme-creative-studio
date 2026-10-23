"use client";

import { useEffect, useState } from "react";
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
type Filter = "all" | "work" | "ready" | "combo";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data as T;
}

const priceRange = (p: ShopifyProduct) => {
  const prices = p.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return "";
  const [lo, hi] = [Math.min(...prices), Math.max(...prices)];
  return lo === hi ? `₹${lo.toLocaleString("en-IN")}` : `₹${lo.toLocaleString("en-IN")}–${hi.toLocaleString("en-IN")}`;
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const issueCount = (p: ShopifyProduct) => {
  const a = auditProduct(p);
  return a.images.length + a.listing.length;
};

/** A store photo that shows a quiet placeholder instead of a broken-image icon if it can't load. */
function StoreImg({ src, alt, className, style }: { src: string; alt: string; className: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`${className} flex items-center justify-center text-center text-[11px] text-ink-soft`}
        style={style}
        {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      >
        Photo unavailable
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} onError={() => setFailed(true)} />;
}

function Swatch({ label, colour }: { label: string; colour: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="size-9 shrink-0 rounded-full border border-line shadow-inner" style={{ background: colour }} aria-hidden />
      <span className="leading-tight">
        <span className="block text-xs font-semibold text-ink">{label}</span>
        <span className="font-mono text-[11px] text-ink-soft uppercase">{colour}</span>
      </span>
    </li>
  );
}

function Stat({ value, label, tone = "" }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className={`font-serif text-3xl font-semibold ${tone || "text-purple"}`}>{value}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
    </div>
  );
}

/** Before the first fetch: what this page does, in three steps. */
function EmptyState() {
  const steps = [
    ["Read your store", "Products, photos, prices and your website's colours, straight from your live Shopify store."],
    ["See what to fix", "Photos that aren't square or sharp enough, missing alt text, thin descriptions, missing barcodes."],
    ["Download a ready set", "A new listing and 2048×2048 images with your real pack, in your store's own colours."],
  ];
  return (
    <ol className="grid gap-3 md:grid-cols-3" data-testid="shopify-empty">
      {steps.map(([t, d], i) => (
        <li key={t} className="rounded-2xl border border-line bg-surface p-5">
          <span className="flex size-8 items-center justify-center rounded-full bg-purple font-serif text-sm font-semibold text-accent-ink">{i + 1}</span>
          <p className="mt-3 font-semibold">{t}</p>
          <p className="mt-1 text-sm text-ink-soft">{d}</p>
        </li>
      ))}
    </ol>
  );
}

export function ShopifyClient({ role, initialStore, products, kit, saved }: { role: Role; initialStore: StoreSnapshot | null; products: Ours[]; kit: BrandKit; saved: Record<string, SavedSet> }) {
  const [store, setStore] = useState(initialStore);
  const [sets, setSets] = useState<Record<string, SavedSet>>(saved);
  const [url, setUrl] = useState(initialStore?.storeUrl.replace(/^https:\/\//, "") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
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

  const all = store?.products ?? [];
  const needImages = all.filter((p) => auditProduct(p).images.length).length;
  const needListing = all.filter((p) => auditProduct(p).listing.length).length;
  const counts: Record<Filter, number> = {
    all: all.length,
    work: all.filter((p) => issueCount(p) > 0).length,
    ready: all.filter((p) => sets[p.handle]).length,
    combo: all.filter((p) => isCombo(p)).length,
  };
  const shown = all.filter(
    (p) =>
      (!query || p.title.toLowerCase().includes(query.toLowerCase())) &&
      (filter === "all" || (filter === "work" && issueCount(p) > 0) || (filter === "ready" && sets[p.handle]) || (filter === "combo" && isCombo(p))),
  );
  const current = open ? all.find((p) => p.handle === open) : null;
  const host = store?.storeUrl.replace(/^https:\/\//, "");

  return (
    <div className="space-y-6">
      {/* Store */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_12px_32px_-20px_rgba(45,27,84,0.35)]" aria-label="Your store" data-testid="shopify-store">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-3">
            {store ? (
              <div>
                <p className="eyebrow">Connected store</p>
                <a href={store.storeUrl} target="_blank" rel="noreferrer" className="display block truncate text-2xl text-purple hover:underline">
                  {host}
                </a>
                <p className="text-sm text-ink-soft">
                  {store.products.length} products · read {ago(store.fetchedAt)}
                </p>
              </div>
            ) : (
              <div>
                <p className="eyebrow">Step 1</p>
                <p className="display text-2xl text-purple">Connect your Shopify store</p>
              </div>
            )}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void fetchStore();
              }}
            >
              <label className="min-w-0 flex-1 basis-64">
                <span className="sr-only">Store web address</span>
                <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="purferme.com or your-store.myshopify.com" aria-label="Store web address" />
              </label>
              <button type="submit" className="btn-primary" disabled={busy || !canRun || !url.trim()}>
                {busy ? "Reading your store…" : store ? "Fetch again" : "Fetch from live store"}
              </button>
            </form>
            {error ? (
              <p role="alert" className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red">
                {error}
              </p>
            ) : (
              <p className="hint">Reads the public product list every Shopify store publishes. Nothing on your store is changed.</p>
            )}
          </div>
          {store ? (
            <div className="rounded-2xl bg-surface-2 p-4" data-testid="store-colours">
              <p className="mb-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">Your store&apos;s look · {store.products.length} products</p>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Swatch label="Photo background" colour={store.imageBackground} />
                <Swatch label="Page" colour={store.theme.background} />
                <Swatch label="Text" colour={store.theme.text} />
                <Swatch label="Accent" colour={store.theme.accent} />
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {!store ? <EmptyState /> : null}

      {store ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
            <Stat value={all.length} label="Products on your store" />
            <Stat value={needImages} label="Need better photos" tone={needImages ? "text-caramel-ink" : ""} />
            <Stat value={needListing} label="Need listing fixes" tone={needListing ? "text-caramel-ink" : ""} />
            <Stat value={counts.ready} label="Shopify sets ready" tone="text-leaf" />
          </section>

          <section className="space-y-4" aria-label="Store products">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
                {(
                  [
                    ["all", "All"],
                    ["work", "Needs work"],
                    ["ready", "Set ready"],
                    ["combo", "Combos"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === id ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
                  >
                    {label} <span className="font-normal text-ink-soft">{counts[id]}</span>
                  </button>
                ))}
              </div>
              <input className="input w-full sm:w-64" placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
            </div>

            {shown.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((p) => (
                  <li key={p.handle}>
                    <ProductCard p={p} store={store} products={products} set={sets[p.handle]} onOpen={() => setOpen(p.handle)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">No products match.</p>
            )}
          </section>
        </>
      ) : null}

      {store && current ? (
        <ProductPanel
          key={current.handle}
          p={current}
          store={store}
          setStore={setStore}
          products={products}
          kit={kit}
          set={sets[current.handle] ?? null}
          setSet={(s) => setSets((m) => ({ ...m, [current.handle]: s }))}
          canRun={canRun}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function ProductCard({ p, store, products, set, onOpen }: { p: ShopifyProduct; store: StoreSnapshot; products: Ours[]; set?: SavedSet; onOpen: () => void }) {
  const issues = issueCount(p);
  const linked = (store.links[p.handle] ?? []).map((id) => products.find((o) => o.id === id)?.name).filter(Boolean) as string[];
  const cover = set?.images.find((i) => i.label === "Shopify main")?.url ?? p.images[0]?.src;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(45,27,84,0.45)] focus-visible:outline-2 focus-visible:outline-purple"
      data-testid={`card-${p.handle}`}
    >
      <div className="relative aspect-square w-full" style={{ background: store.imageBackground }}>
        {cover ? (
          <StoreImg src={cover} alt="" className="absolute inset-0 h-full w-full object-contain p-4 transition group-hover:scale-[1.02]" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">No photo</span>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {set ? <span className="rounded-full bg-purple px-2.5 py-1 text-xs font-semibold text-accent-ink">Set ready</span> : null}
          {isCombo(p) ? <span className="chip-amber">Combo</span> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="line-clamp-2 font-semibold leading-snug">{p.title}</p>
        <p className="text-sm text-ink-soft">
          {priceRange(p) || "No price"} · {p.images.length} photo{p.images.length === 1 ? "" : "s"}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {issues ? <span className="chip-amber">{issues} to fix</span> : <span className="chip-green">Looks complete</span>}
          {linked.length ? (
            <span className="chip truncate" title={linked.join(", ")}>
              {linked.length > 1 ? `${linked.length} products` : linked[0].split(",")[0]}
            </span>
          ) : (
            <span className="chip-red">Not linked</span>
          )}
        </div>
      </div>
    </button>
  );
}

function Meter({ label, value, max }: { label: string; value: string; max: number }) {
  const over = value.length > max;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{label}</span>
        <span className={`text-xs ${over ? "font-semibold text-red" : "text-ink-soft"}`}>
          {value.length}/{max}
        </span>
      </div>
      <p className="text-sm">{value}</p>
      <div className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className={`h-full rounded-full ${over ? "bg-red" : "bg-leaf"}`} style={{ width: `${Math.min(100, (value.length / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function ProductPanel({
  p,
  store,
  setStore,
  products,
  kit,
  set,
  setSet,
  canRun,
  onClose,
}: {
  p: ShopifyProduct;
  store: StoreSnapshot;
  setStore: (s: StoreSnapshot) => void;
  products: Ours[];
  kit: BrandKit;
  set: SavedSet | null;
  setSet: (s: SavedSet) => void;
  canRun: boolean;
  onClose: () => void;
}) {
  const audit = auditProduct(p);
  const links = store.links[p.handle] ?? [];
  const [stages, setStages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allProducts, setAllProducts] = useState(false);
  // Linked products first, then ones with a pack photo (only those can be used); the rest on request.
  const ordered = [...products].sort((a, b) => Number(links.includes(b.id)) - Number(links.includes(a.id)) || Number(b.hasPack) - Number(a.hasPack));
  const primary = ordered.filter((o) => links.includes(o.id) || o.hasPack);
  const pickable = allProducts || !primary.length ? ordered : primary;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

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

  const newImages = set?.images.filter((i) => i.label !== "Shopify facts base") ?? [];
  const L = set?.listing;
  const combo = isCombo(p);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={p.title} className="flex h-full w-full max-w-4xl flex-col bg-bg shadow-2xl" data-testid={`shopify-${p.handle}`}>
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">{priceRange(p) || "Shopify product"}</p>
              {combo ? <span className="chip-amber">Combo</span> : null}
            </div>
            <h2 className="display line-clamp-2 text-xl sm:text-2xl">{p.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={`${store.storeUrl}/products/${p.handle}`} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-sm">
              View live ↗
            </a>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onClose} disabled={busy} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Which of our products */}
          <section className="space-y-2" data-testid="links">
            <h3 className="text-sm font-semibold">
              Which of our products does it show?
              <span className="ml-1 font-normal text-ink-soft">{combo ? "Pick each one in the combo." : "Pick one."}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {pickable.map((o) => {
                const on = links.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-purple bg-accent-soft font-semibold text-purple" : "border-line bg-surface text-ink-soft hover:border-ink-soft"} ${!canRun ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={!canRun}
                      onChange={(e) => link(e.target.checked ? [...links, o.id] : links.filter((x) => x !== o.id))}
                    />
                    <span aria-hidden>{on ? "✓" : "+"}</span>
                    {o.name}
                    {!o.hasPack ? <span className="text-xs font-normal text-red">· no pack photo</span> : null}
                  </label>
                );
              })}
              {pickable.length < ordered.length ? (
                <button type="button" className="rounded-full px-3 py-1.5 text-sm font-semibold text-purple hover:underline" onClick={() => setAllProducts(true)}>
                  Show all {ordered.length} products
                </button>
              ) : null}
            </div>
          </section>

          {/* Live now vs new set */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Live now</h3>
                <span className="text-xs text-ink-soft">
                  {p.images.length} photo{p.images.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="grid grid-cols-3 gap-2">
                {p.images.slice(0, 6).map((img) => (
                  <li key={img.src} className="relative">
                    <StoreImg src={img.src} alt={img.alt || p.title} className="aspect-square w-full rounded-lg border border-line object-contain" style={{ background: store.imageBackground }} />
                    {img.width ? (
                      <span className={`absolute right-1 bottom-1 rounded px-1 text-[10px] font-semibold ${img.width === img.height && img.width >= SHOPIFY_IMAGE ? "bg-green-bg text-leaf" : "bg-amber-bg text-amber"}`}>
                        {img.width}×{img.height}
                      </span>
                    ) : null}
                  </li>
                ))}
                {!p.images.length ? <li className="col-span-3 rounded-lg bg-surface-2 p-6 text-center text-sm text-ink-soft">No photos yet</li> : null}
              </ul>
              <details className="text-sm" data-testid="audit" open={!set}>
                <summary className="cursor-pointer font-semibold">
                  {audit.images.length + audit.listing.length ? `${audit.images.length + audit.listing.length} things to fix on the live listing` : "Live listing looks complete"}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {[...audit.listing, ...audit.images.map((x) => `Photo ${x.position}: ${x.problem}`)].map((x, k) => (
                    <li key={k} className="flex gap-2 text-ink-soft">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />
                      {x}
                    </li>
                  ))}
                </ul>
              </details>
            </div>

            <div className="space-y-3 rounded-2xl border border-purple/30 bg-surface p-4" data-testid="shopify-set">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">New Shopify set</h3>
                {set?.mock ? <span className="chip-amber">Sample text (mock mode)</span> : set ? <span className="chip-green">Ready</span> : null}
              </div>
              {newImages.length ? (
                <ul className="grid grid-cols-3 gap-2" data-testid="shopify-images">
                  {newImages.map((img, k) => (
                    <li key={img.id} className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={L?.image_alts[k] ?? p.title} className="aspect-square w-full rounded-lg border border-line object-cover" />
                      <p className="text-[11px] text-ink-soft">
                        {k + 1}. {img.label.replace(/^Shopify /, "").replace(/ · with text$/, "")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="grid grid-cols-3 gap-2" aria-label="What the set will contain">
                  {["Main: your pack", "Key facts", "Lifestyle (optional)"].map((t) => (
                    <li key={t} className="flex aspect-square items-end rounded-lg border border-dashed border-line p-2 text-[11px] text-ink-soft" style={{ background: store.imageBackground }}>
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-soft">
                Every image {SHOPIFY_IMAGE}×{SHOPIFY_IMAGE}, on your store&apos;s photo background, with your real pack{combo ? "s" : ""}, never redrawn.
              </p>
            </div>
          </section>

          {busy && stages.length ? (
            <ol className="space-y-1 rounded-2xl bg-surface-2 p-4 text-sm" aria-label="What is happening now" data-testid="shopify-stages">
              {stages.map((s, k) => (
                <li key={k} className={k === stages.length - 1 ? "font-semibold" : "text-ink-soft"}>
                  {k === stages.length - 1 ? "⏳ " : "✓ "}
                  {s}
                </li>
              ))}
            </ol>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red">
              {error}
            </p>
          ) : null}

          {set && L ? (
            <section className="space-y-4" aria-label="New listing">
              {set.hits?.length ? (
                <p className="rounded-xl border border-red/30 bg-red-bg p-3 text-sm text-red" role="alert">
                  Check before publishing: {set.hits.map((h) => `${h.label} (“${h.matches.join("”, “")}”)`).join("; ")}
                </p>
              ) : null}
              <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 lg:grid-cols-2">
                <Meter label="Title" value={L.title} max={70} />
                <Meter label="SEO title" value={L.seo_title} max={70} />
                <div className="lg:col-span-2">
                  <Meter label="SEO description" value={L.seo_description} max={160} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Type</span>
                  <p className="text-sm">{L.product_type}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Tags</span>
                  <p className="flex flex-wrap gap-1">
                    {L.tags.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">Description, as shoppers will see it</p>
                <div
                  className="space-y-3 text-sm leading-relaxed [&_h3]:mt-4 [&_h3]:font-serif [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-purple [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: sanitise(L.body_html) }}
                />
              </div>
            </section>
          ) : null}
        </div>

        <footer className="grid grid-cols-2 items-center gap-2 border-t border-line bg-surface px-4 py-3 sm:flex sm:flex-wrap sm:px-6">
          <button type="button" className="btn-primary col-span-2 sm:col-span-1" onClick={generate} disabled={busy || !canRun || !links.length}>
            {busy ? "Working…" : set ? "Make the Shopify set again" : "Make the Shopify set"}
          </button>
          {set ? (
            <>
              <button type="button" className="btn-secondary px-3 text-sm sm:px-4 sm:text-base" onClick={lifestyle} disabled={busy || !canRun}>
                + Lifestyle image (AI)
              </button>
              <a className="btn-secondary px-3 text-center text-sm sm:ml-auto sm:px-4 sm:text-base" href={`/api/shopify/listings/${set.id}/zip`} download data-testid="shopify-zip">
                Download (.zip)
              </a>
            </>
          ) : !links.length ? (
            <span className="col-span-2 text-sm text-ink-soft">Pick which of our products it shows first.</span>
          ) : null}
        </footer>
      </aside>
    </div>
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
