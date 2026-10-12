import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, userRoles, roles, users } from "@/db/schema";
import { queueEmail } from "@/lib/email";
import { adminPasswordResetEmail, passwordResetEmail } from "@/emails";
import { audit } from "@/lib/audit";
import type { AppRole } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  context: z.enum(["admin", "storefront"]).optional(),
  // Legacy compat: callers may pass redirectTo instead of context.
  redirectTo: z.string().max(256).optional(),
});

const STAFF_ROLES: AppRole[] = ["ORDER_STAFF", "INVENTORY_STAFF", "ADMIN", "SUPER_ADMIN"];

// Basic in-memory throttle: 10 requests / 10 min per email+IP (anti-spam).
const hits = new Map<string, { count: number; resetAt: number }>();
function throttled(key: string): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  cur.count += 1;
  return cur.count > 10;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  // Always generic 200 — no user enumeration.
  if (!parsed.success) return NextResponse.json({ ok: true });
  const email = parsed.data.email.toLowerCase().trim();
  const wantsAdmin =
    parsed.data.context === "admin" ||
    (parsed.data.redirectTo ?? "").startsWith("/admin");
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (throttled(`${email}:${ip}`)) return NextResponse.json({ ok: true });
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.deletedAt) {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    // Staff-aware link: admin requests resolve back toward the admin login.
    // Role lookup stays server-side so the generic response never leaks
    // whether an email belongs to staff.
    let isStaff = false;
    try {
      const grants = await db
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, user.id));
      isStaff = grants.some((g) => (STAFF_ROLES as string[]).includes(g.name));
    } catch {
      isStaff = false;
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const useAdminLink = wantsAdmin && isStaff;
    const resetUrl = useAdminLink
      ? `${appUrl}/reset-password?token=${raw}&next=/admin`
      : `${appUrl}/reset-password?token=${raw}`;
    const { subject, html } = useAdminLink
      ? adminPasswordResetEmail(resetUrl)
      : passwordResetEmail(resetUrl);
    await queueEmail({ to: user.email, template: "password_reset", subject, html, userId: user.id }).catch(() => {});
    await audit(null, "auth.password_reset_request", "auth", user.id, {
      context: useAdminLink ? "admin" : "storefront",
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
