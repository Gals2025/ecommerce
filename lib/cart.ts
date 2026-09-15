import { cookies } from "next/headers";
import { db } from "@/db";
import {
  carts,
  cartItems,
  inventoryBalances,
  productImages,
  productVariants,
  products,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const COOKIE_NAME = "guest_cart";
const MAX_QTY = 99;
const MAX_LINES = 50;

export type GuestLine = { variantId: string; qty: number };

export async function readGuestCart(): Promise<GuestLine[]> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is GuestLine =>
          typeof l === "object" && l !== null &&
          typeof (l as GuestLine).variantId === "string" &&
          Number.isInteger((l as GuestLine).qty)
      )
      .slice(0, MAX_LINES)
      .map((l) => ({ variantId: l.variantId, qty: Math.max(1, Math.min(MAX_QTY, l.qty)) }));
  } catch {
    return [];
  }
}

async function writeGuestCart(lines: GuestLine[]) {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(lines.slice(0, MAX_LINES)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearGuestCart() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type CartLine = {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  image: string | null;
  unitPrice: number;
  comparePrice: number | null;
  qty: number;
  available: number;
};

/** Enrich + validate raw lines: drops unknown/inactive variants, caps qty at available stock. */
export async function enrichLines(raw: GuestLine[]): Promise<CartLine[]> {
  const ids = [...new Set(raw.map((l) => l.variantId))];
  if (ids.length === 0) return [];
  const vars = await db.select().from(productVariants).where(inArray(productVariants.id, ids));
  const productIds = [...new Set(vars.map((v) => v.productId))];
  const prods = productIds.length > 0
    ? await db.select().from(products).where(inArray(products.id, productIds))
    : [];
  const prodById = new Map(prods.map((p) => [p.id, p]));
  const balances = await db.select().from(inventoryBalances).where(inArray(inventoryBalances.variantId, ids));
  const availByVariant = new Map<string, number>();
  for (const b of balances) {
    availByVariant.set(b.variantId, (availByVariant.get(b.variantId) ?? 0) + (b.onHand - b.reserved));
  }
  const images = productIds.length > 0
    ? await db.select().from(productImages).where(inArray(productImages.productId, productIds))
    : [];
  const coverByProduct = new Map<string, string>();
  for (const img of images) {
    if (!coverByProduct.has(img.productId)) coverByProduct.set(img.productId, img.url);
  }
  const out: CartLine[] = [];
  for (const l of raw) {
    const v = vars.find((x) => x.id === l.variantId);
    if (!v || v.status !== "active" || v.deletedAt) continue;
    const p = prodById.get(v.productId);
    if (!p || p.status !== "active" || p.deletedAt) continue;
    const available = Math.max(0, availByVariant.get(v.id) ?? 0);
    out.push({
      variantId: v.id,
      sku: v.sku,
      productName: p.name,
      variantName: v.name,
      image: v.imageUrl ?? coverByProduct.get(p.id) ?? null,
      unitPrice: v.priceOverride ?? p.basePrice,
      comparePrice: v.comparePrice ?? p.comparePrice,
      qty: Math.max(1, Math.min(l.qty, MAX_QTY)),
      available,
    });
  }
  return out;
}

async function getOrCreateUserCart(userId: string): Promise<string> {
  const c = await db.select().from(carts).where(eq(carts.customerId, userId)).limit(1);
  if (c[0]) return c[0].id;
  const [row] = await db.insert(carts).values({ customerId: userId }).returning();
  return row.id;
}

/** Unified cart lines for header count, cart page, and checkout prep. */
export async function getCartLines(userId: string | null): Promise<CartLine[]> {
  if (userId) {
    const cartId = (await db.select().from(carts).where(eq(carts.customerId, userId)).limit(1))[0]?.id;
    if (!cartId) {
      // Lazy merge: a fresh sign-in may still hold a guest cookie.
      const merged = await mergeGuestCart(userId);
      if (merged > 0) return getCartLines(userId);
      return enrichLines(await readGuestCart());
    }
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    // Opportunistically fold any lingering guest cookie (merge on sign-in).
    const guest = await readGuestCart();
    if (guest.length > 0) {
      await mergeGuestCart(userId);
      return getCartLines(userId);
    }
    return enrichLines(items.map((i) => ({ variantId: i.variantId, qty: i.qty })));
  }
  return enrichLines(await readGuestCart());
}

/** Fold the guest cookie into the DB cart (quantities capped at MAX_QTY; availability is enforced at checkout via reserveStock), then clear it. Returns lines merged. */
export async function mergeGuestCart(userId: string): Promise<number> {
  const guest = await readGuestCart();
  if (guest.length === 0) return 0;
  const valid = await enrichLines(guest);
  if (valid.length === 0) {
    await clearGuestCart();
    return 0;
  }
  // One transaction: concurrent sign-ins from two tabs can't double-add.
  await db.transaction(async (tx) => {
    let cartId = (await tx.select().from(carts).where(eq(carts.customerId, userId)).limit(1))[0]?.id;
    if (!cartId) {
      const [row] = await tx.insert(carts).values({ customerId: userId }).returning();
      cartId = row.id;
    }
    const existing = await tx.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    for (const l of valid) {
      const line = existing.find((e) => e.variantId === l.variantId);
      const qty = Math.max(1, Math.min(MAX_QTY, l.qty));
      if (line) {
        await tx.update(cartItems).set({ qty: Math.min(MAX_QTY, line.qty + qty) }).where(eq(cartItems.id, line.id));
      } else {
        await tx.insert(cartItems).values({ cartId, variantId: l.variantId, qty });
      }
    }
  });
  await clearGuestCart();
  return valid.length;
}

export async function addLine(userId: string | null, variantId: string, qty: number): Promise<{ count: number }> {
  const safeQty = Math.max(1, Math.min(MAX_QTY, Math.floor(qty) || 1));
  // Validate sellability up front (active product + variant, stock hint).
  const valid = await enrichLines([{ variantId, qty: 1 }]);
  if (valid.length === 0) throw new Error("This item is no longer available");
  if (userId) {
    // Merge any guest cookie first so nothing is lost at sign-in boundary.
    await mergeGuestCart(userId);
    const cartId = await getOrCreateUserCart(userId);
    const existing = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
      .limit(1);
    if (existing[0]) {
      await db.update(cartItems).set({ qty: Math.min(MAX_QTY, existing[0].qty + safeQty) }).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({ cartId, variantId, qty: safeQty });
    }
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    return { count: items.reduce((s, i) => s + i.qty, 0) };
  }
  const guest = await readGuestCart();
  const line = guest.find((l) => l.variantId === variantId);
  if (line) line.qty = Math.min(MAX_QTY, line.qty + safeQty);
  else guest.push({ variantId, qty: safeQty });
  await writeGuestCart(guest);
  return { count: guest.reduce((s, l) => s + l.qty, 0) };
}

export async function setLineQty(userId: string | null, variantId: string, qty: number) {
  const safeQty = Math.max(0, Math.min(MAX_QTY, Math.floor(qty) || 0));
  if (userId) {
    const cartId = (await db.select().from(carts).where(eq(carts.customerId, userId)).limit(1))[0]?.id;
    if (!cartId) return;
    const line = (await db.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId))).limit(1))[0];
    if (!line) return;
    if (safeQty === 0) await db.delete(cartItems).where(eq(cartItems.id, line.id));
    else await db.update(cartItems).set({ qty: safeQty }).where(eq(cartItems.id, line.id));
    return;
  }
  const next = (await readGuestCart())
    .map((l) => (l.variantId === variantId ? { ...l, qty: safeQty } : l))
    .filter((l) => l.qty > 0);
  await writeGuestCart(next);
}

export async function removeLine(userId: string | null, variantId: string) {
  if (userId) {
    const cartId = (await db.select().from(carts).where(eq(carts.customerId, userId)).limit(1))[0]?.id;
    if (!cartId) return;
    const line = (await db.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId))).limit(1))[0];
    if (line) await db.delete(cartItems).where(eq(cartItems.id, line.id));
    return;
  }
  await writeGuestCart((await readGuestCart()).filter((l) => l.variantId !== variantId));
}

export type PricedCartLine = CartLine & {
  originalUnitPrice: number;
  effectiveUnitPrice: number;
  discountAmount: number;
  lineTotal: number;
};

export type PricedCart = {
  lines: PricedCartLine[];
  subtotal: number;
  memberDiscount: number;
  tierName: string | null;
  promoDiscount: number;
  promoName: string | null;
  deliveryFee: number;
  grandTotal: number;
};

/**
 * Server-authoritative priced cart for the cart page + checkout review.
 * Re-reads DB prices via calculateCartTotals (never trusts the browser);
 * member + promo discounts are allocated proportionally per line.
 */
export async function getPricedCart(userId: string | null, promoCode?: string): Promise<PricedCart> {
  const { calculateCartTotals, allocateDiscounts } = await import("./pricing");
  const lines = await getCartLines(userId);
  if (lines.length === 0) {
    return { lines: [], subtotal: 0, memberDiscount: 0, tierName: null, promoDiscount: 0, promoName: null, deliveryFee: 0, grandTotal: 0 };
  }
  const code = promoCode?.trim() ? promoCode.trim() : undefined;
  const totals = await calculateCartTotals({
    lines: lines.map((l) => ({ variantId: l.variantId, unitPrice: 0, qty: l.qty })),
    userId: userId ?? undefined,
    promoCode: code,
    deliveryFee: 0, // staff confirms the fee after ordering; ₱0 due at checkout
  });
  const priced = allocateDiscounts(
    totals.lines.map((l) => ({ variantId: l.variantId, unitPrice: l.memberPrice, qty: l.qty })),
    totals.memberPctDiscount + totals.cartDiscount
  );
  const byVariant = new Map(lines.map((l) => [l.variantId, l]));
  const totalsByVariant = new Map(totals.lines.map((l) => [l.variantId, l]));
  return {
    lines: priced.map((p) => {
      const base = byVariant.get(p.variantId)!;
      const t = totalsByVariant.get(p.variantId)!;
      return {
        ...base,
        originalUnitPrice: t.unitPrice,
        effectiveUnitPrice: p.effectiveUnitPrice,
        discountAmount: t.unitPrice * p.qty - p.lineTotal,
        lineTotal: p.lineTotal,
      };
    }),
    subtotal: totals.subtotal,
    memberDiscount: totals.memberDiscount,
    tierName: totals.tierName,
    promoDiscount: totals.promoDiscount,
    promoName: totals.promoName,
    deliveryFee: 0,
    grandTotal: totals.grandTotal,
  };
}
