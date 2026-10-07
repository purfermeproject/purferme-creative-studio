import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, authDisabled, devLoginEnabled, providerIds, signIn } from "@/auth";

const ERRORS: Record<string, string> = {
  AccessDenied: "That email isn't on the team list. Ask an admin to add it to ALLOWED_EMAILS, then try again.",
  CredentialsSignin: "That email isn't on the team list. Ask an admin to add it to ALLOWED_EMAILS, then try again.",
  Verification: "That sign-in link has expired or was already used. Request a new one below.",
  Configuration: "Sign-in isn't configured yet. Check the auth environment variables in the README.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (authDisabled) redirect("/create");
  const session = await auth();
  if (session?.user?.email) redirect(params.callbackUrl ?? "/create");

  const redirectTo = params.callbackUrl ?? "/create";
  const error = params.error ? (ERRORS[params.error] ?? "Sign-in failed. Try again, or ask an admin to check the setup.") : null;
  const hasGoogle = providerIds.includes("google");
  const hasEmail = providerIds.includes("resend");

  async function withAuthErrors(fn: () => Promise<void>) {
    "use server";
    try {
      await fn();
    } catch (e) {
      if (e instanceof AuthError) redirect(`/login?error=${e.type}`);
      throw e;
    }
  }

  return (
    <div className="mx-auto max-w-md pt-10">
      <p className="text-sm font-semibold tracking-wide text-jaggery uppercase">Puŕ Fermé Project</p>
      <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-ragi">Creative Studio</h1>
      <p className="prose-serif mt-3 text-ink-soft">
        Ad concepts for Meta, Amazon and Flipkart, checked against the claims library before anything goes live. Team members only.
      </p>

      {params.sent ? (
        <p role="status" className="mt-6 rounded-xl border border-leaf/30 bg-green-bg p-4 text-leaf">
          Check your inbox for a sign-in link. It expires in 24 hours.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-6 rounded-xl border border-red/30 bg-red-bg p-4 text-red">
          {error}
        </p>
      ) : null}

      <div className="card mt-6 space-y-5">
        {hasGoogle ? (
          <form
            action={async () => {
              "use server";
              await withAuthErrors(() => signIn("google", { redirectTo }));
            }}
          >
            <button className="btn-primary w-full" type="submit">
              Sign in with Google
            </button>
          </form>
        ) : null}

        {hasEmail ? (
          <form
            action={async (fd: FormData) => {
              "use server";
              await withAuthErrors(() => signIn("resend", { email: String(fd.get("email") ?? ""), redirectTo }));
            }}
            className="space-y-2"
          >
            <label className="label" htmlFor="email">
              Work email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
            <button className="btn-secondary w-full" type="submit">
              Email me a sign-in link
            </button>
          </form>
        ) : null}

        {devLoginEnabled ? (
          <form
            action={async (fd: FormData) => {
              "use server";
              await withAuthErrors(() => signIn("dev", { email: String(fd.get("email") ?? ""), redirectTo }));
            }}
            className="space-y-2"
          >
            <label className="label" htmlFor="dev-email">
              Dev sign-in (local only)
            </label>
            <input id="dev-email" name="email" type="email" required className="input" placeholder="you@example.com" />
            <button className="btn-secondary w-full" type="submit">
              Sign in
            </button>
          </form>
        ) : null}

        {!hasGoogle && !hasEmail && !devLoginEnabled ? (
          <p className="hint">
            No sign-in method is configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or AUTH_RESEND_KEY and AUTH_EMAIL_FROM. The README explains how.
          </p>
        ) : null}
      </div>
    </div>
  );
}
