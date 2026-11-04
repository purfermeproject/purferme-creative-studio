import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · Puŕ Fermé Creative Studio" };

/** The rules for using the studio. Plain words; reviewed by the business before publishing widely. */
export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl space-y-4" data-testid="terms">
      <p className="eyebrow">Terms of use</p>
      <h1 className="display text-3xl">Using the Creative Studio</h1>
      <p className="text-ink-soft">Last updated 4 November 2026. For the Puŕ Fermé team and the people it invites.</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Access is personal: use your own sign-in and don&apos;t share it. Admins decide who gets in and what each person can do.</li>
        <li>AI output is a draft. Every claim, number and image must be checked by a person before it is published; the compliance checks support, but don&apos;t replace, review by a food-regulatory consultant.</li>
        <li>Upload only photos and material the company owns or is allowed to use. Don&apos;t upload customers&apos; personal data.</li>
        <li>What you create here belongs to the company.</li>
        <li>The studio is provided as is for internal use; features may change.</li>
      </ul>
      <p>Questions: ask the studio admin.</p>
    </article>
  );
}
