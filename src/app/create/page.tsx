import { getBrand, getPlatformRule, getProducts } from "@/lib/data";
import { getPlatform } from "@/lib/platform";
import { PLATFORM_LABELS } from "@/lib/types";
import { CreateClient } from "./CreateClient";

export const metadata = { title: "Create ads · Puŕ Fermé Creative Studio" };

const INTRO = {
  meta: "Meta is a discovery feed: brief genuinely different concepts (persona, angle, format, setting, language), not small tweaks.",
  amazon: "Amazon is search intent: win the click and convert. Videos are 16:9 and muted, so on-screen text carries every message.",
  flipkart: "Flipkart is listing-led: the listing images are the ad. Banners need approval and matter most for sale events.",
};

export default async function CreatePage() {
  const platform = await getPlatform();
  const [products, brand, rule] = await Promise.all([getProducts(), getBrand(), getPlatformRule(platform)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Create ads for {PLATFORM_LABELS[platform]}</h1>
        <p className="prose-serif mt-1 text-ink-soft">{INTRO[platform]}</p>
      </div>
      <CreateClient
        key={platform}
        platform={platform}
        products={products.map((p) => ({ id: p.id, name: p.name, status: p.status, statusReason: p.statusReason, hasPackImage: Boolean(p.packImageUrl) }))}
        creativeTypes={rule.creativeTypes}
        angles={brand.angles}
        personas={brand.personas}
        languages={brand.languages}
      />
    </div>
  );
}
