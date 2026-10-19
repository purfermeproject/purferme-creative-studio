export const PLATFORMS = ["meta", "amazon", "flipkart"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: "Meta",
  amazon: "Amazon",
  flipkart: "Flipkart",
};

/** Longer names for headings and the platform switch (Meta runs ads on Instagram and Facebook). */
export const PLATFORM_FULL_LABELS: Record<Platform, string> = {
  meta: "Instagram & Facebook (Meta)",
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

/** Lowest to highest. Each role can do everything the roles before it can. */
export const ROLES = ["viewer", "creator", "approver", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const OBJECTIVES = [
  { id: "awareness", label: "Awareness", hint: "Reach new people; make the brand memorable" },
  { id: "consideration", label: "Consideration", hint: "Clicks, saves and profile visits" },
  { id: "conversion", label: "Conversion", hint: "Purchases at a good cost" },
  { id: "retargeting", label: "Retargeting", hint: "Win back visitors and cart abandoners" },
  { id: "launch", label: "Launch", hint: "Introduce a new product or flavour" },
  { id: "festive", label: "Festive / sale", hint: "Diwali, gifting, sale events" },
] as const;
export type Objective = (typeof OBJECTIVES)[number]["id"];

export const DELIVERABLES = [
  { id: "concept", label: "Ad concept", hint: "Scenes, on-screen text, copy and visual direction" },
  { id: "ugc", label: "UGC script", hint: "Creator brief with spoken lines and shot list" },
  { id: "copy", label: "Ad copy set", hint: "Primary text, headlines and CTA variants" },
] as const;
export type Deliverable = (typeof DELIVERABLES)[number]["id"];
