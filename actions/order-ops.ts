"use server";

import { db } from "@/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  orderNotes,
  orderPromotions,
  emailLogs,
  payments,
  shipments,
  shippingMethods,
  inventoryMovements,
  customers,
  customerMemberships,
  users,
  promotions,
  promotionCodes,
  promotionUsage,
  refunds,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission, getSession } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import {
  proofSubmissionSchema,
  fulfillmentUpdateSchema,
  cancelOrderSchema,
  orderNoteSchema,
  paymentDecisionSchema,
  type PaymentDecision,
} from "@/validators";
import { z } from "zod";
import {
  transitionOrder,
  transitionPayment,
  transitionFulfillment,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  FULFILLMENT_STATUSES,
} from "@/lib/orders";
import type { OrderStatus } from "@/types";
import { captureStock, releaseStock, increaseStock } from "@/lib/inventory";
import { tierForSpend } from "@/lib/membership";
import { remainingRefundable } from "@/lib/returns";
import { queueEmail } from "@/lib/email";
import {
  paymentVerifiedEmail,
  paymentReceivedEmail,
  orderProcessingEmail,
  readyForPickupEmail,
  shippedEmail,
  completedEmail,
  cancelledEmail,
} from "@/emails";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type StaffOrderDetail = Awaited<ReturnType<typeof getStaffOrderDetail>>;

const orderIdSchema = z.string().uuid();

export async function getStaffOrderDetail(orderId: string) {
  orderId = orderIdSchema.parse(orderId);
  await requirePermission("orders.verify_payment");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
  const [ship] = await db.select().from(shipments).where(eq(shipments.orderId, orderId)).limit(1);
  const [method] = ship?.shippingMethodId
    ? await db.select().from(shippingMethods).where(eq(shippingMethods.id, ship.shippingMethodId)).limit(1)
    : [];
  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(orderStatusHistory.createdAt);
  const notes = await db
    .select()
    .from(orderNotes)
    .where(eq(orderNotes.orderId, orderId))
    .orderBy(orderNotes.createdAt);
  const appliedPromos = await db
    .select({
      id: orderPromotions.id,
      promotionId: orderPromotions.promotionId,
      scope: orderPromotions.scope,
      discount: orderPromotions.discount,
      name: promotions.name,
      code: promotionCodes.code,
    })
    .from(orderPromotions)
    .leftJoin(promotions, eq(orderPromotions.promotionId, promotions.id))
    .leftJoin(promotionCodes, eq(orderPromotions.codeId, promotionCodes.id))
    .where(eq(orderPromotions.orderId, orderId));
  const orderRefunds = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
  const emailHistory = await db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.orderId, orderId))
    .orderBy(desc(emailLogs.createdAt))
    .limit(50);
  let customer: { name: string | null; email: string | null; mobile: string | null; tier: string | null; lifetimeSpend: number } | null = null;
  if (order.customerId) {
    const [u] = await db.select().from(users).where(eq(users.id, order.customerId)).limit(1);
    const [c] = await db.select().from(customers).where(eq(customers.userId, order.customerId)).limit(1);
    const tier = c ? await tierForSpend(c.lifetimeSpend ?? 0) : null;
    customer = {
      name: u?.name ?? null,
      email: u?.email ?? null,
      mobile: c?.mobile ?? null,
      tier: tier?.name ?? null,
      lifetimeSpend: c?.lifetimeSpend ?? 0,
    };
  }
  return { order, items, payment: pay ?? null, shipment: ship ?? null, shippingMethod: method ?? null, history, notes, appliedPromos, refunds: orderRefunds, emails: emailHistory, customer };
}

export async function addOrderNote(input: unknown) {
  const session = await requirePermission("orders.verify_payment");
  const data = orderNoteSchema.parse(input);
  const [note] = await db
    .insert(orderNotes)
    .values({ orderId: data.orderId, authorId: session.user.id, body: data.body.trim() })
    .returning();
  await audit(session.user.id, "order.note", "orders", data.orderId, { body: data.body.slice(0, 200) });
  revalidatePath(`/admin/orders/${data.orderId}`);
  return note.id;
}

// ---------------------------------------------------------------------------
// Customer: submit reference number + proof of payment (manual methods)
// ---------------------------------------------------------------------------

export async function submitProof(input: unknown) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const data = proofSubmissionSchema.parse(input);

  const [order] = await db.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
  if (!order || order.customerId !== session.user.id) throw new Error("Order not found");
  if (["completed", "cancelled", "refunded"].includes(order.status)) {
    throw new Error(`Order is ${order.status} — proof can no longer be submitted`);
  }
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, data.orderId)).limit(1);
  if (!pay) throw new Error("Payment not found");
  if (!["bank_transfer", "gcash_manual"].includes(pay.method)) {
    throw new Error("Proof submission applies to bank transfer / GCash manual payments");
  }
  if (!["pending", "rejected"].includes(pay.status)) {
    throw new Error(`Payment already ${pay.status}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        referenceNo: data.referenceNo.trim(),
        proofUrl: data.proofUrl ?? pay.proofUrl,
        status: "submitted",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, pay.id));
    if (order.paymentStatus === "unpaid" || order.paymentStatus === "failed") {
      await transitionPayment(
        tx,
        data.orderId,
        "pending_verification",
        session.user.id,
        `Proof submitted (ref ${data.referenceNo.trim()})`
      );
    } else {
      await tx.insert(orderStatusHistory).values({
        orderId: data.orderId,
        fromStatus: "payment:pending_verification",
        toStatus: "payment:pending_verification",
        actorId: session.user.id,
        note: `Proof re-submitted (ref ${data.referenceNo.trim()})`,
      });
    }
    if (["pending", "awaiting_payment"].includes(order.status)) {
      await transitionOrder(tx, data.orderId, "payment_verification", session.user.id, "Customer submitted proof");
    }
  });
  await audit(session.user.id, "payment.submit_proof", "orders", data.orderId, { referenceNo: data.referenceNo });
  if (session.user.email) {
    const { subject, html } = paymentReceivedEmail(order.orderNo);
    await queueEmail({ to: session.user.email, template: "payment_received", subject, html, orderId: data.orderId, userId: session.user.id });
  }
  revalidatePath(`/account/orders/${data.orderId}`);
  return true;
}

// ---------------------------------------------------------------------------
// Staff: payment verification (verify / reject / mark paid / mark partial)
// ---------------------------------------------------------------------------

async function captureReservations(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  orderNo: string,
  actorId: string
) {
  const reserves = await tx
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.refType, "order"),
        eq(inventoryMovements.refId, orderId),
        eq(inventoryMovements.reason, "RESERVATION")
      )
    );
  const sorted = [...reserves].sort((a, b) =>
    a.variantId === b.variantId
      ? (a.fromLocationId ?? "") < (b.fromLocationId ?? "") ? -1 : 1
      : a.variantId < b.variantId ? -1 : 1
  );
  for (const r of sorted) {
    if (!r.fromLocationId) continue;
    await captureStock(tx, r.variantId, r.fromLocationId, r.qtyReservedChange, {
      refType: "order",
      refId: orderId,
      note: `Capture for order ${orderNo}`,
      createdBy: actorId,
    });
  }
}

export async function decidePayment(orderId: string, decision: PaymentDecision, note?: string) {
  orderId = orderIdSchema.parse(orderId);
  decision = paymentDecisionSchema.parse(decision);
  const session = await requirePermission("orders.verify_payment");
  const cleanNote = note?.trim() ? note.trim().slice(0, 500) : undefined;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("Order not found");
    const [pay] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    if (!pay) throw new Error("Payment not found");
    // Idempotency guard, re-checked INSIDE the tx: only pending/submitted
    // payments transition, so double-submits fail closed.
    if (pay.status !== "pending" && pay.status !== "submitted") {
      throw new Error(`Payment already ${pay.status}`);
    }

    if (decision === "reject") {
      await tx
        .update(payments)
        .set({ status: "rejected", verifiedBy: session.user.id, verifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, pay.id));
      await transitionPayment(tx, orderId, "failed", session.user.id, cleanNote ?? "Payment rejected");
      // Reservations are KEPT so the customer can resubmit valid proof;
      // use Cancel order to release stock.
      if (["pending", "payment_verification"].includes(order.status)) {
        await transitionOrder(tx, orderId, "awaiting_payment", session.user.id, cleanNote ?? "Payment rejected — awaiting valid proof");
      }
      return { captured: false, notify: false };
    }

    if (decision === "mark_partial") {
      // Partial payment recorded WITHOUT verifying: the payment row stays
      // submittable so a later approve/mark_paid can capture stock and flip
      // to paid (previously verified here, which dead-ended the balance path).
      await tx
        .update(payments)
        .set({ status: "submitted", updatedAt: new Date() })
        .where(eq(payments.id, pay.id));
      await transitionPayment(tx, orderId, "partially_paid", session.user.id, cleanNote ?? "Partial payment recorded");
      // Stock stays RESERVED until the balance is paid (no capture yet).
      if (["pending", "awaiting_payment", "payment_verification"].includes(order.status)) {
        await transitionOrder(tx, orderId, "confirmed", session.user.id, "Partial payment confirmed");
      }
      return { captured: false, notify: true };
    }

    // approve | mark_paid: money in hand — verify, mark paid, capture stock.
    await tx
      .update(payments)
      .set({ status: "verified", verifiedBy: session.user.id, verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, pay.id));
    if (order.paymentStatus === "partially_paid") {
      await transitionPayment(tx, orderId, "paid", session.user.id, cleanNote ?? "Balance paid in full");
    } else if (order.paymentStatus !== "paid") {
      await transitionPayment(tx, orderId, "paid", session.user.id, cleanNote ?? "Payment verified");
    }
    if (["pending", "awaiting_payment", "payment_verification"].includes(order.status)) {
      await transitionOrder(tx, orderId, "confirmed", session.user.id, cleanNote ?? "Payment verified");
    }
    await captureReservations(tx, orderId, order.orderNo, session.user.id);
    return { captured: true, notify: true };
  });

  await audit(session.user.id, `payment.${decision}`, "orders", orderId, { note: cleanNote });
  if (result.notify) {
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const [cust] = await db.select().from(users).where(eq(users.id, o?.customerId ?? "")).limit(1);
    if (cust?.email && o) {
      const { subject, html } = paymentVerifiedEmail(o.orderNo);
      await queueEmail({ to: cust.email, template: "payment_verified", subject, html, orderId, userId: o.customerId });
    }
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return true;
}

// ---------------------------------------------------------------------------
// Staff: fulfillment controls
// ---------------------------------------------------------------------------

// Fulfillment move -> coupled master-order move (applied only when legal).
// Intermediate packing states couple to processing (no-op once past it);
// terminal moves drive shipped/completed.
const ORDER_COUPLING: Record<string, string> = {
  processing: "processing",
  partially_fulfilled: "processing",
  fulfilled: "processing",
  ready: "ready_for_pickup",
  shipped: "shipped",
  delivered: "completed",
};

export async function setFulfillmentStatus(input: unknown) {
  const session = await requirePermission("orders.manage_fulfillment");
  const data = fulfillmentUpdateSchema.parse(input);

  await db.transaction(async (tx) => {
    await transitionFulfillment(tx, data.orderId, data.to, session.user.id, data.note);
    const coupled = ORDER_COUPLING[data.to];
    if (coupled) {
      const [fresh] = await tx.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
      if (fresh && fresh.status !== coupled) {
        try {
          await transitionOrder(tx, data.orderId, coupled as OrderStatus, session.user.id, `Fulfillment → ${data.to}`);
        } catch {
          // Coupling is best-effort: the fulfillment move itself stands.
        }
      }
    }
    const shipStatus =
      data.to === "delivered" ? "completed"
      : data.to === "shipped" ? "shipped"
      : data.to === "ready" ? "ready"
      : null;
    if (shipStatus) {
      await tx
        .update(shipments)
        .set({ status: shipStatus, updatedAt: new Date() })
        .where(eq(shipments.orderId, data.orderId));
    }
  });
  await audit(session.user.id, "order.fulfillment", "orders", data.orderId, { to: data.to, note: data.note });
  // Customer notification for the customer-visible milestones (post-commit).
  const [moved] = await db.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
  if (moved?.customerId) {
    const [cust] = await db.select().from(users).where(eq(users.id, moved.customerId)).limit(1);
    if (cust?.email) {
      const pick = data.to === "processing"
        ? { template: "order_processing" as const, ...orderProcessingEmail(moved.orderNo) }
        : data.to === "ready" && moved.fulfillment === "pickup"
          ? { template: "ready_for_pickup" as const, ...readyForPickupEmail(moved.orderNo) }
          : data.to === "shipped"
            ? { template: "shipped" as const, ...shippedEmail(moved.orderNo) }
            : data.to === "delivered"
              ? { template: "completed" as const, ...completedEmail(moved.orderNo) }
              : null;
      if (pick) {
        await queueEmail({ to: cust.email, template: pick.template, subject: pick.subject, html: pick.html, orderId: data.orderId, userId: moved.customerId });
      }
    }
  }
  revalidatePath(`/admin/orders/${data.orderId}`);
  revalidatePath("/admin/orders");
  return true;
}

// ---------------------------------------------------------------------------
// Staff: cancellation with state-dependent inventory correction
// ---------------------------------------------------------------------------

export async function cancelOrderFull(input: unknown) {
  const session = await requirePermission("orders.verify_payment");
  const data = cancelOrderSchema.parse(input);
  const cleanNote = data.note?.trim() ? data.note.trim().slice(0, 500) : undefined;

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (!order) throw new Error("Order not found");

    // Group movements per (variant, location): still-reserved vs already-sold.
    const moves = await tx
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.refType, "order"), eq(inventoryMovements.refId, data.orderId)));
    const byLeg = new Map<string, { variantId: string; locationId: string; reserved: number; sold: number }>();
    for (const m of moves) {
      const loc = m.fromLocationId ?? m.toLocationId;
      if (!loc) continue;
      const key = `${m.variantId}|${loc}`;
      const leg = byLeg.get(key) ?? { variantId: m.variantId, locationId: loc, reserved: 0, sold: 0 };
      if (m.reason === "RESERVATION") leg.reserved += m.qtyReservedChange;
      if (m.reason === "SALE") leg.sold += -m.qtyReservedChange; // SALE stores -qty
      byLeg.set(key, leg);
    }
    const legs = [...byLeg.values()].sort((a, b) =>
      a.variantId === b.variantId
        ? a.locationId < b.locationId ? -1 : 1
        : a.variantId < b.variantId ? -1 : 1
    );
    let capturedAny = false;
    for (const leg of legs) {
      const pending = leg.reserved - leg.sold;
      // Reserved but never captured -> release back to available.
      if (pending > 0) {
        await releaseStock(tx, leg.variantId, leg.locationId, pending, {
          refType: "order",
          refId: data.orderId,
          note: cleanNote ?? `Order ${order.orderNo} cancelled`,
          createdBy: session.user.id,
        }, "ORDER_CANCELLATION");
      }
      // Already captured (sold) -> restock on_hand.
      if (leg.sold > 0) {
        capturedAny = true;
        await increaseStock(tx, leg.variantId, leg.locationId, leg.sold, "ORDER_CANCELLATION", {
          refType: "order",
          refId: data.orderId,
          note: cleanNote ?? `Restock on cancellation of ${order.orderNo}`,
          createdBy: session.user.id,
        });
      }
    }

    // Roll back the merchandise spend credited at checkout (delivery fees are
    // set post-checkout and never touched lifetimeSpend, so exclude them).
    if (order.customerId) {
      const [cust] = await tx.select().from(customers).where(eq(customers.userId, order.customerId)).limit(1);
      if (cust) {
        const merchandise = order.subtotal - order.discountMember - order.discountPromo;
        const rolled = Math.max(0, (cust.lifetimeSpend ?? 0) - merchandise);
        await tx.update(customers).set({ lifetimeSpend: rolled, updatedAt: new Date() }).where(eq(customers.id, cust.id));
        const tier = await tierForSpend(rolled);
        if (tier) {
          await tx.delete(customerMemberships).where(eq(customerMemberships.customerId, cust.id));
          await tx.insert(customerMemberships).values({ customerId: cust.id, tierId: tier.id });
        }
      }
    }

    // Release the promo slot AND its usage rows: per-customer limits count
    // promotionUsage rows, so keeping them would burn the customer's slot.
    const usages = await tx.select().from(promotionUsage).where(eq(promotionUsage.orderId, data.orderId));
    for (const u of usages) {
      if (u.codeId) {
        await tx
          .update(promotionCodes)
          .set({ usedCount: sql`GREATEST(${promotionCodes.usedCount} - 1, 0)`, updatedAt: new Date() })
          .where(eq(promotionCodes.id, u.codeId));
      }
    }
    if (usages.length > 0) {
      await tx.delete(promotionUsage).where(eq(promotionUsage.orderId, data.orderId));
    }

    // Money already captured (or recorded paid) must not end silently as
    // paid+cancelled: raise a pending refund for the remaining balance.
    const paidMoney = capturedAny || order.paymentStatus === "paid" || order.paymentStatus === "partially_paid";
    if (paidMoney) {
      const existingRefunds = await tx.select({ amount: refunds.amount, status: refunds.status }).from(refunds).where(eq(refunds.orderId, data.orderId));
      const remaining = remainingRefundable(order.grandTotal, existingRefunds);
      if (remaining > 0) {
        const [pay] = await tx.select({ method: payments.method }).from(payments).where(eq(payments.orderId, data.orderId)).limit(1);
        const method = pay?.method === "bank_transfer" || pay?.method === "gcash_manual" || pay?.method === "cod" || pay?.method === "pay_at_store" ? pay.method : "cash";
        await tx.insert(refunds).values({
          orderId: data.orderId,
          returnId: null,
          amount: remaining,
          method,
          status: "pending",
          reason: `Auto-raised on cancellation of ${order.orderNo}`,
          processedBy: session.user.id,
        });
      }
    }

    if (order.paymentStatus !== "failed") {
      try {
        await transitionPayment(tx, data.orderId, "failed", session.user.id, cleanNote ?? "Order cancelled");
      } catch { /* already terminal (paid/refunded) — leave it */ }
    }
    await transitionOrder(tx, data.orderId, "cancelled", session.user.id, cleanNote ?? "Order cancelled");
    await tx
      .update(orders)
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, data.orderId));
  });
  await audit(session.user.id, "order.cancel", "orders", data.orderId, { note: cleanNote });
  const [cancelled] = await db.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
  if (cancelled?.customerId) {
    const [cust] = await db.select().from(users).where(eq(users.id, cancelled.customerId)).limit(1);
    if (cust?.email) {
      const { subject, html } = cancelledEmail(cancelled.orderNo, cleanNote);
      await queueEmail({ to: cust.email, template: "cancelled", subject, html, orderId: data.orderId, userId: cancelled.customerId });
    }
  }
  revalidatePath(`/admin/orders/${data.orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/inventory");
  return true;
}

// ---------------------------------------------------------------------------
// Reads for lists
// ---------------------------------------------------------------------------

export async function listOrdersForStaff(opts: { status?: string; payment?: string; fulfillment?: string; q?: string; limit?: number } = {}) {
  await requirePermission("orders.verify_payment");
  // Allowlist filters: arbitrary strings must never reach the query.
  if (opts.status !== undefined && !(ORDER_STATUSES as readonly string[]).includes(opts.status)) {
    throw new Error("Invalid status filter");
  }
  if (opts.payment !== undefined && !(PAYMENT_STATUSES as readonly string[]).includes(opts.payment)) {
    throw new Error("Invalid payment filter");
  }
  if (opts.fulfillment !== undefined && !(FULFILLMENT_STATUSES as readonly string[]).includes(opts.fulfillment)) {
    throw new Error("Invalid fulfillment filter");
  }
  const q = typeof opts.q === "string" ? opts.q.slice(0, 100) : undefined;
  const conds = [];
  if (opts.status) conds.push(eq(orders.status, opts.status));
  if (opts.payment) conds.push(eq(orders.paymentStatus, opts.payment));
  if (opts.fulfillment) conds.push(eq(orders.fulfillmentStatus, opts.fulfillment));
  const rows = await db
    .select()
    .from(orders)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200));
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((o) => o.orderNo.toLowerCase().includes(needle) || (o.promoCode ?? "").toLowerCase().includes(needle));
}
