import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { UserFacingError } from "./ai";

/**
 * Per-person limits on paid AI work, counted from the usage log (so they hold across server instances):
 * images per hour and text/vision calls per hour. Set RATE_IMAGES_PER_HOUR / RATE_AI_PER_HOUR to change them.
 */
const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export async function checkRate(user: string, what: "image" | "ai"): Promise<void> {
  const max = what === "image" ? limit("RATE_IMAGES_PER_HOUR", 150) : limit("RATE_AI_PER_HOUR", 1500);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const kindFilter = what === "image" ? eq(schema.generationLogs.kind, "image") : sql`${schema.generationLogs.kind} <> 'image'`;
  let n = 0;
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.generationLogs)
      .where(and(eq(schema.generationLogs.user, user), gt(schema.generationLogs.createdAt, since), kindFilter));
    n = row?.n ?? 0;
  } catch (e) {
    // A failed count never blocks work.
    console.error("rate limit check failed", e);
    return;
  }
  if (n >= max) {
    throw new UserFacingError(
      what === "image"
        ? `You've made ${n} images in the last hour, the limit per person (it protects the OpenAI budget). Try again in a little while, or ask an admin to raise RATE_IMAGES_PER_HOUR.`
        : `You've made ${n} AI requests in the last hour, the limit per person. Try again in a little while, or ask an admin to raise RATE_AI_PER_HOUR.`,
    );
  }
}
