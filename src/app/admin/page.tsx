import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { BrandKitEditor } from "./BrandKitEditor";
import { PackCropper } from "./PackCropper";
import { getAllPlatformRules, getBrand, getProducts, getTerms } from "@/lib/data";
import { PLATFORMS, PLATFORM_LABELS, PRODUCT_STATUSES, ROLES } from "@/lib/types";
import { asc } from "drizzle-orm";
import { currentUser, roleOf } from "@/auth";
import { db, schema } from "@/db";
import { formatEvidence, formatUrls } from "@/lib/product-knowledge";
import { assetInfo } from "@/lib/asset-store";
import { can, ROLE_HINTS, ROLE_LABELS } from "@/lib/roles";
import {
  createProduct,
  createTerm,
  deleteProduct,
  deleteTerm,
  removeProductPhoto,
  removeUserRole,
  uploadProductPhoto,
  usePhotoAsPack,
  setUserRole,
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
        <h2 id={`${id}-h`} className="display text-2xl">
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
  const [products, brand, rules, terms, user, roleRows] = await Promise.all([
    getProducts(),
    getBrand(),
    getAllPlatformRules(),
    getTerms(),
    currentUser(),
    db.select().from(schema.userRoles).orderBy(asc(schema.userRoles.email)),
  ]);
  const myRole = user ? await roleOf(user) : "viewer";
  const photoInfo = new Map((await assetInfo(products.flatMap((p) => p.photoAssetIds))).map((a) => [a.id, a]));
  const isAdmin = can(myRole, "settings");
  const blocked = products.filter((p) => p.status === "blocked");
  const ruleBy = Object.fromEntries(rules.map((r) => [r.platform, r]));

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-4xl">Settings</h1>
          <p className="hint mt-1">Claims, rules and settings that drive generation and checks. Changes apply immediately.</p>
        </div>
        <nav aria-label="Admin sections" className="flex flex-wrap gap-2 text-sm">
          {[
            ["#products", "Products"],
            ["#brand", "Brand"],
            ["#brand-kit", "Brand kit"],
            ["#platforms", "Platforms"],
            ["#terms", "Compliance terms"],
            ["#thresholds", "Verdict thresholds"],
            ["#roles", "Team roles"],
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

      {!isAdmin ? (
        <p role="status" className="rounded-2xl border border-line bg-surface-2 p-4 text-sm">
          You can view settings, but only admins can change them. Your role: <strong>{ROLE_LABELS[myRole]}</strong>.
        </p>
      ) : null}

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
                <div className="md:col-span-2">
                  <Field
                    label="Product story (makes ads specific)"
                    hint="Taste and texture, what the pack looks like, when people really eat it, lines from real reviews, where ingredients come from. The more real detail, the less generic the ads."
                  >
                    <textarea
                      name="story"
                      defaultValue={p.story}
                      rows={5}
                      className="input"
                      placeholder={"e.g. Deep cocoa, not too sweet; snaps cleanly then goes crumbly in chai.\nBrown kraft pack with a green window.\nPeople keep them at their desk for the 4pm slump; kids steal them from tiffins.\nReview: 'finally a cookie I don't have to hide from my nutritionist friend'"}
                    />
                  </Field>
                </div>
                <Field label="Ingredients" hint="As on the pack, with percentages where known.">
                  <textarea name="ingredients" defaultValue={p.ingredients} rows={4} className="input" />
                </Field>
                <Field label="Messaging priorities" hint="What to lead with, one per line, most important first.">
                  <textarea name="messagingPriorities" defaultValue={p.messagingPriorities.join("\n")} rows={4} className="input" placeholder={"Taste first: deep cocoa, real crunch\nNo maida, sweetened with jaggery\nIngredient % on the website"} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Evidence for amber claims" hint="One per line: claim | evidence | source. Shown to approvers when an ad uses the claim.">
                    <textarea
                      name="claimEvidence"
                      defaultValue={formatEvidence(p.claimEvidence)}
                      rows={3}
                      className="input font-mono text-xs"
                      placeholder="Fibre content (grams per serving only) | 4.2 g fibre per 30 g serving | Lab report NABL-2025-114"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Product links" hint="One per line: label | https://… (website, Amazon, Flipkart).">
                    <textarea name="productUrls" defaultValue={formatUrls(p.productUrls)} rows={2} className="input font-mono text-xs" placeholder="Website | https://purferme.com/products/chocolate-cookies" />
                  </Field>
                </div>
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
                    <input name="packImageUrl" defaultValue={p.packImageUrl ?? ""} className="input" />
                  </Field>
                </div>
              </ActionForm>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-line pt-4">
                {p.packImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.packImageUrl}
                    alt={`${p.name} pack`}
                    title="Shown on a checkerboard: anything you can see the squares through is transparent"
                    className="h-28 w-28 rounded-lg border border-line object-contain"
                    style={{ backgroundImage: "repeating-conic-gradient(#e7e1d6 0% 25%, #fff 0% 50%)", backgroundSize: "14px 14px" }}
                    data-testid={`pack-preview-${p.slug}`}
                  />
                ) : null}
                {p.packImageUrl ? (
                  <PackCropper productId={p.id} productName={p.name} />
                ) : null}
                <ActionForm action={uploadPackImage} submitLabel="Upload pack photo" submitClassName="btn-secondary">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="label" htmlFor={`file-${p.id}`}>
                    Original pack photo (placed into images unchanged; a transparent PNG cut-out works best)
                  </label>
                  <input id={`file-${p.id}`} name="file" type="file" accept="image/*" className="text-sm" />
                </ActionForm>
                <div className="w-full space-y-3 border-t border-line pt-4" data-testid={`photos-${p.slug}`}>
                  <p className="label">More product photos</p>
                  <p className="hint">Back of pack, product out of the pack, jar open, a few pieces on a plate… The workspace can place any of these into images unchanged, and shows them on proposals.</p>
                  {p.photoAssetIds.length ? (
                    <ul className="flex flex-wrap gap-3">
                      {p.photoAssetIds.map((aid) => (
                        <li key={aid} className="w-28 space-y-1 text-xs">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/assets/${aid}`} alt={photoInfo.get(aid)?.label || "Product photo"} className="h-28 w-28 rounded-lg border border-line bg-surface-2 object-contain" />
                          <p className="truncate">{photoInfo.get(aid)?.label}</p>
                          {p.packImageUrl !== `/api/assets/${aid}` ? (
                            <ActionForm action={usePhotoAsPack} submitLabel="Use as pack" submitClassName="text-xs font-semibold text-purple underline">
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="assetId" value={aid} />
                            </ActionForm>
                          ) : (
                            <p className="text-xs font-semibold text-leaf">Used as pack</p>
                          )}
                          <ActionForm action={removeProductPhoto} submitLabel="Remove" submitClassName="text-xs font-semibold text-red underline">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="assetId" value={aid} />
                          </ActionForm>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <ActionForm action={uploadProductPhoto} submitLabel="Add photo" submitClassName="btn-secondary" className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="block">
                      <span className="label">What it shows</span>
                      <input name="label" className="input" maxLength={80} placeholder="e.g. Cookies out of the pack" />
                    </label>
                    <label className="block">
                      <span className="label">Photo</span>
                      <input name="file" type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Product photo for ${p.name}`} />
                    </label>
                  </ActionForm>
                </div>
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
            <div className="md:col-span-2">
              <Field label="Ads we like (examples the AI matches for voice)" hint="Paste 2–5 of your best ads or scripts. The AI copies the voice and specificity, not the lines.">
                <textarea name="exampleAds" defaultValue={brand.exampleAds} rows={10} className="input font-serif" />
              </Field>
            </div>
            <Field label="Words and phrases to never use" hint="One per line. Overused ad clichés make everything sound generic.">
              <textarea name="avoidPhrases" defaultValue={brand.avoidPhrases} rows={8} className="input" />
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

      <Section id="brand-kit" title="Brand kit" intro="Logo, colours and fonts used when you add text and logo to images (Add text & logo).">
        <BrandKitEditor initial={brand.kit} />
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
      <Section
        id="roles"
        title="Team roles"
        intro="Viewer: look and check copy. Creator: make and edit ads. Approver: sign off claims and approve. Admin: settings and roles."
      >
        {roleRows.length === 0 ? (
          <p className="rounded-xl border border-amber/30 bg-amber-bg p-3 text-sm text-amber" data-testid="roles-off">
            Roles are off: everyone who can sign in is an admin. Adding the first person turns roles on (you&apos;re added as an admin automatically). Anyone not listed then gets the {ROLE_LABELS[(process.env.DEFAULT_ROLE as keyof typeof ROLE_LABELS) in ROLE_LABELS ? (process.env.DEFAULT_ROLE as keyof typeof ROLE_LABELS) : "creator"]} role.
          </p>
        ) : null}
        <p className="hint">
          With the shared team password, people are identified by the name they type (e.g. “Priya” becomes priya@team.studio), so anyone who knows the password can type an approver&apos;s name. For roles you can rely on, use Google sign-in or email links.
        </p>
        {roleRows.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="roles-list">
            {roleRows.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span className="text-sm">
                  <strong>{r.email}</strong> <span className="chip ml-2">{ROLE_LABELS[r.role]}</span>
                </span>
                {isAdmin && r.email !== user ? (
                  <ActionForm action={removeUserRole} submitLabel="Remove" submitClassName="btn-secondary px-2 py-1 text-xs">
                    <input type="hidden" name="email" value={r.email} />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {isAdmin ? (
          <ActionForm action={setUserRole} submitLabel="Save role" className="card grid gap-3 sm:grid-cols-[1fr_12rem]" testId="role-form">
            <Field label="Email">
              <input name="email" type="text" className="input" placeholder="priya@purferme.com or priya@team.studio" required />
            </Field>
            <Field label="Role">
              <select name="role" className="input" defaultValue="creator">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="hint sm:col-span-2">{ROLES.map((r) => `${ROLE_LABELS[r]}: ${ROLE_HINTS[r]}`).join(" ")}</p>
          </ActionForm>
        ) : null}
      </Section>
    </div>
  );
}
