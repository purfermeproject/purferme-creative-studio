import { createHash, timingSafeEqual } from "node:crypto";

/** Everyone who signs in with the team password gets an address ending in this. */
export const TEAM_DOMAIN = "@team.studio";

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const teamPasswordEnabled = () => (process.env.TEAM_PASSWORD ?? "").length > 0;

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (teamPasswordEnabled() && e.endsWith(TEAM_DOMAIN)) return true;
  return allowedEmails().includes(e);
}

/** Constant-time comparison so the password can't be guessed by timing. */
export function checkTeamPassword(input: string): boolean {
  const expected = process.env.TEAM_PASSWORD ?? "";
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** "Priya S." -> "priya-s@team.studio", so Usage and saved ads show who did what. */
export function teamIdentity(name: string): { email: string; name: string } {
  const clean = name.trim().slice(0, 40) || "Team";
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
  return { email: `${slug}${TEAM_DOMAIN}`, name: clean };
}
