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
      <aside className="hidden w-64 shrink-0 border-r border-stone-200 bg-white p-4 lg:block">
        <Link href="/admin" className="flex items-baseline gap-2">
          <span className="font-display text-lg font-semibold tracking-tight">Pickle Unltd</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Admin</span>
        </Link>
        <div className="mt-4"><SidebarNav roles={roles} /></div>
        <div className="mt-6 border-t border-stone-200 pt-3 text-xs">
          <Link href="/" className="text-stone-500 transition hover:text-emerald-800">← Storefront</Link>
        </div>
      </aside>
      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto rounded-r-2xl bg-white p-4 shadow-lift">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-semibold">Pickle Unltd <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 align-middle text-[11px] font-sans font-semibold uppercase tracking-wider text-emerald-800">Admin</span></span>
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded border px-2 py-1 text-sm">✕</button>
            </div>
            <div className="mt-4"><SidebarNav roles={roles} onNavigate={() => setDrawer(false)} /></div>
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col bg-stone-50">
        {/* Top navigation */}
        <header className="flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur-md">
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
