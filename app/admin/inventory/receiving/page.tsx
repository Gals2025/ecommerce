import { db } from "@/db";
import { inventoryLocations, products, productVariants } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { ReceivingForm } from "@/components/admin/receiving-form";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function ReceivingPage() {
  let variants: { id: string; sku: string; productName: string }[] = [];
  let locations: { id: string; code: string; name: string }[] = [];
  try {
    variants = await db
      .select({ id: productVariants.id, sku: productVariants.sku, productName: products.name })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .orderBy(asc(products.name));
    locations = await db
      .select({ id: inventoryLocations.id, code: inventoryLocations.code, name: inventoryLocations.name })
      .from(inventoryLocations)
      .where(eq(inventoryLocations.isActive, true))
      .orderBy(asc(inventoryLocations.code));
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory/receiving">
    <div>
      <PageHeader title="Stock receiving" description="Every receipt writes a STOCK_RECEIVED movement with cost, supplier, and reference." />
      <ReceivingForm variants={variants} locations={locations} />
    </div>
    </PageGuard>
  );
}
