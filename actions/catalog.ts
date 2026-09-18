"use server";

import { db, type Tx } from "@/db";
import {
  brands,
  categories,
  products,
  productImages,
  productAttributes,
  productAttributeValues,
  productVariants,
  variantAttributeValues,
  inventoryBalances,
  inventoryLocations,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, getSession } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recordMovement } from "@/lib/inventory";
import {
  brandSchema,
  canonicalizeProductOptions,
  categorySchema,
  productSchema,
  productStatusSchema,
  slugify,
  type BrandInput,
  type CategoryInput,
  type ProductInput,
  type ProductStatus,
} from "@/validators";

// ---------- helpers ----------

function statusSync(status: ProductStatus): {
  isActive: boolean;
  deletedAt: Date | null;
} {
  if (status === "active") return { isActive: true, deletedAt: null };
  if (status === "archived") return { isActive: false, deletedAt: new Date() };
  return { isActive: false, deletedAt: null };
}

function variantSync(status: "active" | "inactive" | "archived"): {
  isActive: boolean;
  deletedAt: Date | null;
} {
  if (status === "active") return { isActive: true, deletedAt: null };
  if (status === "archived") return { isActive: false, deletedAt: new Date() };
  return { isActive: false, deletedAt: null };
}

async function uniqueSlug(
  tx: Tx | typeof db,
  table: typeof products | typeof categories | typeof brands,
  base: string,
  ignoreId?: string
): Promise<string> {
  const slug = slugify(base) || `item-${Date.now().toString(36)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const rows = await tx.select({ id: t.id }).from(table).where(eq(t.slug, candidate)).limit(1);
    if (rows.length === 0 || (ignoreId && rows[0].id === ignoreId)) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function ensureDefaultLocation(tx: Tx | typeof db) {
  const locs = await tx.select().from(inventoryLocations).limit(1);
  return locs[0] ?? null;
}

// Zod errors serialize as JSON blobs — flatten to readable lines so the
// admin form (which renders e.message) shows the actual problems.
function parseProductInput(input: unknown) {
  // Repair legacy drift first so saves aren't blocked by it; genuine
  // errors (duplicates, unknown values) still fail below with readable lines.
  const parsed = productSchema.safeParse(canonicalizeProductOptions(input));
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => {
    const path = i.path.length > 0 ? `${String(i.path.join("."))}: ` : "";
    return `• ${path}${i.message}`;
  });
  throw new Error(`Product validation failed:\n${lines.join("\n")}`);
}

// ---------- Brands ----------

export async function createBrand(input: BrandInput | string) {
  const session = await requireAdmin();
  const data: BrandInput =
    typeof input === "string" ? brandSchema.parse({ name: input }) : brandSchema.parse(input);
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, brands, data.slug || data.name);
    const [row] = await tx
      .insert(brands)
      .values({ name: data.name, slug, logoUrl: data.logoUrl ?? null })
      .returning();
    await audit(session.user.id, "brand.create", "brands", row.id, { name: row.name });
    revalidatePath("/admin/brands");
    return row.id;
  });
}

export async function updateBrand(id: string, input: BrandInput) {
  const session = await requireAdmin();
  const data = brandSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(brands).where(eq(brands.id, id)).limit(1))[0];
    if (!existing) throw new Error("Brand not found");
    const slug = data.slug
      ? await uniqueSlug(tx, brands, data.slug, id)
      : existing.slug;
    const [row] = await tx
      .update(brands)
      .set({ name: data.name, slug, logoUrl: data.logoUrl ?? null, updatedAt: new Date() })
      .where(eq(brands.id, id))
      .returning();
    await audit(session.user.id, "brand.update", "brands", id, {
      before: { name: existing.name },
      after: { name: row.name },
    });
    revalidatePath("/admin/brands");
    return row.id;
  });
}

export async function archiveBrand(id: string, archived = true) {
  id = z.string().uuid().parse(id);
  archived = z.boolean().parse(archived);
  const session = await requireAdmin();
  await db
    .update(brands)
    .set({
      isActive: !archived,
      deletedAt: archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(brands.id, id));
  await audit(session.user.id, archived ? "brand.archive" : "brand.restore", "brands", id, { archived });
  revalidatePath("/admin/brands");
  return true;
}

// ---------- Categories ----------

async function assertValidParent(
  tx: Tx | typeof db,
  parentId: string | null | undefined,
  selfId?: string
) {
  if (!parentId) return;
  if (selfId && parentId === selfId) throw new Error("Category cannot be its own parent");
  const parent = (await tx.select().from(categories).where(eq(categories.id, parentId)).limit(1))[0];
  if (!parent) throw new Error("Parent category not found");
  if (parent.deletedAt) throw new Error("Parent category is archived");
  // One level only: parent must be top-level.
  if (parent.parentId) throw new Error("Only one level of nesting is allowed");
}

export async function createCategory(input: CategoryInput | string) {
  const session = await requireAdmin();
  const data: CategoryInput =
    typeof input === "string" ? categorySchema.parse({ name: input }) : categorySchema.parse(input);
  return db.transaction(async (tx) => {
    await assertValidParent(tx, data.parentId);
    const slug = await uniqueSlug(tx, categories, data.slug || data.name);
    const [row] = await tx
      .insert(categories)
      .values({
        name: data.name,
        slug,
        description: data.description ?? null,
        parentId: data.parentId ?? null,
        imageUrl: data.imageUrl ?? null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();
    await audit(session.user.id, "category.create", "categories", row.id, { name: row.name });
    revalidatePath("/admin/categories");
    return row.id;
  });
}

export async function updateCategory(id: string, input: CategoryInput) {
  const session = await requireAdmin();
  const data = categorySchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
    if (!existing) throw new Error("Category not found");
    await assertValidParent(tx, data.parentId, id);
    const slug = await uniqueSlug(tx, categories, data.slug || data.name, id);
    const [row] = await tx
      .update(categories)
      .set({
        name: data.name,
        slug,
        description: data.description ?? null,
        parentId: data.parentId ?? null,
        imageUrl: data.imageUrl ?? null,
        sortOrder: data.sortOrder ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id))
      .returning();
    await audit(session.user.id, "category.update", "categories", id, {
      before: { name: existing.name },
      after: { name: row.name },
    });
    revalidatePath("/admin/categories");
    return row.id;
  });
}

export async function archiveCategory(id: string, archived = true) {
  id = z.string().uuid().parse(id);
  archived = z.boolean().parse(archived);
  const session = await requireAdmin();
  await db
    .update(categories)
    .set({
      isActive: !archived,
      deletedAt: archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(categories.id, id));
  await audit(
    session.user.id,
    archived ? "category.archive" : "category.restore",
    "categories",
    id,
    { archived }
  );
  revalidatePath("/admin/categories");
  return true;
}

// ---------- Products ----------

type VariantInput = ProductInput["variants"][number];

async function insertVariantWithBalance(
  tx: Tx,
  productId: string,
  v: VariantInput,
  valueIdByName: Map<string, string>,
  actorId: string
) {
  const sync = variantSync(v.status);
  const [variant] = await tx
    .insert(productVariants)
    .values({
      productId,
      sku: v.sku,
      name: v.name ?? (v.optionValues.join(" / ") || null),
      barcode: v.barcode ?? null,
      priceOverride: v.priceOverride ?? null,
      comparePrice: v.comparePrice ?? null,
      costPrice: v.costPrice ?? null,
      imageUrl: v.imageUrl ?? null,
      status: v.status,
      trackInventory: v.trackInventory,
      isActive: sync.isActive,
      deletedAt: sync.deletedAt,
    })
    .returning();
  for (const val of v.optionValues) {
    const avId = valueIdByName.get(val);
    if (avId) {
      await tx
        .insert(variantAttributeValues)
        .values({ variantId: variant.id, attributeValueId: avId })
        .onConflictDoNothing();
    }
  }
  const loc = await ensureDefaultLocation(tx);
  if (loc) {
    await tx
      .insert(inventoryBalances)
      .values({ variantId: variant.id, locationId: loc.id, onHand: 0, reserved: 0 })
      .onConflictDoNothing();
    await recordMovement(
      {
        variantId: variant.id,
        toLocationId: loc.id,
        qtyOnHandChange: 0,
        qtyReservedChange: 0,
        balanceAfter: 0,
        reservedAfter: 0,
        reason: "OPENING_STOCK",
        refType: "product_create",
        refId: productId,
        note: "Variant created",
        createdBy: actorId,
      },
      tx
    );
  }
  return variant;
}

function buildValueMap(
  attributeRows: { id: string }[],
  attributeInputs: { name: string; values: string[] }[],
  valueRows: { id: string; attributeId: string; value: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  const attrIdByIndex = attributeRows.map((r) => r.id);
  attributeInputs.forEach((attr, i) => {
    const attrId = attrIdByIndex[i];
    for (const val of attr.values) {
      const found = valueRows.find((r) => r.attributeId === attrId && r.value === val);
      if (found) map.set(val, found.id);
    }
  });
  return map;
}

export async function createProduct(input: unknown) {
  const session = await requireAdmin();
  const data = parseProductInput(input);
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, products, data.slug || data.name);
    const sync = statusSync(data.status);
    const [p] = await tx
      .insert(products)
      .values({
        name: data.name,
        slug,
        shortDescription: data.shortDescription ?? null,
        description: data.description ?? null,
        sku: data.sku ?? null,
        barcode: data.barcode ?? null,
        brandId: data.brandId ?? null,
        categoryId: data.categoryId ?? null,
        basePrice: data.basePrice,
        comparePrice: data.comparePrice ?? null,
        costPrice: data.costPrice ?? null,
        trackInventory: data.trackInventory,
        lowStockThreshold: data.lowStockThreshold ?? null,
        weightG: data.weightG ?? null,
        lengthMm: data.lengthMm ?? null,
        widthMm: data.widthMm ?? null,
        heightMm: data.heightMm ?? null,
        status: data.status,
        featured: data.featured,
        isActive: sync.isActive,
        deletedAt: sync.deletedAt,
      })
      .returning();

    for (const [i, url] of data.images.entries()) {
      await tx.insert(productImages).values({ productId: p.id, url, sortOrder: i });
    }

    const attributeRows: { id: string }[] = [];
    const valueRows: { id: string; attributeId: string; value: string }[] = [];
    for (const attr of data.attributes) {
      const [a] = await tx
        .insert(productAttributes)
        .values({ productId: p.id, name: attr.name })
        .returning();
      attributeRows.push({ id: a.id });
      for (const val of [...new Set(attr.values)]) {
        const [av] = await tx
          .insert(productAttributeValues)
          .values({ attributeId: a.id, value: val })
          .returning();
        valueRows.push({ id: av.id, attributeId: a.id, value: av.value });
      }
    }
    const valueIdByName = buildValueMap(attributeRows, data.attributes, valueRows);

    // Simple product (no variants): auto-create a default variant from the
    // product SKU so the Variant → Balance → Movement model always holds.
    const effectiveVariants = data.variants.length > 0
      ? data.variants
      : data.sku
        ? [{ sku: data.sku, name: "Default", barcode: data.barcode ?? null, priceOverride: null, comparePrice: data.comparePrice ?? null, costPrice: data.costPrice ?? null, imageUrl: data.images[0] ?? null, status: "active" as const, trackInventory: data.trackInventory, optionValues: [] as string[] }]
        : [];
    for (const v of effectiveVariants) {
      await insertVariantWithBalance(tx, p.id, v, valueIdByName, session.user.id);
    }

    await audit(session.user.id, "product.create", "products", p.id, {
      name: p.name,
      basePrice: p.basePrice,
      status: p.status,
    });
    revalidatePath("/admin/products");
    return p.id;
  });
}

export async function updateProduct(id: string, input: unknown) {
  const session = await requireAdmin();
  const data = parseProductInput(input);
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(products).where(eq(products.id, id)).limit(1))[0];
    if (!existing) throw new Error("Product not found");

    const slug =
      data.slug && data.slug !== existing.slug
        ? await uniqueSlug(tx, products, data.slug, id)
        : existing.slug;
    const sync = statusSync(data.status);

    const [p] = await tx
      .update(products)
      .set({
        name: data.name,
        slug,
        shortDescription: data.shortDescription ?? null,
        description: data.description ?? null,
        sku: data.sku ?? null,
        barcode: data.barcode ?? null,
        brandId: data.brandId ?? null,
        categoryId: data.categoryId ?? null,
        basePrice: data.basePrice,
        comparePrice: data.comparePrice ?? null,
        costPrice: data.costPrice ?? null,
        trackInventory: data.trackInventory,
        lowStockThreshold: data.lowStockThreshold ?? null,
        weightG: data.weightG ?? null,
        lengthMm: data.lengthMm ?? null,
        widthMm: data.widthMm ?? null,
        heightMm: data.heightMm ?? null,
        status: data.status,
        featured: data.featured,
        isActive: sync.isActive,
        deletedAt: sync.deletedAt,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    // Images: replace.
    await tx.delete(productImages).where(eq(productImages.productId, id));
    for (const [i, url] of data.images.entries()) {
      await tx.insert(productImages).values({ productId: id, url, sortOrder: i });
    }

    // Variants: match by SKU, update or insert, archive missing.
    // Simple products keep an auto-created default variant (see createProduct).
    const inputVariants = data.variants.length > 0
      ? data.variants
      : data.sku
        ? [{ sku: data.sku, name: "Default" as string | null, barcode: data.barcode ?? null, priceOverride: null as number | null, comparePrice: data.comparePrice ?? null, costPrice: data.costPrice ?? null, imageUrl: data.images[0] ?? null, status: "active" as const, trackInventory: data.trackInventory, optionValues: [] as string[] }]
        : [];
    const existingVariants = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id));
    const inputSkus = new Set(inputVariants.map((v) => v.sku));
    const priceChanges: Record<string, { before: unknown; after: unknown }> = {};

    for (const v of inputVariants) {
      const found = existingVariants.find((ev) => ev.sku === v.sku);
      const vsync = variantSync(v.status);
      if (found) {
        if (
          found.priceOverride !== (v.priceOverride ?? null) ||
          found.costPrice !== (v.costPrice ?? null)
        ) {
          priceChanges[`variant:${v.sku}`] = {
            before: { priceOverride: found.priceOverride, costPrice: found.costPrice },
            after: { priceOverride: v.priceOverride ?? null, costPrice: v.costPrice ?? null },
          };
        }
        await tx
          .update(productVariants)
          .set({
            name: v.name ?? (v.optionValues.join(" / ") || null),
            barcode: v.barcode ?? null,
            priceOverride: v.priceOverride ?? null,
            comparePrice: v.comparePrice ?? null,
            costPrice: v.costPrice ?? null,
            imageUrl: v.imageUrl ?? null,
            status: v.status,
            trackInventory: v.trackInventory,
            isActive: vsync.isActive,
            deletedAt: vsync.deletedAt,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, found.id));
      } else {
        // SKU globally unique — fail fast if taken by another product.
        const clash = (
          await tx.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(eq(productVariants.sku, v.sku)).limit(1)
        )[0];
        if (clash) throw new Error(`SKU ${v.sku} is already used by another product`);
        // Attributes rebuilt below; insert without links for now.
        await insertVariantWithBalance(tx, id, v, new Map(), session.user.id);
      }
    }
    for (const ev of existingVariants) {
      if (!inputSkus.has(ev.sku) && !ev.deletedAt) {
        await tx
          .update(productVariants)
          .set({ status: "archived", isActive: false, deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(productVariants.id, ev.id));
      }
    }

    // Attributes: rebuild + relink all live variants by option value names.
    const liveVariantIds = (
      await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, id))
    ).map((r) => r.id);
    if (liveVariantIds.length > 0) {
      const attrRows = await tx
        .select({ id: productAttributes.id })
        .from(productAttributes)
        .where(eq(productAttributes.productId, id));
      const attrIds = attrRows.map((r) => r.id);
      if (attrIds.length > 0) {
        const valRows = await tx
          .select({ id: productAttributeValues.id })
          .from(productAttributeValues)
          .where(inArray(productAttributeValues.attributeId, attrIds));
        const valIds = valRows.map((r) => r.id);
        if (valIds.length > 0) {
          await tx.delete(variantAttributeValues).where(
            inArray(variantAttributeValues.attributeValueId, valIds)
          );
        }
        await tx.delete(productAttributeValues).where(
          inArray(productAttributeValues.attributeId, attrIds)
        );
      }
      await tx.delete(productAttributes).where(eq(productAttributes.productId, id));
    } else {
      await tx.delete(productAttributes).where(eq(productAttributes.productId, id));
    }

    const attributeRows: { id: string }[] = [];
    const valueRows: { id: string; attributeId: string; value: string }[] = [];
    for (const attr of data.attributes) {
      const [a] = await tx
        .insert(productAttributes)
        .values({ productId: id, name: attr.name })
        .returning();
      attributeRows.push({ id: a.id });
      for (const val of [...new Set(attr.values)]) {
        const [av] = await tx
          .insert(productAttributeValues)
          .values({ attributeId: a.id, value: val })
          .returning();
        valueRows.push({ id: av.id, attributeId: a.id, value: av.value });
      }
    }
    const valueIdByName = buildValueMap(attributeRows, data.attributes, valueRows);
    const variantBySku = new Map(inputVariants.map((v) => [v.sku, v]));
    const persisted = await tx
      .select({ id: productVariants.id, sku: productVariants.sku })
      .from(productVariants)
      .where(
        and(eq(productVariants.productId, id), inArray(productVariants.sku, [...inputSkus]))
      );
    for (const pv of persisted) {
      const v = variantBySku.get(pv.sku);
      if (!v) continue;
      await tx.delete(variantAttributeValues).where(eq(variantAttributeValues.variantId, pv.id));
      for (const val of v.optionValues) {
        const avId = valueIdByName.get(val);
        if (avId) {
          await tx
            .insert(variantAttributeValues)
            .values({ variantId: pv.id, attributeValueId: avId })
            .onConflictDoNothing();
        }
      }
    }

    // Audit: general update + dedicated pricing event.
    const priceFields: (keyof typeof existing)[] = ["basePrice", "comparePrice", "costPrice"];
    const productPriceDiff: Record<string, { before: unknown; after: unknown }> = {};
    for (const f of priceFields) {
      if (existing[f] !== p[f]) productPriceDiff[f] = { before: existing[f], after: p[f] };
    }
    const allPriceChanges = { ...productPriceDiff, ...priceChanges };
    await audit(session.user.id, "product.update", "products", id, {
      before: { name: existing.name, status: existing.status, basePrice: existing.basePrice },
      after: { name: p.name, status: p.status, basePrice: p.basePrice },
    });
    if (Object.keys(allPriceChanges).length > 0) {
      await audit(session.user.id, "product.price_change", "products", id, allPriceChanges);
    }
    if (existing.status !== p.status) {
      await audit(session.user.id, "product.status_change", "products", id, {
        before: existing.status,
        after: p.status,
      });
    }
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${id}`);
    return p.id;
  });
}

export async function setProductStatus(id: string, status: ProductStatus) {
  id = z.string().uuid().parse(id);
  status = productStatusSchema.parse(status);
  const session = await requireAdmin();
  const sync = statusSync(status);
  const existing = (await db.select().from(products).where(eq(products.id, id)).limit(1))[0];
  if (!existing) throw new Error("Product not found");
  await db
    .update(products)
    .set({ status, isActive: sync.isActive, deletedAt: sync.deletedAt, updatedAt: new Date() })
    .where(eq(products.id, id));
  await audit(session.user.id, "product.status_change", "products", id, {
    before: existing.status,
    after: status,
  });
  revalidatePath("/admin/products");
  return true;
}

export async function archiveProduct(id: string, archived = true) {
  id = z.string().uuid().parse(id);
  archived = z.boolean().parse(archived);
  const session = await requireAdmin();
  const existing = (await db.select().from(products).where(eq(products.id, id)).limit(1))[0];
  if (!existing) throw new Error("Product not found");
  // Archiving maps to status=archived; restoring maps back to inactive (never auto-active).
  const status: ProductStatus = archived ? "archived" : existing.status === "archived" ? "inactive" : existing.status as ProductStatus;
  await setProductStatus(id, status);
  await audit(session.user.id, archived ? "product.archive" : "product.restore", "products", id, {
    archived,
  });
  return true;
}

export async function addToCart(variantId: string, qty: number) {
  variantId = z.string().uuid().parse(variantId);
  qty = z.number().int().min(1).max(99).parse(qty);
  const session = await getSession().catch(() => null);
  const { addLine } = await import("@/lib/cart");
  return addLine(session?.user.id ?? null, variantId, qty);
}
