/** Shown while a page loads, so a slow page never looks frozen. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[90rem] space-y-4 px-4 py-8 sm:px-6" role="status" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
