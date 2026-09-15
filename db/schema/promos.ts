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
import { products, productVariants, brands, categories } from "./catalog";
import { membershipTiers } from "./customers";

export const PROMOTION_KINDS = ["percent", "fixed", "bogo", "bundle", "free_shipping"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMO_RULE_KEYS = ["first_order_only", "min_qty"] as const;
export type PromoRuleKey = (typeof PROMO_RULE_KEYS)[number];

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("code"), // code | auto
    kind: text("kind").notNull().default("percent"), // percent | fixed | bogo | bundle | free_shipping
    value: integer("value").notNull().default(0), // pct (0-100), centavos, bundle price, or max fee covered (free_shipping; 0 = fully waived)
    config: jsonb("config"), // {buyVariantId?,buyProductId?,buyQty,getQty?,getPct?,bundleVariantIds?...}
    minSpend: integer("min_spend").notNull().default(0), // centavos
    maxDiscount: integer("max_discount"), // centavos cap
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    stackable: boolean("stackable").notNull().default(false),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("promotions_type_ck", sql`${t.type} IN ('code','auto')`),
    check("promotions_kind_ck", sql`${t.kind} IN ('percent','fixed','bogo','bundle','free_shipping')`),
    index("promotions_active_idx").on(t.isActive),
  ]
);

// Extended conditions beyond the core columns on promotions
export const promotionRules = pgTable(
  "promotion_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // e.g. min_qty, first_order_only, weekend_only
    value: jsonb("value").notNull(),
  },
  (t) => [index("promotion_rules_promo_idx").on(t.promotionId)]
);

// Scope tables: rows restrict a promotion; NO rows = applies to everything.
export const promotionProducts = pgTable(
  "promotion_products",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("promotion_products_uidx").on(t.promotionId, t.productId)]
);

export const promotionVariants = pgTable(
  "promotion_variants",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("promotion_variants_uidx").on(t.promotionId, t.variantId)]
);

export const promotionCategories = pgTable(
  "promotion_categories",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("promotion_categories_uidx").on(t.promotionId, t.categoryId)]
);

export const promotionBrands = pgTable(
  "promotion_brands",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("promotion_brands_uidx").on(t.promotionId, t.brandId)]
);

export const promotionMembershipTiers = pgTable(
  "promotion_membership_tiers",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => membershipTiers.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("promotion_tiers_uidx").on(t.promotionId, t.tierId)]
);

export const promotionCodes = pgTable(
  "promotion_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    usageLimit: integer("usage_limit"), // null = unlimited
    perCustomerLimit: integer("per_customer_limit").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("promotion_codes_promo_idx").on(t.promotionId)]
);

// Renamed from promo_usages (v1); order_id is now a real UUID FK
export const promotionUsage = pgTable(
  "promotion_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    codeId: uuid("code_id").references(() => promotionCodes.id),
    customerId: text("customer_id"),
    orderId: uuid("order_id"),
    discount: integer("discount").notNull().default(0), // centavos given
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("promotion_usage_promo_idx").on(t.promotionId),
    index("promotion_usage_code_customer_idx").on(t.codeId, t.customerId),
    index("promotion_usage_order_idx").on(t.orderId),
  ]
);
