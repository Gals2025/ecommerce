import Link from "next/link";
import { formatPHP } from "@/lib/money";
import type { StoreProductCard } from "@/features/catalog/storefront";

export function Price({ centavos, className }: { centavos: number; className?: string }) {
  return <span className={className}>{formatPHP(centavos)}</span>;
}

export function StockBadge({ available, lowThreshold = 5 }: { available: number; lowThreshold?: number }) {
  if (available <= 0)
    return <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Out of stock</span>;
  if (available <= lowThreshold)
    return <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Only {available} left</span>;
  return <span className="inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">In stock</span>;
}

export function ProductCard({
  item,
  memberPct,
}: {
  item: StoreProductCard;
  memberPct?: number | null;
}) {
  const memberPrice = memberPct ? Math.round(item.basePrice * (1 - memberPct / 100)) : null;
  return (
    <Link
      href={`/products/${item.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
        {item.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverImage} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">No image</div>
        )}
        {item.comparePrice != null && item.comparePrice > item.basePrice && (
          <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-medium text-white">Sale</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {item.brandName && <div className="text-xs uppercase tracking-widest text-gray-500">{item.brandName}</div>}
        <div className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</div>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <Price centavos={item.basePrice} className="font-semibold" />
          {item.comparePrice != null && item.comparePrice > item.basePrice && (
            <Price centavos={item.comparePrice} className="text-xs text-gray-400 line-through" />
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
      <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
      {href && (
        <Link href={href} className="text-sm text-gray-600 underline-offset-2 hover:underline">
          {linkLabel ?? "View all"}
        </Link>
      )}
    </div>
  );
}
