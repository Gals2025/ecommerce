import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  auditLogs,
  brands,
  categories,
  inventoryBalances,
  inventoryLocations,
  products,
  productAttributes,
  productAttributeValues,
  productImages,
  productVariants,
  variantAttributeValues,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { Card, Button } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/dialog";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";
import { archiveProduct, setProductStatus } from "@/actions/catalog";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product: typeof products.$inferSelect | undefined;
  try {
    product = (await db.select().from(products).where(eq(products.id, id)).limit(1))[0];
  } catch {
    return <DbUnreachable />;
  }
  if (!product) notFound();

  const [brand, category, images, attrs, attrValues, variants, logs] = await Promise.all([
    product.brandId
      ? db.select().from(brands).where(eq(brands.id, product.brandId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    product.categoryId
      ? db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db.select().from(productImages).where(eq(productImages.productId, id)).catch(() => []),
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)).catch(() => []),
    db.select().from(productAttributeValues).catch(() => []),
    db.select().from(productVariants).where(eq(productVariants.productId, id)).catch(() => []),
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "products"), eq(auditLogs.entityId, id))).orderBy(desc(auditLogs.createdAt)).limit(20).catch(() => []),
  ]);

  const balances = await db
    .select({ variantId: inventoryBalances.variantId, onHand: inventoryBalances.onHand, reserved: inventoryBalances.reserved, location: inventoryLocations.code })
    .from(inventoryBalances)
    .innerJoin(inventoryLocations, eq(inventoryBalances.locationId, inventoryLocations.id))
    .catch(() => []);
  const stockByVariant = new Map<string, { onHand: number; reserved: number; location: string }[]>();
  for (const b of balances ?? []) {
    const arr = stockByVariant.get(b.variantId) ?? [];
    arr.push({ onHand: b.onHand, reserved: b.reserved, location: b.location });
    stockByVariant.set(b.variantId, arr);
  }
  // Scoped to this product's variants (unscoped would leak other products'
  // option links and scale with the whole catalog).
  const variantIds = (variants ?? []).map((v) => v.id);
  const links = variantIds.length > 0
    ? await db
        .select({
          variantId: variantAttributeValues.variantId,
          attributeId: productAttributeValues.attributeId,
          value: productAttributeValues.value,
        })
        .from(variantAttributeValues)
        .innerJoin(productAttributeValues, eq(variantAttributeValues.attributeValueId, productAttributeValues.id))
        .where(inArray(variantAttributeValues.variantId, variantIds))
        .catch(() => [])
    : [];
  const attrNameById = new Map((attrs ?? []).map((a) => [a.id, a.name]));
  const optionsByVariant = new Map<string, { attr: string; value: string }[]>();
  const linkedAttrCountByVariant = new Map<string, number>();
  for (const l of links ?? []) {
    const arr = optionsByVariant.get(l.variantId) ?? [];
    arr.push({ attr: attrNameById.get(l.attributeId) ?? "?", value: l.value });
    optionsByVariant.set(l.variantId, arr);
  }
  for (const [vid, opts] of optionsByVariant) {
    linkedAttrCountByVariant.set(vid, new Set(opts.map((o) => o.attr)).size);
  }

  async function archive(formData: FormData) {
    "use server";
    const pid = String(formData.get("id"));
    const currentlyArchived = String(formData.get("archived")) === "true";
    if (currentlyArchived) {
      await setProductStatus(pid, "inactive");
    } else {
      await archiveProduct(pid, true);
    }
    redirect("/admin/products");
  }

  const dims = [product.lengthMm, product.widthMm, product.heightMm].every((v) => v == null)
    ? "—"
    : `${product.lengthMm ?? "?"} × ${product.widthMm ?? "?"} × ${product.heightMm ?? "?"} mm`;

  return (
    <PageGuard permission="catalog.manage" page="/admin/products/[id]">
    <div>
      <PageHeader
        title={product.name}
        description={`${product.slug} • ${product.status}${product.featured ? " • ★ Featured" : ""}`}
        actions={
          <Link href={`/admin/products/${id}/edit`}><Button>Edit</Button></Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">General</h2>
          <dl className="space-y-1 text-sm">
            <div><dt className="text-gray-500">SKU / Barcode</dt><dd>{product.sku ?? "—"} / {product.barcode ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Short description</dt><dd>{product.shortDescription ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Description</dt><dd>{product.description ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Category / Brand</dt><dd>{category?.name ?? "—"} / {brand?.name ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Track inventory / Threshold</dt><dd>{product.trackInventory ? "Yes" : "No"} / {product.lowStockThreshold ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Weight / Dimensions</dt><dd>{product.weightG != null ? `${product.weightG} g` : "—"} / {dims}</dd></div>
          </dl>
          <div className="mt-3">
            <h3 className="mb-1 text-sm font-semibold">Images ({images.length})</h3>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.alt ?? product.name} className="h-24 w-full rounded border object-cover" />
              ))}
            </div>
            {images.length === 0 && <EmptyState title="No images" description="No product images uploaded yet." />}
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Pricing</h2>
          <dl className="space-y-1 text-sm">
            <div><dt className="text-gray-500">Base price</dt><dd className="font-medium">{formatPHP(product.basePrice)}</dd></div>
            <div><dt className="text-gray-500">Compare-at</dt><dd>{product.comparePrice != null ? formatPHP(product.comparePrice) : "—"}</dd></div>
            <div><dt className="text-gray-500">Cost</dt><dd>{product.costPrice != null ? formatPHP(product.costPrice) : "—"}</dd></div>
          </dl>
          <h2 className="mb-2 mt-4 font-semibold">Attributes & variants</h2>
          {attrs.length === 0 && <EmptyState title="No attributes" description="No product attributes defined yet." />}
          {attrs.map((a) => (
            <div key={a.id} className="text-sm"><span className="font-medium">{a.name}:</span> {attrValues.filter((v) => v.attributeId === a.id).map((v) => v.value).join(", ")}</div>
          ))}
          <div className="mt-2 space-y-2">
            {variants.map((v) => (
              <div key={v.id} className="rounded border p-2 text-sm">
                <div className="font-medium">{v.name ?? v.sku} <span className="text-xs text-gray-500">({v.sku} • {v.status})</span></div>
                <div className="text-xs">Price: {v.priceOverride != null ? formatPHP(v.priceOverride) : `base ${formatPHP(product.basePrice)}`} • Cost: {v.costPrice != null ? formatPHP(v.costPrice) : "—"} • Track: {v.trackInventory ? "yes" : "no"}</div>
                <div className="text-xs text-gray-500">
                  Options: {(optionsByVariant.get(v.id) ?? []).map((o) => `${o.attr} = ${o.value}`).join(" · ") || "—"}
                </div>
                {(attrs ?? []).length > 0 && (linkedAttrCountByVariant.get(v.id) ?? 0) < (attrs ?? []).length && (
                  <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    Incomplete options — the storefront can&apos;t resolve this variant. Link one value per attribute in Edit.
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  Stock: {(stockByVariant.get(v.id) ?? []).map((s) => `${s.location}: ${s.onHand - s.reserved} avail (${s.onHand} on hand)`).join("; ") || "—"}
                </div>
              </div>
            ))}
            {variants.length === 0 && <EmptyState title="No variants" description="No product variants created yet." />}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Danger zone</h2>
        <form action={archive} id="product-archive">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="archived" value={String(product.status === "archived")} />
          {product.status === "archived" ? (
            <Button type="submit" variant="outline">Restore (→ inactive)</Button>
          ) : (
            <ConfirmButton
              form="product-archive"
              title="Archive this product?"
              description={`${product.name} will be hidden from the storefront. Variants and history are kept.`}
              confirmLabel="Archive product"
            >
              Archive product
            </ConfirmButton>
          )}
        </form>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Audit history (incl. pricing)</h2>
        <div className="space-y-1 text-sm">
          {logs.map((l) => (
            <div key={l.id} className="rounded border p-2">
              <span className="font-medium">{l.action}</span>{" "}
              <span className="text-xs text-gray-500">{formatManila(l.createdAt)}</span>
              {l.diff && <pre className="mt-1 overflow-x-auto text-xs text-gray-600">{l.diff}</pre>}
            </div>
          ))}
          {logs.length === 0 && <EmptyState title="No audit entries yet" description="Changes to this product will appear here." />}
        </div>
      </Card>
    </div>
    </PageGuard>
  );
}
