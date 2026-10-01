import { listUsers } from "@/actions/users";
import { getStrictAdminSession } from "@/lib/rbac";
import { PageGuard } from "@/components/admin/page-guard";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UserRoleButtons } from "@/components/admin/user-role-buttons";
import { DbUnreachable } from "@/components/ui/empty-state";
import { SearchInput, FilterBar } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";

const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "ORDER_STAFF", label: "Order Staff" },
  { value: "INVENTORY_STAFF", label: "Inventory Staff" },
  { value: "CUSTOMER", label: "Customer" },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const role = typeof sp.role === "string" && sp.role ? sp.role : null;
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;

  let data: Awaited<ReturnType<typeof listUsers>> | null = null;
  try {
    data = await listUsers({ q, role, page, pageSize: 20 });
  } catch {
    data = null;
  }
  const session = await getStrictAdminSession().catch(() => null);
  const selfId = session?.user.id ?? "";

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <PageGuard permission="users.view" page="/admin/users">
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-gray-600">
          Create staff accounts and manage role assignments. You can only assign roles below your own level — every change is audit-logged.
        </p>
        {!data ? (
          <DbUnreachable />
        ) : (
          <>
            <div className="mt-4">
              <CreateUserForm grantable={data.grantable} />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <SearchInput placeholder="Search name or email…" />
              <FilterBar name="role" label="Role" options={ROLE_OPTIONS} />
            </div>
            <div className="mt-4 space-y-2">
              {data.users.map((u) => (
                <div key={u.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">
                    {u.name} • {u.email}
                  </div>
                  <div className="text-gray-500">Roles: {u.roles.join(", ") || "CUSTOMER (implicit)"}</div>
                  <UserRoleButtons userId={u.id} roles={u.roles} grantable={data!.grantable} selfId={selfId} />
                </div>
              ))}
              {data.users.length === 0 && <p className="text-sm">No users found.</p>}
            </div>
            <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))} hrefFor={hrefFor} />
          </>
        )}
      </div>
    </PageGuard>
  );
}
