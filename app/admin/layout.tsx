import { getStrictAdminSession, getUserRoles } from "@/lib/rbac";
import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

const STAFF_ROLES: AppRole[] = ["ORDER_STAFF", "INVENTORY_STAFF", "ADMIN", "SUPER_ADMIN"];

// Strict 8h admin session: access JWT only, no refresh fallback.
// Expired access forces explicit re-login even with a valid refresh token.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) redirect("/login?next=/admin&expired=1");
  const held: AppRole[] = await getUserRoles(session.user.id).catch(() => []);
  if (!held.some((r) => STAFF_ROLES.includes(r))) {
    return <div className="p-8 text-sm">Forbidden — staff role required.</div>;
  }
  return <AdminShell roles={held}>{children}</AdminShell>;
}
