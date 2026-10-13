import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  brands,
  categories,
  products,
  productImages,
  productAttributes,
  productAttributeValues,
  productVariants,
  variantAttributeValues,
} from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { ProductForm } from "@/components/admin/product-form";
import { updateProduct } from "@/actions/catalog";
import type { ProductInput } from "@/validators";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product: typeof products.$inferSelect | undefined;
  try {
    product = (await db.select().from(products).where(eq(products.id, id)).limit(1))[0];
  } catch {
    return <DbUnreachable />;
  }
  if (!product) notFound();

  const [images, attrs, variants, brandOpts, catOpts] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, id)),
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)),
    db.select().from(productVariants).where(eq(productVariants.productId, id)),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
  ]).catch(() => [null, null, null, null, null] as const);
  if (!images || !attrs || !variants || !brandOpts || !catOpts) {
    return <DbUnreachable />;
  }

  // Scoped follow-ups (unscoped full-table fetches grow with the whole
  // catalog and can time out on serverless — React #441).
  const editAttrIds = attrs.map((a) => a.id);
  const editVariantIds = variants.map((v) => v.id);
  const [attrValues, links] = await Promise.all([
    editAttrIds.length > 0
      ? db
          .select()
          .from(productAttributeValues)
          .where(inArray(productAttributeValues.attributeId, editAttrIds))
          .catch(() => [])
      : Promise.resolve([]),
    editVariantIds.length > 0
      ? db
          .select({ variantId: variantAttributeValues.variantId, value: productAttributeValues.value })
          .from(variantAttributeValues)
          .innerJoin(productAttributeValues, eq(variantAttributeValues.attributeValueId, productAttributeValues.id))
          .where(inArray(variantAttributeValues.variantId, editVariantIds))
          .catch(() => [])
      : Promise.resolve([] as { variantId: string; value: string }[]),
  ]);
  const valuesByVariant = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = valuesByVariant.get(l.variantId) ?? [];
    arr.push(l.value);
    valuesByVariant.set(l.variantId, arr);
  }

  const initial: Partial<ProductInput> = {
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    barcode: product.barcode,
    shortDescription: product.shortDescription,
    description: product.description,
    brandId: product.brandId,
    categoryId: product.categoryId,
    basePrice: product.basePrice,
    comparePrice: product.comparePrice,
    costPrice: product.costPrice,
    trackInventory: product.trackInventory,
    lowStockThreshold: product.lowStockThreshold,
    weightG: product.weightG,
    lengthMm: product.lengthMm,
    widthMm: product.widthMm,
    heightMm: product.heightMm,
    status: product.status as ProductInput["status"],
    featured: product.featured,
    images: [...images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    attributes: attrs.map((a) => ({
      name: a.name,
      values: attrValues.filter((v) => v.attributeId === a.id).map((v) => v.value),
    })),
    variants: variants
      .filter((v) => !v.deletedAt)
      .map((v) => ({
        sku: v.sku,
        name: v.name,
        barcode: v.barcode,
        priceOverride: v.priceOverride,
        comparePrice: v.comparePrice,
        costPrice: v.costPrice,
        imageUrl: v.imageUrl,
        status: v.status as "active" | "inactive" | "archived",
        trackInventory: v.trackInventory,
        optionValues: valuesByVariant.get(v.id) ?? [],
      })),
  };

  async function submit(data: ProductInput): Promise<string> {
    "use server";
    return updateProduct(id, data);
  }

  return (
    <PageGuard permission="catalog.manage" page="/admin/products/[id]/edit">
    <div>
      <PageHeader title={`Edit: ${product.name}`} description="Pricing changes are written to audit logs." />
      <ProductForm initial={initial} brands={brandOpts} categories={catOpts} mode="edit" submit={submit} />
    </div>
    </PageGuard>
  );
}
