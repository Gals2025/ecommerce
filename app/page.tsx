import Link from "next/link";
import { getSession } from "@/lib/rbac";
import {
  getActivePromos,
  getBestSellers,
  getCategoriesTree,
  getMemberDiscountPct,
  getMembershipTiers,
  getVisibleProducts,
} from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ProductCard, SectionHeader } from "@/components/store/product-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession().catch(() => null);
  const memberPct = await getMemberDiscountPct(session?.user.id ?? null).catch(() => null);
  const categories = await getCategoriesTree().catch(() => []);
  const featured = await getVisibleProducts({ sort: "newest" }, 100, 0).catch(() => ({ items: [], total: 0 }));
  const featuredItems = featured.items.filter((i) => i.featured).slice(0, 8);
  const newArrivals = featured.items.slice(0, 8);
  let bestSellers = await getBestSellers(8).catch(() => []);
  if (bestSellers.length === 0) bestSellers = featuredItems.map((i) => ({ ...i, unitsSold: 0 }));
  const promos = await getActivePromos().catch(() => []);
  const tiers = await getMembershipTiers().catch(() => []);
  const topTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="mt-4 overflow-hidden rounded-2xl bg-gray-900 text-white">
          <div className="px-6 py-10 sm:px-10 sm:py-14">
            <p className="text-xs uppercase tracking-widest text-gray-300">New season essentials</p>
            <h1 className="mt-2 max-w-md text-2xl font-bold leading-tight sm:text-4xl">
              Everyday quality, delivered across the Philippines
            </h1>
            <p className="mt-2 max-w-md text-sm text-gray-300 sm:text-base">
              Shop apparel, accessories, and more — with member prices and nationwide delivery.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/shop" className={cn(buttonVariants({ variant: "primary" }), "bg-white text-black hover:bg-gray-100")}>
                Shop now
              </Link>
              <Link href="/membership" className={cn(buttonVariants({ variant: "primary" }), "border border-white/40 bg-transparent hover:bg-white/10")}>
                Membership
              </Link>
            </div>
          </div>
        </section>

        {/* Featured categories */}
        {categories.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="Shop by category" href="/shop" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {categories.slice(0, 4).map((c) => (
                <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="group overflow-hidden rounded-xl border bg-white hover:shadow-md">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-gray-50">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">🛍️</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium">{c.name}</div>
                    {c.children.length > 0 && (
                      <div className="mt-0.5 truncate text-xs text-gray-500">{c.children.map((k) => k.name).join(" • ")}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured products */}
        {featuredItems.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="Featured products" href="/shop" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {featuredItems.map((i) => <ProductCard key={i.id} item={i} memberPct={memberPct} />)}
            </div>
          </section>
        )}

        {/* New arrivals */}
        {newArrivals.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="New arrivals" href="/shop?sort=newest" linkLabel="View all" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {newArrivals.map((i) => <ProductCard key={i.id} item={i} memberPct={memberPct} />)}
            </div>
          </section>
        )}

        {/* Best sellers */}
        {bestSellers.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="Best sellers" href="/shop?sort=bestselling" linkLabel="View all" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {bestSellers.map((i) => <ProductCard key={i.id} item={i} memberPct={memberPct} />)}
            </div>
          </section>
        )}

        {/* Promotions */}
        {promos.length > 0 && (
          <section className="mt-8 rounded-2xl bg-amber-50 p-5 sm:p-6">
            <SectionHeader title="Promotions" href="/promotions" />
            <div className="grid gap-2 sm:grid-cols-2">
              {promos.slice(0, 4).map((p) => (
                <div key={p.id} className="rounded-xl border border-amber-200 bg-white p-3 text-sm">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-600">
                    {p.kind === "percent" ? `${p.value}% off` : p.kind === "fixed" ? `Save ₱${((p.value ?? 0) / 100).toFixed(2)}` : p.kind} • {p.type === "auto" ? "auto-applied" : "use code at checkout"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Membership CTA */}
        <section className="mt-8 overflow-hidden rounded-2xl border">
          <div className="grid sm:grid-cols-2">
            <div className="p-5 sm:p-8">
              <p className="text-xs uppercase tracking-widest text-gray-500">Membership</p>
              <h2 className="mt-1 text-xl font-bold sm:text-2xl">Unlock member prices{topTier ? ` up to ${topTier.discountPct}% off` : ""}</h2>
              <p className="mt-2 text-sm text-gray-600">
                Earn tiers as you shop. Higher tiers mean bigger automatic discounts on every order.
              </p>
              <Link href="/membership" className={cn(buttonVariants({ variant: "primary" }), "mt-4 inline-block")}>
                Learn more
              </Link>
            </div>
            <div className="bg-gray-50 p-5 sm:p-8">
              <div className="space-y-2 text-sm">
                {tiers.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-gray-600">{t.discountPct}% off</span>
                  </div>
                ))}
                {tiers.length === 0 && <p className="text-gray-500">Membership tiers coming soon.</p>}
              </div>
            </div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </div>
  );
}
