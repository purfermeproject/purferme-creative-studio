import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";
import { isAllowedEmail } from "@/lib/allowlist";

/** Dev sign-in is for local runs and tests only; it is never enabled on Vercel. */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && !process.env.VERCEL;

const providers: Provider[] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);
if (process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM) {
  providers.push(Resend({ from: process.env.AUTH_EMAIL_FROM }));
}
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev sign-in",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        return isAllowedEmail(email) ? { id: email, email, name: email.split("@")[0] } : null;
      },
    }),
  );
}

export const providerIds = providers.map((p) => (typeof p === "function" ? p().id : p.id));

const config: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login", verifyRequest: "/login?sent=1", error: "/login" },
  callbacks: {
    // Only allowlisted team emails get in, whatever the provider.
    signIn: ({ user, profile }) => isAllowedEmail(user?.email ?? profile?.email),
    authorized: ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) return true;
      return isAllowedEmail(auth?.user?.email);
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

/** For server actions and route handlers: returns the signed-in email or throws. */
export async function requireUser(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) throw new Error("You need to sign in with a team email to do that.");
  return email.toLowerCase();
}
