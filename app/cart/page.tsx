import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/rbac";
import { getPricedCart } from "@/lib/cart";
import { formatPHP } from "@/lib/money";
import { getCategoriesTree } from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { Input, buttonVariants } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const SCOPE_LABEL: Record<string, string> = {
  line: "on items",
  cart: "on cart",
  shipping: "shipping",
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession().catch(() => null);
  const userId = session?.user.id ?? null;
  const raw = await searchParams;
  const promoParam = first(raw.promo).trim();
  let cart: Awaited<ReturnType<typeof getPricedCart>> | null = null;
  try {
    cart = await getPricedCart(userId, promoParam || undefined);
  } catch {
    return <DbUnreachable />;
  }
  const cats = await getCategoriesTree().catch(() => []);
  const lines = cart.lines;

  async function updateQty(formData: FormData) {
    "use server";
    const { getSession } = await import("@/lib/rbac");
    const { setLineQty } = await import("@/lib/cart");
    const s = await getSession().catch(() => null);
    await setLineQty(s?.user.id ?? null, String(formData.get("variantId")), Number(formData.get("qty")));
    redirect("/cart");
  }

  async function remove(formData: FormData) {
    "use server";
    const { getSession } = await import("@/lib/rbac");
    const { removeLine } = await import("@/lib/cart");
    const s = await getSession().catch(() => null);
    await removeLine(s?.user.id ?? null, String(formData.get("variantId")));
    redirect("/cart");
  }

  async function applyPromo(formData: FormData) {
    "use server";
    const code = String(formData.get("promo") ?? "").trim();
    redirect(code ? `/cart?promo=${encodeURIComponent(code)}` : "/cart");
  }

  async function removePromo() {
    "use server";
    redirect("/cart");
  }

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold sm:text-2xl">Cart</h1>
        {!userId && lines.length > 0 && (
          <p className="mt-1 text-sm text-gray-600">
            Browsing as guest. <Link href="/login" className="underline">Sign in</Link> to check out — your cart carries over.
          </p>
        )}
        {userId && cart.tierName && (
          <p className="mt-1 text-sm text-gray-600">
            Member tier: <span className="font-medium">{cart.tierName}</span> — discount applied below.
          </p>
        )}
        <div className="mt-4 space-y-3">
          {lines.map((l) => (
            <div key={l.variantId} className="flex gap-3 rounded-xl border p-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                {l.image ? (
                  <Image src={l.image} alt={l.productName} width={80} height={80} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">No image</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{l.productName}</div>
                <div className="text-xs text-gray-500">{l.variantName ?? l.sku}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold">{formatPHP(l.lineTotal)}</span>
                  {l.discountAmount > 0 ? (
                    <>
                      <span className="text-xs text-gray-400 line-through">{formatPHP(l.originalUnitPrice * l.qty)}</span>
                      <span className="text-xs font-medium text-green-700">
                        {formatPHP(l.effectiveUnitPrice)} each · −{formatPHP(l.discountAmount)}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {formatPHP(l.originalUnitPrice)} each × {l.qty}
                    </span>
                  )}
                </div>
                {l.available <= 0 && <div className="text-xs text-red-600" role="alert">Out of stock — remove or wait for restock</div>}
                {l.available > 0 && l.qty > l.available && (
                  <div className="text-xs text-amber-700" role="alert">Only {l.available} available — lower the quantity</div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <form action={updateQty} className="flex flex-wrap items-center gap-1">
                    <input type="hidden" name="variantId" value={l.variantId} />
                    <Input
                      type="number" name="qty" defaultValue={l.qty} min={1}
                      max={Math.max(1, Math.min(99, l.available || 99))}
                      className="w-20 min-h-[44px] px-2"
                      aria-label={`Quantity for ${l.productName}`}
                    />
                    <SubmitButton variant="utility" pendingLabel="…" className="min-h-[44px] px-3">Update</SubmitButton>
                  </form>
                  <form action={remove}>
                    <input type="hidden" name="variantId" value={l.variantId} />
                    <SubmitButton variant="utilityDanger" pendingLabel="…" className="min-h-[44px] px-3">Remove</SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
          {lines.length === 0 && (
            <p className="text-sm text-gray-500">Your cart is empty. <Link href="/shop" className="underline">Start shopping</Link>.</p>
          )}
        </div>
        {lines.length > 0 && (
          <div className="mt-4 rounded-xl border p-4">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{formatPHP(cart.subtotal)}</span></div>
            {cart.memberDiscount > 0 && (
              <div className="mt-1 flex justify-between text-sm text-green-700">
                <span>Member discount{cart.tierName ? ` (${cart.tierName})` : ""}</span>
                <span>−{formatPHP(cart.memberDiscount)}</span>
              </div>
            )}
            {cart.appliedPromos
              .filter((a) => a.scope !== "shipping" && a.discount > 0)
              .map((a) => (
                <div key={`${a.promotionId}-${a.scope}`} className="mt-1 flex justify-between gap-2 text-sm text-green-700">
                  <span className="min-w-0 truncate">{a.name} <span className="text-xs text-gray-500">· {SCOPE_LABEL[a.scope] ?? a.scope}{a.codeId && promoParam ? ` · code ${promoParam.toUpperCase()}` : ""}</span></span>
                  <span className="shrink-0">−{formatPHP(a.discount)}</span>
                </div>
              ))}
            {cart.shippingWaiver != null && (
              <div className="mt-1 flex justify-between text-sm text-green-700">
                <span>Shipping covered{cart.appliedPromos.find((a) => a.scope === "shipping") ? ` (${cart.appliedPromos.find((a) => a.scope === "shipping")!.name})` : ""}</span>
                <span>{cart.shippingWaiver === 0 ? "fully waived" : `up to −${formatPHP(cart.shippingWaiver)}`}</span>
              </div>
            )}
            <form action={applyPromo} className="mt-3 flex flex-wrap gap-2">
              <Input name="promo" defaultValue={promoParam} placeholder="Promo code (optional)" maxLength={32} aria-label="Promo code" className="min-w-0 flex-1 basis-full sm:basis-auto" />
              <SubmitButton variant="outline" pendingLabel="…">{promoParam ? "Re-apply" : "Apply"}</SubmitButton>
              {promoParam && (
                <SubmitButton variant="utilityDanger" pendingLabel="…" formAction={removePromo}>Remove</SubmitButton>
              )}
            </form>
            {promoParam && cart.codeError && (
              <p className="mt-1 text-sm text-red-600" role="alert">{cart.codeError} — totals unchanged.</p>
            )}
            {promoParam && !cart.codeError && cart.promoDiscount > 0 && (
              <p className="mt-1 text-sm text-green-700">Applied: {promoParam.toUpperCase()} (−{formatPHP(cart.promoDiscount)}).</p>
            )}
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold"><span>Total</span><span>{formatPHP(cart.grandTotal)}</span></div>
            <p className="mt-1 text-xs text-gray-500">Server-computed preview — promos revalidated at checkout.</p>
            {userId ? (
              <Link
                href={promoParam && cart.promoDiscount > 0 ? `/checkout?promo=${encodeURIComponent(promoParam)}` : "/checkout"}
                className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-3 block text-center")}
              >
                Proceed to checkout
              </Link>
            ) : (
              <Link href="/login?redirect=/cart" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-3 block text-center")}>
                Sign in to check out
              </Link>
            )}
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
