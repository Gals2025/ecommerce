"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_NAV, type NavSection } from "./nav";
import type { Permission } from "@/lib/permissions";
import { rolesHavePermission } from "@/lib/permissions";
import type { AppRole } from "@/lib/auth";

function visible(
  sections: NavSection[],
  roles: AppRole[]
): NavSection[] {
  const can = (perms?: Permission[]) => !perms || perms.some((p) => rolesHavePermission(roles, p));
  return sections
    .map((s) => {
      if (!can(s.permissions)) return null;
      const items = s.items.filter((i) => can(i.permissions ?? s.permissions));
      return items.length > 0 ? { ...s, items } : null;
    })
    .filter((s): s is NavSection => s !== null);
}

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ roles, onNavigate }: { roles: AppRole[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = visible(ADMIN_NAV, roles);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    // Sections containing the active route start expanded.
    const init: Record<string, boolean> = {};
    for (const s of sections) {
      if (s.items.some((i) => isActive(pathname, i.href))) init[s.label] = true;
    }
    return init;
  });
  return (
    <nav className="flex flex-col gap-4" aria-label="Admin">
      {sections.map((s) => {
        const expanded = open[s.label] ?? false;
        const hasActive = s.items.some((i) => isActive(pathname, i.href));
        if (s.items.length === 1 && s.label === "Overview") {
          const item = s.items[0];
          return (
            <Link
              key={s.label}
              href={item.href}
              onClick={onNavigate}
              className={cn("rounded-md px-2 py-1.5 text-sm font-medium", isActive(pathname, item.href) && "bg-black text-white")}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <div key={s.label}>
            <button
              onClick={() => setOpen((o) => ({ ...o, [s.label]: !expanded }))}
              aria-expanded={expanded}
              className={cn("flex w-full items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500", hasActive && "text-black")}
            >
              {s.label}
              <span aria-hidden>{expanded ? "▾" : "▸"}</span>
            </button>
            {expanded && (
              <div className="mt-1 flex flex-col gap-0.5">
                {s.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={isActive(pathname, i.href) ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-sm",
                      isActive(pathname, i.href) ? "bg-black font-medium text-white" : "hover:bg-gray-100"
                    )}
                  >
                    {i.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
