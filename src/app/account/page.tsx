import type { Metadata } from "next";
import { requireUser, roleOf } from "@/auth";
import { ActionForm } from "@/components/ActionForm";
import { ROLE_HINTS, ROLE_LABELS } from "@/lib/roles";
import { deleteMyAccount } from "./actions";

export const metadata: Metadata = { title: "Your account · Puŕ Fermé Creative Studio" };

export default async function Account() {
  const email = await requireUser();
  const role = await roleOf(email);
  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="account">
      <div>
        <p className="eyebrow">Your account</p>
        <h1 className="display text-3xl">{email}</h1>
        <p className="mt-1 text-ink-soft">
          Role: <strong>{ROLE_LABELS[role]}</strong> · {ROLE_HINTS[role]}
        </p>
      </div>
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Delete your account</h2>
        <p className="text-sm text-ink-soft">
          This removes your role and sign-in records and signs you out. What you made (creatives, plans, images) stays with the team, marked with your email. To stop someone signing in again, an admin also removes them from the team list or the allowed emails.
        </p>
        <ActionForm action={deleteMyAccount} submitLabel="Delete my account" submitClassName="btn-danger" confirm="Delete your account? You'll be signed out." className="space-y-2">
          <label className="block text-sm">
            <span className="label">Type your email to confirm</span>
            <input name="confirm" className="input" autoComplete="off" placeholder={email} />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
