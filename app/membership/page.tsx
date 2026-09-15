import Link from "next/link";
import { getCategoriesTree, getMembershipTiers } from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { formatPHP } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const cats = await getCategoriesTree().catch(() => []);
  const tiers = await getMembershipTiers().catch(() => []);
  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold sm:text-2xl">Membership</h1>
        <p className="mt-1 text-sm text-gray-600">
          Shop more, save more. Your lifetime spend sets your tier, and your tier discount applies automatically at checkout.
        </p>
        <div className="mt-5 space-y-2">
          {tiers.map((t, i) => (
            <div key={t.id} className={`rounded-xl border p-4 ${i === tiers.length - 1 ? "border-black" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t.name}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-700">{t.discountPct}% off</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                {(t.minSpend ?? 0) > 0 ? `From ${formatPHP(t.minSpend ?? 0)} lifetime spend` : "Starting tier for every new member"}
              </div>
            </div>
          ))}
          {tiers.length === 0 && <p className="text-sm text-gray-500">Tiers coming soon.</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <Link href="/shop" className="rounded-full bg-black px-5 py-2 text-sm text-white">Start shopping</Link>
          <Link href="/account" className="rounded-full border px-5 py-2 text-sm">My tier</Link>
        </div>
      </main>
      <StoreFooter />
    </div>
  );
}
