import { db } from "@/db";
import { inventoryBalances, inventoryLocations, products, productVariants } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function OutOfStockPage() {
  let rows: { sku: string; productName: string; locationCode: string; onHand: number; reserved: number }[] = [];
  try {
    rows = await db
      .select({
        sku: productVariants.sku,
        productName: products.name,
        locationCode: inventoryLocations.code,
        onHand: inventoryBalances.onHand,
        reserved: inventoryBalances.reserved,
      })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(inventoryLocations, eq(inventoryBalances.locationId, inventoryLocations.id))
      .where(sql`${inventoryBalances.onHand} - ${inventoryBalances.reserved} <= 0`)
      .orderBy(asc(products.name));
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory/out-of-stock">
    <div>
      <PageHeader title="Out-of-stock report" description="Variant locations with zero available stock (on hand − reserved ≤ 0)." />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr><th className="px-3 py-2 font-medium">Product</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 font-medium">Location</th><th className="px-3 py-2 font-medium">On hand</th><th className="px-3 py-2 font-medium">Reserved</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.productName}</td>
                <td className="px-3 py-2 text-xs">{r.sku}</td>
                <td className="px-3 py-2 text-xs">{r.locationCode}</td>
                <td className="px-3 py-2">{r.onHand}</td>
                <td className="px-3 py-2">{r.reserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="mt-3">
          <EmptyState title="Nothing out of stock" description="All variants have available stock." />
        </div>
      )}
    </div>
    </PageGuard>
  );
}
