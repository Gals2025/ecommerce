import { PageGuard } from "@/components/admin/page-guard";
import { StubPage } from "@/components/admin/stub-page";

export default function UsersPage() {
  return (<PageGuard permission="users.manage_roles" page="/admin/users"><StubPage title="Users" description="Manage staff accounts and role assignments. Use Settings for role grants." /></PageGuard>);
}
