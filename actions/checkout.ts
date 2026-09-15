"use server";

import { db, type Tx } from "@/db";
import {
  carts,
  cartItems,
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  shipments,
  shippingMethods,
  inventoryLocations,
  inventoryBalances,
  customers,
  customerAddresses,
  customerMemberships,
  promotionCodes,
  promotionUsage,
  orderPromotions,
} from "@/db/schema";
import { eq, and, or, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/lib/rbac";
import { checkoutSchema, type PhAddress, type ShippingMethodCode } from "@/lib/validations";
import { calculateCartTotals, allocateDiscounts } from "@/lib/pricing";
import { reserveStock, planAllocations } from "@/lib/inventory";
import { ensureCustomer, tierForSpend } from "@/lib/membership";
import { recordPromoUsage } from "@/lib/promos";
import { queueEmail } from "@/lib/email";
import { orderReceivedEmail } from "@/emails";
import { audit } from "@/lib/audit";

function orderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `ORD-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// Delivery option -> shipping_methods row. Fee is informational only:
// staff confirms the fee after ordering (₱0 due at checkout).
const SHIPPING_CODE: Record<ShippingMethodCode, string> = {
  pickup: "pickup",
  local_delivery: "local_delivery",
  standard_shipping: "standard_shipping",
};

export type CheckoutPreview = Awaited<ReturnType<typeof previewCheckout>>;

export type CheckoutAddress = typeof customerAddresses.$inferSelect;
export type CheckoutContext = {
  signedIn: boolean;
  name: string | null;
  email: string | null;
  tierName: string | null;
  lifetimeSpend: number;
  addresses: CheckoutAddress[];
};

/**
 * Checkout wizard bootstrap: session + customer tier + address book.
 * Read-only; the priced lines themselves come from previewCheckout.
 */
export async function getCheckoutContext(): Promise<CheckoutContext> {
  const session = await getSession();
  if (!session?.user) return { signedIn: false, name: null, email: null, tierName: null, lifetimeSpend: 0, addresses: [] };
  const customer = await ensureCustomer(session.user.id);
  const addresses = await db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customer.id));
  const tier = await tierForSpend(customer.lifetimeSpend ?? 0);
  return {
    signedIn: true,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    tierName: tier?.name ?? null,
    lifetimeSpend: customer.lifetimeSpend ?? 0,
    addresses,
  };
}

/**
 * Read-only checkout preview. Recomputes server-authoritative totals
 * (prices, membership, promos) with ZERO writes — safe to call on every
 * wizard step. The browser must never determine pricing.
 */
export async function previewCheckout(input: { promoCode?: string }) {
  const promoCode = z.string().max(32).optional().parse(input.promoCode);
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const cart = await db.select().from(carts).where(eq(carts.customerId, userId)).limit(1);
  if (!cart[0]) throw new Error("Cart is empty");
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart[0].id));
  if (items.length === 0) throw new Error("Cart is empty");

  const code = promoCode?.trim() ? promoCode.trim() : undefined;
  const totals = await calculateCartTotals({
    lines: items.map((i) => ({ variantId: i.variantId, unitPrice: 0, qty: i.qty })),
    userId,
    promoCode: code,
    deliveryFee: 0,
  });
  const priced = allocateDiscounts(
    totals.lines.map((l) => ({ variantId: l.variantId, unitPrice: l.memberPrice, qty: l.qty })),
    totals.memberPctDiscount + totals.cartDiscount
  );
  const byVariant = new Map(totals.lines.map((l) => [l.variantId, l]));
  return {
    lines: priced.map((p) => {
      const base = byVariant.get(p.variantId)!;
      return {
        variantId: p.variantId,
        name: base.name,
        sku: base.sku,
        qty: p.qty,
        originalUnitPrice: base.unitPrice,
        effectiveUnitPrice: p.effectiveUnitPrice,
        // Includes explicit member-price savings (base vs resolved).
        discountAmount: base.unitPrice * p.qty - p.lineTotal,
        lineTotal: p.lineTotal,
      };
    }),
        subtotal: totals.subtotal,
    memberDiscount: totals.memberDiscount,
    tierName: totals.tierName,
    membershipNo: totals.membershipNo,
    promoDiscount: totals.promoDiscount,
    promoName: totals.promoName,
    appliedPromos: totals.appliedPromos,
    codeError: totals.codeError,
    shippingWaiver: totals.shippingWaiver,
    deliveryFee: 0,
    grandTotal: totals.subtotal - totals.memberDiscount - totals.promoDiscount,
  };
}

function toAddressSnapshot(row: typeof customerAddresses.$inferSelect): PhAddress {
  return {
    label: row.label,
    recipient: row.recipient,
    mobile: row.mobile,
    region: row.region,
    province: row.province,
    city: row.city,
    barangay: row.barangay,
    street: row.street,
    zip: row.zip,
  };
}

/**
 * Enforce promo usage caps inside the order transaction (atomic increment).
 * Throws when the code is exhausted so the whole checkout rolls back.
 */
async function assertPromoLimits(
  tx: Tx,
  codeId: string | undefined,
  customerId: string | undefined
) {
  if (!codeId) return;
  const [code] = await tx.select().from(promotionCodes).where(eq(promotionCodes.id, codeId)).limit(1);
  if (!code || !code.isActive) throw new Error("Promo code is no longer valid");
  // Per-customer limit ALWAYS applies (even when a global cap also exists —
  // previously the global branch returned early and skipped this check).
  if (customerId && (code.perCustomerLimit ?? 1) > 0) {
    const prior = await tx
      .select({ id: promotionUsage.id })
      .from(promotionUsage)
      .where(and(eq(promotionUsage.codeId, codeId), eq(promotionUsage.customerId, customerId)));
    if (prior.length >= (code.perCustomerLimit ?? 1)) {
      throw new Error("You have already used this promo code");
    }
  }
  if (code.usageLimit != null) {
    // Atomic guarded increment: exactly one concurrent winner per remaining slot.
    // (Same-tx, so a later checkout failure rolls the bump back too.)
    const updated = await tx
      .update(promotionCodes)
      .set({ usedCount: sql`${promotionCodes.usedCount} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(promotionCodes.id, codeId),
          or(isNull(promotionCodes.usageLimit), lt(promotionCodes.usedCount, promotionCodes.usageLimit))
        )
      )
      .returning({ id: promotionCodes.id });
    if (updated.length === 0) throw new Error("Promo code usage limit reached");
  }
}

export async function checkout(input: unknown, proofUrlArg?: string) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const data = checkoutSchema.parse(input);
  if (data.fulfillment === "delivery" && !data.address && !data.addressId) {
    throw new Error("Delivery address is required for delivery orders");
  }
  // proofUrlArg is a legacy bypass around the schema — validate it identically.
  const validatedArg = proofUrlArg === undefined ? undefined : z.string().url().max(2048).parse(proofUrlArg);
  const proofUrl = data.proofUrl ?? validatedArg;
  const userId = session.user.id;
  const idempotencyKey = data.idempotencyKey ?? null;

  // Fast path: exact retry of an already-placed order (double-click safe).
  if (idempotencyKey) {
    const [existing] = await db
      .select({ id: orders.id, orderNo: orders.orderNo })
      .from(orders)
      .where(and(eq(orders.idempotencyKey, idempotencyKey), eq(orders.customerId, userId)))
      .limit(1);
    if (existing) return { orderId: existing.id, orderNo: existing.orderNo, duplicate: true as const };
  }

  const runTx = () =>
    db.transaction(async (tx) => {
      // Authoritative duplicate check inside the tx (covers race with fast path).
      if (idempotencyKey) {
        const [existing] = await tx
          .select({ id: orders.id, orderNo: orders.orderNo, grandTotal: orders.grandTotal })
          .from(orders)
          .where(and(eq(orders.idempotencyKey, idempotencyKey), eq(orders.customerId, userId)))
          .limit(1);
        if (existing) return { ...existing, duplicate: true as const };
      }

      const customer = await ensureCustomer(userId, tx);
      const cart = await tx.select().from(carts).where(eq(carts.customerId, userId)).limit(1);
      if (!cart[0]) throw new Error("Cart is empty");
      const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, cart[0].id));
      if (items.length === 0) throw new Error("Cart is empty");

      // Resolve address-book selection (ownership-checked) inside the tx.
      let addressSnapshot: PhAddress | null = data.address ?? null;
      let addressId: string | null = null;
      if (data.addressId) {
        const [row] = await tx
          .select()
          .from(customerAddresses)
          .where(and(eq(customerAddresses.id, data.addressId), eq(customerAddresses.customerId, customer.id)))
          .limit(1);
        if (!row) throw new Error("Address not found");
        addressSnapshot = toAddressSnapshot(row);
        addressId = row.id;
      }

      // Resolve delivery option -> shipping method row (must be active).
      const shipCode = data.shippingMethodCode ?? (data.fulfillment === "pickup" ? "pickup" : "local_delivery");
      const [shipMethod] = await tx
        .select()
        .from(shippingMethods)
        .where(and(eq(shippingMethods.code, SHIPPING_CODE[shipCode]), eq(shippingMethods.isActive, true)))
        .limit(1);
      if (!shipMethod) throw new Error("Selected delivery method is unavailable");

      // Server-authoritative totals, computed in the same transaction as the
      // order write so cart/pricing/promo state cannot drift between phases.
      const totals = await calculateCartTotals({
        lines: items.map((i) => ({ variantId: i.variantId, unitPrice: 0, qty: i.qty })),
        userId,
        promoCode: data.promoCode,
        deliveryFee: 0,
        client: tx,
      });
      if (data.promoCode?.trim() && totals.codeError) {
        throw new Error(totals.codeError);
      }

      const locations = await tx
        .select()
        .from(inventoryLocations)
        .where(eq(inventoryLocations.isActive, true));
      if (locations.length === 0) throw new Error("No inventory locations");

      // Promo caps enforced BEFORE creating anything (fail fast, no writes yet).
      // Every applied code consumes its slot, including shipping waivers.
      const appliedCodes = totals.appliedPromos.filter((a) => a.codeId);
      const countedCodes = new Set<string>();
      for (const a of appliedCodes) {
        await assertPromoLimits(tx, a.codeId, userId);
        const [code] = await tx.select().from(promotionCodes).where(eq(promotionCodes.id, a.codeId!)).limit(1);
        if (code?.usageLimit != null) countedCodes.add(a.codeId!);
      }

      // Create the order FIRST so reservation movements carry the exact refId.
      // Atomicity is unaffected: any later failure rolls back the whole tx,
      // leaving no orphan orders and no phantom reservations.
      const [order] = await tx
        .insert(orders)
        .values({
          orderNo: orderNo(),
          customerId: userId,
          customerAddressId: addressId,
          shippingMethodId: shipMethod.id,
          idempotencyKey,
          status: "pending",
          currency: "PHP",
          subtotal: totals.subtotal,
          discountMember: totals.memberDiscount,
          discountPromo: totals.promoDiscount,
          deliveryFee: 0,
          shippingWaiver: totals.shippingWaiver,
          grandTotal: totals.subtotal - totals.memberDiscount - totals.promoDiscount,
          fulfillment: data.fulfillment,
          snapshotTier: totals.tierName,
          snapshotMembershipNo: totals.membershipNo,
          promoCode: data.promoCode?.toUpperCase() ?? null,
          notes: data.notes ?? null,
        })
        .returning();

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: "pending",
        actorId: userId,
        note: "Order placed",
      });

      // Reserve stock in deterministic (variantId, locationId) order so
      // concurrent checkouts can never deadlock on row-lock ordering.
      // Lines may split across locations when no single location covers the
      // full qty; capture/release already operate per leg. The unlocked
      // availability read is only a hint; reserveStock re-checks
      // under SELECT ... FOR UPDATE, which is the real oversell guard.
      const sortedLines = [...totals.lines].sort((a, b) =>
        a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0
      );
      const sortedLocs = [...locations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const balanceRows = await tx
        .select()
        .from(inventoryBalances)
        .where(
          or(
            ...sortedLines.flatMap((line) =>
              sortedLocs.map((loc) => and(eq(inventoryBalances.variantId, line.variantId), eq(inventoryBalances.locationId, loc.id))!)
            )
          )
        );
      const balancesByLeg = new Map(balanceRows.map((b) => [`${b.variantId}|${b.locationId}`, b]));
      for (const line of sortedLines) {
        const availability = sortedLocs.map((loc) => {
          const lvl = balancesByLeg.get(`${line.variantId}|${loc.id}`);
          return { locationId: loc.id, available: (lvl?.onHand ?? 0) - (lvl?.reserved ?? 0) };
        });
        let legs: { locationId: string; qty: number }[];
        try {
          legs = planAllocations(line.qty, availability);
        } catch {
          throw new Error(`Insufficient stock for ${line.sku}`);
        }
        for (const leg of legs) {
          await reserveStock(tx, line.variantId, leg.locationId, leg.qty, {
            refType: "order",
            refId: order.id,
            note: `Reserve for order ${order.orderNo}`,
            createdBy: userId,
          });
        }
      }

      const priced = allocateDiscounts(
        totals.lines.map((l) => ({ variantId: l.variantId, unitPrice: l.memberPrice, qty: l.qty })),
        totals.memberPctDiscount + totals.cartDiscount
      );
      // One snapshot row per variant line (allocations may split a line
      // across locations; stock legs live in inventory movements, not here).
      for (const snap of priced) {
        const line = totals.lines.find((l) => l.variantId === snap.variantId)!;
        await tx.insert(orderItems).values({
          orderId: order.id,
          variantId: snap.variantId,
          productName: line.name,
          sku: line.sku,
          variantName: line.sku,
          originalUnitPrice: line.unitPrice,
          effectiveUnitPrice: snap.effectiveUnitPrice,
          // Base-vs-final diff: includes explicit member-price savings.
          discountAmount: line.unitPrice * snap.qty - snap.lineTotal,
          quantity: snap.qty,
          lineTotal: snap.lineTotal,
        });
      }

      await tx.insert(payments).values({
        orderId: order.id,
        method: data.paymentMethod,
        amount: order.grandTotal,
        status: data.paymentMethod === "cod" || data.paymentMethod === "pay_at_store"
          ? "pending"
          : proofUrl ? "submitted" : "pending",
        proofUrl: proofUrl ?? null,
      });

      await tx.insert(shipments).values({
        orderId: order.id,
        shippingMethodId: shipMethod.id,
        mode: data.fulfillment,
        address: addressSnapshot ?? null,
        fee: 0,
        notes: data.fulfillment === "pickup" ? "Store pickup" : "Delivery fee to be confirmed by staff",
        status: "pending",
      });

      // Lifetime spend + auto-tier upgrade in same transaction.
      // Credited at checkout (before payment) so tier upgrades stay
      // responsive; rolled back on cancel. Reports count paid-family revenue
      // separately — spend credit and revenue recognition differ by design.
      const cust = await tx.select().from(customers).where(eq(customers.userId, userId)).limit(1);
      const newSpend = (cust[0]?.lifetimeSpend ?? 0) + order.grandTotal;
      await tx.update(customers).set({ lifetimeSpend: newSpend }).where(eq(customers.userId, userId));
      const tier = await tierForSpend(newSpend, tx);
      if (tier) {
        await tx.delete(customerMemberships).where(eq(customerMemberships.customerId, customer.id));
        await tx.insert(customerMemberships).values({ customerId: customer.id, tierId: tier.id });
      }

      // Applied-discount history: one row per promotion application, so later
      // config edits never rewrite history. Usage rows feed limit counting.
      for (const a of totals.appliedPromos) {
        await tx.insert(orderPromotions).values({
          orderId: order.id,
          promotionId: a.promotionId,
          codeId: a.codeId ?? null,
          scope: a.scope,
          discount: a.discount,
        });
        if (!a.codeId || !countedCodes.has(a.codeId)) {
          if (!a.codeId && a.discount <= 0) continue;
          await recordPromoUsage(a.promotionId, a.codeId, userId, order.id, a.discount, tx);
        } else {
          // usedCount already bumped atomically by assertPromoLimits.
          await tx.insert(promotionUsage).values({
            promotionId: a.promotionId,
            codeId: a.codeId,
            customerId: userId,
            orderId: order.id,
            discount: a.discount,
          });
        }
      }

      for (const i of items) await tx.delete(cartItems).where(eq(cartItems.id, i.id));

      return { id: order.id, orderNo: order.orderNo, grandTotal: order.grandTotal, duplicate: false as const };
    });

  let result: { id: string; orderNo: string; grandTotal: number; duplicate: boolean };
  // Retry budget covers random orderNo collisions (fresh number each attempt).
  // A NULL key means no dedup (documented): retries only apply to keyed checkouts.
  let attempts = 0;
  while (true) {
    try {
      result = await runTx();
      break;
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      const code = (err as { code?: string })?.code;
      const detail = String((err as { detail?: unknown })?.detail ?? "") + msg;
      const isUnique = code === "23505" || /23505|duplicate|unique/i.test(msg);
      if (!idempotencyKey || !isUnique) throw err;
      // Lost race on the unique idempotency index: the other attempt won.
      // Return its order instead of an error (double-click safe).
      const [existing] = await db
        .select({ id: orders.id, orderNo: orders.orderNo })
        .from(orders)
        .where(and(eq(orders.idempotencyKey, idempotencyKey), eq(orders.customerId, userId)))
        .limit(1);
      if (existing) return { orderId: existing.id, orderNo: existing.orderNo, duplicate: true as const };
      // No row for our (key, customer): either our random orderNo collided
      // (retry with a fresh one) or another customer reused the same key
      // (unique index is global; lookups are per-customer). Never leak raw PG errors.
      attempts++;
      const looksLikeOrderNo = /order_no/i.test(detail);
      if (attempts < 3 && (looksLikeOrderNo || attempts < 2)) continue;
      throw new Error("This checkout was already placed. Please refresh to see your order.");
    }
  }

  if (!result.duplicate) {
    await audit(userId, "order.create", "orders", result.id, { orderNo: result.orderNo, total: result.grandTotal });
    if (session.user.email) {
      const { subject, html } = orderReceivedEmail(result.orderNo, result.grandTotal);
      // Queued post-commit: awaits only the log insert, never the Resend call.
      await queueEmail({ to: session.user.email, template: "order_confirmation", subject, html, orderId: result.id, userId });
    }
  }
  return { orderId: result.id, orderNo: result.orderNo };
}
