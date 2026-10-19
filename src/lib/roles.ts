import { ROLES, type Role } from "./types";

/** What each action needs. Roles are ordered: each one includes everything below it. */
export const ACTION_ROLE = {
  view: "viewer",
  generate: "creator",
  edit: "creator",
  review: "approver",
  approve: "approver",
  delete: "approver",
  settings: "admin",
  roles: "admin",
} as const satisfies Record<string, Role>;
export type Action = keyof typeof ACTION_ROLE;

export const ROLE_LABELS: Record<Role, string> = { viewer: "Viewer", creator: "Creator", approver: "Approver", admin: "Admin" };
export const ROLE_HINTS: Record<Role, string> = {
  viewer: "Can look at everything and check copy, but can't create or change ads.",
  creator: "Can create, edit and save ads and images, and enter results.",
  approver: "Creator, plus can sign off uncertain claims, approve, change status and delete ads.",
  admin: "Approver, plus can change settings, products, claims and roles.",
};

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);
export const atLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min);
export const can = (role: Role, action: Action) => atLeast(role, ACTION_ROLE[action]);

/**
 * Works out someone's role.
 * - Emails in ADMIN_EMAILS are always admins (so nobody can lock the team out).
 * - Someone listed in the roles table gets that role.
 * - While the roles table is empty, everyone is an admin: the app behaves as it did before roles existed.
 * - Otherwise unlisted people get DEFAULT_ROLE (creator unless set).
 */
export function resolveRole(opts: { email: string; listed: Role | null; totalListed: number; adminEmails: string[]; defaultRole?: string }): Role {
  const email = opts.email.trim().toLowerCase();
  if (opts.adminEmails.includes(email)) return "admin";
  if (opts.listed) return opts.listed;
  if (opts.totalListed === 0) return "admin";
  return isRole(opts.defaultRole) ? opts.defaultRole : "creator";
}

export function adminEmailsFromEnv(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export class ForbiddenError extends Error {}

export function forbiddenMessage(role: Role, action: Action): string {
  const needed = ACTION_ROLE[action];
  return `Your role (${ROLE_LABELS[role]}) can't do this. It needs ${ROLE_LABELS[needed]} or higher; ask an admin to change your role in Settings → Team roles.`;
}
