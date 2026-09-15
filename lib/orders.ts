import { db, type Tx } from "@/db";
import { orders, orderStatusHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  OrderStatus,
  OrderPaymentStatus,
  OrderFulfillmentStatus,
} from "@/types";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "awaiting_payment",
  "payment_verification",
  "confirmed",
  "processing",
  "ready_for_pickup",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
];

export const PAYMENT_STATUSES: OrderPaymentStatus[] = [
  "unpaid",
  "pending_verification",
  "paid",
  "partially_paid",
  "failed",
  "refunded",
  "partially_refunded",
];

export const FULFILLMENT_STATUSES: OrderFulfillmentStatus[] = [
  "unfulfilled",
  "processing",
  "ready",
  "partially_fulfilled",
  "fulfilled",
  "shipped",
  "delivered",
  "returned",
];

// Master pipeline: which order statuses can follow which. Cancellation is
// allowed from any non-terminal state; terminal states never transition.
const TERMINAL: OrderStatus[] = ["completed", "cancelled", "refunded"];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["awaiting_payment", "payment_verification", "confirmed", "cancelled"],
  awaiting_payment: ["payment_verification", "confirmed", "cancelled"],
  payment_verification: ["confirmed", "awaiting_payment", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready_for_pickup", "shipped", "cancelled"],
  ready_for_pickup: ["shipped", "completed", "cancelled"],
  shipped: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  refunded: [],
};

export function canTransitionOrder(from: string, to: string): boolean {
  if (TERMINAL.includes(from as OrderStatus)) return false;
  return (ORDER_TRANSITIONS[from as OrderStatus] ?? []).includes(to as OrderStatus);
}

// Sub-pipeline guards. Partial flags are explicit staff decisions.
const PAYMENT_TERMINAL: OrderPaymentStatus[] = ["paid", "partially_paid", "refunded", "partially_refunded"];

export const PAYMENT_TRANSITIONS: Record<OrderPaymentStatus, OrderPaymentStatus[]> = {
  unpaid: ["pending_verification", "paid", "failed"],
  pending_verification: ["paid", "partially_paid", "failed", "unpaid"],
  paid: [],
  partially_paid: ["paid", "refunded", "partially_refunded"],
  failed: ["pending_verification", "paid", "unpaid"],
  refunded: [],
  partially_refunded: ["refunded"],
};

export function canTransitionPayment(from: string, to: string): boolean {
  if (PAYMENT_TERMINAL.includes(from as OrderPaymentStatus)) {
    // Terminal payment states only move within the refund family.
    return (PAYMENT_TRANSITIONS[from as OrderPaymentStatus] ?? []).includes(to as OrderPaymentStatus);
  }
  return (PAYMENT_TRANSITIONS[from as OrderPaymentStatus] ?? []).includes(to as OrderPaymentStatus);
}

const FULFILLMENT_TERMINAL: OrderFulfillmentStatus[] = ["delivered", "returned"];

export const FULFILLMENT_TRANSITIONS: Record<OrderFulfillmentStatus, OrderFulfillmentStatus[]> = {
  unfulfilled: ["processing", "ready"],
  processing: ["ready", "partially_fulfilled", "fulfilled"],
  ready: ["partially_fulfilled", "fulfilled", "shipped"],
  partially_fulfilled: ["fulfilled", "shipped"],
  fulfilled: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  returned: [],
};

export function canTransitionFulfillment(from: string, to: string): boolean {
  if (FULFILLMENT_TERMINAL.includes(from as OrderFulfillmentStatus)) return false;
  return (FULFILLMENT_TRANSITIONS[from as OrderFulfillmentStatus] ?? []).includes(to as OrderFulfillmentStatus);
}

export type OrderRow = typeof orders.$inferSelect;

/**
 * Guarded master-status transition. Re-reads the row INSIDE the caller's
 * transaction so concurrent staff actions fail closed instead of overwriting
 * each other. Records history (from/to/actor/timestamp/note) in the same tx.
 */
export async function transitionOrder(
  tx: Tx,
  orderId: string,
  to: OrderStatus,
  actorId: string,
  note?: string
): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  if (!canTransitionOrder(order.status, to)) {
    throw new Error(`Cannot move order from ${order.status} to ${to}`);
  }
  const [updated] = await tx
    .update(orders)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: order.status,
    toStatus: to,
    actorId,
    note: note ?? null,
  });
  return updated;
}

/** Guarded payment-status transition (same tx-guard contract as transitionOrder). */
export async function transitionPayment(
  tx: Tx,
  orderId: string,
  to: OrderPaymentStatus,
  actorId: string,
  note?: string
): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  if (!canTransitionPayment(order.paymentStatus, to)) {
    throw new Error(`Cannot move payment from ${order.paymentStatus} to ${to}`);
  }
  const [updated] = await tx
    .update(orders)
    .set({ paymentStatus: to, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: `payment:${order.paymentStatus}`,
    toStatus: `payment:${to}`,
    actorId,
    note: note ?? null,
  });
  return updated;
}

/** Guarded fulfillment-status transition (same tx-guard contract). */
export async function transitionFulfillment(
  tx: Tx,
  orderId: string,
  to: OrderFulfillmentStatus,
  actorId: string,
  note?: string
): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  if (!canTransitionFulfillment(order.fulfillmentStatus, to)) {
    throw new Error(`Cannot move fulfillment from ${order.fulfillmentStatus} to ${to}`);
  }
  const [updated] = await tx
    .update(orders)
    .set({ fulfillmentStatus: to, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: `fulfillment:${order.fulfillmentStatus}`,
    toStatus: `fulfillment:${to}`,
    actorId,
    note: note ?? null,
  });
  return updated;
}

export async function getOrderHistory(orderId: string) {
  return db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId));
}
