import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Puŕ Fermé Creative Studio" };

/** What the studio stores and who processes it. Plain words; reviewed by the business before publishing widely. */
export default function Privacy() {
  return (
    <article className="prose-studio mx-auto max-w-3xl space-y-4" data-testid="privacy">
      <p className="eyebrow">Privacy policy</p>
      <h1 className="display text-3xl">How the Creative Studio handles data</h1>
      <p className="text-ink-soft">Last updated 4 November 2026. This is an internal tool for the Puŕ Fermé team; it is not offered to the public.</p>
      <h2 className="text-xl font-semibold">What we store</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Your work email (or your name, for team-password sign-in) and your role, to let you in and show who made what.</li>
        <li>What you create: briefs, ad copy, listing plans, approvals and comments, with who did them and when.</li>
        <li>Images: product and pack photos you upload, and images the studio generates.</li>
        <li>A usage log (who ran which AI task, when, and its size) for cost tracking and per-person limits, and an error log so problems can be fixed.</li>
      </ul>
      <p>We don&apos;t use advertising trackers or sell data. Page analytics, if switched on, count visits without cookies.</p>
      <h2 className="text-xl font-semibold">Who processes it</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>The database host (Neon) and the app host (Vercel) store and serve the app.</li>
        <li>AI providers (Anthropic for text and checks, OpenAI for images) receive the prompts and images needed for each task. Don&apos;t put personal data about customers into briefs or uploads.</li>
        <li>Sign-in providers: Google, or Resend for email links, when those are used.</li>
      </ul>
      <h2 className="text-xl font-semibold">Keeping and deleting</h2>
      <p>Work is kept while the team needs it. You can delete your account in Your account; what you made stays with the team (marked with your email) unless an admin removes it. To ask what we hold about you or to have it removed, contact the studio admin.</p>
      <h2 className="text-xl font-semibold">Contact</h2>
      <p>Ask the studio admin (Tools → Settings → Team shows who that is).</p>
    </article>
  );
}
