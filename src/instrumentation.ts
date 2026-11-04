/** Server errors in pages and API routes are saved for the admins (Settings → Errors). */
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/error-log");
  const e = err as { message?: string; stack?: string; digest?: string };
  await recordError({ source: "server", where: `${request.method} ${request.path}`, message: e?.message ?? String(err), detail: e?.stack ?? "", digest: e?.digest });
}
