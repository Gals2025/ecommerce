import Link from "next/link";
import { getActivePromos, getCategoriesTree } from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const cats = await getCategoriesTree().catch(() => []);
  const promos = await getActivePromos().catch(() => []);
  const autos = promos.filter((p) => p.type === "auto");
  const codes = promos.filter((p) => p.type === "code");
  return (
    <div className="min-h-screen bg-stone-50">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">Promotions</h1>
        <p className="mt-1 text-sm text-stone-500">Automatic discounts apply at checkout. Code promos are entered on the checkout page.</p>
        {autos.length > 0 && (
          <section className="mt-5">
            <h2 className="font-display text-lg font-semibold text-stone-900">Automatic — no code needed</h2>
            <div className="mt-2 space-y-2">
              {autos.map((p) => (
                <div key={p.id} className="rounded-2xl border border-stone-200/80 bg-white p-4 text-sm shadow-soft">
                  <div className="font-medium text-stone-900">{p.name}</div>
                  <div className="text-xs text-stone-500">
                    {p.kind === "percent" ? `${p.value}% off` : p.kind === "fixed" ? `Save ₱${((p.value ?? 0) / 100).toFixed(2)}` : p.kind}
                    {(p.minSpend ?? 0) > 0 ? ` • min. spend ₱${((p.minSpend ?? 0) / 100).toFixed(2)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {codes.length > 0 && (
          <section className="mt-5">
            <h2 className="font-display text-lg font-semibold text-stone-900">Code promos</h2>
            <div className="mt-2 space-y-2">
              {codes.map((p) => (
                <div key={p.id} className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm shadow-soft">
                  <div className="font-medium text-stone-900">{p.name}</div>
                  <div className="text-xs text-stone-500">Enter the code at checkout to claim.</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {promos.length === 0 && <p className="mt-4 text-sm text-stone-500">No active promotions right now. Check back soon.</p>}
        <Link href="/shop" className="mt-5 inline-block rounded-full bg-emerald-700 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800">Shop now</Link>
      </main>
      <StoreFooter />
    </div>
  );
}
