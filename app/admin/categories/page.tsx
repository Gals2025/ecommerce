import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { CategoryManager } from "@/components/admin/category-manager";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  let rows: {
    id: string; name: string; slug: string; description: string | null;
    parentId: string | null; imageUrl: string | null; sortOrder: number;
    isActive: boolean; deletedAt: Date | null;
  }[] = [];
  try {
    rows = await db
      .select({
        id: categories.id, name: categories.name, slug: categories.slug,
        description: categories.description, parentId: categories.parentId,
        imageUrl: categories.imageUrl, sortOrder: categories.sortOrder,
        isActive: categories.isActive, deletedAt: categories.deletedAt,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  } catch {
    return <DbUnreachable />;
  }
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  const parents = rows.filter((r) => !r.parentId && !r.deletedAt).map((r) => ({ id: r.id, name: r.name }));
  return (
    <PageGuard permission="catalog.manage" page="/admin/categories">
    <div>
      <PageHeader title="Categories" description="Parent/child (one level), slugs, images, display order, archive." />
      <CategoryManager
        rows={rows.map((r) => ({ ...r, parentName: r.parentId ? (nameById.get(r.parentId) ?? "?") : null }))}
        parents={parents}
      />
    </div>
    </PageGuard>
  );
}
