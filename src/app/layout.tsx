import type { Metadata } from "next";
import { Bricolage_Grotesque, Literata } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Nav } from "@/components/Nav";
import { PlatformSwitch } from "@/components/PlatformSwitch";
import { getPlatform } from "@/lib/platform";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const literata = Literata({ subsets: ["latin"], variable: "--font-literata" });

export const metadata: Metadata = {
  title: "Puŕ Fermé Creative Studio",
  description: "Ad creatives for Meta, Amazon and Flipkart, checked against the claims library.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [platform, session] = await Promise.all([getPlatform(), auth()]);
  const email = session?.user?.email;

  return (
    <html lang="en" data-platform={platform} className={`${bricolage.variable} ${literata.variable}`}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="h-1.5 w-full bg-accent" aria-hidden />
        {email ? (
          <header className="border-b border-line bg-surface/80">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-4 pb-2 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <Link href="/create" className="group flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold tracking-tight text-ragi">Puŕ Fermé</span>
                  <span className="text-sm font-semibold text-jaggery">Creative Studio</span>
                </Link>
                <PlatformSwitch value={platform} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Nav />
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                  className="hidden shrink-0 items-center gap-2 text-sm text-ink-soft md:flex"
                >
                  <span className="max-w-48 truncate" title={email}>
                    {email}
                  </span>
                  <button type="submit" className="rounded-md px-2 py-1 font-semibold hover:bg-surface-2 hover:text-ink">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>
        ) : null}
        {email && process.env.ANTHROPIC_MOCK === "true" ? (
          <p className="bg-amber-bg px-4 py-1.5 text-center text-sm font-semibold text-amber">
            Mock AI mode: generation and checks return sample output, not real model responses (ANTHROPIC_MOCK=true).
          </p>
        ) : null}
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 text-sm text-ink-soft sm:px-6">
          <p className="border-t border-line pt-4">
            Compliance checks support, but don&apos;t replace, review by a food-regulatory consultant.
          </p>
        </footer>
      </body>
    </html>
  );
}
