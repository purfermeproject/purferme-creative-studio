"use client";

import Link from "next/link";
import { useEffect } from "react";

/** What people see when a page breaks: a plain explanation, a reference for the admins, and a way back. */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.message || "Unknown error", where: typeof window === "undefined" ? "" : window.location.pathname, detail: error.stack ?? "", digest: error.digest ?? "" }),
    }).catch(() => {});
  }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-16 text-center" data-testid="error-screen">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display text-3xl">This page hit a problem</h1>
      <p className="text-ink-soft">Nothing you saved is lost. Try again; if it keeps happening, send the admins this reference so they can find it in Settings → Errors.</p>
      {error.digest ? <p className="font-mono text-sm">Reference: {error.digest}</p> : null}
      <div className="flex justify-center gap-3">
        <button type="button" className="btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/create" className="btn-secondary">
          Go to Create
        </Link>
      </div>
    </div>
  );
}
