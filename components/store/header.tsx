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
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">PH Store</Link>
        <form action="/shop" method="get" className="hidden min-w-0 flex-1 sm:block">
          <input
            name="q"
            placeholder="Search products…"
            className="w-full rounded-full border bg-gray-50 px-4 py-1.5 text-sm outline-none focus:border-gray-400"
          />
        </form>
        <nav className="ml-auto flex items-center gap-3 text-sm sm:gap-4">
          <Link href="/shop" className="hidden hover:underline sm:inline">Shop</Link>
          <Link href="/promotions" className="hidden hover:underline md:inline">Promos</Link>
          <Link href="/membership" className="hidden hover:underline md:inline">Membership</Link>
          <Link href="/account" className="hover:underline">{userId ? "Account" : "Sign in"}</Link>
          <Link href="/cart" className="relative rounded-full border px-3 py-1.5 hover:bg-gray-50">
            Cart{count > 0 && <span className="ml-1 rounded-full bg-black px-1.5 text-xs text-white">{count}</span>}
          </Link>
        </nav>
      </div>
      <div className="border-t sm:hidden">
        <form action="/shop" method="get" className="mx-auto max-w-6xl px-4 py-2">
          <input
            name="q"
            placeholder="Search products…"
            className="w-full rounded-full border bg-gray-50 px-4 py-1.5 text-sm outline-none focus:border-gray-400"
          />
        </form>
      </div>
      {categories.length > 0 && (
        <nav className="overflow-x-auto border-t">
          <div className="mx-auto flex max-w-6xl gap-4 whitespace-nowrap px-4 py-2 text-sm text-gray-600">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="hover:text-black hover:underline">
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
    <footer className="mt-12 border-t bg-gray-50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-sm sm:grid-cols-4">
        <div>
          <div className="font-bold">PH Store</div>
          <p className="mt-1 text-gray-600">Quality goods delivered across the Philippines.</p>
        </div>
        <div>
          <div className="font-medium">Shop</div>
          <div className="mt-1 flex flex-col gap-1 text-gray-600">
            <Link href="/shop" className="hover:underline">All products</Link>
            <Link href="/promotions" className="hover:underline">Promotions</Link>
            <Link href="/membership" className="hover:underline">Membership</Link>
          </div>
        </div>
        <div>
          <div className="font-medium">Account</div>
          <div className="mt-1 flex flex-col gap-1 text-gray-600">
            <Link href="/account" className="hover:underline">My account</Link>
            <Link href="/cart" className="hover:underline">Cart</Link>
            <Link href="/checkout" className="hover:underline">Checkout</Link>
          </div>
        </div>
        <div>
          <div className="font-medium">Prices</div>
          <p className="mt-1 text-gray-600">All prices in Philippine Peso (₱).</p>
        </div>
      </div>
    </footer>
  );
}
