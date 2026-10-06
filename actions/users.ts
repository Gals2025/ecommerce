"use server";

import { db } from "@/db";
import { refreshSessions, roles, userRoles, users } from "@/db/schema";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { getUserRoles, requirePermission } from "@/lib/rbac";
import { canGrant, filterGrantable } from "@/lib/permissions";
import { hashPassword, newUserId, type AppRole } from "@/lib/auth";
import { adminSetPasswordSchema, createUserSchema, listUsersParamsSchema } from "@/validators";
import { audit } from "@/lib/audit";

export type UserWithRoles = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  roles: AppRole[];
};

async function roleMaps() {
  const allRoles = await db.select().from(roles);
  const nameById = new Map(allRoles.map((r) => [r.id, r.name as AppRole]));
  const idByName = new Map(allRoles.map((r) => [r.name as AppRole, r.id]));
  return { nameById, idByName };
}

// Paginated, searchable user list. Requires users.view (ADMIN, SUPER_ADMIN).
export async function listUsers(input: unknown): Promise<{
  users: UserWithRoles[];
  total: number;
  page: number;
  pageSize: number;
  myRoles: AppRole[];
  grantable: AppRole[];
}> {
  const session = await requirePermission("users.view");
  const params = listUsersParamsSchema.parse(input ?? {});
  const q = params.q.trim();
  const like = `%${q}%`;

  const conds = [isNull(users.deletedAt)];
  if (q) {
    const match = or(ilike(users.email, like), ilike(users.name, like));
    if (match) conds.push(match);
  }
  const where = and(...conds);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(200);

  const { nameById } = await roleMaps();
  const grants = await db.select().from(userRoles);
  let mapped: UserWithRoles[] = rows.map((u) => ({
    ...u,
    roles: grants
      .filter((g) => g.userId === u.id)
      .map((g) => nameById.get(g.roleId)!)
      .filter(Boolean),
  }));

  if (params.role) {
    mapped =
      params.role === "CUSTOMER"
        ? mapped.filter((u) => u.roles.length === 0)
        : mapped.filter((u) => u.roles.includes(params.role!));
  }

  const total = mapped.length;
  const start = (params.page - 1) * params.pageSize;
  const page = mapped.slice(start, start + params.pageSize);

  const myRoles = await getUserRoles(session.user.id);
  const allCreatable: AppRole[] = ["SUPER_ADMIN", "ADMIN", "ORDER_STAFF", "INVENTORY_STAFF", "CUSTOMER"];
  return {
    users: page,
    total,
    page: params.page,
    pageSize: params.pageSize,
    myRoles,
    grantable: filterGrantable(myRoles, allCreatable),
  };
}

// Hierarchical user creation. Requires users.create; each requested role must
// rank strictly below the creator's max rank (no privilege escalation).
export async function createUser(input: unknown): Promise<{ id: string; email: string }> {
  const session = await requirePermission("users.create");
  const data = createUserSchema.parse(input);
  const held = await getUserRoles(session.user.id);

  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();

  const denied = data.roles.filter((r) => !canGrant(held, r as AppRole));
  if (denied.length > 0) {
    await audit(session.user.id, "auth.forbidden", "users", session.user.id, {
      action: "user.create",
      email,
      denied,
      held,
    }).catch(() => {});
    throw new Error(`Forbidden: cannot assign role(s): ${denied.join(", ")}`);
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) throw new Error("Email already registered");

  const storedRoles = (data.roles as AppRole[]).filter((r) => r !== "CUSTOMER");
  const { idByName } = await roleMaps();
  for (const r of storedRoles) {
    if (!idByName.has(r)) throw new Error(`Unknown role ${r}`);
  }

  const id = newUserId();
  const passwordHash = await hashPassword(data.password);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email, name, passwordHash });
    for (const r of storedRoles) {
      await tx.insert(userRoles).values({
        userId: id,
        roleId: idByName.get(r)!,
        grantedBy: session.user.id,
      });
    }
  });

  await audit(session.user.id, "user.create", "users", id, {
    email,
    roles: storedRoles.length > 0 ? storedRoles : ["CUSTOMER (implicit)"],
  });
  for (const r of storedRoles) {
    await audit(session.user.id, "role.grant", "users", id, { role: r, targetEmail: email }).catch(() => {});
  }
  return { id, email };
}

// SUPER_ADMIN-only: set any user's password directly (staff, customers, self).
// No current-password check — the admin defines the new password outright.
// Revokes the target's refresh sessions and audits; never logs the password.
export async function adminSetPassword(input: unknown): Promise<{ id: string; email: string }> {
  const session = await requirePermission("users.view");
  const held = await getUserRoles(session.user.id);
  if (!held.includes("SUPER_ADMIN")) {
    await audit(session.user.id, "auth.forbidden", "users", session.user.id, {
      action: "user.password_reset",
      held,
    }).catch(() => {});
    throw new Error("Forbidden: SUPER_ADMIN only");
  }
  const data = adminSetPasswordSchema.parse(input);
  const [target] = await db.select().from(users).where(eq(users.id, data.userId)).limit(1);
  if (!target || target.deletedAt) throw new Error("User not found");

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, target.id));
  // Revoke the target's refresh sessions so their other devices re-login.
  // Any live 8h access JWT stays valid until expiry (stateless).
  await db.delete(refreshSessions).where(eq(refreshSessions.userId, target.id));
  await audit(session.user.id, "user.password_reset", "users", target.id, {
    targetEmail: target.email,
  });
  return { id: target.id, email: target.email };
}
