import { db, type DbClient } from "@/db";
import { productVariants, products } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { tierForSpend, getActiveMembership, getMemberPrices } from "./membership";
import { loadPromoState, enrichCoreLines, evaluateLineStage, evaluateCartStage, type PricedLine, type CoreLine, type CoreCtx } from "./promos";
import { customers } from "@/db/schema";

// Allocate order-level discounts proportionally across lines for snapshots.
// Last line absorbs rounding so shares always sum to exactly totalDiscount.
export function allocateDiscounts<T extends { variantId: string; unitPrice: number; qty: number }>(
  lines: T[],
  totalDiscount: number
): (T & { discountAmount: number; effectiveUnitPrice: number; lineTotal: number })[] {
  const gross = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  if (gross <= 0 || totalDiscount <= 0) {
    return lines.map((l) => ({ ...l, discountAmount: 0, effectiveUnitPrice: l.unitPrice, lineTotal: l.unitPrice * l.qty }));
  }
  let assigned = 0;
  return lines.map((l, i) => {
    const share = i === lines.length - 1
      ? totalDiscount - assigned // last line absorbs rounding
      : Math.round((totalDiscount * l.unitPrice * l.qty) / gross);
    assigned += share;
    const lineTotal = l.unitPrice * l.qty - share;
    return {
      ...l,
      discountAmount: share,
      effectiveUnitPrice: Math.round(lineTotal / l.qty),
      lineTotal,
    };
  });
}

// Pure member-price resolution (DB-free, unit-testable). Variant explicit
// price wins, then product explicit price, else the percent rule applies —
// but never both on the same line (no double-dipping).
export function resolveMemberPricing(
  lines: { variantId: string; productId: string; unitPrice: number; qty: number }[],
  opts: { pct: number; byVariant: Map<string, number>; byProduct: Map<string, number> }
): {
  memberPrices: Map<string, number>;
  explicitSavings: number;
  pctDiscount: number;
} {
  const memberPrices = new Map<string, number>();
  let explicitSavings = 0;
  for (const l of lines) {
    const explicit = opts.byVariant.get(l.variantId) ?? opts.byProduct.get(l.productId);
    if (explicit != null && explicit < l.unitPrice) {
      memberPrices.set(l.variantId, explicit);
      explicitSavings += (l.unitPrice - explicit) * l.qty;
    } else {
      memberPrices.set(l.variantId, l.unitPrice);
    }
  }
  const pctBase = lines
    .filter((l) => (memberPrices.get(l.variantId) ?? l.unitPrice) >= l.unitPrice)
    .reduce((s, l) => s + (memberPrices.get(l.variantId) ?? l.unitPrice) * l.qty, 0);
  const pctDiscount = opts.pct > 0 ? Math.round((pctBase * opts.pct) / 100) : 0;
  return { memberPrices, explicitSavings, pctDiscount };
}

type PriceLine = PricedLine & { name: string; sku: string; productId: string; memberPrice: number };

export function resolvePricedLinesFromCatalog(
  lines: PricedLine[],
  variants: { id: string; productId: string; sku: string; priceOverride: number | null }[],
  productRows: { id: string; name: string; basePrice: number }[]
): PriceLine[] {
  const variantsById = new Map(variants.map((v) => [v.id, v]));
  const productsById = new Map(productRows.map((p) => [p.id, p]));
  return lines.map((l) => {
    const v = variantsById.get(l.variantId);
    if (!v) throw new Error(`Unknown variant ${l.variantId}`);
    const p = productsById.get(v.productId);
    const unit = v.priceOverride ?? p?.basePrice ?? 0;
    return { variantId: l.variantId, unitPrice: unit, qty: l.qty, name: p?.name ?? "Item", sku: v.sku, productId: v.productId, memberPrice: unit };
  });
}

// Centralized pipeline (the ONLY place discount rules execute):
//   Base Price → Product Promotion → Member Price / Discount →
//   Automatic Cart Promotion → Promo Code → Shipping Promotion → Final.
// Browser totals are display-only.
export async function calculateCartTotals(opts: {
  lines: PricedLine[];
  userId?: string;
  promoCode?: string;
  deliveryFee?: number;
  client?: DbClient;
}) {
  const client = opts.client ?? db;
  // Re-read authoritative prices (never trust client). unitPrice stays the
  // BASE price (order snapshot original); linePrice/memberPrice resolve down
  // the pipeline.
  let priced: PriceLine[] = [];
  const variantIds = [...new Set(opts.lines.map((l) => l.variantId))];
  const variantRows = variantIds.length > 0
    ? await client.select().from(productVariants).where(inArray(productVariants.id, variantIds))
    : [];
  const productIds = [...new Set(variantRows.map((v) => v.productId))];
  const productRows = productIds.length > 0
    ? await client.select().from(products).where(inArray(products.id, productIds))
    : [];
  priced = resolvePricedLinesFromCatalog(opts.lines, variantRows, productRows);
  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  // Promotion state once per calculation (scopes, rules, codes, tiers).
  const promoState = await loadPromoState({ customerId: opts.userId, code: opts.promoCode }, client);
  const coreCtx: CoreCtx = {
    now: promoState.now.toISOString(),
    memberTierIds: promoState.memberTierIds,
    isFirstOrder: promoState.isFirstOrder,
  };
  const coreLines: CoreLine[] = priced.map((l) => ({
    variantId: l.variantId,
    productId: l.productId,
    categoryId: null,
    brandId: null,
    unitPrice: l.unitPrice,
    qty: l.qty,
  }));
  // Attach catalog scope context for category/brand promos.
  const enriched = await enrichCoreLines(coreLines, client);
  const catBrand = new Map(enriched.map((l) => [l.variantId, l]));
  for (const l of coreLines) {
    const e = catBrand.get(l.variantId);
    if (e) {
      l.categoryId = e.categoryId;
      l.brandId = e.brandId;
    }
  }

  // Stage 2: product promotion (line-level, scoped).
  const lineStage = evaluateLineStage(coreLines, promoState.promos, coreCtx, subtotal);
  const lineDiscount = lineStage.discount;
  for (const l of priced) l.memberPrice = lineStage.prices.get(l.variantId) ?? l.unitPrice;

  // Stage 3: member price / membership discount (on promo-reduced prices).
  //   1. explicit member price (variant row wins, then product row), else
  //   2. best percent rule: max(auto-tier discount, paid-membership discount)
  //      applied only to lines WITHOUT an explicit price (no double-dipping).
  // Expired/suspended/cancelled memberships are rejected by
  // getActiveMembership, so they automatically confer nothing.
  let explicitSavings = 0;
  let memberPctDiscount = 0;
  let tierName: string | null = null;
  let membershipNo: string | null = null;
  if (opts.userId) {
    const c = await client.select().from(customers).where(eq(customers.userId, opts.userId)).limit(1);
    if (c[0]) {
      const autoTier = await tierForSpend(c[0].lifetimeSpend ?? 0, client);
      const paid = await getActiveMembership(c[0].id, client);
      let bestPct = autoTier && (autoTier.discountPct ?? 0) > 0 ? autoTier.discountPct : 0;
      let bestName: string | null = bestPct > 0 ? autoTier!.name : null;
      if (paid && paid.discountPct > bestPct) {
        bestPct = paid.discountPct;
        bestName = paid.tierName;
      }
      let byVariant = new Map<string, number>();
      let byProduct = new Map<string, number>();
      if (paid) {
        membershipNo = paid.membershipNo;
        ({ byVariant, byProduct } = await getMemberPrices(
          paid.tierId,
          priced.map((l) => l.variantId),
          [...new Set(priced.map((l) => l.productId))],
          client
        ));
        // Paid tier is the benefit source for explicit prices even at 0% rule.
        if (bestName == null) bestName = paid.tierName;
      }
      // Explicit member prices compare against the promo-reduced line price.
      const memberBase = priced.map((l) => ({ variantId: l.variantId, productId: l.productId, unitPrice: l.memberPrice, qty: l.qty }));
      const resolved = resolveMemberPricing(memberBase, { pct: bestPct, byVariant, byProduct });
      explicitSavings = resolved.explicitSavings;
      memberPctDiscount = resolved.pctDiscount;
      for (const l of priced) l.memberPrice = resolved.memberPrices.get(l.variantId) ?? l.memberPrice;
      if (bestPct > 0 || paid) tierName = bestName;
    }
  }
  const memberDiscount = explicitSavings + memberPctDiscount;

  // Stages 4-6: automatic cart promos → promo code → shipping waiver.
  const afterMember = subtotal - lineDiscount - memberDiscount;
  const cartStage = evaluateCartStage(afterMember, promoState.promos, coreCtx, opts.promoCode);
  const cartDiscount = Math.min(cartStage.discount, Math.max(0, afterMember));
  const promoDiscount = lineDiscount + cartDiscount;
  const deliveryFee = opts.deliveryFee ?? 0;
  const grandTotal = Math.max(0, afterMember - cartDiscount + deliveryFee);

  const cartApplied = cartStage.applied.find((a) => a.scope === "cart");
  return {
    lines: priced,
    subtotal,
    memberDiscount,
    explicitSavings,
    memberPctDiscount,
    lineDiscount,
    cartDiscount,
    tierName,
    membershipNo,
    promoDiscount,
    promoName: cartApplied?.name ?? (cartStage.applied.length > 1 ? "Stacked promos" : cartStage.applied[0]?.name ?? null),
    promotionId: cartApplied?.promotionId,
    codeId: cartApplied?.codeId,
    appliedPromos: [...lineStage.applied, ...cartStage.applied],
    shippingWaiver: cartStage.shippingWaiver,
    codeError: cartStage.codeError,
    deliveryFee,
    grandTotal,
  };
}
