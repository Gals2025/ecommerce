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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog";
import { users } from "./auth";

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // e.g. WH-QC, STORE-MAKATI
    name: text("name").notNull().unique(), // e.g. Main Warehouse, Makati Store
    type: text("type").notNull().default("warehouse"), // warehouse | store
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "inventory_locations_type_ck",
      sql`${t.type} IN ('warehouse','store')`
    ),
  ]
);

// Renamed from inventory_levels (v1). available = on_hand - reserved (derived, never stored).
export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_balances_variant_location_uidx").on(t.variantId, t.locationId),
    index("inventory_balances_location_idx").on(t.locationId),
    check("inventory_balances_on_hand_ck", sql`${t.onHand} >= 0`),
    check("inventory_balances_reserved_ck", sql`${t.reserved} >= 0`),
    check("inventory_balances_available_ck", sql`${t.reserved} <= ${t.onHand}`),
  ]
);

// Ledger: every balance change MUST insert a row here in the same transaction.
// Rows are append-only: application code MUST never UPDATE or DELETE them;
// corrections are recorded as new compensating movements.
export const MOVEMENT_TYPES = [
  "OPENING_STOCK",
  "STOCK_RECEIVED",
  "SALE",
  "CUSTOMER_RETURN",
  "SUPPLIER_RETURN",
  "DAMAGE",
  "LOSS",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RESERVATION",
  "RESERVATION_RELEASE",
  "ORDER_CANCELLATION",
  "REFUND_RESTOCK",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const ADJUSTMENT_REASONS = [
  "physical_count",
  "damaged",
  "lost",
  "expired",
  "data_correction",
  "other",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    fromLocationId: uuid("from_location_id").references(() => inventoryLocations.id),
    toLocationId: uuid("to_location_id").references(() => inventoryLocations.id),
    qtyOnHandChange: integer("qty_on_hand_change").notNull().default(0), // signed
    qtyReservedChange: integer("qty_reserved_change").notNull().default(0), // signed
    balanceAfter: integer("balance_after"), // on_hand at the affected location after change
    reservedAfter: integer("reserved_after"), // reserved at the affected location after change
    // Receiving / provenance context (nullable; set on STOCK_RECEIVED / OPENING_STOCK)
    unitCost: integer("unit_cost"), // centavos
    supplier: text("supplier"),
    reference: text("reference"),
    reason: text("reason").notNull(), // MovementType
    refType: text("ref_type"), // order|transfer|adjustment|return|receiving|product_create
    refId: text("ref_id"),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_variant_idx").on(t.variantId, t.createdAt),
    index("inventory_movements_ref_idx").on(t.refType, t.refId),
    index("inventory_movements_ref_reason_idx").on(t.refType, t.refId, t.reason),
    index("inventory_movements_reason_idx").on(t.reason),
    check(
      "inventory_movements_reason_ck",
      sql`${t.reason} IN ('OPENING_STOCK','STOCK_RECEIVED','SALE','CUSTOMER_RETURN','SUPPLIER_RETURN','DAMAGE','LOSS','ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT','RESERVATION','RESERVATION_RELEASE','ORDER_CANCELLATION','REFUND_RESTOCK')`
    ),
    check("inventory_movements_unit_cost_ck", sql`${t.unitCost} IS NULL OR ${t.unitCost} >= 0`),
  ]
);
