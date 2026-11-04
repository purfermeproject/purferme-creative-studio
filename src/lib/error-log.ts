import "server-only";
import { db, schema } from "@/db";

/** Saves an error for the admins (Settings → Errors). Never throws: logging must not cause another failure. */
export async function recordError(e: { source: "server" | "browser"; where?: string; message: string; detail?: string; user?: string | null; digest?: string }) {
  console.error(`[${e.source} error] ${e.where ?? ""} ${e.message}`, e.detail ?? "");
  try {
    await db.insert(schema.appErrors).values({
      source: e.source,
      where: (e.where ?? "").slice(0, 300),
      message: e.message.slice(0, 1000),
      detail: (e.detail ?? "").slice(0, 4000),
      user: (e.user ?? "").slice(0, 200),
      digest: (e.digest ?? "").slice(0, 100),
    });
  } catch (err) {
    console.error("couldn't save the error", err);
  }
}
