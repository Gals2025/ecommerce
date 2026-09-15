"use client";
import { useTransition, useState } from "react";
import { grantRole, revokeRole } from "@/actions/auth";
import type { AppRole } from "@/lib/auth";
import { Button } from "@/components/ui";

const MANAGEABLE: AppRole[] = ["ADMIN", "INVENTORY_STAFF", "ORDER_STAFF"];

export function RoleButtons({ userId, roles, selfId }: { userId: string; roles: AppRole[]; selfId: string }) {
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
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {MANAGEABLE.map((r) =>
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
          <Button
            key={r}
            variant="utility"
            disabled={pending}
            onClick={() => act(() => grantRole(userId, r), `Granted ${r}`)}
          >
            Grant {r}
          </Button>
        )
      )}
      {msg && <span className="text-xs text-gray-500" role="status">{msg}</span>}
    </div>
  );
}
