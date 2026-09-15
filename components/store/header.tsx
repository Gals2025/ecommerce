import Link from "next/link";
import { getSession } from "@/lib/rbac";
import { getCartLines } from "@/lib/cart";

export async function StoreHeader({ categories }: { categories: { name: string; slug: string; id: string }[] }) {
  const session = await getSession().catch(() => null);
  const userId = session?.user.id ?? null;
  let count = 0;
  try {
    const lines = await getCartLines(userId);
    count = lines.reduce((s, l) => s + l.qty, 0);
  } catch {
    count = 0;
  }
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-1.5 tracking-tight">
          <span className="font-display text-xl font-semibold">Pickle Unltd</span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 sm:inline">Small-batch</span>
        </Link>
        <form action="/shop" method="get" className="hidden min-w-0 flex-1 sm:block">
          <input
            name="q"
            placeholder="Search the pantry…"
            className="w-full rounded-full border border-stone-200 bg-stone-100/70 px-4 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15"
          />
        </form>
        <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/shop" className="hidden rounded-full px-3 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 sm:inline">Shop</Link>
          <Link href="/promotions" className="hidden rounded-full px-3 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:inline">Promos</Link>
          <Link href="/membership" className="hidden rounded-full px-3 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:inline">Membership</Link>
          <Link href="/account" className="rounded-full px-3 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900">{userId ? "Account" : "Sign in"}</Link>
          <Link href="/cart" className="relative rounded-full bg-stone-900 px-4 py-2 font-medium text-white transition hover:bg-emerald-800">
            Cart{count > 0 && <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-semibold text-white">{count}</span>}
          </Link>
        </nav>
      </div>
      <div className="border-t border-stone-200/70 sm:hidden">
        <form action="/shop" method="get" className="mx-auto max-w-6xl px-4 py-2">
          <input
            name="q"
            placeholder="Search the pantry…"
            className="w-full rounded-full border border-stone-200 bg-stone-100/70 px-4 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15"
          />
        </form>
      </div>
      {categories.length > 0 && (
        <nav className="overflow-x-auto border-t border-stone-200/70">
          <div className="mx-auto flex max-w-6xl gap-1 whitespace-nowrap px-4 py-1.5 text-[13px] text-stone-500">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="rounded-full px-2.5 py-1 transition hover:bg-emerald-50 hover:text-emerald-800">
                {c.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

export function StoreFooter() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 text-sm sm:grid-cols-4">
        <div>
          <div className="font-display text-lg font-semibold">Pickle Unltd</div>
          <p className="mt-2 text-stone-500">Small-batch pickles, delivered across the Philippines.</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Shop</div>
          <div className="mt-2 flex flex-col gap-1.5 text-stone-600">
            <Link href="/shop" className="transition hover:text-emerald-800">All products</Link>
            <Link href="/promotions" className="transition hover:text-emerald-800">Promotions</Link>
            <Link href="/membership" className="transition hover:text-emerald-800">Membership</Link>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Account</div>
          <div className="mt-2 flex flex-col gap-1.5 text-stone-600">
            <Link href="/account" className="transition hover:text-emerald-800">My account</Link>
            <Link href="/cart" className="transition hover:text-emerald-800">Cart</Link>
            <Link href="/checkout" className="transition hover:text-emerald-800">Checkout</Link>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Prices</div>
          <p className="mt-2 text-stone-500">All prices in Philippine Peso (₱).</p>
        </div>
      </div>
      <div className="border-t border-stone-100">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-stone-400">© {new Date().getFullYear()} Pickle Unltd. All rights reserved.</div>
      </div>
    </footer>
  );
}
