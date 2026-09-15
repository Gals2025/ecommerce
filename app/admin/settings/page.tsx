import { listUsersWithRoles } from "@/actions/auth";
import { getSession, getUserRoles } from "@/lib/rbac";
import type { AppRole } from "@/lib/auth";
import { RoleButtons } from "./role-buttons";
import { DbUnreachable } from "@/components/ui/empty-state";

export default async function SettingsPage() {
  const session = await getSession().catch(() => null);
  if (!session?.user) return <div className="text-sm">Sign in required.</div>;
  const held: AppRole[] = await getUserRoles(session.user.id).catch(() => []);
  if (!held.includes("SUPER_ADMIN")) {
    const { audit } = await import("@/lib/audit");
    await audit(session.user.id, "auth.forbidden", "auth", session.user.id, { page: "/admin/settings", held }).catch(() => {});
    return <div className="p-2 text-sm">Forbidden — SUPER_ADMIN only. This attempt has been logged.</div>;
  }
  let users: Awaited<ReturnType<typeof listUsersWithRoles>> = [];
  try {
    users = await listUsersWithRoles();
  } catch {
    return <DbUnreachable />;
  }
  return (
    <div>
      <h1 className="text-xl font-bold">Settings — Super Admin</h1>
      <p className="text-sm text-gray-600">Role assignment. Every change is audit-logged.</p>
      <div className="mt-4 space-y-2">
        {users.map((u) => (
          <div key={u.id} className="rounded border p-3 text-sm">
            <div className="font-medium">{u.name} • {u.email}</div>
            <div className="text-gray-500">Roles: {u.roles.join(", ") || "CUSTOMER (implicit)"}</div>
            <RoleButtons userId={u.id} roles={u.roles} selfId={session.user.id} />
          </div>
        ))}
        {users.length === 0 && <p className="text-sm">No users.</p>}
      </div>
    </div>
  );
}
