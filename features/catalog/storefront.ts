import { db } from "@/db";
import {
  brands,
  categories,
  inventoryBalances,
  orderItems,
  orders,
  productAttributeValues,
  productAttributes,
  productImages,
  productVariants,
  products,
  promotions,
  membershipTiers,
  variantAttributeValues,
} from "@/db/schema";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

// NOTE: cost fields (costPrice) are NEVER selected here — they must not leak
// into customer-facing payloads.

export type StoreProductCard = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  basePrice: number;
  comparePrice: number | null;
  featured: boolean;
  createdAt: Date;
  brandName: string | null;
  categoryName: string | null;
  categoryId: string | null;
  brandId: string | null;
  coverImage: string | null;
  available: number;
  variantCount: number;
};

const AVAILABLE = sql<number>`COALESCE(SUM(${inventoryBalances.onHand} - ${inventoryBalances.reserved}),0)`;

export type ShopFilter = {
  q?: string;
  categoryId?: string | null;
  brandId?: string | null;
  minPrice?: number | null; // centavos
  maxPrice?: number | null;
  inStockOnly?: boolean;
  sort?: "newest" | "price" | "price_desc" | "name" | "bestselling";
};

export async function getVisibleProducts(filter: ShopFilter = {}, limit = 24, offset = 0) {
  const conds: SQL[] = [eq(products.status, "active")];
  if (filter.q) {
    const like = `%${filter.q}%`;
    conds.push(or(ilike(products.name, like), ilike(products.shortDescription, like))!);
  }
  if (filter.categoryId) {
    // Include child categories of the selected parent (one level).
    const kids = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, filter.categoryId));
    const ids = [filter.categoryId, ...kids.map((k) => k.id)];
    conds.push(inArray(products.categoryId, ids));
  }
  if (filter.brandId) conds.push(eq(products.brandId, filter.brandId));
  if (filter.minPrice != null) conds.push(gte(products.basePrice, filter.minPrice));
  if (filter.maxPrice != null) conds.push(lte(products.basePrice, filter.maxPrice));
  const where = and(...conds);

  const orderBy =
    filter.sort === "price" ? asc(products.basePrice)
    : filter.sort === "price_desc" ? desc(products.basePrice)
    : filter.sort === "name" ? asc(products.name)
    : desc(products.createdAt);

  // Bestselling sort is applied in-memory after sales aggregation (see below).
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      shortDescription: products.shortDescription,
      basePrice: products.basePrice,
      comparePrice: products.comparePrice,
      featured: products.featured,
      createdAt: products.createdAt,
      brandId: products.brandId,
      categoryId: products.categoryId,
      brandName: brands.name,
      categoryName: categories.name,
      available: AVAILABLE,
      variantCount: sql<number>`COUNT(DISTINCT ${productVariants.id})`,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.status, "active")))
    .leftJoin(inventoryBalances, eq(inventoryBalances.variantId, productVariants.id))
    .where(where)
    .groupBy(products.id, brands.name, categories.name)
    .orderBy(orderBy)
    .limit(filter.sort === "bestselling" ? 100 : limit)
    .offset(filter.sort === "bestselling" ? 0 : offset);

  const rowIds = rows.map((r) => r.id);
  const imageRows = rowIds.length > 0
    ? await db
        .select({ productId: productImages.productId, url: productImages.url, sortOrder: productImages.sortOrder })
        .from(productImages)
        .where(inArray(productImages.productId, rowIds))
        .orderBy(asc(productImages.productId), asc(productImages.sortOrder))
    : [];
  const coverByProduct = new Map<string, string>();
  for (const img of imageRows) {
    if (!coverByProduct.has(img.productId)) coverByProduct.set(img.productId, img.url);
  }
  const withImages = rows.map((r) => ({
    ...r,
    available: Number(r.available ?? 0),
    variantCount: Number(r.variantCount ?? 0),
    coverImage: coverByProduct.get(r.id) ?? null,
  }));

  let items = withImages;
  if (filter.inStockOnly) items = items.filter((i) => i.available > 0);
  if (filter.sort === "bestselling") {
    const sales = await getUnitsSold(new Set(items.map((i) => i.id)));
    items = items.sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0));
    return { items: items.slice(offset, offset + limit), total: items.length };
  }

  const countRows = await db
    .select({ id: products.id })
    .from(products)
    .where(where);
  let total = countRows.length;
  if (filter.inStockOnly) {
    // Approximate: count items with stock from the fetched window is wrong for
    // pagination; do a second aggregated pass when the filter is active.
    const all = await db
      .select({ id: products.id, available: AVAILABLE })
      .from(products)
      .leftJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.status, "active")))
      .leftJoin(inventoryBalances, eq(inventoryBalances.variantId, productVariants.id))
      .where(where)
      .groupBy(products.id);
    total = all.filter((r) => Number(r.available ?? 0) > 0).length;
  }
  return { items, total };
}

async function getUnitsSold(productIds: Set<string>): Promise<Map<string, number>> {
  if (productIds.size === 0) return new Map();
  const rows = await db
    .select({
      productId: productVariants.productId,
      units: sql<number>`COALESCE(SUM(${orderItems.quantity}),0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(inArray(orders.status, ["confirmed", "processing", "ready_for_pickup", "shipped", "completed"]))
    .groupBy(productVariants.productId);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (productIds.has(r.productId)) map.set(r.productId, Number(r.units ?? 0));
  }
  return map;
}

export async function getBestSellers(limit = 8): Promise<(StoreProductCard & { unitsSold: number })[]> {
  const rows = await db
    .select({
      productId: productVariants.productId,
      units: sql<number>`COALESCE(SUM(${orderItems.quantity}),0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(inArray(orders.status, ["confirmed", "processing", "ready_for_pickup", "shipped", "completed"]))
    .groupBy(productVariants.productId)
    .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.productId);
  const units = new Map(rows.map((r) => [r.productId, Number(r.units ?? 0)]));
  const { items } = await getVisibleProducts({}, 100, 0);
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: (StoreProductCard & { unitsSold: number })[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) out.push({ ...item, unitsSold: units.get(id) ?? 0 });
  }
  return out;
}

export type StoreProductDetail = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  basePrice: number;
  comparePrice: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  featured: boolean;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  images: { url: string; alt: string | null }[];
  attributes: { name: string; values: string[] }[];
  variants: {
    id: string;
    sku: string;
    name: string | null;
    barcode: string | null;
    price: number | null; // override, null = base
    comparePrice: number | null;
    imageUrl: string | null;
    status: string;
    optionValues: string[];
    available: number;
  }[];
};

export async function getProductDetail(slug: string): Promise<StoreProductDetail | null> {
  const found = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      sku: products.sku,
      shortDescription: products.shortDescription,
      description: products.description,
      basePrice: products.basePrice,
      comparePrice: products.comparePrice,
      weightG: products.weightG,
      lengthMm: products.lengthMm,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      featured: products.featured,
      brandName: brands.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.status, "active")))
    .limit(1);
  const p = found[0];
  if (!p) return null;

  const imgs = await db
    .select({ url: productImages.url, alt: productImages.alt })
    .from(productImages)
    .where(eq(productImages.productId, p.id))
    .orderBy(asc(productImages.sortOrder));

  const attrs = await db.select().from(productAttributes).where(eq(productAttributes.productId, p.id));
  const attrIds = attrs.map((a) => a.id);
  const attrValues = attrIds.length > 0
    ? await db.select().from(productAttributeValues).where(inArray(productAttributeValues.attributeId, attrIds))
    : [];
  const attributes = attrs.map((a) => ({
    name: a.name,
    values: attrValues.filter((v) => v.attributeId === a.id).map((v) => v.value),
  }));

  const vars = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
  const variantIds = vars.map((v) => v.id);
  const links = variantIds.length > 0
    ? await db
        .select({ variantId: variantAttributeValues.variantId, value: productAttributeValues.value })
        .from(variantAttributeValues)
        .innerJoin(productAttributeValues, eq(variantAttributeValues.attributeValueId, productAttributeValues.id))
        .where(inArray(variantAttributeValues.variantId, variantIds))
    : [];
  const valuesByVariant = new Map<string, string[]>();
  for (const l of links) {
    const arr = valuesByVariant.get(l.variantId) ?? [];
    arr.push(l.value);
    valuesByVariant.set(l.variantId, arr);
  }
  const balances = variantIds.length > 0
    ? await db.select().from(inventoryBalances).where(inArray(inventoryBalances.variantId, variantIds))
    : [];
  const availByVariant = new Map<string, number>();
  for (const b of balances) {
    availByVariant.set(b.variantId, (availByVariant.get(b.variantId) ?? 0) + (b.onHand - b.reserved));
  }

  return {
    ...p,
    images: imgs,
    attributes,
    variants: vars
      .filter((v) => v.status === "active" && !v.deletedAt)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        barcode: v.barcode,
        price: v.priceOverride,
        comparePrice: v.comparePrice,
        imageUrl: v.imageUrl,
        status: v.status,
        optionValues: valuesByVariant.get(v.id) ?? [],
        available: availByVariant.get(v.id) ?? 0,
      })),
  };
}

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  children: { id: string; name: string; slug: string; imageUrl: string | null }[];
};

export async function getCategoriesTree(): Promise<CategoryNode[]> {
  const all = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      imageUrl: categories.imageUrl,
      sortOrder: categories.sortOrder,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return all
    .filter((c) => !c.parentId)
    .map((c) => ({
      ...c,
      children: all.filter((k) => k.parentId === c.id).map((k) => ({ id: k.id, name: k.name, slug: k.slug, imageUrl: k.imageUrl })),
    }));
}

export async function getActivePromos() {
  const now = new Date();
  const all = await db.select().from(promotions).where(eq(promotions.isActive, true));
  return all.filter((p) => (!p.startAt || p.startAt <= now) && (!p.endAt || p.endAt >= now));
}

export async function getMembershipTiers() {
  return db.select().from(membershipTiers).orderBy(asc(membershipTiers.minSpend));
}

/** Current member discount percent for price hints (null when none/guest). */
export async function getMemberDiscountPct(userId: string | null): Promise<number | null> {
  if (!userId) return null;
  const { customers } = await import("@/db/schema");
  const { tierForSpend } = await import("@/lib/membership");
  const c = await db.select().from(customers).where(eq(customers.userId, userId)).limit(1);
  if (!c[0]) return null;
  const tier = await tierForSpend(c[0].lifetimeSpend ?? 0);
  return tier && (tier.discountPct ?? 0) > 0 ? tier.discountPct : null;
}
