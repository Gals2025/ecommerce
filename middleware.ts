import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

async function hasValidAccess(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.JWT_SECRET;
  if (!secret) return true; // let page routes surface the config error
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

// Storefront-only silent renewal: customers stay logged in via 30d sliding
// refresh (manual logout ends it). Admin is excluded — 8h strict + explicit
// re-login, so a valid refresh token must never extend /admin.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }
  if (await hasValidAccess(req)) return NextResponse.next();
  if (!req.cookies.get(REFRESH_COOKIE)?.value) return NextResponse.next();

  try {
    const refreshRes = await fetch(new URL("/api/auth/refresh", req.url), {
      method: "POST",
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    if (!refreshRes.ok) return NextResponse.next();
    const res = NextResponse.next();
    // Merge rotated cookies (fresh 8h access + sliding 30d refresh).
    const setCookies =
      typeof refreshRes.headers.getSetCookie === "function"
        ? refreshRes.headers.getSetCookie()
        : (() => {
            const single = refreshRes.headers.get("set-cookie");
            return single ? [single] : [];
          })();
    for (const c of setCookies) res.headers.append("set-cookie", c);
    return res;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!admin|api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
