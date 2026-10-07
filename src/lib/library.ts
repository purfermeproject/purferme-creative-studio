import "server-only";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { CREATIVE_STATUSES, isPlatform, type CreativeStatus, type Platform } from "./types";

export type LibraryFilters = { platform: Platform | "all"; productId: string; status: CreativeStatus | ""; q: string };

export function parseFilters(sp: Record<string, string | string[] | undefined>, fallbackPlatform: Platform): LibraryFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const p = one("platform");
  const s = one("status");
  return {
    platform: p === "all" ? "all" : isPlatform(p) ? p : fallbackPlatform,
    productId: /^[0-9a-f-]{36}$/i.test(one("product")) ? one("product") : "",
    status: (CREATIVE_STATUSES as readonly string[]).includes(s) ? (s as CreativeStatus) : "",
    q: one("q").trim().slice(0, 200),
  };
}

export async function queryCreatives(f: LibraryFilters) {
  const where: SQL[] = [];
  if (f.platform !== "all") where.push(eq(schema.creatives.platform, f.platform));
  if (f.productId) where.push(eq(schema.creatives.productId, f.productId));
  if (f.status) where.push(eq(schema.creatives.status, f.status));
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    where.push(
      or(
        ilike(schema.creatives.title, like),
        ilike(schema.creatives.hook, like),
        ilike(schema.creatives.persona, like),
        ilike(schema.creatives.angle, like),
        ilike(schema.creatives.language, like),
        sql`${schema.creatives.copy}::text ilike ${like}`,
        sql`${schema.creatives.frames}::text ilike ${like}`,
      )!,
    );
  }
  return db
    .select({ creative: schema.creatives, productName: schema.products.name, productSlug: schema.products.slug })
    .from(schema.creatives)
    .leftJoin(schema.products, eq(schema.creatives.productId, schema.products.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.creatives.createdAt))
    .limit(500);
}
