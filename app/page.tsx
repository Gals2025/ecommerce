import {
  getActivePromos,
  getBestSellers,
  getCategoriesTree,
  getMemberDiscountPct,
  getMembershipTiers,
  getVisibleProducts,
} from "@/features/catalog/storefront";
import { getSession } from "@/lib/rbac";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import {
  CategoryRail,
  Hero,
  MembershipBanner,
  ProductRow,
  PromoSplit,
} from "@/components/store/home-sections";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession().catch(() => null);
  const memberPct = await getMemberDiscountPct(session?.user.id ?? null).catch(() => null);
  const categories = await getCategoriesTree().catch(() => []);
  const featured = await getVisibleProducts({ sort: "newest" }, 100, 0).catch(() => ({ items: [], total: 0 }));
  const featuredItems = featured.items.filter((i) => i.featured).slice(0, 10);
  const newArrivals = featured.items.slice(0, 10);
  let bestSellers = await getBestSellers(10).catch(() => []);
  if (bestSellers.length === 0) bestSellers = featuredItems.map((i) => ({ ...i, unitsSold: 0 }));
  const promos = await getActivePromos().catch(() => []);
  const tiers = await getMembershipTiers().catch(() => []);
  const topTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;

  const navCats = categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  const paddleCat = categories.find((c) => `${c.slug} ${c.name}`.toLowerCase().includes("paddle")) ?? null;

  return (
    <div className="min-h-screen bg-stone-50">
      <StoreHeader categories={navCats} />
      <main className="mx-auto max-w-6xl px-4">
        <div className="mt-4">
          <Hero paddleCategoryId={paddleCat?.id ?? null} />
        </div>

        <CategoryRail categories={categories} />

        <ProductRow
          title="Featured products"
          subtitle="Top picks to power your game."
          href="/shop"
          items={featuredItems}
          memberPct={memberPct}
        />

        <PromoSplit
          promos={promos.slice(0, 4).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            kind: p.kind,
            value: p.value,
            endAt: p.endAt,
          }))}
        />

        <ProductRow
          title="Best sellers"
          subtitle="Loved by players. Trusted on court."
          href="/shop?sort=bestselling"
          linkLabel="View all"
          items={bestSellers}
          memberPct={memberPct}
          rankFrom={1}
        />

        <ProductRow
          title="New arrivals"
          subtitle="Fresh gear, just landed."
          href="/shop?sort=newest"
          linkLabel="View all"
          items={newArrivals}
          memberPct={memberPct}
        />

        <MembershipBanner
          tiers={tiers.slice(0, 4).map((t) => ({ id: t.id, name: t.name, discountPct: t.discountPct }))}
          topDiscount={topTier?.discountPct ?? null}
        />
      </main>
      <StoreFooter categories={navCats} />
    </div>
  );
}
