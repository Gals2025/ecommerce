import Link from "next/link";
import { db } from "@/db";
import { inventoryBalances, inventoryLocations, products, productVariants } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Button, buttonVariants } from "@/components/ui";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function AdminInventory() {
  let rows: {
    sku: string; productName: string; locationCode: string;
    onHand: number; reserved: number;
  }[] = [];
  let totals = { onHand: 0, reserved: 0, skus: 0 };
  try {
    const data = await db
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
      .orderBy(asc(products.name), asc(productVariants.sku));
    rows = data;
    totals = {
      onHand: data.reduce((s, r) => s + r.onHand, 0),
      reserved: data.reduce((s, r) => s + r.reserved, 0),
      skus: data.length,
    };
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory">
    <div>
      <PageHeader
        title="Inventory overview"
        description={`${totals.skus} stocked SKU locations • ${totals.onHand} on hand • ${totals.reserved} reserved • ${totals.onHand - totals.reserved} available. Balances are never edited directly — use Receiving or Adjustments.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons endpoint="/api/admin/exports/inventory" />
            <Link href="/admin/inventory/receiving"><Button>Receive stock</Button></Link>
            <Link href="/admin/inventory/adjustments"><Button>Adjust</Button></Link>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/inventory/by-location" className={cn(buttonVariants({ variant: "utility" }), "no-underline")}>By location</Link>
        <Link href="/admin/inventory/movements" className={cn(buttonVariants({ variant: "utility" }), "no-underline")}>Movement history</Link>
        <Link href="/admin/inventory/low-stock" className={cn(buttonVariants({ variant: "utility" }), "no-underline")}>Low-stock report</Link>
        <Link href="/admin/inventory/out-of-stock" className={cn(buttonVariants({ variant: "utility" }), "no-underline")}>Out-of-stock report</Link>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">On hand</th>
              <th className="px-3 py-2 font-medium">Reserved</th>
              <th className="px-3 py-2 font-medium">Available</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{r.productName}</td>
                <td className="px-3 py-2 text-xs">{r.sku}</td>
                <td className="px-3 py-2 text-xs">{r.locationCode}</td>
                <td className="px-3 py-2">{r.onHand}</td>
                <td className="px-3 py-2">{r.reserved}</td>
                <td className="px-3 py-2 font-medium">{r.onHand - r.reserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="mt-3">
          <EmptyState
            title="No balances yet"
            description="Balances appear after receiving stock."
            action={
              <Link href="/admin/inventory/receiving"><Button size="sm">Receive stock</Button></Link>
            }
          />
        </div>
      )}
    </div>
    </PageGuard>
  );
}
