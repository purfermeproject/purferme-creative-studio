import Link from "next/link";
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
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="How it works">
        {[
          ["1", "Make", "Pick a product and type of ad. Get ready-to-shoot ideas, checked for risky claims."],
          ["2", "Save and approve", "Keep the ideas you like in Saved ads, then approve them."],
          ["3", "Learn", "After they run, enter the numbers in Results to see what to kill or scale."],
        ].map(([n, t, d]) => (
          <li key={n} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink">{n}</span>
            <span className="text-sm">
              <strong className="block">{t}</strong>
              <span className="text-ink-soft">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Create ads for {PLATFORM_LABELS[platform]}</h1>
        <p className="prose-serif mt-1 text-ink-soft">
          {INTRO[platform]}{" "}
          <Link href="/guide" className="font-sans text-sm font-semibold text-accent hover:underline">
            How {PLATFORM_LABELS[platform]} differs →
          </Link>
        </p>
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
