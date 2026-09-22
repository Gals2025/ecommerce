import { db } from "@/db";
import {
  brands,
  categories,
  inventoryBalances,
  inventoryLocations,
  inventoryMovements,
  products,
  productVariants,
  users,
} from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import type { ExportColumn, ExportRow } from "@/lib/exports";
import { getInventorySnapshot } from "@/features/reports/service";

export const MOVEMENT_EXPORT_LIMIT = 50000;

export const productExportColumns: ExportColumn[] = [
  { key: "product", header: "Product", width: 30 },
  { key: "slug", header: "Slug", width: 26 },
  { key: "productSku", header: "Product SKU", width: 18 },
  { key: "variantSku", header: "Variant SKU", width: 18 },
  { key: "variantName", header: "Variant", width: 18 },
  { key: "barcode", header: "Barcode", width: 18 },
  { key: "brand", header: "Brand", width: 18 },
  { key: "category", header: "Category", width: 18 },
  { key: "basePrice", header: "Base price (₱)", width: 16, kind: "money" },
  { key: "priceOverride", header: "Variant price (₱)", width: 16, kind: "money" },
  { key: "costPrice", header: "Cost (₱)", width: 14, kind: "money" },
  { key: "status", header: "Status", width: 12 },
  { key: "featured", header: "Featured", width: 10 },
];

export async function getProductExportRows(): Promise<ExportRow[]> {
  const rows = await db
    .select({
      product: products.name,
      slug: products.slug,
      productSku: products.sku,
      barcode: products.barcode,
      brand: brands.name,
      category: categories.name,
      basePrice: products.basePrice,
      productStatus: products.status,
      featured: products.featured,
      variantSku: productVariants.sku,
      variantName: productVariants.name,
      variantBarcode: productVariants.barcode,
      priceOverride: productVariants.priceOverride,
      costPrice: productVariants.costPrice,
      productCost: products.costPrice,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .orderBy(asc(products.name), asc(productVariants.sku))
    .limit(10000);
  return rows.map((r) => ({
    product: r.product,
    slug: r.slug,
    productSku: r.productSku ?? "",
    variantSku: r.variantSku ?? "",
    variantName: r.variantName ?? "",
    barcode: r.variantBarcode ?? r.barcode ?? "",
    brand: r.brand ?? "",
    category: r.category ?? "",
    basePrice: r.basePrice,
    priceOverride: r.priceOverride,
    costPrice: r.costPrice ?? r.productCost,
    status: r.productStatus,
    featured: r.featured ? "yes" : "no",
  }));
}

export const inventoryExportColumns: ExportColumn[] = [
  { key: "product", header: "Product", width: 30 },
  { key: "sku", header: "SKU", width: 18 },
  { key: "location", header: "Location", width: 14 },
  { key: "onHand", header: "On hand", width: 10, kind: "number" },
  { key: "reserved", header: "Reserved", width: 10, kind: "number" },
  { key: "available", header: "Available", width: 10, kind: "number" },
  { key: "unitCost", header: "Unit cost (₱)", width: 16, kind: "money" },
  { key: "value", header: "Value (₱)", width: 16, kind: "money" },
];

export async function getInventoryExportRows(): Promise<ExportRow[]> {
  const [balances, snapshot] = await Promise.all([
    db
      .select({
        product: products.name,
        sku: productVariants.sku,
        variantId: productVariants.id,
        location: inventoryLocations.code,
        onHand: inventoryBalances.onHand,
        reserved: inventoryBalances.reserved,
      })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(inventoryLocations, eq(inventoryBalances.locationId, inventoryLocations.id))
      .orderBy(asc(products.name), asc(productVariants.sku))
      .limit(10000),
    getInventorySnapshot().catch(() => []),
  ]);
  const costByVariant = new Map(snapshot.map((s) => [s.variantId, s]));
  return balances.map((b) => {
    const cost = costByVariant.get(b.variantId);
    const unitCost = cost && !cost.costMissing ? cost.unitCost : null;
    return {
      product: b.product,
      sku: b.sku,
      location: b.location,
      onHand: b.onHand,
      reserved: b.reserved,
      available: b.onHand - b.reserved,
      unitCost,
      value: unitCost == null ? null : b.onHand * unitCost,
    };
  });
}

export const movementExportColumns: ExportColumn[] = [
  { key: "createdAt", header: "Date", width: 20, kind: "date" },
  { key: "sku", header: "SKU", width: 18 },
  { key: "product", header: "Product", width: 26 },
  { key: "from", header: "From", width: 12 },
  { key: "to", header: "To", width: 12 },
  { key: "onHandChange", header: "Δ on-hand", width: 10, kind: "number" },
  { key: "reservedChange", header: "Δ reserved", width: 10, kind: "number" },
  { key: "reason", header: "Reason", width: 18 },
  { key: "reference", header: "Reference", width: 22 },
  { key: "unitCost", header: "Unit cost (₱)", width: 14, kind: "money" },
  { key: "note", header: "Note", width: 30 },
  { key: "createdBy", header: "By", width: 22 },
];

export async function getMovementExportRows(): Promise<ExportRow[]> {
  const [rows, locations] = await Promise.all([
    db
      .select({
        createdAt: inventoryMovements.createdAt,
        sku: productVariants.sku,
        product: products.name,
        fromLocationId: inventoryMovements.fromLocationId,
        toLocationId: inventoryMovements.toLocationId,
        onHandChange: inventoryMovements.qtyOnHandChange,
        reservedChange: inventoryMovements.qtyReservedChange,
        reason: inventoryMovements.reason,
        refType: inventoryMovements.refType,
        refId: inventoryMovements.refId,
        reference: inventoryMovements.reference,
        unitCost: inventoryMovements.unitCost,
        note: inventoryMovements.note,
        byName: users.name,
        byEmail: users.email,
      })
      .from(inventoryMovements)
      .leftJoin(productVariants, eq(inventoryMovements.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(users, eq(inventoryMovements.createdBy, users.id))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(MOVEMENT_EXPORT_LIMIT),
    db.select({ id: inventoryLocations.id, code: inventoryLocations.code }).from(inventoryLocations),
  ]);
  const locById = new Map(locations.map((l) => [l.id, l.code]));
  return rows.map((r) => ({
    createdAt: r.createdAt,
    sku: r.sku ?? "",
    product: r.product ?? "",
    from: r.fromLocationId ? (locById.get(r.fromLocationId) ?? "") : "",
    to: r.toLocationId ? (locById.get(r.toLocationId) ?? "") : "",
    onHandChange: r.onHandChange,
    reservedChange: r.reservedChange,
    reason: r.reason,
    reference: r.reference ?? (r.refType ? `${r.refType}:${(r.refId ?? "").slice(0, 8)}` : ""),
    unitCost: r.unitCost,
    note: r.note ?? "",
    createdBy: r.byName ?? r.byEmail ?? "",
  }));
}
