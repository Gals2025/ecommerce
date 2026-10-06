"use server";

import { db } from "@/db";
import { refreshSessions, roles, userRoles, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser, getUserRoles } from "@/lib/rbac";
import { hashPassword, verifyPassword, type AppRole } from "@/lib/auth";
import { changePasswordSchema } from "@/validators";
import { canGrant, ROLE_RANK } from "@/lib/permissions";
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

// Hierarchical: may grant only roles strictly below your max rank.
// SUPER_ADMIN can grant anything; ADMIN can grant staff roles only.
export async function grantRole(targetUserId: string, role: AppRole) {
  const session = await requireUser();
  const held = await getUserRoles(session.user.id);
  if (!canGrant(held, role)) {
    await audit(session.user.id, "auth.forbidden", "auth", targetUserId, { action: "role.grant", role, held }).catch(() => {});
    throw new Error("Forbidden: cannot assign a role at or above your own level");
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

// Hierarchical revoke: may revoke only roles you could grant.
// Cannot revoke your own highest-rank role (prevents self-demotion).
export async function revokeRole(targetUserId: string, role: AppRole) {
  const session = await requireUser();
  const held = await getUserRoles(session.user.id);
  if (!canGrant(held, role)) {
    await audit(session.user.id, "auth.forbidden", "auth", targetUserId, { action: "role.revoke", role, held }).catch(() => {});
    throw new Error("Forbidden: cannot revoke a role at or above your own level");
  }
  if (targetUserId === session.user.id) {
    const myMax = Math.max(0, ...held.map((r) => ROLE_RANK[r] ?? 0));
    if ((ROLE_RANK[role] ?? 0) >= myMax) {
      throw new Error("Cannot revoke your own highest role");
    }
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

// Self-service: logged-in user changes their own password.
// Verifies the current password, then hashes + stores the new one,
// revokes all refresh sessions (other devices must re-login), and audits.
export async function changeOwnPassword(input: unknown) {
  const session = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user || user.deletedAt) throw new Error("Unauthorized");
  if (!user.passwordHash) {
    throw new Error("No password set — use forgot-password to create one");
  }
  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    await audit(session.user.id, "auth.forbidden", "auth", session.user.id, {
      action: "password.change",
      reason: "bad_current_password",
    }).catch(() => {});
    throw new Error("Current password is incorrect");
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, session.user.id));
  // Revoke all refresh sessions so other devices re-login with the new password.
  // The current admin tab keeps its 8h access JWT until expiry (stateless).
  await db.delete(refreshSessions).where(eq(refreshSessions.userId, session.user.id));
  await audit(session.user.id, "auth.password_change", "auth", session.user.id, {});
  return true;
}

