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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("brands_slug_idx").on(t.slug)]
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("categories_slug_idx").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
    index("categories_sort_idx").on(t.sortOrder),
  ]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    sku: text("sku").unique(),
    barcode: text("barcode"),
    brandId: uuid("brand_id").references(() => brands.id),
    categoryId: uuid("category_id").references(() => categories.id),
    basePrice: integer("base_price").notNull(), // centavos
    comparePrice: integer("compare_price"), // centavos
    costPrice: integer("cost_price"), // centavos
    trackInventory: boolean("track_inventory").notNull().default(true),
    lowStockThreshold: integer("low_stock_threshold"),
    weightG: integer("weight_g"), // grams
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    status: text("status").notNull().default("draft"), // draft|active|inactive|archived
    featured: boolean("featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Slug reusable after soft-delete
    uniqueIndex("products_slug_uidx").on(t.slug).where(sql`${t.deletedAt} IS NULL`),
    index("products_brand_idx").on(t.brandId),
    index("products_category_idx").on(t.categoryId),
    index("products_status_idx").on(t.status),
    check("products_base_price_ck", sql`${t.basePrice} >= 0`),
    check("products_status_ck", sql`${t.status} IN ('draft','active','inactive','archived')`),
  ]
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(), // Vercel Blob URL
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId),
    index("product_images_product_sort_idx").on(t.productId, t.sortOrder),
  ]
);

// Renamed from product_options (v1) — generic variant dimensions (Size, Color)
export const productAttributes = pgTable(
  "product_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. Size, Color
  },
  (t) => [index("product_attributes_product_idx").on(t.productId)]
);

export const productAttributeValues = pgTable(
  "product_attribute_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attributeId: uuid("attribute_id")
      .notNull()
      .references(() => productAttributes.id, { onDelete: "cascade" }),
    value: text("value").notNull(), // e.g. M, Red
  },
  (t) => [
    uniqueIndex("product_attribute_values_uidx").on(t.attributeId, t.value),
    index("product_attribute_values_attr_idx").on(t.attributeId),
  ]
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    name: text("name"), // e.g. "Red / M" — display snapshot helper
    barcode: text("barcode"),
    priceOverride: integer("price_override"), // centavos, null = use product.basePrice
    comparePrice: integer("compare_price"),
    costPrice: integer("cost_price"), // centavos
    imageUrl: text("image_url"), // Vercel Blob URL override
    status: text("status").notNull().default("active"), // active|inactive|archived
    trackInventory: boolean("track_inventory").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("product_variants_product_idx").on(t.productId),
    index("product_variants_status_idx").on(t.status),
    check("product_variants_price_ck", sql`${t.priceOverride} IS NULL OR ${t.priceOverride} >= 0`),
    check("product_variants_status_ck", sql`${t.status} IN ('active','inactive','archived')`),
  ]
);

export const variantAttributeValues = pgTable(
  "variant_attribute_values",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    attributeValueId: uuid("attribute_value_id")
      .notNull()
      .references(() => productAttributeValues.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("variant_attribute_values_uidx").on(t.variantId, t.attributeValueId),
    index("variant_attribute_values_variant_idx").on(t.variantId),
  ]
);
