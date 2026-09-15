import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { productVariants } from "./catalog";
import { customerAddresses } from "./customers";
import { promotions, promotionCodes } from "./promos";

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id"), // guest cart
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("carts_customer_idx").on(t.customerId)]
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: integer("qty").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_variant_uidx").on(t.cartId, t.variantId),
    check("cart_items_qty_ck", sql`${t.qty} > 0`),
  ]
);

export const shippingMethods = pgTable("shipping_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // pickup | flat_ncr | flat_luzon | flat_vismin
  name: text("name").notNull(),
  baseFee: integer("base_fee").notNull().default(0), // centavos
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").notNull().unique(),
    customerId: text("customer_id").references(() => users.id),
    customerAddressId: uuid("customer_address_id").references(() => customerAddresses.id),
    shippingMethodId: uuid("shipping_method_id").references(() => shippingMethods.id),
    // Client-generated UUID per checkout attempt. Unique + checked inside the
    // order transaction so double-clicks/retries return the existing order
    // instead of creating a duplicate.
    idempotencyKey: text("idempotency_key"),
    // Operational workflow: order status is the master pipeline stage;
    // payment_status and fulfillment_status track the two sub-pipelines
    // separately (partial flags are set explicitly by authorized staff).
    status: text("status").notNull().default("pending"), // pending|awaiting_payment|payment_verification|confirmed|processing|ready_for_pickup|shipped|completed|cancelled|refunded
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid|pending_verification|paid|partially_paid|failed|refunded|partially_refunded
    fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"), // unfulfilled|processing|ready|partially_fulfilled|fulfilled|shipped|delivered|returned
    currency: text("currency").notNull().default("PHP"),
    subtotal: integer("subtotal").notNull().default(0),
    discountMember: integer("discount_member").notNull().default(0),
    discountPromo: integer("discount_promo").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    // Free-shipping promo waiver: max staff-settable fee (0 = fully waived).
    shippingWaiver: integer("shipping_waiver"),
    grandTotal: integer("grand_total").notNull().default(0),
    fulfillment: text("fulfillment").notNull().default("pickup"), // pickup | delivery
    snapshotTier: text("snapshot_tier"),
    snapshotMembershipNo: text("snapshot_membership_no"), // paid membership at order time, if any
    promoCode: text("promo_code"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.createdAt),
    index("orders_status_created_at_idx").on(t.status, t.createdAt),
    uniqueIndex("orders_idempotency_key_uidx").on(t.idempotencyKey),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_payment_status_created_at_idx").on(t.paymentStatus, t.createdAt),
    index("orders_fulfillment_status_idx").on(t.fulfillmentStatus),
    index("orders_fulfillment_status_created_at_idx").on(t.fulfillmentStatus, t.createdAt),
    check("orders_status_ck", sql`${t.status} IN ('pending','awaiting_payment','payment_verification','confirmed','processing','ready_for_pickup','shipped','completed','cancelled','refunded')`),
    check("orders_payment_status_ck", sql`${t.paymentStatus} IN ('unpaid','pending_verification','paid','partially_paid','failed','refunded','partially_refunded')`),
    check("orders_fulfillment_status_ck", sql`${t.fulfillmentStatus} IN ('unfulfilled','processing','ready','partially_fulfilled','fulfilled','shipped','delivered','returned')`),
    check("orders_fulfillment_ck", sql`${t.fulfillment} IN ('pickup','delivery')`),
    check("orders_totals_ck", sql`${t.subtotal} >= 0 AND ${t.grandTotal} >= 0`),
  ]
);

// Full historical snapshots — never updated after insert.
// variant_id SET NULL on variant delete so history survives.
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull(),
    variantName: text("variant_name"),
    originalUnitPrice: integer("original_unit_price").notNull(), // centavos, pre-discount
    effectiveUnitPrice: integer("effective_unit_price").notNull(), // centavos, post line-discounts
    discountAmount: integer("discount_amount").notNull().default(0), // centavos
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull(), // effective * qty
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_variant_idx").on(t.variantId),
    check("order_items_qty_ck", sql`${t.quantity} > 0`),
  ]
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorId: text("actor_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)]
);

// Staff-only internal notes. Never exposed to customers; shown on the admin
// order detail + timeline interleaved with status changes.
export const orderNotes = pgTable(
  "order_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_notes_order_idx").on(t.orderId, t.createdAt)]
);

// Applied-discount history: one row per promotion application on an order,
// so later config edits never rewrite history. Complements promotionUsage
// (which serves limit counting).
export const orderPromotions = pgTable(
  "order_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    codeId: uuid("code_id").references(() => promotionCodes.id),
    scope: text("scope").notNull().default("cart"), // line | cart | shipping
    discount: integer("discount").notNull().default(0), // centavos given
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_promotions_order_idx").on(t.orderId),
    check("order_promotions_scope_ck", sql`${t.scope} IN ('line','cart','shipping')`),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // cod | bank_transfer | gcash_manual | pay_at_store
    amount: integer("amount").notNull(), // centavos
    status: text("status").notNull().default("pending"), // pending|submitted|verified|rejected
    proofUrl: text("proof_url"), // Vercel Blob receipt
    referenceNo: text("reference_no"), // customer-submitted GCash / bank ref number
    providerRef: text("provider_ref"),
    verifiedBy: text("verified_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    // Manual methods only — no payment gateway (GCash/bank are verified by staff from proofUrl).
    check("payments_method_ck", sql`${t.method} IN ('cod','bank_transfer','gcash_manual','pay_at_store')`),
    check("payments_status_ck", sql`${t.status} IN ('pending','submitted','verified','rejected')`),
  ]
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    shippingMethodId: uuid("shipping_method_id").references(() => shippingMethods.id),
    mode: text("mode").notNull().default("pickup"), // pickup | delivery
    address: jsonb("address"), // snapshot of delivery address at order time
    fee: integer("fee").notNull().default(0), // manually set/overridden by staff
    notes: text("notes"), // manual delivery details
    status: text("status").notNull().default("pending"), // pending|ready|shipped|completed|cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shipments_order_idx").on(t.orderId),
    check("shipments_mode_ck", sql`${t.mode} IN ('pickup','delivery')`),
  ]
);

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    status: text("status").notNull().default("requested"), // requested|approved|rejected|completed
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("returns_order_idx").on(t.orderId),
    check("returns_status_ck", sql`${t.status} IN ('requested','approved','rejected','completed')`),
  ]
);

export const returnItems = pgTable(
  "return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    qty: integer("qty").notNull(),
    // Decided at approval, never at request: restock returns units to
    // on_hand; damaged records a zero-delta DAMAGE movement and restocks
    // NOTHING (see lib/inventory.ts damaged-return pattern).
    disposition: text("disposition").notNull().default("pending"), // pending|restock|damaged
  },
  (t) => [
    index("return_items_return_idx").on(t.returnId),
    index("return_items_order_item_idx").on(t.orderItemId),
    check("return_items_qty_ck", sql`${t.qty} > 0`),
    check("return_items_disposition_ck", sql`${t.disposition} IN ('pending','restock','damaged')`),
  ]
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    returnId: uuid("return_id").references(() => returns.id),
    amount: integer("amount").notNull(), // centavos
    method: text("method").notNull().default("cash"), // cash | cod | bank_transfer | gcash_manual | pay_at_store
    status: text("status").notNull().default("pending"), // pending|completed|rejected
    reason: text("reason"), // required for item-less (goodwill) refunds
    processedBy: text("processed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("refunds_order_idx").on(t.orderId),
    check("refunds_amount_ck", sql`${t.amount} > 0`),
    check(
      "refunds_method_ck",
      sql`${t.method} IN ('cash','cod','bank_transfer','gcash_manual','pay_at_store')`
    ),
  ]
);
