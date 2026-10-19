import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb, schema } from "@/db";
import { checkTeamPassword, isAllowedEmail, teamIdentity, teamPasswordEnabled } from "@/lib/allowlist";

/**
 * AUTH_DISABLED=true skips sign-in entirely for local use: everyone is treated
 * as LOCAL_USER. Never honoured on Vercel, so a deployed app always needs login.
 */
export const authDisabled = process.env.AUTH_DISABLED === "true" && !process.env.VERCEL;
export const LOCAL_USER = "local@studio";

/** Dev sign-in is for local runs and tests only; it is never enabled on Vercel. */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && !process.env.VERCEL;

const providers: Provider[] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);
const emailLinks = Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM);
if (emailLinks) {
  providers.push(Resend({ from: process.env.AUTH_EMAIL_FROM }));
}
if (teamPasswordEnabled()) {
  providers.push(
    Credentials({
      id: "password",
      name: "Team password",
      credentials: { name: { label: "Your name", type: "text" }, password: { label: "Password", type: "password" } },
      authorize: async (creds) => {
        const ok = checkTeamPassword(String(creds?.password ?? ""));
        if (!ok) {
          // Slow down guessing.
          await new Promise((r) => setTimeout(r, 1000));
          return null;
        }
        const who = teamIdentity(String(creds?.name ?? ""));
        return { id: who.email, ...who };
      },
    }),
  );
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

// Credentials-type providers report id "credentials"; the custom id lives in options.
export const providerIds = providers.map((p) => {
  const cfg = (typeof p === "function" ? p() : p) as { id: string; options?: { id?: string } };
  return cfg.options?.id ?? cfg.id;
});

const config: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login", verifyRequest: "/login?sent=1", error: "/login" },
  callbacks: {
    // Only allowlisted team emails get in, whatever the provider.
    signIn: ({ user, profile }) => isAllowedEmail(user?.email ?? profile?.email),
    authorized: ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      if (authDisabled) return true;
      if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) return true;
      return isAllowedEmail(auth?.user?.email);
    },
  },
};

// Only email links need the database (to store one-time tokens). Google sign-in uses
// cookies only, so the app builds and runs auth without touching the database.
export const { handlers, auth, signIn, signOut } = NextAuth(() =>
  emailLinks
    ? {
        ...config,
        adapter: DrizzleAdapter(getDb(), {
          usersTable: schema.users,
          accountsTable: schema.accounts,
          sessionsTable: schema.sessions,
          verificationTokensTable: schema.verificationTokens,
        }),
      }
    : config,
);

/** For server actions and route handlers: returns the signed-in email or throws. */
export async function requireUser(): Promise<string> {
  if (authDisabled) return LOCAL_USER;
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) throw new Error("You need to sign in with a team email to do that.");
  return email.toLowerCase();
}

/** The signed-in email (or LOCAL_USER when sign-in is disabled), or null. */
export async function currentUser(): Promise<string | null> {
  if (authDisabled) return LOCAL_USER;
  const email = (await auth())?.user?.email;
  return email && isAllowedEmail(email) ? email.toLowerCase() : null;
}
