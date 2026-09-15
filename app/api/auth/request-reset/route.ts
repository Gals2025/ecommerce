import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { queueEmail } from "@/lib/email";
import { passwordResetEmail } from "@/emails";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  // Always generic 200 — no user enumeration.
  if (!parsed.success) return NextResponse.json({ ok: true });
  const email = parsed.data.email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.deletedAt) {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { subject, html } = passwordResetEmail(`${appUrl}/reset-password?token=${raw}`);
    await queueEmail({ to: user.email, template: "password_reset", subject, html, userId: user.id }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
