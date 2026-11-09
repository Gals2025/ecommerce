"use server";

import { db } from "@/db";
import { products, productVariants, inventoryLocations, inventoryBalances } from "@/db/schema";
import { and, eq, isNull, sql, asc } from "drizzle-orm";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import { createPosSale } from "@/features/pos/service";
import { posSaleSchema } from "@/features/pos/validation";
import { revalidatePath } from "next/cache";

async function authorize() {
  const session = await getStrictAdminSession();
  if (!session || !await hasPermission(session.user.id, "orders.pos")) throw new Error("Forbidden");
  return session.user.id;
}

const sellable = () => and(eq(products.status, "active"), eq(products.isActive, true), isNull(products.deletedAt), eq(productVariants.status, "active"), eq(productVariants.isActive, true), isNull(productVariants.deletedAt));

export async function getPosCatalog() {
  await authorize();
  const [variants, locations, balances] = await Promise.all([
    db.select({ id: productVariants.id, name: products.name, variant: productVariants.name, sku: productVariants.sku, barcode: productVariants.barcode, productBarcode: products.barcode, basePrice: products.basePrice, override: productVariants.priceOverride, trackProduct: products.trackInventory, trackVariant: productVariants.trackInventory })
      .from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(sellable()).orderBy(asc(products.name)),
    db.select({ id: inventoryLocations.id, name: inventoryLocations.name }).from(inventoryLocations).where(and(eq(inventoryLocations.isActive, true), isNull(inventoryLocations.deletedAt))).orderBy(asc(inventoryLocations.name)),
    db.select({ variantId: inventoryBalances.variantId, locationId: inventoryBalances.locationId, available: sql<number>`${inventoryBalances.onHand} - ${inventoryBalances.reserved}` }).from(inventoryBalances),
  ]);
  return { products: variants.map(v => ({ id: v.id, name: v.name, variant: v.variant, sku: v.sku, barcode: v.barcode ?? v.productBarcode, price: v.override ?? v.basePrice, tracked: v.trackProduct && v.trackVariant })), locations, balances };
}

export async function recordPosSale(input: unknown): Promise<{ orderId: string; orderNo: string } | { error: string; retry?: boolean }> {
  const actorId = await authorize();
  const parsed = posSaleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  try {
    const result = await createPosSale(db, actorId, data);
    for (const path of ["/admin/pos", "/admin/orders", "/admin/payments", "/admin/inventory", "/admin/reports", "/admin/reports/sales", "/admin", "/shop", "/"]) revalidatePath(path);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Insufficient|Select an active|A product|Cash received|Sale total|Invalid sale)/.test(message)) return { error: message };
    console.error("POS sale failed", error instanceof Error ? error.name : "unknown");
    return { error: "Sale could not be confirmed. Retry to check the same sale without creating a duplicate.", retry: true };
  }
}
