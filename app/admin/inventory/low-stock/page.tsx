import { db } from "@/db";
import { inventoryBalances, inventoryLocations, products, productVariants } from "@/db/schema";
import { asc, eq, lte, sql } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function LowStockPage() {
  let rows: { sku: string; productName: string; locationCode: string; onHand: number; reserved: number; threshold: number | null }[] = [];
  try {
    const data = await db
      .select({
        sku: productVariants.sku,
        productName: products.name,
        locationCode: inventoryLocations.code,
        onHand: inventoryBalances.onHand,
        reserved: inventoryBalances.reserved,
        threshold: products.lowStockThreshold,
      })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(inventoryLocations, eq(inventoryBalances.locationId, inventoryLocations.id))
      .where(lte(sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved}`, products.lowStockThreshold))
      .orderBy(asc(products.name));
    // Only rows where a threshold is actually set (NULL threshold comparisons are excluded by SQL semantics).
    rows = data.filter((r) => r.threshold != null);
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory/low-stock">
    <div>
      <PageHeader title="Low-stock report" description="Variants whose available stock is at or below the product's low-stock threshold." />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr><th className="px-3 py-2 font-medium">Product</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 font-medium">Location</th><th className="px-3 py-2 font-medium">Available</th><th className="px-3 py-2 font-medium">Threshold</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.productName}</td>
                <td className="px-3 py-2 text-xs">{r.sku}</td>
                <td className="px-3 py-2 text-xs">{r.locationCode}</td>
                <td className="px-3 py-2 font-medium">{r.onHand - r.reserved}</td>
                <td className="px-3 py-2">{r.threshold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="mt-3">
          <EmptyState title="Nothing at or below threshold" description="Set thresholds on the product edit page." />
        </div>
      )}
    </div>
    </PageGuard>
  );
}
