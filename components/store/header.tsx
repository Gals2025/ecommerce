import Link from "next/link";
import { Search, ShoppingBag, User } from "lucide-react";
import { getSession } from "@/lib/rbac";
import { getCartLines } from "@/lib/cart";

export type StoreNavCategory = { id: string; name: string; slug: string };

export async function StoreHeader({ categories }: { categories: StoreNavCategory[] }) {
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
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      {/* Utility bar */}
      <div className="bg-stone-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-1.5 text-[11px] sm:text-xs">
          <p className="truncate font-medium tracking-wide">
            Brand-new pickleball gear · Member prices on every order
          </p>
          <nav className="hidden shrink-0 items-center gap-4 text-stone-300 sm:flex">
            <Link href="/account" className="transition hover:text-white">Track Order</Link>
            <Link href="/promotions" className="transition hover:text-white">Promos</Link>
            <Link href="/membership" className="transition hover:text-white">Membership</Link>
          </nav>
        </div>
      </div>
      {/* Main bar */}
      <div className="border-b border-stone-200/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-baseline gap-1.5 tracking-tight">
            <span className="font-display text-xl font-semibold">Pickle Unltd</span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 lg:inline">Pickleball</span>
          </Link>
          <form action="/shop" method="get" className="relative hidden min-w-0 flex-1 sm:block">
            <input
              name="q"
              placeholder="Search paddles, balls, apparel…"
              className="w-full rounded-full border border-stone-200 bg-stone-100/70 py-2.5 pl-4 pr-14 text-base outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15 sm:text-sm"
            />
            <button type="submit" aria-label="Search" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-stone-900 p-2.5 text-white transition hover:bg-emerald-800">
              <Search className="h-4 w-4" />
            </button>
          </form>
          <nav className="ml-auto flex shrink-0 items-center gap-1 text-sm sm:gap-2">
            <Link href="/account" className="hidden min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:flex">
              <User className="h-4 w-4" />
              {userId ? "Account" : "Sign in"}
            </Link>
            <Link href="/account" className="inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:hidden">
              {userId ? "Account" : "Sign in"}
            </Link>
            <Link href="/cart" className="relative flex min-h-[44px] items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 font-medium text-white transition hover:bg-emerald-800">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Cart</span>
              {count > 0 && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-semibold text-white">{count}</span>}
            </Link>
          </nav>
        </div>
        <div className="border-t border-stone-200/70 sm:hidden">
          <form action="/shop" method="get" className="relative mx-auto max-w-6xl px-4 py-2">
            <input
              name="q"
              placeholder="Search paddles, balls, apparel…"
              className="w-full rounded-full border border-stone-200 bg-stone-100/70 py-2.5 pl-4 pr-14 text-base outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15 sm:text-sm"
            />
            <button type="submit" aria-label="Search" className="absolute right-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-stone-900 p-2.5 text-white transition hover:bg-emerald-800">
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      {/* Category nav */}
      {categories.length > 0 && (
        <nav className="overflow-x-auto border-b border-stone-200/70 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-1 whitespace-nowrap px-4 py-2 text-[13px]">
            <Link href="/shop" className="flex min-h-[44px] items-center rounded-full bg-stone-900 px-3 py-1 font-medium text-white transition hover:bg-emerald-800">
              Shop All
            </Link>
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="flex min-h-[44px] items-center rounded-full px-3 py-1 font-medium text-stone-600 transition hover:bg-emerald-50 hover:text-emerald-800">
                {c.name}
              </Link>
            ))}
            <Link href="/promotions" className="flex min-h-[44px] items-center rounded-full px-3 py-1 font-semibold text-red-600 transition hover:bg-red-50">
              Deals
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

export function StoreFooter({ categories = [] }: { categories?: StoreNavCategory[] }) {
  return (
    <footer className="mt-16 bg-stone-950 text-stone-300">
      {/* Trust strip */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-5 text-xs sm:grid-cols-4">
          {[
            ["Member prices", "Unlock tier discounts on every order"],
            ["Nationwide shipping", "Metro Manila delivery & nationwide"],
            ["Flexible payment", "COD, GCash, bank transfer, in-store"],
            ["Easy returns", "Hassle-free returns on gear"],
          ].map(([title, sub]) => (
            <div key={title}>
              <div className="font-semibold text-white">{title}</div>
              <div className="mt-0.5 text-stone-400">{sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 text-sm sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="font-display text-lg font-semibold text-white">Pickle Unltd</div>
          <p className="mt-2 text-stone-400">Brand-new pickleball paddles, balls & sportswear, delivered across the Philippines.</p>
          <p className="mt-2 text-xs text-stone-500">All prices in Philippine Peso (₱).</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Shop</div>
          <div className="mt-2 flex flex-col gap-1.5 [&_a]:py-1">
            <Link href="/shop" className="transition hover:text-white">All products</Link>
            {categories.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="transition hover:text-white">{c.name}</Link>
            ))}
            <Link href="/promotions" className="transition hover:text-white">Deals & promotions</Link>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Account</div>
          <div className="mt-2 flex flex-col gap-1.5 [&_a]:py-1">
            <Link href="/account" className="transition hover:text-white">My account</Link>
            <Link href="/account" className="transition hover:text-white">Track order</Link>
            <Link href="/cart" className="transition hover:text-white">Cart</Link>
            <Link href="/checkout" className="transition hover:text-white">Checkout</Link>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Membership</div>
          <div className="mt-2 flex flex-col gap-1.5 [&_a]:py-1">
            <Link href="/membership" className="transition hover:text-white">Become a member</Link>
            <Link href="/promotions" className="transition hover:text-white">Promotions</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-stone-500">
          <span>© {new Date().getFullYear()} Pickle Unltd. All rights reserved.</span>
          <span className="font-medium tracking-wide">Gear up. Own the court.</span>
        </div>
      </div>
    </footer>
  );
}
