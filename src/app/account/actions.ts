"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser, roleOf, signOut } from "@/auth";
import { db, schema } from "@/db";
import type { ActionState } from "@/lib/action-state";

/**
 * Deletes the signed-in person's account: their role, sign-in records and sessions. What they made stays
 * with the team (it carries their email). The last admin can't delete themselves, so nobody is locked out.
 */
export async function deleteMyAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== user) {
    return { ok: false, message: "Type your email exactly to confirm." };
  }
  if ((await roleOf(user)) === "admin") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.userRoles)
      .where(and(eq(schema.userRoles.role, "admin"), ne(schema.userRoles.email, user)));
    if (Number(n) === 0) return { ok: false, message: "You're the only admin. Make someone else an admin in Settings → Team first, so the studio isn't left without one." };
  }
  await db.delete(schema.userRoles).where(eq(schema.userRoles.email, user));
  // Sign-in records (Google or email link); their accounts and sessions go with them.
  await db.delete(schema.users).where(eq(schema.users.email, user));
  await signOut({ redirect: false }).catch(() => undefined);
  redirect("/login?deleted=1");
}
