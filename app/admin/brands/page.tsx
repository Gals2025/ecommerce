import { db } from "@/db";
import { brands } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { BrandManager } from "@/components/admin/brand-manager";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  let rows: { id: string; name: string; slug: string; logoUrl: string | null; isActive: boolean; deletedAt: Date | null }[] = [];
  try {
    rows = await db
      .select({
        id: brands.id, name: brands.name, slug: brands.slug,
        logoUrl: brands.logoUrl, isActive: brands.isActive, deletedAt: brands.deletedAt,
      })
      .from(brands)
      .orderBy(asc(brands.name));
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="catalog.manage" page="/admin/brands">
    <div>
      <PageHeader title="Brands" description="Names, slugs, logos, archive." />
      <BrandManager rows={rows} />
    </div>
    </PageGuard>
  );
}
