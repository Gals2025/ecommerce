import { getStrictAdminSession, getUserRoles } from "@/lib/rbac";
import { rolesHavePermission, type Permission } from "@/lib/permissions";
import type { AppRole } from "@/lib/auth";

/**
 * Least-privilege gate for admin pages. The admin layout only proves "is
 * staff"; wrap each page's main return in this guard with the permission its
 * actions require. Denials are audit-logged. Early "DB not connected"
 * returns are intentionally left outside (they render no sensitive data).
 * Uses the strict 8h admin session (no refresh fallback).
 */
export async function PageGuard({
  permission,
  roles,
  page,
  children,
}: {
  permission?: Permission;
  roles?: AppRole[];
  page: string;
  children: React.ReactNode;
}) {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) return <div className="p-8 text-sm">Sign in required — admin session expired after 8 hours. Please log in again.</div>;
  const held = await getUserRoles(session.user.id).catch(() => [] as AppRole[]);
  const effective = held.length > 0 ? held : (["CUSTOMER"] as AppRole[]);
  const ok = permission
    ? rolesHavePermission(effective, permission)
    : (roles ?? []).some((r) => effective.includes(r));
  if (!ok) {
    const { audit } = await import("@/lib/audit");
    await audit(session.user.id, "auth.forbidden", "auth", session.user.id, { page, held: effective }).catch(() => {});
    return <div className="p-8 text-sm">Forbidden — insufficient permissions. This attempt has been logged.</div>;
  }
  return <>{children}</>;
}
