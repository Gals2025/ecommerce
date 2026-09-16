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
    <div className="min-h-screen bg-stone-50">
      <StoreHeader categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="relative mt-4 overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-50 via-white to-amber-50/60 shadow-soft">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-amber-100/50 blur-3xl" aria-hidden />
          <div className="relative px-6 py-12 sm:px-12 sm:py-16">
            {/*<p className="inline-flex items-center gap-2 rounded-full bg-emerald-700/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800 ring-1 ring-inset ring-emerald-700/15">Pickleball · Paddles · Apparel</p>*/}
            <h1 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-[1.08] tracking-tight text-stone-900 sm:text-5xl">
              GEAR UP, OWN THE COURT!
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-500 sm:text-base">
              Brand-new paddles, balls & court-ready apparel — with member prices and nationwide delivery.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/shop" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>
                Shop pickleball
              </Link>
              <Link href="/membership" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
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
                <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="group overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft transition-all hover:shadow-lift">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">🏓</div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-medium text-stone-900">{c.name}</div>
                    {c.children.length > 0 && (
                      <div className="mt-0.5 truncate text-xs text-stone-500">{c.children.map((k) => k.name).join(" • ")}</div>
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
          <section className="mt-8 rounded-3xl border border-amber-200/60 bg-amber-50 p-5 shadow-soft sm:p-6">
            <SectionHeader title="Promotions" href="/promotions" />
            <div className="grid gap-2 sm:grid-cols-2">
              {promos.slice(0, 4).map((p) => (
                <div key={p.id} className="rounded-2xl border border-amber-200/70 bg-white p-4 text-sm shadow-sm">
                  <div className="font-medium text-stone-900">{p.name}</div>
                  <div className="text-xs text-stone-500">
                    {p.kind === "percent" ? `${p.value}% off` : p.kind === "fixed" ? `Save ₱${((p.value ?? 0) / 100).toFixed(2)}` : p.kind} • {p.type === "auto" ? "auto-applied" : "use code at checkout"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Membership CTA */}
        <section className="mt-8 overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-soft">
          <div className="grid sm:grid-cols-2">
            <div className="p-5 sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Membership</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">Unlock member prices{topTier ? ` up to ${topTier.discountPct}% off` : ""}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                Earn tiers as you shop. Higher tiers mean bigger automatic discounts on every order.
              </p>
              <Link href="/membership" className={cn(buttonVariants({ variant: "primary" }), "mt-4 inline-block")}>
                Learn more
              </Link>
            </div>
            <div className="bg-stone-50 p-5 sm:p-8">
              <div className="space-y-2 text-sm">
                {tiers.slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white px-4 py-2.5 shadow-sm">
                    <span className="font-medium text-stone-900">{t.name}</span>
                    <span className="text-stone-500">{t.discountPct}% off</span>
                  </div>
                ))}
                {tiers.length === 0 && <p className="text-stone-500">Membership tiers coming soon.</p>}
              </div>
            </div>
          </div>
        </section>
      </main>
      <StoreFooter />
    </div>
  );
}
