import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  cookieFlags,
} from "@/lib/auth";
import { rotateSessionFromRefresh } from "@/lib/rbac";

export async function POST() {
  const store = await cookies();
  const raw = store.get(REFRESH_COOKIE)?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });
  const rotated = await rotateSessionFromRefresh(raw);
  // Reuse detection: token valid shape but unknown/revoked → revoke family by user is
  // handled at login-reset time; here just reject.
  if (!rotated) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const res = NextResponse.json({ user: rotated.user });
  res.cookies.set(ACCESS_COOKIE, rotated.access, { ...cookieFlags(), maxAge: ACCESS_TTL_SECONDS });
  res.cookies.set(REFRESH_COOKIE, rotated.next, { ...cookieFlags(true), maxAge: REFRESH_TTL_SECONDS });
  return res;
}
