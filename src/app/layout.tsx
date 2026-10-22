import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { authDisabled, currentUser, roleOf, signOut } from "@/auth";
import { ROLE_HINTS, ROLE_LABELS } from "@/lib/roles";
import { Nav } from "@/components/Nav";
import { PlatformSwitch } from "@/components/PlatformSwitch";
import { getPlatform } from "@/lib/platform";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "WONK", "opsz"] });

export const metadata: Metadata = {
  title: "Puŕ Fermé Creative Studio",
  description: "Ad creatives for Meta, Amazon and Flipkart, checked against the claims library.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [platform, email] = await Promise.all([getPlatform(), currentUser()]);
  const role = email ? await roleOf(email).catch(() => null) : null;

  return (
    <html lang="en" data-platform={platform} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="h-1 w-full bg-gradient-to-r from-purple via-caramel to-gold" aria-hidden />
        {email ? (
          <header className="border-b border-line bg-surface/90">
            <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
              <Link href="/create" className="flex items-baseline gap-2">
                <span className="font-serif text-2xl font-semibold tracking-tight text-purple">Puŕ Fermé</span>
                <span className="eyebrow hidden sm:inline">Creative Studio</span>
              </Link>
              <div className="order-3 w-full overflow-x-auto">
                <Nav />
              </div>
              <div className="ml-auto flex items-center gap-3">
                <PlatformSwitch value={platform} />
                {authDisabled ? (
                  <span className="hidden text-sm text-ink-soft lg:inline">Sign-in off (local)</span>
                ) : (
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}
                    className="flex shrink-0 items-center gap-2 text-sm text-ink-soft"
                  >
                    <span className="hidden max-w-40 truncate lg:inline" title={email}>
                      {email}
                    </span>
                    <button type="submit" className="rounded-md px-2 py-1 font-semibold hover:bg-surface-2 hover:text-ink">
                      Sign out
                    </button>
                  </form>
                )}
                {role ? (
                  <span className="chip border-purple/20 bg-accent-soft text-purple" title={ROLE_HINTS[role]} data-testid="role-chip">
                    {ROLE_LABELS[role]}
                  </span>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}
        {email && process.env.ANTHROPIC_MOCK === "true" ? (
          <p className="bg-amber-bg px-4 py-1.5 text-center text-sm font-semibold text-amber" data-testid="mock-banner">
            Mock AI mode: generation and checks return clearly labelled sample output, not real model responses (ANTHROPIC_MOCK=true).
          </p>
        ) : null}
        <main id="main" className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-[90rem] px-4 pb-10 text-sm text-ink-soft sm:px-6">
          <p className="border-t border-line pt-4">
            Compliance checks support, but don&apos;t replace, review by a food-regulatory consultant.
          </p>
        </footer>
      </body>
    </html>
  );
}
