import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { refreshSessions } from "@/db/schema";
import { ACCESS_COOKIE, LEGACY_REFRESH_PATH, REFRESH_COOKIE, hashToken } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  const raw = store.get(REFRESH_COOKIE)?.value;
  if (raw) {
    await db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(eq(refreshSessions.tokenHash, hashToken(raw)));
  }
  const res = NextResponse.json({ ok: true });
  // Clear current Path=/ cookies plus legacy Path=/api/auth refresh cookies
  // left over from before the split-session fix.
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: LEGACY_REFRESH_PATH, maxAge: 0 });
  return res;
}
