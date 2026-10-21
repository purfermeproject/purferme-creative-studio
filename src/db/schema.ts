import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { CreativeStatus, Platform, ProductStatus, Role, Severity } from "@/lib/types";
import type { ScanResult } from "@/lib/compliance";
import type { VerdictThresholds } from "@/lib/verdicts";
import { DEFAULT_AVOID_PHRASES, DEFAULT_EXAMPLE_ADS } from "@/lib/creative-defaults";
import { DEFAULT_BRAND_KIT, type BrandKit } from "@/lib/brand-kit";
import type { ImageStyle } from "@/lib/image-prompt";
import type { CompetitorAnalysis, ListingInsight, MarketplaceResearch, Proposal } from "@/lib/schemas";

export type ClaimEvidence = { claim: string; evidence: string; source?: string };
export type ProductUrl = { label: string; url: string };

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  priceText: text("price_text").notNull().default(""),
  status: text("status").$type<ProductStatus>().notNull().default("ready"),
  statusReason: text("status_reason").notNull().default(""),
  greenClaims: text("green_claims").array().notNull().default([]),
  amberClaims: text("amber_claims").array().notNull().default([]),
  redClaims: text("red_claims").array().notNull().default([]),
  notes: text("notes").notNull().default(""),
  allergens: text("allergens").notNull().default(""),
  // Taste, texture, pack look, real eating moments, real review lines: the specifics that make ads non-generic.
  story: text("story").notNull().default(""),
  packImageUrl: text("pack_image_url"),
  /** Structured product knowledge used by generation and validation. */
  ingredients: text("ingredients").notNull().default(""),
  messagingPriorities: text("messaging_priorities").array().notNull().default([]),
  claimEvidence: jsonb("claim_evidence").$type<ClaimEvidence[]>().notNull().default([]),
  productUrls: jsonb("product_urls").$type<ProductUrl[]>().notNull().default([]),
  /** Extra real product photos (pack back, product out of pack, jar open…). Placed into images unchanged, like the pack. */
  photoAssetIds: uuid("photo_asset_ids").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single row (id = 1). Angle/persona/language lists and verdict thresholds live
// here too so the team can edit them in Admin.
export const brandSettings = pgTable("brand_settings", {
  id: integer("id").primaryKey().default(1),
  brandContext: text("brand_context").notNull().default(""),
  hardRules: text("hard_rules").notNull().default(""),
  tone: text("tone").notNull().default(""),
  angles: text("angles").array().notNull().default([]),
  personas: text("personas").array().notNull().default([]),
  languages: text("languages").array().notNull().default([]),
  exampleAds: text("example_ads").notNull().default(DEFAULT_EXAMPLE_ADS),
  avoidPhrases: text("avoid_phrases").notNull().default(DEFAULT_AVOID_PHRASES),
  kit: jsonb("kit").$type<BrandKit>().notNull().default(DEFAULT_BRAND_KIT),
  /** Photography direction for generated images (empty fields use the defaults). */
  imageStyle: jsonb("image_style").$type<Partial<ImageStyle>>(),
  verdictThresholds: jsonb("verdict_thresholds").$type<VerdictThresholds>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComparisonRow = { row: string; value: string };

export const platformRules = pgTable("platform_rules", {
  platform: text("platform").$type<Platform>().primaryKey(),
  creativeTypes: text("creative_types").array().notNull().default([]),
  rules: text("rules").notNull().default(""),
  guideMarkdown: text("guide_markdown").notNull().default(""),
  comparison: jsonb("comparison").$type<ComparisonRow[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complianceTerms = pgTable("compliance_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  regex: text("regex").notNull(),
  severity: text("severity").$type<Severity>().notNull(),
  platform: text("platform").$type<Platform>(),
  productSlug: text("product_slug"),
  active: boolean("active").notNull().default(true),
});

export type Frame = { slot: string; visual: string; onscreen: string; audio?: string };
export type CopyVariant = { headline: string; body: string; cta: string };
export type CopyBlock = { headline?: string; body?: string; body_alt?: string; cta?: string; variants?: CopyVariant[] };
/** How a creative was made: kept for audit and for learning from results later. */
export type GenerationMeta = {
  provider?: string;
  model?: string;
  mock?: boolean;
  promptHash?: string;
  prompt?: string;
  sourceAssetIds?: string[];
  proposal?: { title: string; big_idea: string };
  competitorId?: string;
  /** Competitors whose research shaped this ad. */
  landscapeBrands?: string[];
  generatedAt?: string;
};
export type ClaimUsed = { text: string; tier: "green" | "amber" };

export const creatives = pgTable("creatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: text("platform").$type<Platform>().notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  creativeType: text("creative_type").notNull(),
  /** e.g. Instagram Reels, Instagram Stories, Instagram Feed post (Meta). */
  placement: text("placement").notNull().default(""),
  title: text("title").notNull(),
  persona: text("persona").notNull().default(""),
  angle: text("angle").notNull().default(""),
  format: text("format").notNull().default(""),
  language: text("language").notNull().default(""),
  hook: text("hook").notNull().default(""),
  frames: jsonb("frames").$type<Frame[]>().notNull().default([]),
  copy: jsonb("copy").$type<CopyBlock>().notNull().default({}),
  aiPrompt: text("ai_prompt").notNull().default(""),
  needsRealPerson: boolean("needs_real_person").notNull().default(false),
  aiLabelNeeded: boolean("ai_label_needed").notNull().default(false),
  claims: jsonb("claims").$type<ClaimUsed[]>().notNull().default([]),
  whyItFits: text("why_it_fits").notNull().default(""),
  scanResult: jsonb("scan_result").$type<ScanResult>().notNull().default({ hits: [] }),
  status: text("status").$type<CreativeStatus>().notNull().default("Draft"),
  qaChecked: integer("qa_checked").array().notNull().default([]),
  imageIds: uuid("image_ids").array().notNull().default([]),
  /** awareness | consideration | conversion | retargeting | launch | festive */
  objective: text("objective").notNull().default(""),
  /** concept | ugc | copy */
  deliverable: text("deliverable").notNull().default("concept"),
  generationMeta: jsonb("generation_meta").$type<GenerationMeta>().notNull().default({}),
  /** Bumped on every content change; used to detect edits made elsewhere. */
  revision: integer("revision").notNull().default(1),
  claimsReviewedBy: text("claims_reviewed_by").notNull().default(""),
  claimsReviewedAt: timestamp("claims_reviewed_at", { withTimezone: true }),
  approvedBy: text("approved_by").notNull().default(""),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Editable content of a creative at a point in time (see src/lib/versions.ts). */
export type CreativeSnapshot = {
  title: string;
  hook: string;
  persona: string;
  angle: string;
  format: string;
  language: string;
  frames: Frame[];
  copy: CopyBlock;
  aiPrompt: string;
  needsRealPerson: boolean;
  aiLabelNeeded: boolean;
  claims: ClaimUsed[];
  whyItFits: string;
};

export const creativeVersions = pgTable("creative_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  creativeId: uuid("creative_id")
    .notNull()
    .references(() => creatives.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").$type<CreativeSnapshot>().notNull(),
  /** generated | autosave | manual | restore | regenerated */
  source: text("source").notNull().default("autosave"),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("creative_versions_creative_idx").on(t.creativeId, t.revision)]);

/** Competitor ads the team collects, with an AI breakdown used to brief differentiated ideas. */
export const competitorAds = pgTable("competitor_ads", {
  id: uuid("id").primaryKey().defaultRandom(),
  brand: text("brand").notNull(),
  product: text("product").notNull().default(""),
  /** Where it ran: free text (Instagram, Amazon, YouTube…). */
  channel: text("channel").notNull().default(""),
  adText: text("ad_text").notNull().default(""),
  link: text("link").notNull().default(""),
  notes: text("notes").notNull().default(""),
  imageAssetId: uuid("image_asset_id"),
  /** The product it was first researched for (kept for older rows; see productIds). */
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  /** Every one of our products it competes with (a brand can compete with several). */
  productIds: uuid("product_ids").array().notNull().default([]),
  /** manual = a team member added it; research = found by web search. */
  source: text("source").notNull().default("manual"),
  /** Category searched and what the search focused on (research only). */
  category: text("category").notNull().default(""),
  focus: text("focus").notNull().default(""),
  /** Web pages the research is based on. verified = the URL came back from the search tool itself. */
  sources: jsonb("sources").$type<{ title: string; url: string; verified: boolean }[]>().notNull().default([]),
  /** Their marketplace listing as researched (Amazon/Flipkart), if any. */
  listing: jsonb("listing").$type<ListingInsight & { platform: "amazon" | "flipkart" }>(),
  analysis: jsonb("analysis").$type<CompetitorAnalysis>(),
  analysisModel: text("analysis_model").notNull().default(""),
  analysedAt: timestamp("analysed_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Ideas proposed for one product on one platform by a research run, kept so any can be developed later. */
export const ideaSets = pgTable("idea_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  platform: text("platform").$type<Platform>().notNull(),
  creativeType: text("creative_type").notNull(),
  placement: text("placement").notNull().default(""),
  proposals: jsonb("proposals").$type<(Proposal & { scan: ScanResult })[]>().notNull(),
  mock: boolean("mock").notNull().default(false),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Category-level findings from a competitor search, kept so creation can use them later. */
export const categoryResearch = pgTable("category_research", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  summary: text("summary").notNull().default(""),
  gaps: text("gaps").array().notNull().default([]),
  model: text("model").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** "What's working" on Amazon or Flipkart for a category, from researching the top listings. */
export const marketPlaybooks = pgTable("market_playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: text("platform").$type<"amazon" | "flipkart">().notNull(),
  category: text("category").notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  summary: text("summary").notNull().default(""),
  playbook: jsonb("playbook").$type<MarketplaceResearch["playbook"]>().notNull(),
  sources: jsonb("sources").$type<{ title: string; url: string; verified: boolean }[]>().notNull().default([]),
  model: text("model").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Team roles. While this table is empty everyone is an admin (see src/lib/roles.ts). */
export const userRoles = pgTable("user_roles", {
  email: text("email").primaryKey(),
  role: text("role").$type<Role>().notNull(),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const results = pgTable("results", {
  id: uuid("id").primaryKey().defaultRandom(),
  creativeId: uuid("creative_id").references(() => creatives.id, { onDelete: "set null" }),
  platform: text("platform").$type<Platform>().notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  metrics: jsonb("metrics").$type<Record<string, number | string | null>>().notNull().default({}),
  verdict: text("verdict").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generationLogs = pgTable("generation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  user: text("user").notNull(),
  kind: text("kind").notNull().default("generate"),
  platform: text("platform").$type<Platform>(),
  productId: uuid("product_id"),
  promptHash: text("prompt_hash").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generated images, stored in the database so they work without extra storage setup. */
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  mime: text("mime").notNull(),
  dataBase64: text("data_base64").notNull(),
  prompt: text("prompt").notNull().default(""),
  model: text("model").notNull().default(""),
  /** generated | overlay | upload | edit | resize | logo | font | pack */
  kind: text("kind").notNull().default("generated"),
  label: text("label").notNull().default(""),
  width: integer("width"),
  height: integer("height"),
  /** Which scene of the concept this image shows (storyboards). */
  frameIndex: integer("frame_index"),
  /** Assets this one was made from (e.g. the locked pack photo composited into a scene). */
  sourceAssetIds: uuid("source_asset_ids").array().notNull().default([]),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Auth.js tables (needed for email magic-link verification tokens) ----

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export type Product = typeof products.$inferSelect;
export type BrandSettings = typeof brandSettings.$inferSelect;
export type PlatformRule = typeof platformRules.$inferSelect;
export type ComplianceTerm = typeof complianceTerms.$inferSelect;
export type Creative = typeof creatives.$inferSelect;
export type Result = typeof results.$inferSelect;
export type CreativeVersion = typeof creativeVersions.$inferSelect;
export type CompetitorAd = typeof competitorAds.$inferSelect;
export type MarketPlaybook = typeof marketPlaybooks.$inferSelect;
