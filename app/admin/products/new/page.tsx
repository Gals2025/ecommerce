import { db } from "@/db";
import { brands, categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { ProductForm } from "@/components/admin/product-form";
import { createProduct } from "@/actions/catalog";
import type { ProductInput } from "@/validators";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  let brandOpts: { id: string; name: string }[] = [];
  let catOpts: { id: string; name: string }[] = [];
  try {
    brandOpts = await db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name));
    catOpts = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name));
  } catch {
    return <DbUnreachable />;
  }

  async function submit(data: ProductInput): Promise<string> {
    "use server";
    return createProduct(data);
  }

  return (
    <PageGuard permission="catalog.manage" page="/admin/products/new">
    <div>
      <PageHeader title="New product" description="All mutations run server-side with Zod validation." />
      <ProductForm brands={brandOpts} categories={catOpts} mode="create" submit={submit} />
    </div>
    </PageGuard>
  );
}
