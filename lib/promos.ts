import { db, type DbClient, type Tx } from "@/db";
import {
  promotions,
  promotionRules,
  promotionProducts,
  promotionVariants,
  promotionCategories,
  promotionBrands,
  promotionMembershipTiers,
  promotionCodes,
  promotionUsage,
  products,
  productVariants,
  orders,
} from "@/db/schema";
import { and, eq, ne, count, inArray, sql } from "drizzle-orm";
import { getActiveMembership, tierForSpend } from "./membership";
import { customers } from "@/db/schema";

export type PricedLine = { variantId: string; unitPrice: number; qty: number };

// ---------------------------------------------------------------------------
// Pure discount core (DB-free). All stacking/scope/schedule math lives here
// so scripts/verify.ts can assert exact totals without a database. The
// DB-backed loaders below only fetch rows and delegate to this core.
// ---------------------------------------------------------------------------

export type CoreLine = {
  variantId: string;
  productId: string;
  categoryId: string | null;
  brandId: string | null;
  unitPrice: number; // base price entering the stage
  qty: number;
};

export type CorePromo = {
  id: string;
  name: string;
  type: "code" | "auto";
  kind: "percent" | "fixed" | "bogo" | "bundle" | "free_shipping";
  value: number;
  config: Record<string, unknown> | null;
  minSpend: number;
  maxDiscount: number | null;
  stackable: boolean;
  priority: number;
  startAt: string | null; // ISO
  endAt: string | null; // ISO
  scopes: {
    products: string[];
    variants: string[];
    categories: string[];
    brands: string[];
    tiers: string[];
  };
  rules: Record<string, unknown>;
  code?: {
    id: string;
    code: string;
    usageLimit: number | null;
    usedCount: number;
    perCustomerLimit: number;
    customerUsed: number;
    isActive: boolean;
  };
};

export type CoreCtx = {
  now: string; // ISO instant
  memberTierIds: string[]; // paid tier id + auto-tier id held by the customer
  isFirstOrder: boolean;
};

export type AppliedPromo = {
  promotionId: string;
  codeId?: string;
  name: string;
  scope: "line" | "cart" | "shipping";
  discount: number;
};

export type LineStageResult = {
  prices: Map<string, number>; // variantId -> resolved unit price
  discount: number; // total line-stage savings
  applied: AppliedPromo[];
};

export type CartStageResult = {
  discount: number;
  shippingWaiver: number | null; // max staff-settable fee; 0 = fully waived
  applied: AppliedPromo[];
  codeError?: string;
};

function inSchedule(p: CorePromo, now: string): boolean {
  return (!p.startAt || p.startAt <= now) && (!p.endAt || p.endAt >= now);
}

function tierOk(p: CorePromo, ctx: CoreCtx): boolean {
  if (p.scopes.tiers.length === 0) return true;
  return p.scopes.tiers.some((t) => ctx.memberTierIds.includes(t));
}

function rulesOk(p: CorePromo, ctx: CoreCtx, matchedQty: number): boolean {
  if (p.rules.first_order_only === true && !ctx.isFirstOrder) return false;
  const minQty = p.rules.min_qty;
  if (typeof minQty === "number" && matchedQty < minQty) return false;
  return true;
}

function limitsOk(p: CorePromo): boolean {
  const c = p.code;
  if (!c) return true;
  if (!c.isActive) return false;
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return false;
  if (c.customerUsed >= c.perCustomerLimit) return false;
  return true;
}

function hasProductScope(p: CorePromo): boolean {
  const s = p.scopes;
  return s.products.length > 0 || s.variants.length > 0 || s.categories.length > 0 || s.brands.length > 0;
}

function lineMatches(p: CorePromo, l: CoreLine): boolean {
  const s = p.scopes;
  if (!hasProductScope(p)) return true;
  return (
    s.variants.includes(l.variantId) ||
    s.products.includes(l.productId) ||
    (l.categoryId != null && s.categories.includes(l.categoryId)) ||
    (l.brandId != null && s.brands.includes(l.brandId))
  );
}

function capEach(discount: number, max: number | null, running: number): number {
  const capped = max != null ? Math.min(discount, max) : discount;
  return Math.max(0, Math.min(capped, running));
}

function bogoDiscount(p: CorePromo, l: CoreLine): number {
  const cfg = (p.config ?? {}) as {
    buyVariantId?: string;
    buyProductId?: string;
    buyQty?: number;
    getQty?: number;
    getPct?: number;
  };
  if (cfg.buyVariantId && cfg.buyVariantId !== l.variantId) return 0;
  if (!cfg.buyVariantId && cfg.buyProductId && cfg.buyProductId !== l.productId) return 0;
  if (!cfg.buyVariantId && !cfg.buyProductId) return 0;
  const buyQty = cfg.buyQty ?? 2;
  if (buyQty <= 0 || l.qty < buyQty) return 0;
  // New-style {buyQty, getQty}: sets = floor(qty / (buy+get)).
  // Legacy {buyQty} only: sets = floor(qty / buyQty) — preserved.
  const getQty = cfg.getQty ?? 1;
  const sets = cfg.getQty != null ? Math.floor(l.qty / (buyQty + getQty)) : Math.floor(l.qty / buyQty);
  if (sets <= 0) return 0;
  return Math.round(sets * getQty * l.unitPrice * ((cfg.getPct ?? 100) / 100));
}

function bundleDiscount(p: CorePromo, lines: CoreLine[]): number {
  const cfg = (p.config ?? {}) as { bundleVariantIds?: string[] };
  if (!cfg.bundleVariantIds?.length) return 0;
  const inCart = cfg.bundleVariantIds.every((id) => lines.some((l) => l.variantId === id && l.qty > 0));
  if (!inCart) return 0;
  const sum = lines
    .filter((l) => cfg.bundleVariantIds!.includes(l.variantId))
    .reduce((s, l) => s + l.unitPrice, 0);
  return Math.max(0, sum - (p.value ?? sum));
}

/**
 * Line stage: percent/fixed promos WITH product-ish scopes, plus bogo/bundle.
 * minSpend here is evaluated on the pre-discount cart subtotal (base prices).
 * Per line, matching promos run the priority+stackable chain (sorted desc;
 * first non-stackable applies and stops the line, stackables accumulate).
 * Each promo applies at most once per order.
 */
export function evaluateLineStage(lines: CoreLine[], promos: CorePromo[], ctx: CoreCtx, cartSubtotal: number): LineStageResult {
  const prices = new Map(lines.map((l) => [l.variantId, l.unitPrice]));
  const applied: AppliedPromo[] = [];
  let total = 0;
  const used = new Set<string>();

  const linePromos = promos
    .filter((p) => (p.kind === "percent" || p.kind === "fixed" ? hasProductScope(p) : p.kind === "bogo" || p.kind === "bundle"))
    .filter((p) => inSchedule(p, ctx.now) && tierOk(p, ctx))
    .sort((a, b) => b.priority - a.priority);

  // Bundle is cart-wide: handle once.
  for (const p of linePromos.filter((x) => x.kind === "bundle")) {
    if (used.has(p.id)) continue;
    const matchedQty = lines.filter((l) => lineMatches(p, l)).reduce((s, l) => s + l.qty, 0);
    if (!rulesOk(p, ctx, matchedQty) || cartSubtotal < p.minSpend) continue;
    const d = capEach(bundleDiscount(p, lines), p.maxDiscount, cartSubtotal - total);
    if (d <= 0) continue;
    // Spread across bundle lines proportional to unit price for display.
    const bundleLines = lines.filter((l) => (p.config as { bundleVariantIds?: string[] })?.bundleVariantIds?.includes(l.variantId));
    const sum = bundleLines.reduce((s, l) => s + (prices.get(l.variantId) ?? 0), 0) || 1;
    let assigned = 0;
    bundleLines.forEach((l, i) => {
      const share = i === bundleLines.length - 1 ? d - assigned : Math.round((d * (prices.get(l.variantId) ?? 0)) / sum);
      assigned += share;
      prices.set(l.variantId, Math.max(0, (prices.get(l.variantId) ?? 0) - share));
    });
    used.add(p.id);
    total += d;
    applied.push({ promotionId: p.id, name: p.name, scope: "line", discount: d });
  }

  for (const l of lines) {
    let running = prices.get(l.variantId) ?? l.unitPrice;
    for (const p of linePromos.filter((x) => x.kind !== "bundle")) {
      if (used.has(p.id) && !p.stackable) continue;
      if (!lineMatches(p, l)) continue;
      const matchedQty = lines.filter((x) => lineMatches(p, x)).reduce((s, x) => s + x.qty, 0);
      if (!rulesOk(p, ctx, matchedQty)) continue;
      if (cartSubtotal - total < p.minSpend && p.minSpend > 0) {
        // minSpend is evaluated on the running cart subtotal.
        if (cartSubtotal < p.minSpend) continue;
      }
      let d = 0;
      if (p.kind === "percent") d = Math.round(((prices.get(l.variantId) ?? 0) * l.qty * p.value) / 100);
      else if (p.kind === "fixed") d = Math.min(p.value, (prices.get(l.variantId) ?? 0) * l.qty);
      else if (p.kind === "bogo") d = bogoDiscount(p, { ...l, unitPrice: prices.get(l.variantId) ?? l.unitPrice });
      d = capEach(d, p.maxDiscount, running * l.qty);
      if (d <= 0) continue;
      const perUnit = d / l.qty;
      prices.set(l.variantId, Math.max(0, running - perUnit));
      running = prices.get(l.variantId)!;
      total += d;
      const prev = applied.find((a) => a.promotionId === p.id);
      if (prev) prev.discount += d;
      else {
        applied.push({ promotionId: p.id, name: p.name, scope: "line", discount: d });
        used.add(p.id);
      }
      if (!p.stackable) break; // chain stops for this line
    }
  }
  return { prices, discount: Math.max(0, total), applied };
}

/**
 * Cart stage: percent/fixed promos with NO product scopes (cart-level),
 * plus the optional promo code participating in the same priority chain.
 * minSpend here is evaluated on the post-member running subtotal (callers
 * pass afterMember), which intentionally differs from the line-stage base.
 * Free-shipping promos record a fee waiver instead of a discount.
 * Running total never drops below zero.
 */
export function evaluateCartStage(
  subtotal: number,
  promos: CorePromo[],
  ctx: CoreCtx,
  code?: string
): CartStageResult {
  let running = Math.max(0, subtotal);
  let total = 0;
  const applied: AppliedPromo[] = [];
  let shippingWaiver: number | null = null;
  let codeError: string | undefined;

  const cartPromos = promos
    .filter((p) => (p.kind === "percent" || p.kind === "fixed" ? !hasProductScope(p) : p.kind === "free_shipping"))
    .filter((p) => p.type === "auto")
    .filter((p) => inSchedule(p, ctx.now) && tierOk(p, ctx))
    .sort((a, b) => b.priority - a.priority);

  let codePromo: CorePromo | null = null;
  if (code?.trim()) {
    const want = code.trim().toUpperCase();
    codePromo = promos.find((p) => p.type === "code" && p.code?.code.toUpperCase() === want) ?? null;
    if (!codePromo) codeError = "Promo code not recognized";
    else if (!inSchedule(codePromo, ctx.now)) {
      codeError = "Promo code expired";
      codePromo = null;
    } else if (!tierOk(codePromo, ctx)) {
      codeError = "This code is for members only";
      codePromo = null;
    } else if (!limitsOk(codePromo)) {
      codeError = "Promo code usage limit reached";
      codePromo = null;
    } else if (!rulesOk(codePromo, ctx, 0)) {
      codeError = "This code is not eligible for this order";
      codePromo = null;
    }
  }

  const chain = [...cartPromos];
  if (codePromo) chain.push(codePromo);
  chain.sort((a, b) => b.priority - a.priority);
  const used = new Set<string>();

  for (const p of chain) {
    if (used.has(p.id)) continue; // never apply twice
    if (p.kind === "free_shipping") {
      const matchedQty = 0;
      if (!rulesOk(p, ctx, matchedQty)) continue;
      if (subtotal < p.minSpend) continue;
      // value = max staff-settable fee covered; 0 = fully waived.
      shippingWaiver = shippingWaiver == null ? p.value : Math.min(shippingWaiver, p.value);
      used.add(p.id);
      applied.push({ promotionId: p.id, codeId: p.code?.id, name: p.name, scope: "shipping", discount: 0 });
      if (!p.stackable) break;
      continue;
    }
    if (subtotal < p.minSpend) continue;
    if (!rulesOk(p, ctx, 0)) continue;
    if (p.code && !limitsOk(p)) continue;
    let d = 0;
    if (p.kind === "percent") d = Math.round((running * p.value) / 100);
    else if (p.kind === "fixed") d = p.value;
    d = capEach(d, p.maxDiscount, running);
    if (d <= 0) {
      used.add(p.id);
      if (!p.stackable) break;
      continue;
    }
    running -= d;
    total += d;
    used.add(p.id);
    applied.push({ promotionId: p.id, codeId: p.code?.id, name: p.name, scope: "cart", discount: d });
    if (!p.stackable) break; // chain stops: winner takes the rest
  }
  return { discount: Math.max(0, total), shippingWaiver, applied, codeError };
}

// ---------------------------------------------------------------------------
// DB-backed loaders: fetch rows, delegate to the pure core.
// ---------------------------------------------------------------------------

export type LoadedPromoState = {
  promos: CorePromo[];
  memberTierIds: string[];
  isFirstOrder: boolean;
  now: Date;
};

export async function loadPromoState(opts: { customerId?: string; code?: string }, client: DbClient = db): Promise<LoadedPromoState> {
  const now = new Date();
  const all = await client.select().from(promotions).where(eq(promotions.isActive, true));
  const live = all.filter((p) => !p.deletedAt);

  const [prodRows, varRows, catRows, brandRows, tierRows, ruleRows] = await Promise.all([
    client.select().from(promotionProducts),
    client.select().from(promotionVariants),
    client.select().from(promotionCategories),
    client.select().from(promotionBrands),
    client.select().from(promotionMembershipTiers),
    client.select().from(promotionRules),
  ]);

  const byId = (pid: string) => ({
    products: prodRows.filter((r) => r.promotionId === pid).map((r) => r.productId),
    variants: varRows.filter((r) => r.promotionId === pid).map((r) => r.variantId),
    categories: catRows.filter((r) => r.promotionId === pid).map((r) => r.categoryId),
    brands: brandRows.filter((r) => r.promotionId === pid).map((r) => r.brandId),
    tiers: tierRows.filter((r) => r.promotionId === pid).map((r) => r.tierId),
  });
  const rulesById = (pid: string) => {
    const out: Record<string, unknown> = {};
    for (const r of ruleRows.filter((x) => x.promotionId === pid)) out[r.key] = r.value as unknown;
    return out;
  };

  // Requested code (single lookup, case-insensitive exact).
  let codeRow: typeof promotionCodes.$inferSelect | null = null;
  if (opts.code?.trim()) {
    const rows = await client.select().from(promotionCodes).where(eq(promotionCodes.code, opts.code.trim().toUpperCase())).limit(1);
    codeRow = rows[0] ?? null;
  }
  const codePromoIds = new Set(live.filter((p) => p.type === "code").map((p) => p.id));
  const customerUsed = codeRow && opts.customerId
    ? Number(
        (
          await client
            .select({ n: count() })
            .from(promotionUsage)
            .where(and(eq(promotionUsage.codeId, codeRow.id), eq(promotionUsage.customerId, opts.customerId)))
        )[0]?.n ?? 0
      )
    : 0;

  // Member tiers held: paid membership tier + spend auto-tier.
  const memberTierIds: string[] = [];
  if (opts.customerId) {
    const [c] = await client.select().from(customers).where(eq(customers.userId, opts.customerId)).limit(1);
    if (c) {
      const paid = await getActiveMembership(c.id, client).catch(() => null);
      if (paid) memberTierIds.push(paid.tierId);
      const auto = await tierForSpend(c.lifetimeSpend ?? 0, client).catch(() => null);
      if (auto) memberTierIds.push(auto.id);
    }
  }

  // First order = zero prior non-cancelled orders.
  let isFirstOrder = true;
  if (opts.customerId) {
    const rows = await client
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.customerId, opts.customerId), ne(orders.status, "cancelled")));
    isFirstOrder = Number(rows[0]?.n ?? 0) === 0;
  }

  const promos: CorePromo[] = live
    .filter((p) => p.type === "auto" || (codeRow && p.id === codeRow.promotionId && codePromoIds.has(p.id)))
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type as "code" | "auto",
      kind: p.kind as CorePromo["kind"],
      value: p.value ?? 0,
      config: (p.config as Record<string, unknown> | null) ?? null,
      minSpend: p.minSpend ?? 0,
      maxDiscount: p.maxDiscount ?? null,
      stackable: p.stackable ?? false,
      priority: p.priority ?? 0,
      startAt: p.startAt ? p.startAt.toISOString() : null,
      endAt: p.endAt ? p.endAt.toISOString() : null,
      scopes: byId(p.id),
      rules: rulesById(p.id),
      code: codeRow && codeRow.promotionId === p.id
        ? {
            id: codeRow.id,
            code: codeRow.code,
            usageLimit: codeRow.usageLimit ?? null,
            usedCount: codeRow.usedCount ?? 0,
            perCustomerLimit: codeRow.perCustomerLimit ?? 1,
            customerUsed,
            isActive: codeRow.isActive ?? true,
          }
        : undefined,
    }));

  return { promos, memberTierIds, isFirstOrder, now };
}

/** Attach catalog scope context (product/category/brand) to priced lines. */
export async function enrichCoreLines(
  lines: (PricedLine & { productId?: string })[],
  client: DbClient = db
): Promise<CoreLine[]> {
  const productIds = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const prodMap = new Map<string, { categoryId: string | null; brandId: string | null }>();
  if (productIds.length > 0) {
    const rows = await client
      .select({ id: products.id, categoryId: products.categoryId, brandId: products.brandId })
      .from(products)
      .where(inArray(products.id, productIds));
    for (const r of rows) prodMap.set(r.id, { categoryId: r.categoryId, brandId: r.brandId });
  }
  // pricing.ts already resolves productId per variant; fall back to lookup by variant.
  const missing = [...new Set(lines.filter((l) => !l.productId).map((l) => l.variantId))];
  const varMap = new Map<string, string>();
  if (missing.length > 0) {
    const vrows = await client
      .select({ id: productVariants.id, productId: productVariants.productId })
      .from(productVariants)
      .where(inArray(productVariants.id, missing));
    for (const v of vrows) varMap.set(v.id, v.productId);
  }
  return lines.map((l) => {
    const pid = l.productId ?? varMap.get(l.variantId) ?? "";
    const ctx = prodMap.get(pid);
    return {
      variantId: l.variantId,
      productId: pid,
      categoryId: ctx?.categoryId ?? null,
      brandId: ctx?.brandId ?? null,
      unitPrice: l.unitPrice,
      qty: l.qty,
    };
  });
}

export type PromoResult = {
  discount: number;
  promotionId?: string;
  codeId?: string;
  name?: string;
};

// Legacy single-result evaluator: cart-stage only over base lines.
// Kept for backward compatibility; the pricing pipeline uses the staged API.
export async function evaluatePromos(opts: {
  lines: PricedLine[];
  subtotal: number;
  code?: string;
  customerId?: string;
}): Promise<PromoResult> {
  const state = await loadPromoState({ customerId: opts.customerId, code: opts.code });
  const ctx: CoreCtx = { now: state.now.toISOString(), memberTierIds: state.memberTierIds, isFirstOrder: state.isFirstOrder };
  const res = evaluateCartStage(opts.subtotal, state.promos, ctx, opts.code);
  const first = res.applied.find((a) => a.scope === "cart");
  return { discount: res.discount, promotionId: first?.promotionId, codeId: first?.codeId, name: first?.name ?? (res.applied.length > 1 ? "Stacked promos" : undefined) };
}

export async function recordPromoUsage(
  promotionId: string,
  codeId: string | undefined,
  customerId: string | undefined,
  orderId: string,
  discount: number,
  tx?: Tx
) {
  if (!promotionId || discount <= 0) return;
  const client = tx ?? db;
  await client.insert(promotionUsage).values({ promotionId, codeId: codeId ?? null, customerId: customerId ?? null, orderId, discount });
  if (codeId) {
    await client
      .update(promotionCodes)
      .set({ usedCount: sql`${promotionCodes.usedCount} + 1`, updatedAt: new Date() })
      .where(eq(promotionCodes.id, codeId));
  }
}
