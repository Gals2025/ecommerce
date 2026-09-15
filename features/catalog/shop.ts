import { db } from "@/db";
import { brands, products } from "@/db/schema";
import { asc, eq, max, min } from "drizzle-orm";

export type { ShopFilter } from "./storefront";
export { getCategoriesTree, getMemberDiscountPct, getVisibleProducts } from "./storefront";

export async function getBrandsForShop() {
  return db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.isActive, true))
    .orderBy(asc(brands.name));
}

export async function getPriceBounds(): Promise<{ min: number; max: number }> {
  const rows = await db
    .select({ min: min(products.basePrice), max: max(products.basePrice) })
    .from(products)
    .where(eq(products.status, "active"));
  return { min: rows[0]?.min ?? 0, max: rows[0]?.max ?? 0 };
}
