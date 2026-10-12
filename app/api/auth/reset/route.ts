import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, refreshSessions, roles, userRoles, users } from "@/db/schema";
import { hashPassword, type AppRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(16), password: z.string().min(8).max(128) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return NextResponse.json({ error: "Reset link expired. Request a new one." }, { status: 400 });
  }
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password), updatedAt: new Date() }).where(eq(users.id, row.userId));
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
  // Revoke all refresh sessions so old devices re-login with the new password.
  await db.delete(refreshSessions).where(eq(refreshSessions.userId, row.userId));
  // Audit completion; flag staff resets for admin visibility. Never throws.
  try {
    const grants = await db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, row.userId));
    const held = grants.map((g) => g.name as AppRole);
    const isStaff = held.some((r) => (["ORDER_STAFF", "INVENTORY_STAFF", "ADMIN", "SUPER_ADMIN"] as AppRole[]).includes(r));
    await audit(row.userId, "auth.password_reset", "auth", row.userId, { via: isStaff ? "admin_or_storefront" : "storefront" });
  } catch {
    // audit is best-effort
  }
  return NextResponse.json({ ok: true });
}
