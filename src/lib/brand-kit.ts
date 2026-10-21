/** Brand kit used by the text & logo overlay. Stored on brand_settings.kit. */
export type BrandFont = { name: string; url: string | null };
export type BrandKit = {
  logoUrl: string | null;
  colors: { primary: string; accent: string; text: string; band: string };
  headingFont: BrandFont;
  bodyFont: BrandFont;
};

export const DEFAULT_BRAND_KIT: BrandKit = {
  logoUrl: null,
  colors: { primary: "#2d1b54", accent: "#c8862a", text: "#ffffff", band: "#2d1b54" },
  headingFont: { name: "Bricolage Grotesque", url: null },
  bodyFont: { name: "Literata", url: null },
};

const HEX = /^#[0-9a-f]{6}$/i;

export function withKitDefaults(k: Partial<BrandKit> | null | undefined): BrandKit {
  const d = DEFAULT_BRAND_KIT;
  const c = { ...d.colors, ...(k?.colors ?? {}) };
  for (const key of Object.keys(c) as (keyof BrandKit["colors"])[]) if (!HEX.test(c[key])) c[key] = d.colors[key];
  return {
    logoUrl: k?.logoUrl ?? null,
    colors: c,
    headingFont: k?.headingFont?.name ? k.headingFont : d.headingFont,
    bodyFont: k?.bodyFont?.name ? k.bodyFont : d.bodyFont,
  };
}

export const isHexColor = (v: string) => HEX.test(v);
