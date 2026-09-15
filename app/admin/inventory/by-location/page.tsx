import { db } from "@/db";
import { inventoryBalances, inventoryLocations, products, productVariants } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { Card } from "@/components/ui";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function ByLocationPage() {
  let locations: { id: string; code: string; name: string }[] = [];
  let rows: { locationId: string; sku: string; productName: string; onHand: number; reserved: number }[] = [];
  try {
    locations = await db
      .select({ id: inventoryLocations.id, code: inventoryLocations.code, name: inventoryLocations.name })
      .from(inventoryLocations)
      .orderBy(asc(inventoryLocations.code));
    const data = await db
      .select({
        locationId: inventoryBalances.locationId,
        sku: productVariants.sku,
        productName: products.name,
        onHand: inventoryBalances.onHand,
        reserved: inventoryBalances.reserved,
      })
      .from(inventoryBalances)
      .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .orderBy(asc(products.name));
    rows = data;
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory/by-location">
    <div>
      <PageHeader title="Inventory by location" description="Per-location stock grouped under each warehouse/store." />
      <div className="space-y-4">
        {locations.map((loc) => {
          const lines = rows.filter((r) => r.locationId === loc.id);
          const onHand = lines.reduce((s, l) => s + l.onHand, 0);
          const reserved = lines.reduce((s, l) => s + l.reserved, 0);
          return (
            <Card key={loc.id}>
              <h2 className="font-semibold">{loc.code} — {loc.name}</h2>
              <p className="text-xs text-gray-500">{lines.length} SKUs • {onHand} on hand • {reserved} reserved • {onHand - reserved} available</p>
              {lines.length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="text-gray-500"><th className="py-1 font-medium">Product</th><th className="font-medium">SKU</th><th className="font-medium">On hand</th><th className="font-medium">Reserved</th><th className="font-medium">Available</th></tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1">{l.productName}</td>
                          <td className="text-xs">{l.sku}</td>
                          <td>{l.onHand}</td>
                          <td>{l.reserved}</td>
                          <td className="font-medium">{l.onHand - l.reserved}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No stock at this location" />
              )}
            </Card>
          );
        })}
        {locations.length === 0 && <EmptyState title="No locations yet" description="Create a warehouse or store location first." />}
      </div>
    </div>
    </PageGuard>
  );
}
