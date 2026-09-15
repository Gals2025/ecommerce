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
  hashToken,
  newRefreshToken,
  signAccessToken,
  verifyPassword,
} from "@/lib/auth";
import { refreshSessions } from "@/db/schema";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Basic in-memory login throttle: 10 attempts / 10 min per email+IP.
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (throttled(`${email}:${ip}`)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.passwordHash || user.deletedAt) {
    // Generic message — existing Better Auth users have no hash after migration
    // and must use forgot-password to set one (force-reset policy).
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const access = await signAccessToken({ sub: user.id, email: user.email, name: user.name });
  const rawRefresh = newRefreshToken();
  await db.insert(refreshSessions).values({
    userId: user.id,
    tokenHash: hashToken(rawRefresh),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    ipAddress: ip.slice(0, 64),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 255),
  });
  await audit(user.id, "auth.login", "auth", user.id, {}).catch(() => {});

  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  res.cookies.set(ACCESS_COOKIE, access, { ...cookieFlags(), maxAge: ACCESS_TTL_SECONDS });
  res.cookies.set(REFRESH_COOKIE, rawRefresh, { ...cookieFlags(true), maxAge: REFRESH_TTL_SECONDS });
  return res;
}
