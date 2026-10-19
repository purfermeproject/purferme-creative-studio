import { assetInfo } from "@/lib/asset-store";
import { validate, validationContext } from "@/lib/creative-store";
import { snapshotOf } from "@/lib/versions";
import { getBrand, getProducts } from "@/lib/data";
import { parseFilters, queryCreatives } from "@/lib/library";
import { getPlatform } from "@/lib/platform";
import { CREATIVE_STATUSES, PLATFORMS, PLATFORM_LABELS } from "@/lib/types";
import { LibraryItem } from "./LibraryItem";

export const metadata = { title: "Library · Puŕ Fermé Creative Studio" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const platform = await getPlatform();
  const filters = parseFilters(sp, platform);
  const [rows, products, brand, ctx] = await Promise.all([queryCreatives(filters), getProducts(), getBrand(), validationContext()]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const infos = await assetInfo(rows.flatMap((r) => r.creative.imageIds));
  const infoById = new Map(infos.map((i) => [i.id, i]));
  const highlight = typeof sp.highlight === "string" ? sp.highlight : "";
  const exportQs = new URLSearchParams({
    platform: filters.platform,
    ...(filters.productId ? { product: filters.productId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  }).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-4xl">Creative library</h1>
          <p className="hint mt-1">
            Every draft is saved here automatically. Open one in the workspace to edit, see its history and approve it.
          </p>
        </div>
        <a href={`/api/library/export?${exportQs}`} className="btn-secondary shrink-0" download>
          Export {rows.length} to CSV
        </a>
      </div>

      <form method="get" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_1fr_10rem_1fr_auto] lg:items-end" role="search" aria-label="Filter creatives">
        <div>
          <label htmlFor="f-platform" className="label">
            Platform
          </label>
          <select id="f-platform" name="platform" defaultValue={filters.platform} className="input">
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-product" className="label">
            Product
          </label>
          <select id="f-product" name="product" defaultValue={filters.productId} className="input">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="label">
            Status
          </label>
          <select id="f-status" name="status" defaultValue={filters.status} className="input">
            <option value="">Any status</option>
            {CREATIVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-q" className="label">
            Search
          </label>
          <input id="f-q" name="q" type="search" defaultValue={filters.q} className="input" placeholder="Title, hook, copy, persona…" />
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="card border-dashed text-center">
          <p className="text-lg font-bold">Nothing here yet</p>
          <p className="hint mt-1">Develop a concept in Create and it appears here, or loosen the filters.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ creative, productName, productPrice }) => {
            const v = validate(snapshotOf(creative), creative.platform, creative.productId ? (productById.get(creative.productId) ?? null) : null, ctx);
            return (
            <li key={creative.id}>
              <LibraryItem
                review={{ needed: v.needsHumanReview, reviewedBy: creative.claimsReviewedBy }}
                otherBlocking={v.issues.filter((i) => i.level === "block" && !i.id.startsWith("scan:")).map((i) => i.detail)}
                creative={creative}
                productName={productName ?? "(product deleted)"}
                defaultOpen={creative.id === highlight}
                kit={brand.kit}
                priceText={productPrice ?? ""}
                images={creative.imageIds.map((id) => {
                  const i = infoById.get(id);
                  return { id, url: `/api/assets/${id}`, label: i?.label || undefined, frameIndex: i?.frameIndex ?? null };
                })}
              />
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
