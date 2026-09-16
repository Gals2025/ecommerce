import Link from "next/link";
import { formatPHP } from "@/lib/money";
import type { StoreProductCard } from "@/features/catalog/storefront";

export function Price({ centavos, className }: { centavos: number; className?: string }) {
  return <span className={className}>{formatPHP(centavos)}</span>;
}

export function StockBadge({ available, lowThreshold = 5 }: { available: number; lowThreshold?: number }) {
  if (available <= 0)
    return <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 ring-1 ring-inset ring-stone-200">Out of stock</span>;
  if (available <= lowThreshold)
    return <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">Only {available} left</span>;
  return <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200">In stock</span>;
}

export function ProductCard({
  item,
  memberPct,
  rank = null,
  featuredBadge = false,
}: {
  item: StoreProductCard;
  memberPct?: number | null;
  /** Best-seller rank (renders a #N badge). */
  rank?: number | null;
  /** Render a "Featured" badge (used outside ranked rows). */
  featuredBadge?: boolean;
}) {
  const memberPrice = memberPct ? Math.round(item.basePrice * (1 - memberPct / 100)) : null;
  const salePct =
    item.comparePrice != null && item.comparePrice > item.basePrice
      ? Math.round((1 - item.basePrice / item.comparePrice) * 100)
      : null;
  return (
    <Link
      href={`/products/${item.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft transition-all hover:shadow-lift"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
        {item.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverImage} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">No image</div>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {rank != null && (
            <span className="rounded bg-stone-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">#{rank}</span>
          )}
          {rank == null && featuredBadge && (
            <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[11px] font-medium text-white">Featured</span>
          )}
          {salePct != null && (
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-medium text-white">-{salePct}%</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {item.brandName && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{item.brandName}</div>}
        <div className="line-clamp-2 text-sm font-medium leading-snug text-stone-900">{item.name}</div>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <Price centavos={item.basePrice} className="font-semibold text-stone-900" />
          {item.comparePrice != null && item.comparePrice > item.basePrice && (
            <Price centavos={item.comparePrice} className="text-xs text-stone-400 line-through" />
          )}
        </div>
        {memberPrice != null && (
          <div className="text-xs text-emerald-700">Member price {formatPHP(memberPrice)}</div>
        )}
        <div className="pt-1"><StockBadge available={item.available} /></div>
      </div>
    </Link>
  );
}

export function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="font-display text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{title}</h2>
      {href && (
        <Link href={href} className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline">
          {linkLabel ?? "View all"}
        </Link>
      )}
    </div>
  );
}
