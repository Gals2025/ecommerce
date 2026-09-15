import { db } from "@/db";
import { inventoryLocations } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { LocationManager } from "@/components/admin/location-manager";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  let rows: { id: string; code: string; name: string; type: string; address: string | null; isActive: boolean; deletedAt: Date | null }[] = [];
  try {
    rows = await db
      .select({
        id: inventoryLocations.id, code: inventoryLocations.code, name: inventoryLocations.name,
        type: inventoryLocations.type, address: inventoryLocations.address,
        isActive: inventoryLocations.isActive, deletedAt: inventoryLocations.deletedAt,
      })
      .from(inventoryLocations)
      .orderBy(asc(inventoryLocations.code));
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory/locations">
    <div>
      <PageHeader title="Locations" description="Warehouses and stores. Checkout only reserves from active locations." />
      <LocationManager rows={rows} />
    </div>
    </PageGuard>
  );
}
