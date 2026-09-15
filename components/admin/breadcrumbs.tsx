import Link from "next/link";
import { routeLabel } from "./nav";

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  // Build cumulative crumbs starting at /admin.
  const start = parts[0] === "admin" ? 1 : 0;
  const crumbs = parts.slice(start).map((_, i) => {
    const href = "/" + parts.slice(0, start + i + 1).join("/");
    return { href, label: routeLabel(href) };
  });
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
      <ol className="flex items-center gap-1">
        <li><Link href="/admin" className="hover:underline">Admin</Link></li>
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link href={c.href} className="hover:underline">{c.label}</Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
