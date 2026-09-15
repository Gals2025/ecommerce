// Pure returns/refunds math (DB-free, unit-testable). actions/admin.ts is the
// only executor — no component reimplements these rules.

export const RETURN_WINDOW_DAYS = 30;

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: string };

/** Gate: delivered/completed orders within the return window, not terminal. */
export function returnEligibility(opts: {
  fulfillmentStatus: string;
  status: string;
  createdAt: Date | string;
  now?: Date;
  hasOpenRequest?: boolean;
  windowDays?: number;
}): Eligibility {
  const now = opts.now ?? new Date();
  if (["cancelled", "refunded"].includes(opts.status)) {
    return { ok: false, reason: `Order is ${opts.status}` };
  }
  if (!(opts.fulfillmentStatus === "delivered" || opts.status === "completed")) {
    return { ok: false, reason: "Only delivered or completed orders can be returned" };
  }
  const ageDays = (now.getTime() - new Date(opts.createdAt).getTime()) / 86400000;
  if (ageDays > (opts.windowDays ?? RETURN_WINDOW_DAYS)) {
    return { ok: false, reason: `Returns are accepted within ${opts.windowDays ?? RETURN_WINDOW_DAYS} days` };
  }
  if (opts.hasOpenRequest) {
    return { ok: false, reason: "A return request is already open for this order" };
  }
  return { ok: true };
}

/** Units of a purchased line still returnable (excludes rejected returns). */
export function returnableQty(purchased: number, priorNonRejected: number): number {
  return Math.max(0, purchased - priorNonRejected);
}

/** Default refund = effective-price sum over return lines. */
export function defaultRefundForLines(lines: { unitPrice: number; qty: number }[]): number {
  return lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

/** Staff adjustment must stay within [0, default]; returns the final amount. */
export function clampRefundAmount(requested: number | null | undefined, defaultSum: number): number {
  const amount = requested ?? defaultSum;
  if (!Number.isInteger(amount) || amount < 0 || amount > defaultSum) {
    throw new Error(`Refund must be between 0 and ${defaultSum}`);
  }
  return amount;
}

/** Remaining refundable = grand total minus non-rejected refunds. */
export function remainingRefundable(
  grandTotal: number,
  refunds: { amount: number; status: string }[]
): number {
  const used = refunds
    .filter((r) => r.status === "pending" || r.status === "completed")
    .reduce((s, r) => s + r.amount, 0);
  return Math.max(0, grandTotal - used);
}

/** Status derivation after completing a refund. Totals decide, not flags. */
export function refundStatusAfter(
  totalCompletedRefunded: number,
  grandTotal: number
): "refunded" | "partially_refunded" {
  return totalCompletedRefunded >= grandTotal ? "refunded" : "partially_refunded";
}

/** True when every purchased unit is covered by non-rejected returns. */
export function isFullyReturned(
  items: { orderItemId: string; quantity: number }[],
  returnedNonRejected: Map<string, number>
): boolean {
  return items.every((i) => (returnedNonRejected.get(i.orderItemId) ?? 0) >= i.quantity);
}
