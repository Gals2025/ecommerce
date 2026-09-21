import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export type AppRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "INVENTORY_STAFF"
  | "ORDER_STAFF"
  | "CUSTOMER";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
// Legacy path used before the split-session fix. Refresh cookies set with
// Path=/api/auth are invisible to page routes, which caused admin logouts.
export const LEGACY_REFRESH_PATH = "/api/auth";

function parseTtl(raw: string | undefined, fallbackSeconds: number): number {
  if (!raw) return fallbackSeconds;
  const t = raw.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : fallbackSeconds;
  }
  const m = t.match(/^(\d+)\s*([smhd])$/);
  if (!m) return fallbackSeconds;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return fallbackSeconds;
  const mult = m[2] === "s" ? 1 : m[2] === "m" ? 60 : m[2] === "h" ? 3600 : 86400;
  return n * mult;
}

// Admin: strict 8h access JWT, explicit re-login (refresh ignored for /admin).
// Customer: same 8h access + 30d sliding refresh, auto-renewed via middleware.
export const ACCESS_TTL_SECONDS = parseTtl(process.env.JWT_ACCESS_TTL, 8 * 3600); // 8h
export const REFRESH_TTL_SECONDS = parseTtl(
  process.env.JWT_CUSTOMER_REFRESH_TTL ?? process.env.JWT_REFRESH_TTL,
  30 * 24 * 3600
); // 30d
const BCRYPT_ROUNDS = 12;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required (see .env.example)");
  return new TextEncoder().encode(secret);
}

export type AccessClaims = { sub: string; email: string; name: string };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newUserId(): string {
  return `user_${randomUUID()}`;
}

export function cookieFlags(_isRefreshPath = false) {
  void _isRefreshPath; // kept for call-site compat; both cookies now use Path=/.
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // Both cookies use Path=/ so page routes (/, /admin, /account) receive
    // them. The old Path=/api/auth refresh cookie caused admin logouts.
    path: "/" as const,
  };
}
