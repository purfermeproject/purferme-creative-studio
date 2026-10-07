import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { CreativeStatus, Platform, ProductStatus, Severity } from "@/lib/types";
import type { ScanResult } from "@/lib/compliance";
import type { VerdictThresholds } from "@/lib/verdicts";

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
  packImageUrl: text("pack_image_url"),
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
export type CopyBlock = { headline?: string; body?: string; body_alt?: string; cta?: string };
export type ClaimUsed = { text: string; tier: "green" | "amber" };

export const creatives = pgTable("creatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: text("platform").$type<Platform>().notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  creativeType: text("creative_type").notNull(),
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
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
