import Link from "next/link";
import { getSession } from "@/lib/rbac";
import {
  getBrandsForShop,
  getCategoriesTree,
  getMemberDiscountPct,
  getPriceBounds,
  getVisibleProducts,
  type ShopFilter,
} from "@/features/catalog/shop";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { ProductCard } from "@/components/store/product-card";
import { Button, Input, Select, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function pageUrl(base: Record<string, string>, page: number) {
  const params = new URLSearchParams({ ...base, page: String(page) });
  return `/shop?${params.toString()}`;
}

const PAGE_SIZE = 24;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const q = first(raw.q);
  const categoryId = first(raw.categoryId) || null;
  const brandId = first(raw.brandId) || null;
  const sort = (["newest", "price", "price_desc", "name", "bestselling"] as const).includes(first(raw.sort) as "newest")
    ? (first(raw.sort) as ShopFilter["sort"])
    : "newest";
  const page = Math.max(1, Number(first(raw.page)) || 1);
  const minP = first(raw.minPrice) ? Math.round(Number(first(raw.minPrice)) * 100) : null;
  const maxP = first(raw.maxPrice) ? Math.round(Number(first(raw.maxPrice)) * 100) : null;
  const inStockOnly = first(raw.inStock) === "1";

  const session = await getSession().catch(() => null);
  const [cats, brands, bounds, memberPct] = await Promise.all([
    getCategoriesTree().catch(() => []),
    getBrandsForShop().catch(() => []),
    getPriceBounds().catch(() => ({ min: 0, max: 0 })),
    getMemberDiscountPct(session?.user.id ?? null).catch(() => null),
  ]);

  let items: Awaited<ReturnType<typeof getVisibleProducts>>["items"] = [];
  let total = 0;
  try {
    const res = await getVisibleProducts(
      {
        q: q || undefined, categoryId, brandId,
        minPrice: minP, maxPrice: maxP, inStockOnly, sort,
      },
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE
    );
    items = res.items;
    total = res.total;
  } catch {
    items = [];
  }

  const base: Record<string, string> = {};
  if (q) base.q = q;
  if (categoryId) base.categoryId = categoryId;
  if (brandId) base.brandId = brandId;
  if (sort !== "newest") base.sort = sort!;
  if (first(raw.minPrice)) base.minPrice = first(raw.minPrice);
  if (first(raw.maxPrice)) base.maxPrice = first(raw.maxPrice);
  if (inStockOnly) base.inStock = "1";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCat = cats.find((c) => c.id === categoryId);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <h1 className="text-xl font-bold sm:text-2xl">{activeCat ? activeCat.name : q ? `Results for “${q}”` : "Shop all"}</h1>
        <p className="text-sm text-gray-600">{total} product{total === 1 ? "" : "s"}</p>

        <form method="get" className="mt-3 grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-6">
          {q && <input type="hidden" name="q" value={q} />}
          <label className="text-xs">Category
            <Select name="categoryId" defaultValue={categoryId ?? ""}>
              <option value="">All</option>
              {cats.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name} (all)</option>
                  {c.children.map((k) => <option key={k.id} value={k.id}>— {k.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </label>
          <label className="text-xs">Brand
            <Select name="brandId" defaultValue={brandId ?? ""}>
              <option value="">All</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </label>
          <label className="text-xs">Min ₱
            <Input name="minPrice" defaultValue={first(raw.minPrice)} inputMode="decimal" min={0} placeholder={String(bounds.min / 100)} />
          </label>
          <label className="text-xs">Max ₱
            <Input name="maxPrice" defaultValue={first(raw.maxPrice)} inputMode="decimal" min={0} placeholder={String(bounds.max / 100)} />
          </label>
          <label className="text-xs">Sort
            <Select name="sort" defaultValue={sort}>
              <option value="newest">Newest</option>
              <option value="bestselling">Best selling</option>
              <option value="price">Price low–high</option>
              <option value="price_desc">Price high–low</option>
              <option value="name">Name A–Z</option>
            </Select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs">
            <input type="checkbox" name="inStock" value="1" defaultChecked={inStockOnly} className="h-5 w-5 shrink-0 accent-emerald-700" /> In stock only
          </label>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-6">
            <Button type="submit" variant="primary" size="md">Apply</Button>
            <Link href="/shop" className="inline-flex min-h-[44px] items-center py-1 text-sm text-gray-500 hover:underline">Reset</Link>
          </div>
        </form>

        {items.length === 0 ? (
          <div className="mt-6 text-sm text-gray-500">
            No products match your filters. <Link href="/shop" className="underline">Reset filters</Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((i) => <ProductCard key={i.id} item={i} memberPct={memberPct} />)}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          {page > 1 && <Link href={pageUrl(base, page - 1)} className={cn(buttonVariants({ variant: "utility" }), "no-underline")}>← Prev</Link>}
          {page < totalPages && <Link href={pageUrl(base, page + 1)} className={cn(buttonVariants({ variant: "utility" }), "no-underline")}>Next →</Link>}
        </div>
      </main>
      <StoreFooter categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
    </div>
  );
}
