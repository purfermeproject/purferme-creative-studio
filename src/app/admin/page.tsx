import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { getAllPlatformRules, getBrand, getProducts, getTerms } from "@/lib/data";
import { PLATFORMS, PLATFORM_LABELS, PRODUCT_STATUSES } from "@/lib/types";
import {
  createProduct,
  createTerm,
  deleteProduct,
  deleteTerm,
  saveBrand,
  savePlatformRule,
  saveProduct,
  saveTerm,
  saveThresholds,
  uploadPackImage,
} from "./actions";

export const metadata = { title: "Settings · Puŕ Fermé Creative Studio" };

const STATUS_CHIP = { ready: "chip-green", hold: "chip-amber", blocked: "chip-red" } as const;

const THRESHOLD_LABELS: Record<string, string> = {
  minSpendMultiple: "Not enough data below spend of (× target CPA)",
  hookKill: "Kill if hook rate under (%)",
  ctrKill: "Kill if link CTR under (%)",
  cpaKillMultiple: "Kill if CPA over (× target)",
  hookScale: "Scale signal: hook rate over (%)",
  ctrScale: "Scale signal: link CTR over (%)",
  frequencyWarn: "Warn when 7-day frequency over",
  minClicks: "Not enough data below (clicks)",
  ctrFloor: "Fix image and title if CTR under (%)",
  conversionFloor: "Check price/reviews if conversion under (%)",
  acosCutMultiple: "Cut if ACoS over (× target)",
};

function Section({ id, title, children, intro }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-4">
      <div>
        <h2 id={`${id}-h`} className="text-2xl font-bold tracking-tight">
          {title}
        </h2>
        {intro ? <p className="hint mt-1">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint mt-1 block">{hint}</span> : null}
    </label>
  );
}

export default async function AdminPage() {
  const [products, brand, rules, terms] = await Promise.all([getProducts(), getBrand(), getAllPlatformRules(), getTerms()]);
  const blocked = products.filter((p) => p.status === "blocked");
  const ruleBy = Object.fromEntries(rules.map((r) => [r.platform, r]));

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
          <p className="hint mt-1">Claims, rules and settings that drive generation and checks. Changes apply immediately.</p>
        </div>
        <nav aria-label="Admin sections" className="flex flex-wrap gap-2 text-sm">
          {[
            ["#products", "Products"],
            ["#brand", "Brand"],
            ["#platforms", "Platforms"],
            ["#terms", "Compliance terms"],
            ["#thresholds", "Verdict thresholds"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="chip hover:text-ink">
              {label}
            </a>
          ))}
          <Link href="/admin/usage" className="chip hover:text-ink">
            Usage and cost
          </Link>
        </nav>
      </div>

      {blocked.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-red/30 bg-red-bg p-4 text-red">
          <p className="font-bold">Blocked: {blocked.map((p) => p.name).join(", ")}</p>
          {blocked.map((p) => (
            <p key={p.id} className="mt-1 text-sm">
              {p.statusReason}
            </p>
          ))}
        </div>
      ) : null}

      <Section
        id="products"
        title="Products"
        intro="Products on hold or blocked can't be generated. One claim per line. Green = allowed; amber = needs evidence; red = never."
      >
        <div className="space-y-3">
          {products.map((p) => (
            <details key={p.id} className="card group" data-testid={`product-${p.slug}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span className="text-lg font-bold">{p.name}</span>
                <span className={STATUS_CHIP[p.status]}>{p.status}</span>
                <span className="chip">{p.slug}</span>
                {p.status !== "ready" ? <span className="hint w-full sm:w-auto">{p.statusReason}</span> : null}
              </summary>
              {p.status === "blocked" ? (
                <p role="alert" className="mt-4 rounded-lg border border-red/30 bg-red-bg p-3 text-sm text-red">
                  This product is blocked. Nothing can be generated for it until the reason below is resolved.
                </p>
              ) : null}
              <ActionForm action={saveProduct} className="mt-4 grid gap-4 md:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Name">
                  <input name="name" defaultValue={p.name} className="input" required />
                </Field>
                <Field label="Price" hint="As it should appear in ads, e.g. Rs 349.">
                  <input name="priceText" defaultValue={p.priceText} className="input" />
                </Field>
                <Field label="Status">
                  <select name="status" defaultValue={p.status} className="input" aria-label={`Status for ${p.name}`}>
                    {PRODUCT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status reason" hint="Required for hold or blocked. Shown on the Create page.">
                  <input name="statusReason" defaultValue={p.statusReason} className="input" />
                </Field>
                <Field label="Green claims (allowed)">
                  <textarea name="greenClaims" defaultValue={p.greenClaims.join("\n")} rows={6} className="input" />
                </Field>
                <Field label="Amber claims (need evidence)">
                  <textarea name="amberClaims" defaultValue={p.amberClaims.join("\n")} rows={6} className="input" />
                </Field>
                <Field label="Red claims (never use)">
                  <textarea name="redClaims" defaultValue={p.redClaims.join("\n")} rows={4} className="input" />
                </Field>
                <div className="space-y-4">
                  <Field label="Notes">
                    <textarea name="notes" defaultValue={p.notes} rows={2} className="input" />
                  </Field>
                  <Field label="Allergens">
                    <input name="allergens" defaultValue={p.allergens} className="input" />
                  </Field>
                  <Field label="Pack image URL">
                    <input name="packImageUrl" defaultValue={p.packImageUrl ?? ""} className="input" type="url" />
                  </Field>
                </div>
              </ActionForm>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-line pt-4">
                <ActionForm action={uploadPackImage} submitLabel="Upload pack image" submitClassName="btn-secondary">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="label" htmlFor={`file-${p.id}`}>
                    Or upload a pack image
                  </label>
                  <input id={`file-${p.id}`} name="file" type="file" accept="image/*" className="text-sm" />
                </ActionForm>
                <ActionForm
                  action={deleteProduct}
                  submitLabel="Delete product"
                  submitClassName="btn-danger"
                  confirm={`Delete ${p.name}? Saved creatives keep their text but lose the product link.`}
                >
                  <input type="hidden" name="id" value={p.id} />
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
        <div className="card">
          <h3 className="mb-3 font-bold">Add a product</h3>
          <ActionForm action={createProduct} submitLabel="Add product" className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="Short id used by compliance terms, e.g. choc.">
              <input name="slug" className="input" required pattern="[a-z0-9-]{2,32}" />
            </Field>
            <Field label="Name">
              <input name="name" className="input" required />
            </Field>
          </ActionForm>
        </div>
      </Section>

      <Section id="brand" title="Brand settings" intro="Sent to the model on every generation and deep check.">
        <div className="card">
          <ActionForm action={saveBrand} className="grid gap-4 md:grid-cols-2">
            <Field label="Brand context">
              <textarea name="brandContext" defaultValue={brand.brandContext} rows={9} className="input" />
            </Field>
            <Field label="Hard rules">
              <textarea name="hardRules" defaultValue={brand.hardRules} rows={9} className="input" />
            </Field>
            <Field label="Tone">
              <textarea name="tone" defaultValue={brand.tone} rows={3} className="input" />
            </Field>
            <Field label="Languages (one per line)">
              <textarea name="languages" defaultValue={brand.languages.join("\n")} rows={3} className="input" />
            </Field>
            <Field label="Angles (one per line)">
              <textarea name="angles" defaultValue={brand.angles.join("\n")} rows={8} className="input" />
            </Field>
            <Field label="Personas (one per line)">
              <textarea name="personas" defaultValue={brand.personas.join("\n")} rows={8} className="input" />
            </Field>
          </ActionForm>
        </div>
      </Section>

      <Section id="platforms" title="Platform rules and guide" intro="Rules go into the generation prompt; the guide and comparison show on the Platform guide page.">
        {PLATFORMS.map((platform) => {
          const r = ruleBy[platform];
          if (!r) return null;
          return (
            <details key={platform} className="card">
              <summary className="cursor-pointer text-lg font-bold">{PLATFORM_LABELS[platform]}</summary>
              <ActionForm action={savePlatformRule} className="mt-4 grid gap-4 md:grid-cols-2">
                <input type="hidden" name="platform" value={platform} />
                <Field label="Creative types (one per line)">
                  <textarea name="creativeTypes" defaultValue={r.creativeTypes.join("\n")} rows={5} className="input" />
                </Field>
                <Field label="Rules sent to the model">
                  <textarea name="rules" defaultValue={r.rules} rows={8} className="input" />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Guide (markdown)">
                    <textarea name="guideMarkdown" defaultValue={r.guideMarkdown} rows={14} className="input font-mono text-sm" />
                  </Field>
                </div>
                <fieldset className="space-y-2 md:col-span-2">
                  <legend className="label">Comparison table</legend>
                  {r.comparison.map((c, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                      <input name={`cmp_row_${i}`} defaultValue={c.row} className="input font-semibold" aria-label={`Row ${i + 1} label`} />
                      <input name={`cmp_value_${i}`} defaultValue={c.value} className="input" aria-label={`${c.row} for ${PLATFORM_LABELS[platform]}`} />
                    </div>
                  ))}
                </fieldset>
              </ActionForm>
            </details>
          );
        })}
      </Section>

      <Section
        id="terms"
        title="Compliance terms"
        intro="Case-insensitive regular expressions. Red must be fixed before launch; amber needs evidence. Leave platform or product empty to apply everywhere."
      >
        <div className="space-y-2">
          {terms.map((t) => (
            <ActionForm key={t.id} action={saveTerm} className="card grid items-end gap-3 p-3 md:grid-cols-[1fr_2fr_7rem_8rem_7rem_auto]" submitClassName="btn-secondary">
              <input type="hidden" name="id" value={t.id} />
              <Field label="Label">
                <input name="label" defaultValue={t.label} className="input" />
              </Field>
              <Field label="Pattern">
                <input name="regex" defaultValue={t.regex} className="input font-mono text-sm" />
              </Field>
              <Field label="Severity">
                <select name="severity" defaultValue={t.severity} className="input">
                  <option value="red">red</option>
                  <option value="amber">amber</option>
                </select>
              </Field>
              <Field label="Platform">
                <select name="platform" defaultValue={t.platform ?? ""} className="input">
                  <option value="">All</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Product">
                <select name="productSlug" defaultValue={t.productSlug ?? ""} className="input">
                  <option value="">All</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.slug}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={t.active} /> Active
              </label>
            </ActionForm>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h3 className="mb-3 font-bold">Add a term</h3>
            <ActionForm action={createTerm} submitLabel="Add term" className="grid gap-3 sm:grid-cols-2">
              <Field label="Label">
                <input name="label" className="input" required />
              </Field>
              <Field label="Pattern (regex)">
                <input name="regex" className="input font-mono text-sm" required />
              </Field>
              <Field label="Severity">
                <select name="severity" className="input" defaultValue="red">
                  <option value="red">red</option>
                  <option value="amber">amber</option>
                </select>
              </Field>
              <Field label="Platform">
                <select name="platform" className="input" defaultValue="">
                  <option value="">All</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Product">
                <select name="productSlug" className="input" defaultValue="">
                  <option value="">All</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.slug}
                    </option>
                  ))}
                </select>
              </Field>
              <input type="hidden" name="active" value="on" />
            </ActionForm>
          </div>
          <div className="card">
            <h3 className="mb-3 font-bold">Delete a term</h3>
            <ActionForm action={deleteTerm} submitLabel="Delete term" submitClassName="btn-danger" confirm="Delete this term? Unticking Active is usually safer.">
              <select name="id" className="input" aria-label="Term to delete">
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.severity} · {t.label}
                  </option>
                ))}
              </select>
            </ActionForm>
          </div>
        </div>
      </Section>

      <Section id="thresholds" title="Verdict thresholds" intro="Used on the Results page.">
        <div className="card">
          <ActionForm action={saveThresholds} className="grid gap-6 md:grid-cols-2">
            {(["meta", "marketplace"] as const).map((group) => (
              <fieldset key={group} className="space-y-3">
                <legend className="mb-2 font-bold">{group === "meta" ? "Meta" : "Amazon / Flipkart"}</legend>
                {Object.entries(brand.verdictThresholds[group]).map(([k, v]) => (
                  <Field key={k} label={THRESHOLD_LABELS[k] ?? k}>
                    <input name={`${group}.${k}`} type="number" step="any" min={0} defaultValue={v} className="input" required />
                  </Field>
                ))}
              </fieldset>
            ))}
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
