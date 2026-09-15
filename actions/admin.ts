"use server";

import { db } from "@/db";
import {
  payments,
  orders,
  shipments,
  returns,
  returnItems,
  refunds,
  orderItems,
  inventoryLocations,
  inventoryMovements,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, getSession } from "@/lib/rbac";
import {
  stockMoveSchema,
  returnRequestSchema,
  approveReturnSchema,
  standaloneRefundSchema,
  type RefundMethod,
} from "@/lib/validations";
import {
  returnableQty,
  defaultRefundForLines,
  clampRefundAmount,
  remainingRefundable,
  refundStatusAfter,
  returnEligibility,
  isFullyReturned,
} from "@/lib/returns";
import { receiveStock, transferStock, recordMovement } from "@/lib/inventory";
import { transitionOrder, transitionFulfillment, transitionPayment } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { refundEmail } from "@/emails";
import { queueEmail } from "@/lib/email";
import { users } from "@/db/schema";

// Manual stock IN (purchase) or adjustment — always with movement
export async function stockIn(input: unknown) {
  const session = await requirePermission("inventory.adjust");
  const data = stockMoveSchema.parse(input);
  if (!data.locationId && !data.toLocationId) throw new Error("locationId required");
  const loc = (data.toLocationId ?? data.locationId)!;
  await db.transaction(async (tx) => {
    await receiveStock(tx, data.variantId, loc, data.qty, {
      movementType: data.reason === "return" ? "CUSTOMER_RETURN" : "STOCK_RECEIVED",
      refType: "adjustment",
      note: data.note,
      createdBy: session.user.id,
    });
  });
  await audit(session.user.id, "inventory.stock_in", "variants", data.variantId, data);
}

// Transfer between locations
export async function stockTransfer(input: unknown) {
  const session = await requirePermission("inventory.transfer");
  const data = stockMoveSchema.parse(input);
  if (!data.fromLocationId || !data.toLocationId) throw new Error("from/to required");
  await db.transaction(async (tx) => {
    await transferStock(tx, data.variantId, data.fromLocationId!, data.toLocationId!, data.qty, {
      refType: "transfer",
      note: data.note,
      createdBy: session.user.id,
    });
  });
  await audit(session.user.id, "inventory.transfer", "variants", data.variantId, data);
}

// CS/Admin: set manual delivery fee + details, recompute grand total
export async function setDeliveryFee(orderId: string, feeCentavos: number, notes?: string) {
  const parsed = z.object({
    orderId: z.string().uuid(),
    feeCentavos: z.number().int().min(0).max(10000000),
    notes: z.string().max(500).optional(),
  }).parse({ orderId, feeCentavos, notes });
  orderId = parsed.orderId;
  feeCentavos = parsed.feeCentavos;
  notes = parsed.notes;
  const session = await requirePermission("orders.set_delivery_fee");
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order[0]) throw new Error("Order not found");
  const ship = await db.select().from(shipments).where(eq(shipments.orderId, orderId)).limit(1);
  // Free-shipping waiver (granted by promo at checkout) caps the confirmed fee.
  const effectiveFee = order[0].shippingWaiver != null ? Math.min(feeCentavos, order[0].shippingWaiver) : feeCentavos;
  await db.transaction(async (tx) => {
    await tx.update(shipments).set({ fee: effectiveFee, notes: notes ?? ship[0]?.notes ?? null, updatedAt: new Date() }).where(eq(shipments.orderId, orderId));
    const grand = order[0].subtotal - order[0].discountMember - order[0].discountPromo + effectiveFee;
    await tx.update(orders).set({ deliveryFee: effectiveFee, grandTotal: grand, updatedAt: new Date() }).where(eq(orders.id, orderId));
    const pay = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    if (pay[0]) await tx.update(payments).set({ amount: grand, updatedAt: new Date() }).where(eq(payments.id, pay[0].id));
  });
  await audit(session.user.id, "order.delivery_fee", "orders", orderId, { requested: feeCentavos, applied: effectiveFee, waiver: order[0].shippingWaiver, notes });
}

// Verify / reject manual e-wallet payment. Delegates to the order-ops engine
// (approve captures reserved stock, reject keeps reservations for resubmit).
export async function verifyPayment(orderId: string, approve: boolean) {
  const { decidePayment } = await import("./order-ops");
  return decidePayment(orderId, approve ? "approve" : "reject");
}

// Returns & refunds
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const RETURNABLE_ITEM_STATUSES = ["requested", "approved", "completed"] as const;

async function returnedQtys(tx: Tx, orderItemIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderItemIds.length === 0) return out;
  const rows = await tx
    .select({ orderItemId: returnItems.orderItemId, qty: returnItems.qty, status: returns.status })
    .from(returnItems)
    .innerJoin(returns, eq(returnItems.returnId, returns.id))
    .where(inArray(returnItems.orderItemId, orderItemIds));
  for (const r of rows) {
    if (!(RETURNABLE_ITEM_STATUSES as readonly string[]).includes(r.status)) continue;
    out.set(r.orderItemId, (out.get(r.orderItemId) ?? 0) + r.qty);
  }
  return out;
}

/** DB-backed wrapper: loads refund rows, then applies the pure cap rule. */
async function remainingRefundableForOrder(tx: Tx, orderId: string, grandTotal: number): Promise<number> {
  const rows = await tx.select({ amount: refunds.amount, status: refunds.status }).from(refunds).where(eq(refunds.orderId, orderId));
  return remainingRefundable(grandTotal, rows);
}

function defaultRefundMethod(payMethod: string | null | undefined): RefundMethod {
  if (payMethod === "bank_transfer" || payMethod === "gcash_manual" || payMethod === "cod") return payMethod;
  return "cash"; // pay_at_store and anything else settle at the counter
}

export async function requestReturn(input: unknown) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const data = returnRequestSchema.parse(input);

  const retId = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (!order || order.customerId !== session.user.id) throw new Error("Order not found");
    const open = await tx
      .select({ id: returns.id })
      .from(returns)
      .where(and(eq(returns.orderId, data.orderId), eq(returns.status, "requested")))
      .limit(1);
    const gate = returnEligibility({
      fulfillmentStatus: order.fulfillmentStatus,
      status: order.status,
      createdAt: order.createdAt,
      hasOpenRequest: open.length > 0,
    });
    if (!gate.ok) throw new Error(gate.reason);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, data.orderId));
    const byId = new Map(items.map((i) => [i.id, i]));
    const returned = await returnedQtys(tx, data.lines.map((l) => l.orderItemId));
    for (const l of data.lines) {
      const oi = byId.get(l.orderItemId);
      if (!oi) throw new Error("Order item not found in this order");
      const left = returnableQty(oi.quantity, returned.get(l.orderItemId) ?? 0);
      if (l.qty > left) {
        throw new Error(`Only ${left} × ${oi.productName} can still be returned`);
      }
    }
    const [ret] = await tx.insert(returns).values({ orderId: data.orderId, reason: data.reason.trim(), status: "requested" }).returning();
    for (const l of data.lines) {
      await tx.insert(returnItems).values({ returnId: ret.id, orderItemId: l.orderItemId, qty: l.qty });
    }
    return ret.id;
  });
  await audit(session.user.id, "return.request", "returns", retId, { orderId: data.orderId, reason: data.reason });
  return retId;
}

export async function approveReturn(input: unknown) {
  const session = await requirePermission("orders.manage_returns");
  const data = approveReturnSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const [ret] = await tx.select().from(returns).where(eq(returns.id, data.returnId)).limit(1);
    if (!ret) throw new Error("Return not found");
    if (ret.status !== "requested") throw new Error(`Return is already ${ret.status}`);
    if (!data.approve) {
      await tx.update(returns).set({ status: "rejected", updatedAt: new Date() }).where(eq(returns.id, data.returnId));
      return { refundId: null as string | null, rejected: true as const };
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, ret.orderId)).limit(1);
    if (!order) throw new Error("Order not found");
    const items = await tx.select().from(returnItems).where(eq(returnItems.returnId, data.returnId));
    if (items.length === 0) throw new Error("Return has no items");
    const dispByItem = new Map(data.lines.map((l) => [l.returnItemId, l.disposition]));
    for (const ri of items) {
      if (!dispByItem.has(ri.id)) throw new Error("Disposition required for every return line (restock or damaged)");
    }
    // Original reservation locations keep restocks traceable to source.
    const reserves = await tx
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.refType, "order"),
          eq(inventoryMovements.refId, order.id),
          eq(inventoryMovements.reason, "RESERVATION")
        )
      );
    const locByVariant = new Map(reserves.filter((r) => r.fromLocationId).map((r) => [r.variantId, r.fromLocationId as string]));
    const fallback = (await tx.select({ id: inventoryLocations.id }).from(inventoryLocations).limit(1))[0]?.id ?? null;

    const orderItemIds = items.map((ri) => ri.orderItemId);
    const orderRows = orderItemIds.length > 0
      ? await tx.select().from(orderItems).where(inArray(orderItems.id, orderItemIds))
      : [];
    const orderItemById = new Map(orderRows.map((oi) => [oi.id, oi]));
    const refundLines: { unitPrice: number; qty: number }[] = [];
    for (const ri of items) {
      const oi = orderItemById.get(ri.orderItemId);
      if (!oi) throw new Error("Order item not found");
      refundLines.push({ unitPrice: oi.effectiveUnitPrice, qty: ri.qty });
      const disposition = dispByItem.get(ri.id)!;
      await tx.update(returnItems).set({ disposition }).where(eq(returnItems.id, ri.id));
      if (!oi.variantId) continue;
      if (disposition === "restock") {
        const locId = locByVariant.get(oi.variantId) ?? fallback;
        if (!locId) throw new Error("No inventory location available for restock");
        await receiveStock(tx, oi.variantId, locId, ri.qty, {
          movementType: "REFUND_RESTOCK",
          refType: "return",
          refId: data.returnId,
          createdBy: session.user.id,
        });
      } else {
        // Damaged: zero-delta DAMAGE movement for the audit trail.
        // Balances are untouched — damaged merchandise is NEVER restocked.
        await recordMovement(
          {
            variantId: oi.variantId,
            fromLocationId: locByVariant.get(oi.variantId) ?? fallback,
            qtyOnHandChange: 0,
            qtyReservedChange: 0,
            reason: "DAMAGE",
            refType: "return",
            refId: data.returnId,
            note: `Damaged return, ${ri.qty} × ${oi.sku} not restocked`,
            createdBy: session.user.id,
          },
          tx
        );
      }
    }

    const defaultRefund = defaultRefundForLines(refundLines);
    const amount = clampRefundAmount(data.refundAmount, defaultRefund);
    const [pay] = await tx.select({ method: payments.method }).from(payments).where(eq(payments.orderId, order.id)).limit(1);
    const remaining = await remainingRefundableForOrder(tx, order.id, order.grandTotal);
    if (amount > remaining) throw new Error(`Only ${remaining} remains refundable on this order`);
    let refundId: string | null = null;
    if (amount > 0) {
      const [row] = await tx
        .insert(refunds)
        .values({
          orderId: order.id,
          returnId: data.returnId,
          amount,
          method: data.method ?? defaultRefundMethod(pay?.method),
          status: "pending",
          reason: `Return ${data.returnId.slice(0, 8)}: ${ret.reason}`.slice(0, 1000),
        })
        .returning();
      refundId = row.id;
    }
    await tx.update(returns).set({ status: "approved", updatedAt: new Date() }).where(eq(returns.id, data.returnId));

    // Fulfillment → returned only when EVERY purchased unit is now returned.
    // returnedQty already includes this request (status=requested counts as
    // non-rejected), so no manual addition is needed.
    const allItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const returnedMap = await returnedQtys(tx, allItems.map((oi) => oi.id));
    const fullyReturned = isFullyReturned(
      allItems.map((oi) => ({ orderItemId: oi.id, quantity: oi.quantity })),
      returnedMap
    );
    if (fullyReturned && order.fulfillmentStatus !== "returned") {
      try {
        await transitionFulfillment(tx, order.id, "returned", session.user.id, `Return ${data.returnId} approved (full)`);
      } catch { /* already terminal — history still records the approval */ }
    }
    return { refundId, rejected: false as const };
  });
  if (result.rejected) {
    await audit(session.user.id, "return.reject", "returns", data.returnId, {});
    return { refundId: null as string | null };
  }
  await audit(session.user.id, "return.approve", "returns", data.returnId, { refundId: result.refundId });
  return { refundId: result.refundId };
}

export async function completeRefund(refundId: string) {
  refundId = z.string().uuid().parse(refundId);
  const session = await requirePermission("orders.manage_refunds");
  const rows = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (!rows[0]) throw new Error("Refund not found");
  if (rows[0].status !== "pending") throw new Error(`Refund is already ${rows[0].status}`);
  const orderId = rows[0].orderId;
  await db.transaction(async (tx) => {
    const [freshRefund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!freshRefund) throw new Error("Refund not found");
    if (freshRefund.status !== "pending") throw new Error(`Refund is already ${freshRefund.status}`);
    await tx.update(refunds).set({ status: "completed", processedBy: session.user.id, updatedAt: new Date() }).where(eq(refunds.id, refundId));
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("Order not found");
    // Original order totals are preserved; only statuses move.
    const completed = await tx.select({ amount: refunds.amount }).from(refunds).where(and(eq(refunds.orderId, orderId), eq(refunds.status, "completed")));
    const totalRefunded = completed.reduce((s, r) => s + r.amount, 0);
    const derived = refundStatusAfter(totalRefunded, order.grandTotal);
    if (derived === "refunded") {
      if (order.paymentStatus !== "refunded") {
        try {
          await transitionPayment(tx, orderId, "refunded", session.user.id, "Refund completed (full)");
        } catch { /* terminal payment state — leave it */ }
      }
      if (order.status !== "refunded") {
        await transitionOrder(tx, orderId, "refunded", session.user.id, "Refund completed (full)");
      }
    } else if (order.paymentStatus !== "partially_refunded" && order.paymentStatus !== "refunded") {
      try {
        await transitionPayment(tx, orderId, "partially_refunded", session.user.id, "Partial refund completed");
      } catch { /* terminal payment state — leave it */ }
    }
  });
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [cust] = await db.select().from(users).where(eq(users.id, order[0]?.customerId ?? ""));
  if (cust?.email && order[0]) {
    const { subject, html } = refundEmail(order[0].orderNo, rows[0].amount);
    await queueEmail({ to: cust.email, template: "refund", subject, html, orderId, userId: order[0].customerId });
  }
  await audit(session.user.id, "refund.complete", "orders", orderId, { refundId, amount: rows[0].amount });
  return true;
}

export async function issueStandaloneRefund(input: unknown) {
  const session = await requirePermission("orders.manage_refunds");
  const data = standaloneRefundSchema.parse(input);
  const refundId = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (!order) throw new Error("Order not found");
    if (["cancelled", "refunded"].includes(order.status)) {
      throw new Error(`Cannot refund a ${order.status} order`);
    }
    if (!["paid", "partially_paid"].includes(order.paymentStatus)) {
      throw new Error(`Order payment is ${order.paymentStatus} — nothing to refund`);
    }
    const remaining = await remainingRefundableForOrder(tx, order.id, order.grandTotal);
    if (data.amount > remaining) throw new Error(`Only ${remaining} remains refundable on this order`);
    const [row] = await tx
      .insert(refunds)
      .values({ orderId: order.id, returnId: null, amount: data.amount, method: data.method, status: "pending", reason: data.reason.trim() })
      .returning();
    return row.id;
  });
  await audit(session.user.id, "refund.issue", "orders", data.orderId, { refundId, amount: data.amount, reason: data.reason });
  return refundId;
}
