import { headers } from "next/headers";
import { auth, type AppRole } from "./auth";
import { db } from "@/db";
import { userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rolesHavePermission, type Permission } from "./permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

// Authenticated user or throw. Use for any customer-or-staff action.
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

// Multi-role: resolves roles via user_roles join table.
export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.name as AppRole);
}

async function deny(userId: string | null, action: string, detail: unknown) {
  const { audit } = await import("./audit");
  await audit(userId, action, "auth", userId ?? "anonymous", detail).catch(() => {});
  throw new Error("Forbidden");
}

export async function requireRole(allowed: AppRole[]) {
  const session = await requireUser().catch(() => null);
  if (!session?.user) throw new Error("Unauthorized");
  const held = await getUserRoles(session.user.id);
  // Bootstrap: grant-less users are customers.
  const effective = held.length > 0 ? held : (["CUSTOMER"] as AppRole[]);
  if (!allowed.some((r) => effective.includes(r))) {
    await deny(session.user.id, "auth.forbidden", { allowed, held: effective });
  }
  return { ...session, roles: effective };
}

export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const held = await getUserRoles(userId);
  const effective = held.length > 0 ? held : (["CUSTOMER"] as AppRole[]);
  return rolesHavePermission(effective, permission);
}

export async function requirePermission(permission: Permission) {
  const session = await requireUser().catch(() => null);
  if (!session?.user) throw new Error("Unauthorized");
  const ok = await hasPermission(session.user.id, permission);
  if (!ok) await deny(session.user.id, "auth.forbidden", { permission });
  return session;
}

export async function requireAdmin() {
  return requireRole(["ADMIN", "SUPER_ADMIN"]);
}

export async function requireStaff() {
  return requireRole(["ORDER_STAFF", "INVENTORY_STAFF", "ADMIN", "SUPER_ADMIN"]);
}
