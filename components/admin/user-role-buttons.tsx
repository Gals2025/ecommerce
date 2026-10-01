"use client";
import { useTransition, useState } from "react";
import { grantRole, revokeRole } from "@/actions/auth";
import type { AppRole } from "@/lib/auth";
import { Button } from "@/components/ui";

// Hierarchy-aware role buttons: only roles the viewer may grant get action
// buttons; higher roles the viewer cannot touch render as static badges.
export function UserRoleButtons({
  userId,
  roles,
  grantable,
  selfId,
}: {
  userId: string;
  roles: AppRole[];
  grantable: AppRole[];
  selfId: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const act = (fn: () => Promise<unknown>, label: string) =>
    start(async () => {
      try {
        await fn();
        setMsg(`${label} ok — refresh to see changes`);
      } catch (e) {
        setMsg(`Error: ${(e as Error).message}`);
      }
    });
  const locked = roles.filter((r) => !grantable.includes(r));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {locked.map((r) => (
        <span key={r} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500" title="Above your level — read-only">
          {r} 🔒
        </span>
      ))}
      {grantable.map((r) =>
        roles.includes(r) ? (
          <Button
            key={r}
            variant="utility"
            disabled={pending || (userId === selfId && r === "SUPER_ADMIN")}
            onClick={() => act(() => revokeRole(userId, r), `Revoked ${r}`)}
          >
            Revoke {r}
          </Button>
        ) : (
          <Button key={r} variant="utility" disabled={pending} onClick={() => act(() => grantRole(userId, r), `Granted ${r}`)}>
            Grant {r}
          </Button>
        )
      )}
      {msg && <span className="text-xs text-gray-500" role="status">{msg}</span>}
    </div>
  );
}
