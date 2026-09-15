import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  cookieFlags,
  hashPassword,
  hashToken,
  newRefreshToken,
  newUserId,
  signAccessToken,
} from "@/lib/auth";
import { refreshSessions } from "@/db/schema";
import { queueEmail } from "@/lib/email";
import { welcomeEmail } from "@/emails";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.password);
  const id = newUserId();
  await db.insert(users).values({ id, email, name: parsed.data.name.trim(), passwordHash });

  const { subject, html } = welcomeEmail(parsed.data.name.trim());
  await queueEmail({ to: email, template: "welcome", subject, html, userId: id }).catch(() => {});

  const access = await signAccessToken({ sub: id, email, name: parsed.data.name.trim() });
  const rawRefresh = newRefreshToken();
  await db.insert(refreshSessions).values({
    userId: id,
    tokenHash: hashToken(rawRefresh),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });

  const res = NextResponse.json({ user: { id, email, name: parsed.data.name.trim() } });
  res.cookies.set(ACCESS_COOKIE, access, { ...cookieFlags(), maxAge: ACCESS_TTL_SECONDS });
  res.cookies.set(REFRESH_COOKIE, rawRefresh, { ...cookieFlags(true), maxAge: REFRESH_TTL_SECONDS });
  return res;
}
