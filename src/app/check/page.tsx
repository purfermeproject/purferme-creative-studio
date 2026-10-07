import { getProducts, getTerms } from "@/lib/data";
import { getPlatform } from "@/lib/platform";
import { PLATFORM_LABELS } from "@/lib/types";
import { CheckClient } from "./CheckClient";

export const metadata = { title: "Claim checker · Puŕ Fermé Creative Studio" };

export default async function CheckPage() {
  const [platform, products, terms] = await Promise.all([getPlatform(), getProducts(), getTerms()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Claim checker</h1>
        <p className="hint mt-1">
          Paste any copy. The instant scan uses the compliance terms for {PLATFORM_LABELS[platform]}; the deep check asks the model to review it against
          brand rules, product claims and Indian ad regulations.
        </p>
      </div>
      <CheckClient
        platform={platform}
        products={products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, status: p.status }))}
        terms={terms.filter((t) => t.active)}
      />
    </div>
  );
}
