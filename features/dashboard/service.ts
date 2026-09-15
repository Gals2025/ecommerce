import { db } from "@/db";
import {
  orders,
  orderItems,
  refunds,
  products,
  productVariants,
  categories,
  customers,
  memberships,
  membershipTiers,
  inventoryBalances,
} from "@/db/schema";
import { sql, desc, gte, lt, and, eq, ne, inArray } from "drizzle-orm";
import {
  manilaDayRange,
  manilaMonthRange,
  bucketKey,
  bucketRange,
  isLowStock,
  isOutOfStock,
  isRevenueOrder,
} from "@/lib/reports";

export type DashboardCards = {
  salesToday: number;
  salesMonth: number;
  ordersToday: number;
  pendingOrders: number;
  awaitingVerification: number;
  customerCount: number;
  activeMembers: number;
  lowStock: number;
  outOfStock: number;
};

export type ChartPoint = { label: string; value: number };
export type ChartPair = { label: string; orders: number; revenue: number };

export type DashboardData = DashboardCards & {
  revenueDaily: ChartPair[];
  categorySales: ChartPoint[];
  topProducts: (ChartPoint & { units: number })[];
  membershipDist: ChartPoint[];
  recentOrders: { id: string; orderNo: string; status: string; grandTotal: number }[];
};

export type DashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; reason: "db-unreachable" };

export async function getDashboardMetrics(now = new Date()): Promise<DashboardResult> {
  try {
    const day = manilaDayRange(now);
    const month = manilaMonthRange(now);
    const from30 = new Date(day.start.getTime() - 29 * 86400000);

    // --- Cards: today's + month's sales (revenue orders only) ---
    // Paid-family revenue: paid/partially_paid or completed, never
    // cancelled/refunded (refunds subtract separately below).
    const paidFamily = sql`(${orders.status} NOT IN ('cancelled','refunded') AND (${orders.paymentStatus} IN ('paid','partially_paid') OR ${orders.status} = 'completed'))`;
    const salesRows = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.grandTotal}),0)` })
      .from(orders)
      .where(and(gte(orders.createdAt, day.start), lt(orders.createdAt, day.end), paidFamily));
    // Orders Today stays an intake count (all non-cancelled placed today).
    const [ordersTodayRow] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(and(gte(orders.createdAt, day.start), lt(orders.createdAt, day.end), ne(orders.status, "cancelled")));
    const monthRows = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.grandTotal}),0)` })
      .from(orders)
      .where(and(gte(orders.createdAt, month.start), lt(orders.createdAt, month.end), paidFamily));
    const refundDay = await db
      .select({ total: sql<number>`COALESCE(SUM(${refunds.amount}),0)` })
      .from(refunds)
      .where(and(gte(refunds.createdAt, day.start), lt(refunds.createdAt, day.end), eq(refunds.status, "completed")));
    const refundMonth = await db
      .select({ total: sql<number>`COALESCE(SUM(${refunds.amount}),0)` })
      .from(refunds)
      .where(and(gte(refunds.createdAt, month.start), lt(refunds.createdAt, month.end), eq(refunds.status, "completed")));

    const [pending] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(sql`${orders.status} IN ('pending','awaiting_payment','payment_verification')`);
    const [awaiting] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(eq(orders.paymentStatus, "pending_verification"));
    const [custs] = await db.select({ n: sql<number>`COUNT(*)` }).from(customers);
    const [activeM] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(memberships)
      .where(
        and(
          eq(memberships.status, "active"),
          sql`(${memberships.expiresAt} IS NULL OR ${memberships.expiresAt} >= NOW())`
        )
      );

    // --- Stock cards: threshold rule per product ---
    const balances = await db
      .select({
        variantId: inventoryBalances.variantId,
        onHand: inventoryBalances.onHand,
        reserved: inventoryBalances.reserved,
        threshold: products.lowStockThreshold,
      })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id));
    const availByVariant = new Map<string, { avail: number; threshold: number | null }>();
    for (const b of balances) {
      const prev = availByVariant.get(b.variantId) ?? { avail: 0, threshold: b.threshold };
      prev.avail += (b.onHand ?? 0) - (b.reserved ?? 0);
      availByVariant.set(b.variantId, prev);
    }
    let lowStock = 0;
    let outOfStock = 0;
    for (const { avail, threshold } of availByVariant.values()) {
      if (isOutOfStock(avail)) outOfStock++;
      else if (isLowStock(avail, threshold)) lowStock++;
    }

    // --- Charts: last 30 Manila days ---
    const days = bucketRange(from30, day.start, "day");
    const revByDay = new Map(days.map((d) => [d, { orders: 0, revenue: 0 }]));
    const recentOrders = await db
      .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status, paymentStatus: orders.paymentStatus, grandTotal: orders.grandTotal, createdAt: orders.createdAt })
      .from(orders)
      .where(gte(orders.createdAt, from30))
      .orderBy(desc(orders.createdAt))
      .limit(500);
    for (const o of recentOrders) {
      if (!isRevenueOrder(o)) continue;
      const key = bucketKey(o.createdAt, "day");
      const slot = revByDay.get(key);
      if (slot) {
        slot.orders++;
        slot.revenue += o.grandTotal;
      }
    }
    const recentRefunds = await db
      .select({ amount: refunds.amount, createdAt: refunds.createdAt })
      .from(refunds)
      .where(and(gte(refunds.createdAt, from30), eq(refunds.status, "completed")))
      .limit(500);
    for (const r of recentRefunds) {
      const key = bucketKey(r.createdAt, "day");
      const slot = revByDay.get(key);
      if (slot) slot.revenue = Math.max(0, slot.revenue - r.amount);
    }
    const revenueDaily: ChartPair[] = days.map((d) => ({ label: d.slice(5), ...revByDay.get(d)! }));

    // --- Category + top products (revenue orders in window) ---
    const revIds = recentOrders.filter(isRevenueOrder).map((o) => o.id);
    const catSales = new Map<string, number>();
    const prodSales = new Map<string, { name: string; units: number; revenue: number }>();
    if (revIds.length > 0) {
      const items = await db
        .select({ orderId: orderItems.orderId, variantId: orderItems.variantId, qty: orderItems.quantity, lineTotal: orderItems.lineTotal })
        .from(orderItems)
        .where(inArray(orderItems.orderId, revIds.slice(0, 500)))
        .limit(2000);
      const vIds = [...new Set(items.map((i) => i.variantId).filter((x): x is string => !!x))];
      const vMap = new Map<string, { productId: string }>();
      if (vIds.length > 0) {
        const vrows = await db
          .select({ id: productVariants.id, productId: productVariants.productId })
          .from(productVariants)
          .where(inArray(productVariants.id, vIds));
        for (const v of vrows) vMap.set(v.id, { productId: v.productId });
      }
      const pIds = [...new Set([...vMap.values()].map((v) => v.productId))];
      const pMap = new Map<string, { name: string; categoryId: string | null }>();
      if (pIds.length > 0) {
        const prows = await db
          .select({ id: products.id, name: products.name, categoryId: products.categoryId })
          .from(products)
          .where(inArray(products.id, pIds));
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
        const v = vMap.get(i.variantId);
        if (!v) continue;
        const p = pMap.get(v.productId);
        if (!p) continue;
        const cat = (p.categoryId && cMap.get(p.categoryId)) || "Uncategorized";
        catSales.set(cat, (catSales.get(cat) ?? 0) + i.lineTotal);
        const prev = prodSales.get(v.productId) ?? { name: p.name, units: 0, revenue: 0 };
        prev.units += i.qty;
        prev.revenue += i.lineTotal;
        prodSales.set(v.productId, prev);
      }
    }
    const categorySales: ChartPoint[] = [...catSales.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const topProducts = [...prodSales.values()]
      .sort((a, b) => b.units - a.units)
      .slice(0, 8)
      .map((p) => ({ label: p.name, value: p.revenue, units: p.units }));

    // --- Membership distribution (currently valid actives by tier) ---
    const mrows = await db
      .select({ tierName: membershipTiers.name, n: sql<number>`COUNT(*)` })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.status, "active"),
          sql`(${memberships.expiresAt} IS NULL OR ${memberships.expiresAt} >= NOW())`
        )
      )
      .groupBy(membershipTiers.name);
    const membershipDist: ChartPoint[] = mrows.map((r) => ({ label: r.tierName, value: Number(r.n) }));

    const recent = await db
      .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status, grandTotal: orders.grandTotal })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(5);

    return {
      ok: true,
      data: {
        salesToday: Math.max(0, Number(salesRows[0]?.total ?? 0) - Number(refundDay[0]?.total ?? 0)),
        salesMonth: Math.max(0, Number(monthRows[0]?.total ?? 0) - Number(refundMonth[0]?.total ?? 0)),
        ordersToday: Number(ordersTodayRow?.n ?? 0),
        pendingOrders: Number(pending?.n ?? 0),
        awaitingVerification: Number(awaiting?.n ?? 0),
        customerCount: Number(custs?.n ?? 0),
        activeMembers: Number(activeM?.n ?? 0),
        lowStock,
        outOfStock,
        revenueDaily,
        categorySales,
        topProducts,
        membershipDist,
        recentOrders: recent,
      },
    };
  } catch {
    return { ok: false, reason: "db-unreachable" };
  }
}
