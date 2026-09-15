"use server";

import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, getUserRoles } from "@/lib/rbac";
import type { AppRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const STAFF_ROLES: AppRole[] = ["ORDER_STAFF", "INVENTORY_STAFF", "ADMIN", "SUPER_ADMIN"];

// Where to send a user right after login.
export async function getPostLoginPath(): Promise<string> {
  const session = await requireUser();
  const held = await getUserRoles(session.user.id);
  await audit(session.user.id, "auth.login", "auth", session.user.id, { roles: held }).catch(() => {});
  return held.some((r) => STAFF_ROLES.includes(r)) ? "/admin" : "/";
}

export async function getMyRoles(): Promise<AppRole[]> {
  const session = await requireUser();
  return getUserRoles(session.user.id);
}

// SUPER_ADMIN only: grant a role. Audited.
export async function grantRole(targetUserId: string, role: AppRole) {
  const session = await requireUser();
  const held = await getUserRoles(session.user.id);
  if (!held.includes("SUPER_ADMIN")) {
    await audit(session.user.id, "auth.forbidden", "auth", targetUserId, { action: "role.grant", role }).catch(() => {});
    throw new Error("Forbidden");
  }
  const [roleRow] = await db.select().from(roles).where(eq(roles.name, role)).limit(1);
  if (!roleRow) throw new Error(`Unknown role ${role}`);
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw new Error("User not found");
  await db
    .insert(userRoles)
    .values({ userId: targetUserId, roleId: roleRow.id, grantedBy: session.user.id })
    .onConflictDoNothing();
  await audit(session.user.id, "role.grant", "users", targetUserId, { role, targetEmail: target.email });
  return true;
}

// SUPER_ADMIN only: revoke a role. Cannot revoke your own SUPER_ADMIN.
export async function revokeRole(targetUserId: string, role: AppRole) {
  const session = await requireUser();
  const held = await getUserRoles(session.user.id);
  if (!held.includes("SUPER_ADMIN")) {
    await audit(session.user.id, "auth.forbidden", "auth", targetUserId, { action: "role.revoke", role }).catch(() => {});
    throw new Error("Forbidden");
  }
  if (targetUserId === session.user.id && role === "SUPER_ADMIN") {
    throw new Error("Cannot revoke your own SUPER_ADMIN role");
  }
  const [roleRow] = await db.select().from(roles).where(eq(roles.name, role)).limit(1);
  if (!roleRow) throw new Error(`Unknown role ${role}`);
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, targetUserId), eq(userRoles.roleId, roleRow.id)));
  await audit(session.user.id, "role.revoke", "users", targetUserId, { role });
  return true;
}

// List users with their roles (SUPER_ADMIN only, for the settings page).
export async function listUsersWithRoles() {
  const session = await requireUser();
  const held = await getUserRoles(session.user.id);
  if (!held.includes("SUPER_ADMIN")) throw new Error("Forbidden");
  const all = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).limit(200);
  const grants = await db.select().from(userRoles);
  const allRoles = await db.select().from(roles);
  const nameById = new Map(allRoles.map((r) => [r.id, r.name as AppRole]));
  return all.map((u) => ({
    ...u,
    roles: grants.filter((g) => g.userId === u.id).map((g) => nameById.get(g.roleId)!).filter(Boolean),
  }));
}

