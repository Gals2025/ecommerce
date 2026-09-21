"use client";
import { useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const { data } = useSession(true);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const user = data?.user;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="User menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-medium text-white"
      >
        {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-md border bg-white p-3 text-sm shadow-lg">
          <div className="font-medium">{user?.name ?? "Staff"}</div>
          <div className="truncate text-xs text-stone-500">{user?.email}</div>
          <button
            className="mt-3 w-full rounded-lg border border-stone-200 px-2 py-1 text-left text-sm transition hover:bg-stone-50"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
