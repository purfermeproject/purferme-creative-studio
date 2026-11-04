import Link from "next/link";

/** A page that doesn't exist (an old link, a typo). */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-16 text-center" data-testid="not-found">
      <p className="eyebrow">404</p>
      <h1 className="display text-3xl">There&apos;s no page here</h1>
      <p className="text-ink-soft">The link may be old, or the creative or product may have been deleted.</p>
      <div className="flex justify-center gap-3">
        <Link href="/create" className="btn-primary">
          Go to Create
        </Link>
        <Link href="/library" className="btn-secondary">
          Open the Library
        </Link>
      </div>
    </div>
  );
}
