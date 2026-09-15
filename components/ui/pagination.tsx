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
    <nav className="mt-4 flex items-center gap-1.5 text-sm" aria-label="Pagination">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50">← Prev</Link>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? "page" : undefined}
          className={cn("rounded-full border px-3 py-1.5 shadow-sm transition", p === page ? "border-emerald-700 bg-emerald-700 font-medium text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50")}
        >
          {p}
        </Link>
      ))}
      {page < totalPages && (
        <Link href={hrefFor(page + 1)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50">Next →</Link>
      )}
    </nav>
  );
}
