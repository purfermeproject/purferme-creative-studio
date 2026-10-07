export const PLATFORMS = ["meta", "amazon", "flipkart"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: "Meta",
  amazon: "Amazon",
  flipkart: "Flipkart",
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export const PRODUCT_STATUSES = ["ready", "hold", "blocked"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const SEVERITIES = ["red", "amber"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CREATIVE_STATUSES = [
  "Draft",
  "Approved",
  "In production",
  "Live",
  "Winner",
  "Killed",
] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];
