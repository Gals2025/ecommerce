import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { products, productVariants } from "./catalog";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    mobile: text("mobile"),
    lifetimeSpend: integer("lifetime_spend").notNull().default(0), // centavos
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [check("customers_spend_ck", sql`${t.lifetimeSpend} >= 0`)]
);

// Philippine-friendly address book (replaces v1 address JSONB)
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Home"),
    recipient: text("recipient").notNull(),
    mobile: text("mobile").notNull(),
    region: text("region").notNull(),
    province: text("province").notNull(),
    city: text("city").notNull(),
    barangay: text("barangay").notNull(),
    street: text("street").notNull(),
    zip: text("zip").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)]
);

export const membershipTiers = pgTable(
  "membership_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    description: text("description"),
    // Paid-membership config. fee = centavos to join/renew; validity_days null = no expiry.
    membershipFee: integer("membership_fee").notNull().default(0), // centavos
    validityDays: integer("validity_days"), // null = lifetime
    minSpend: integer("min_spend").notNull().default(0), // centavos lifetime (auto-tier track)
    discountPct: integer("discount_pct").notNull().default(0), // 0-100
    benefits: jsonb("benefits").$type<string[]>(), // display list, e.g. ["10% off", "Free delivery"]
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("membership_tiers_pct_ck", sql`${t.discountPct} >= 0 AND ${t.discountPct} <= 100`),
    check("membership_tiers_fee_ck", sql`${t.membershipFee} >= 0`),
    check("membership_tiers_validity_ck", sql`${t.validityDays} IS NULL OR ${t.validityDays} > 0`),
  ]
);

export const customerMemberships = pgTable(
  "customer_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => membershipTiers.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }), // null = current
  },
  (t) => [index("customer_memberships_customer_idx").on(t.customerId)]
);

// Paid memberships (staff-assigned). Separate from the spend-based auto-tier
// trail in customer_memberships: the pricing engine grants the BEST of the
// two discounts, so paid tiers layer on top instead of replacing anything.
// Expiry is evaluated lazily (see lib/membership.ts): any read treats
// expires_at < now as expired and sweeps the row to status=expired.
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    membershipNo: text("membership_no").notNull().unique(), // e.g. MBR-2026-XXXXXX
    tierId: uuid("tier_id")
      .notNull()
      .references(() => membershipTiers.id),
    status: text("status").notNull().default("pending"), // pending|active|expired|suspended|cancelled
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = lifetime
    paymentRef: text("payment_ref"), // staff-recorded fee receipt (GCash/bank/cash ref)
    activatedBy: text("activated_by").references(() => users.id),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memberships_customer_idx").on(t.customerId),
    index("memberships_status_idx").on(t.status),
    check(
      "memberships_status_ck",
      sql`${t.status} IN ('pending','active','expired','suspended','cancelled')`
    ),
  ]
);

// Explicit tier prices. Variant row wins over product row; when neither
// exists the tier discount_pct rule applies. All reads are server-side
// (see calculateCartTotals) — the browser never supplies member prices.
export const memberPrices = pgTable(
  "member_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => membershipTiers.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    price: integer("price").notNull(), // centavos
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_prices_tier_variant_uidx").on(t.tierId, t.variantId),
    uniqueIndex("member_prices_tier_product_uidx").on(t.tierId, t.productId),
    index("member_prices_tier_idx").on(t.tierId),
    check("member_prices_price_ck", sql`${t.price} >= 0`),
    check(
      "member_prices_scope_ck",
      sql`(${t.variantId} IS NULL) <> (${t.productId} IS NULL)`
    ),
  ]
);
