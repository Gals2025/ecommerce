import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  hashToken,
  newRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type AppRole,
} from "./auth";
import { db } from "@/db";
import { refreshSessions, userRoles, roles, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { rolesHavePermission, type Permission } from "./permissions";

export type { AppRole };

export type Session = { user: { id: string; email: string; name: string } };

async function rotateRefresh(userId: string, rawRefresh: string) {
  const [row] = await db
    .select()
    .from(refreshSessions)
    .where(eq(refreshSessions.tokenHash, hashToken(rawRefresh)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt < new Date() || row.userId !== userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) return null;
  // Rotate: revoke old, insert new.
  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(eq(refreshSessions.id, row.id));
  const next = newRefreshToken();
  await db.insert(refreshSessions).values({
    userId,
    tokenHash: hashToken(next),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  const access = await signAccessToken({ sub: user.id, email: user.email, name: user.name });
  return { access, next, user };
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) {
    const claims = await verifyAccessToken(access);
    if (claims) return { user: { id: claims.sub, email: claims.email, name: claims.name } };
  }
  // Fallback: try refresh rotation (issues new pair via cookie update in route only;
  // server components just resolve the session without setting cookies).
  const rawRefresh = store.get(REFRESH_COOKIE)?.value;
  if (!rawRefresh) return null;
  const [row] = await db
    .select()
    .from(refreshSessions)
    .where(and(eq(refreshSessions.tokenHash, hashToken(rawRefresh)), isNull(refreshSessions.revokedAt)))
    .limit(1);
  if (!row || row.expiresAt < new Date()) return null;
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.deletedAt) return null;
  return { user: { id: user.id, email: user.email, name: user.name } };
}

// Authenticated user or throw. Use for any customer-or-staff action.
export async function requireUser(): Promise<Session> {
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

// Used by /api/auth/refresh route to rotate and return fresh tokens.
export async function rotateSessionFromRefresh(rawRefresh: string) {
  const [row] = await db
    .select()
    .from(refreshSessions)
    .where(eq(refreshSessions.tokenHash, hashToken(rawRefresh)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  return rotateRefresh(row.userId, rawRefresh);
}
