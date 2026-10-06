import { getStrictAdminSession } from "@/lib/rbac";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export default async function ProfilePage() {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) {
    return <div className="text-sm">Sign in required — admin session expired after 8 hours. Please log in again.</div>;
  }
  return (
    <div>
      <h1 className="text-xl font-bold">Profile</h1>
      <p className="text-sm text-gray-600">
        {session.user.name} • {session.user.email}
      </p>
      <div className="mt-4 max-w-lg">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
