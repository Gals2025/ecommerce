import Link from "next/link";
import { cn } from "@/lib/cn";

export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );
  return (
    <nav className="mt-4 flex items-center gap-1 text-sm" aria-label="Pagination">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className="rounded border px-2 py-1">← Prev</Link>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? "page" : undefined}
          className={cn("rounded border px-2 py-1", p === page && "bg-black text-white")}
        >
          {p}
        </Link>
      ))}
      {page < totalPages && (
        <Link href={hrefFor(page + 1)} className="rounded border px-2 py-1">Next →</Link>
      )}
    </nav>
  );
}
