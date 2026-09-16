import { db } from "@/db";
import {
  orders,
  orderItems,
  orderPromotions,
  refunds,
  products,
  productVariants,
  categories,
  customers,
  users,
  memberships,
  membershipTiers,
  inventoryBalances,
  inventoryMovements,
  promotions,
} from "@/db/schema";
import { desc, gte, gt, lt, and, eq, inArray, sql } from "drizzle-orm";
import { bucketKey, bucketRange, isLowStock, isOutOfStock, isRevenueOrder, weightedAverageCost, type Bucket } from "@/lib/reports";

export type DateRange = { from: Date; to: Date }; // [from, to)

function orderFilter(range: DateRange) {
  return and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to));
}

// ---------------------------------------------------------------- Sales ---
export type SalesBucket = { label: string; orders: number; revenue: number };

export async function getSalesReport(range: DateRange, bucket: Bucket = "day") {
  const labels = bucketRange(range.from, range.to, bucket);
  const per = new Map(labels.map((l) => [l, { orders: 0, revenue: 0 }]));
  const rows = await db
    .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus, grandTotal: orders.grandTotal, createdAt: orders.createdAt, snapshotTier: orders.snapshotTier, customerId: orders.customerId })
    .from(orders)
    .where(orderFilter(range))
    .limit(2000);
  const live = rows.filter(isRevenueOrder);
  for (const o of live) {
    const slot = per.get(bucketKey(o.createdAt, bucket));
    if (slot) {
      slot.orders++;
      slot.revenue += o.grandTotal;
    }
  }
  const refundRows = await db
    .select({ amount: refunds.amount, createdAt: refunds.createdAt })
    .from(refunds)
    .where(and(gte(refunds.createdAt, range.from), lt(refunds.createdAt, range.to), eq(refunds.status, "completed")))
    .limit(1000);
  for (const r of refundRows) {
    const slot = per.get(bucketKey(r.createdAt, bucket));
    if (slot) slot.revenue = Math.max(0, slot.revenue - r.amount);
  }
  const buckets: SalesBucket[] = labels.map((l) => ({ label: l, ...per.get(l)! }));
  const totals = {
    orders: live.length,
    revenue: buckets.reduce((s, b) => s + b.revenue, 0),
    refunds: refundRows.reduce((s, r) => s + r.amount, 0),
  };

  // By product / category (line totals of revenue orders).
  const liveIds = live.map((o) => o.id);
  const byProduct = new Map<string, { name: string; units: number; revenue: number }>();
  const byCategory = new Map<string, number>();
  if (liveIds.length > 0) {
    const items = await db
      .select({ orderId: orderItems.orderId, variantId: orderItems.variantId, qty: orderItems.quantity, lineTotal: orderItems.lineTotal })
      .from(orderItems)
      .where(inArray(orderItems.orderId, liveIds.slice(0, 1000)))
      .limit(5000);
    const vIds = [...new Set(items.map((i) => i.variantId).filter((x): x is string => !!x))];
    const vMap = new Map<string, string>();
    if (vIds.length > 0) {
      const vrows = await db.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.id, vIds));
      for (const v of vrows) vMap.set(v.id, v.productId);
    }
    const pIds = [...new Set(vMap.values())];
    const pMap = new Map<string, { name: string; categoryId: string | null }>();
    if (pIds.length > 0) {
      const prows = await db.select({ id: products.id, name: products.name, categoryId: products.categoryId }).from(products).where(inArray(products.id, pIds));
      for (const p of prows) pMap.set(p.id, { name: p.name, categoryId: p.categoryId });
    }
    const cIds = [...new Set([...pMap.values()].map((p) => p.categoryId).filter((x): x is string => !!x))];
    const cMap = new Map<string, string>();
    if (cIds.length > 0) {
      const crows = await db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, cIds));
      for (const c of crows) cMap.set(c.id, c.name);
    }
    for (const i of items) {
      if (!i.variantId) continue;
      const pid = vMap.get(i.variantId);
      if (!pid) continue;
      const p = pMap.get(pid);
      if (!p) continue;
      const prev = byProduct.get(pid) ?? { name: p.name, units: 0, revenue: 0 };
      prev.units += i.qty;
      prev.revenue += i.lineTotal;
      byProduct.set(pid, prev);
      const cat = (p.categoryId && cMap.get(p.categoryId)) || "Uncategorized";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + i.lineTotal);
    }
  }

  // By customer + by tier (order-level revenue).
  const custIds = [...new Set(live.map((o) => o.customerId).filter((x): x is string => !!x))];
  const custMap = new Map<string, string>();
  if (custIds.length > 0) {
    const urows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, custIds.slice(0, 500)));
    for (const u of urows) custMap.set(u.id, u.name ?? u.email);
  }
  const byCustomer = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const o of live) {
    if (!o.customerId) continue;
    const prev = byCustomer.get(o.customerId) ?? { name: custMap.get(o.customerId) ?? "Guest", orders: 0, revenue: 0 };
    prev.orders++;
    prev.revenue += o.grandTotal;
    byCustomer.set(o.customerId, prev);
  }
  const byTier = new Map<string, { orders: number; revenue: number }>();
  for (const o of live) {
    const t = o.snapshotTier ?? "No tier";
    const prev = byTier.get(t) ?? { orders: 0, revenue: 0 };
    prev.orders++;
    prev.revenue += o.grandTotal;
    byTier.set(t, prev);
  }

  return {
    buckets,
    totals,
    byProduct: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue),
    byCategory: [...byCategory.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byCustomer: [...byCustomer.values()].sort((a, b) => b.revenue - a.revenue),
    byTier: [...byTier.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.revenue - a.revenue),
  };
}

// ------------------------------------------------------------- Inventory ---
/** One receipt-cost bucket: totals received at a given unit cost + supplier.
 * Receipt totals across all locations — NOT remaining stock per cost (sales
 * deplete the aggregate balance without layer linkage). */
export type ReceiptCostLayer = {
  unitCost: number | null;
  qtyReceived: number;
  supplier: string | null;
  lastReceivedAt: Date;
  reference: string | null;
};

export type StockRow = {
  variantId: string;
  sku: string;
  productName: string;
  onHand: number;
  reserved: number;
  available: number;
  threshold: number | null;
  unitCost: number;
  /** Weighted-average over costed receipt layers; null when none exists. */
  wac: number | null;
  /** True when neither receipts nor static cost provide a unit cost. */
  costMissing: boolean;
  costLayers: ReceiptCostLayer[];
  value: number;
};

export async function getInventorySnapshot(): Promise<StockRow[]> {
  const rows = await db
    .select({
      variantId: inventoryBalances.variantId,
      sku: productVariants.sku,
      productName: products.name,
      onHand: inventoryBalances.onHand,
      reserved: inventoryBalances.reserved,
      threshold: products.lowStockThreshold,
      unitCost: productVariants.costPrice,
      productCost: products.costPrice,
    })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .limit(2000);
  const agg = new Map<string, StockRow>();
  const fallback = new Map<string, number | null>();
  for (const r of rows) {
    const prev = agg.get(r.variantId) ?? {
      variantId: r.variantId,
      sku: r.sku,
      productName: r.productName,
      onHand: 0,
      reserved: 0,
      available: 0,
      threshold: r.threshold,
      unitCost: 0,
      wac: null,
      costMissing: true,
      costLayers: [],
      value: 0,
    };
    prev.onHand += r.onHand ?? 0;
    prev.reserved += r.reserved ?? 0;
    agg.set(r.variantId, prev);
    if (fallback.get(r.variantId) == null) {
      fallback.set(r.variantId, r.unitCost ?? r.productCost ?? null);
    }
  }
  // Receipt-cost layers per variant (STOCK_RECEIVED + OPENING_STOCK, positive
  // qty only), grouped by (unitCost, supplier). NULL costs group together.
  const variantIds = [...agg.keys()];
  const layersByVariant = new Map<string, ReceiptCostLayer[]>();
  if (variantIds.length > 0) {
    const layerRows = await db
      .select({
        variantId: inventoryMovements.variantId,
        unitCost: inventoryMovements.unitCost,
        supplier: inventoryMovements.supplier,
        qtyReceived: sql<number>`COALESCE(SUM(${inventoryMovements.qtyOnHandChange}), 0)`,
        lastReceivedAt: sql<Date>`MAX(${inventoryMovements.createdAt})`,
        reference: sql<string | null>`MAX(${inventoryMovements.reference})`,
      })
      .from(inventoryMovements)
      .where(
        and(
          inArray(inventoryMovements.variantId, variantIds.slice(0, 1000)),
          inArray(inventoryMovements.reason, ["STOCK_RECEIVED", "OPENING_STOCK"]),
          gt(inventoryMovements.qtyOnHandChange, 0)
        )
      )
      .groupBy(inventoryMovements.variantId, inventoryMovements.unitCost, inventoryMovements.supplier)
      .limit(2000);
    for (const l of layerRows) {
      const qty = Number(l.qtyReceived ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const list = layersByVariant.get(l.variantId) ?? [];
      list.push({
        unitCost: l.unitCost ?? null,
        qtyReceived: qty,
        supplier: l.supplier ?? null,
        lastReceivedAt: l.lastReceivedAt ? new Date(l.lastReceivedAt) : new Date(0),
        reference: l.reference ?? null,
      });
      layersByVariant.set(l.variantId, list);
    }
  }
  for (const s of agg.values()) {
    const layers = (layersByVariant.get(s.variantId) ?? [])
      .sort((a, b) =>
        a.unitCost == null ? 1 : b.unitCost == null ? -1 : a.unitCost - b.unitCost
      )
      .slice(0, 10);
    const wac = weightedAverageCost(layers);
    const staticCost = fallback.get(s.variantId) ?? null;
    const effective = wac ?? staticCost ?? 0;
    s.costLayers = layers;
    s.wac = wac;
    s.costMissing = wac == null && staticCost == null;
    s.unitCost = effective;
    s.available = s.onHand - s.reserved;
    s.value = s.onHand * effective;
  }
  return [...agg.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

export async function getInventoryReport(range: DateRange) {
  const snapshot = await getInventorySnapshot();
  const low = snapshot.filter((s) => isLowStock(s.available, s.threshold));
  const out = snapshot.filter((s) => isOutOfStock(s.available));
  const valuation = snapshot.reduce((s, r) => s + r.value, 0);
  const moves = await db
    .select()
    .from(inventoryMovements)
    .where(and(gte(inventoryMovements.createdAt, range.from), lt(inventoryMovements.createdAt, range.to)))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(500);
  const adjustments = moves.filter((m) => m.reason.startsWith("ADJUSTMENT") || m.reason === "DAMAGE" || m.reason === "LOSS");
  return { snapshot, low, out, valuation, moves, adjustments };
}

// ------------------------------------------------------------- Customers ---
export async function getCustomerReport(range: DateRange) {
  const all = await db.select().from(customers).limit(2000);
  const inRange = all.filter((c) => c.createdAt >= range.from && c.createdAt < range.to);
  const top = [...all].sort((a, b) => (b.lifetimeSpend ?? 0) - (a.lifetimeSpend ?? 0)).slice(0, 20);
  const uIds = [...new Set([...inRange, ...top].map((c) => c.userId))];
  const uMap = new Map<string, string>();
  if (uIds.length > 0) {
    const urows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, uIds.slice(0, 500)));
    for (const u of urows) uMap.set(u.id, u.name ?? u.email);
  }
  return {
    newCount: inRange.length,
    newCustomers: inRange.map((c) => ({ id: c.id, name: uMap.get(c.userId) ?? "—", lifetimeSpend: c.lifetimeSpend ?? 0, createdAt: c.createdAt })),
    topCustomers: top.map((c) => ({ id: c.id, name: uMap.get(c.userId) ?? "—", lifetimeSpend: c.lifetimeSpend ?? 0 })),
    lifetime: [...all].sort((a, b) => (b.lifetimeSpend ?? 0) - (a.lifetimeSpend ?? 0)).slice(0, 100)
      .map((c) => ({ id: c.id, name: uMap.get(c.userId) ?? "—", lifetimeSpend: c.lifetimeSpend ?? 0 })),
  };
}

// ------------------------------------------------------------ Membership ---
export async function getMembershipReport(now = new Date(), expiringDays = 30) {
  const horizon = new Date(now.getTime() + expiringDays * 86400000);
  const rows = await db
    .select({ m: memberships, tierName: membershipTiers.name })
    .from(memberships)
    .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
    .limit(2000);
  const isLive = (expiresAt: Date | null) => !expiresAt || expiresAt >= now;
  const active = rows.filter((r) => r.m.status === "active" && isLive(r.m.expiresAt));
  const expiring = active.filter((r) => r.m.expiresAt && r.m.expiresAt < horizon);
  const expired = rows.filter((r) => r.m.status === "expired" || (r.m.status === "active" && !isLive(r.m.expiresAt)));
  const dist = new Map<string, number>();
  for (const r of active) dist.set(r.tierName, (dist.get(r.tierName) ?? 0) + 1);
  const fmt = (r: (typeof rows)[number]) => ({
    id: r.m.id,
    membershipNo: r.m.membershipNo,
    tierName: r.tierName,
    status: r.m.status,
    expiresAt: r.m.expiresAt,
  });
  return {
    activeCount: active.length,
    expiring: expiring.map(fmt),
    expired: expired.map(fmt),
    tierDist: [...dist.entries()].map(([label, value]) => ({ label, value })),
  };
}

// ------------------------------------------------------------ Promotions ---
export async function getPromoReport(range: DateRange) {
  const applied = await db
    .select()
    .from(orderPromotions)
    .where(and(gte(orderPromotions.createdAt, range.from), lt(orderPromotions.createdAt, range.to)))
    .limit(2000);
  const promoIds = [...new Set(applied.map((a) => a.promotionId))];
  const nameMap = new Map<string, string>();
  if (promoIds.length > 0) {
    const prows = await db.select({ id: promotions.id, name: promotions.name }).from(promotions).where(inArray(promotions.id, promoIds));
    for (const p of prows) nameMap.set(p.id, p.name);
  }
  const byPromo = new Map<string, { name: string; uses: number; discount: number; orderIds: Set<string> }>();
  for (const a of applied) {
    const prev = byPromo.get(a.promotionId) ?? { name: nameMap.get(a.promotionId) ?? "—", uses: 0, discount: 0, orderIds: new Set<string>() };
    prev.uses++;
    prev.discount += a.discount ?? 0;
    prev.orderIds.add(a.orderId);
    byPromo.set(a.promotionId, prev);
  }
  // Revenue associated = grand totals of orders where the promo applied.
  const allOrderIds = [...new Set(applied.map((a) => a.orderId))];
  const totalsMap = new Map<string, number>();
  if (allOrderIds.length > 0) {
    const orows = await db
      .select({ id: orders.id, grandTotal: orders.grandTotal, status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(inArray(orders.id, allOrderIds.slice(0, 1000)));
    for (const o of orows) {
      if (isRevenueOrder(o)) totalsMap.set(o.id, o.grandTotal);
    }
  }
  return [...byPromo.entries()].map(([id, v]) => ({
    id,
    name: v.name,
    uses: v.uses,
    discountIssued: v.discount,
    revenueAssociated: [...v.orderIds].reduce((s, oid) => s + (totalsMap.get(oid) ?? 0), 0),
  })).sort((a, b) => b.discountIssued - a.discountIssued);
}
