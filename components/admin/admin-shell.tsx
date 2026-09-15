"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/lib/auth";
import { SidebarNav } from "./sidebar";
import { Breadcrumbs } from "./breadcrumbs";
import { UserMenu } from "./user-menu";
import { NotificationsButton } from "./notifications";

export function AdminShell({ roles, children }: { roles: AppRole[]; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r p-4 lg:block">
        <Link href="/admin" className="font-bold">Admin Portal 🇵🇭</Link>
        <div className="mt-4"><SidebarNav roles={roles} /></div>
        <div className="mt-6 border-t pt-3 text-xs">
          <Link href="/" className="text-gray-500 hover:underline">← Storefront</Link>
        </div>
      </aside>
      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold">Admin Portal 🇵🇭</span>
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded border px-2 py-1 text-sm">✕</button>
            </div>
            <div className="mt-4"><SidebarNav roles={roles} onNavigate={() => setDrawer(false)} /></div>
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top navigation */}
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded border px-2 py-1 text-sm lg:hidden">☰</button>
          <div className="min-w-0 flex-1"><Breadcrumbs pathname={pathname} /></div>
          <NotificationsButton />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
