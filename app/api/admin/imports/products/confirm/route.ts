import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  brands,
  categories,
  inventoryLocations,
  products,
  productVariants,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import { createProduct, updateProductKeepVariants } from "@/actions/catalog";
import { receiveStock } from "@/lib/inventory";
import { slugify, type ProductInput } from "@/validators";
import {
  fetchRefMaps,
  groupRows,
  groupStock,
  parseImportFile,
  validateGroup,
  type ImportMode,
} from "@/features/imports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function uniqueSlug(
  table: typeof brands | typeof categories,
  base: string
): Promise<string> {
  const slug = slugify(base) || `item-${Date.now().toString(36)}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const rows = await db
      .select({ id: table.id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(table as any)
      .where(eq(table.slug, candidate))
      .limit(1);
    if (rows.length === 0) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function ensureBrand(name: string, actorId: string, map: Map<string, string>) {
  const hit = map.get(name.toLowerCase());
  if (hit) return hit;
  const slug = await uniqueSlug(brands, name);
  const [row] = await db.insert(brands).values({ name, slug }).returning();
  const { audit } = await import("@/lib/audit");
  await audit(actorId, "brand.create", "brands", row.id, { name, via: "import" }).catch(() => {});
  map.set(name.toLowerCase(), row.id);
  return row.id;
}

async function ensureCategory(name: string, actorId: string, map: Map<string, string>) {
  const hit = map.get(name.toLowerCase());
  if (hit) return hit;
  const slug = await uniqueSlug(categories, name);
  const [row] = await db.insert(categories).values({ name, slug }).returning();
  const { audit } = await import("@/lib/audit");
  await audit(actorId, "category.create", "categories", row.id, { name, via: "import" }).catch(() => {});
  map.set(name.toLowerCase(), row.id);
  return row.id;
}

export async function POST(req: Request) {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const allowed = await hasPermission(session.user.id, "catalog.manage").catch(() => false);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = session.user.id;

  const form = await req.formData().catch(() => null);
  const modeRaw = form?.get("mode");
  const mode: ImportMode = modeRaw === "update" ? "update" : "new";
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  let rawRows;
  try {
    rawRows = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parse failed" }, { status: 400 });
  }

  const refs = await fetchRefMaps();
  const groups = groupRows(rawRows);
  const results: { product: string; rows: number[]; ok: boolean; id?: string; errors: string[] }[] = [];

  for (const group of groups) {
    const v = validateGroup(group, refs, mode);
    if (v.errors.length > 0 || !v.input) {
      results.push({ product: v.product, rows: v.rowIndexes, ok: false, errors: v.errors });
      continue;
    }
    try {
      // Resolve or auto-create brand/category.
      for (const name of new Set(v.pendingBrands)) {
        const id = await ensureBrand(name, actorId, refs.brandIdByName);
        if (!v.input.brandId) v.input.brandId = id;
      }
      for (const name of new Set(v.pendingCategories)) {
        const id = await ensureCategory(name, actorId, refs.categoryIdByName);
        if (!v.input.categoryId) v.input.categoryId = id;
      }

      if (mode === "new") {
        const variantSkus = v.input.variants.map((x) => x.sku);
        const checks: string[] = [...variantSkus];
        if (v.input.sku) checks.push(v.input.sku);
        const [pClash, vClash] = await Promise.all([
          v.input.sku
            ? db.select({ id: products.id }).from(products).where(eq(products.sku, v.input.sku)).limit(1)
            : Promise.resolve([]),
          checks.length > 0
            ? db.select({ sku: productVariants.sku }).from(productVariants).where(inArray(productVariants.sku, checks)).limit(10)
            : Promise.resolve([]),
        ]);
        if (pClash.length > 0 || vClash.length > 0) {
          const taken = [...pClash.map(() => v.input!.sku!), ...vClash.map((r) => r.sku)];
          results.push({ product: v.product, rows: v.rowIndexes, ok: false, errors: [`• sku: Already exists: ${[...new Set(taken)].join(", ")} — use Update mode`] });
          continue;
        }
        const id = await createProduct(v.input);
        // Opening stock receipt at the default location.
        const stock = groupStock(group);
        const receipt = [...stock.entries()].filter(([, qty]) => qty > 0);
        if (receipt.length > 0) {
          const [loc] = await db.select().from(inventoryLocations).limit(1);
          if (loc) {
            const vrows = await db
              .select({ id: productVariants.id, sku: productVariants.sku, costPrice: productVariants.costPrice })
              .from(productVariants)
              .where(inArray(productVariants.sku, receipt.map(([sku]) => sku)));
            const bySku = new Map(vrows.map((r) => [r.sku, r]));
            await db.transaction(async (tx) => {
              for (const [sku, qty] of receipt) {
                const vr = bySku.get(sku);
                if (!vr) continue;
                await receiveStock(tx, vr.id, loc.id, qty, {
                  movementType: "STOCK_RECEIVED",
                  unitCost: vr.costPrice ?? null,
                  reference: "import",
                  refType: "receiving",
                  note: "Opening stock via import",
                  createdBy: actorId,
                });
              }
            });
          }
        }
        results.push({ product: v.product, rows: v.rowIndexes, ok: true, id, errors: [] });
      } else {
        // Update mode: locate the product by product SKU or any variant SKU.
        const lookup: string[] = [...v.input.variants.map((x) => x.sku)];
        if (v.input.sku) lookup.push(v.input.sku);
        const [pHit, vHits] = await Promise.all([
          v.input.sku
            ? db.select({ id: products.id }).from(products).where(eq(products.sku, v.input.sku)).limit(1)
            : Promise.resolve([]),
          lookup.length > 0
            ? db.select({ productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.sku, lookup))
            : Promise.resolve([]),
        ]);
        const ids = new Set<string>([...pHit.map((r) => r.id), ...vHits.map((r) => r.productId)]);
        if (ids.size === 0) {
          results.push({ product: v.product, rows: v.rowIndexes, ok: false, errors: ["• sku: No existing product matches — use New entry mode"] });
          continue;
        }
        if (ids.size > 1) {
          results.push({ product: v.product, rows: v.rowIndexes, ok: false, errors: ["• sku: Rows match multiple products — split into one product per import group"] });
          continue;
        }
        const targetId = [...ids][0];
        const [existing] = await db.select().from(products).where(eq(products.id, targetId)).limit(1);
        const existingVariants = await db.select().from(productVariants).where(eq(productVariants.productId, targetId));
        const bySku = new Map(existingVariants.map((x) => [x.sku, x]));

        // Merge: import cells win when non-empty, otherwise keep existing.
        const mergedVariants: ProductInput["variants"] = v.input.variants.map((iv) => {
          const ev = bySku.get(iv.sku);
          if (!ev) return iv;
          const raw = group.rows.find((r) => (r.variantSku || r.productSku) === iv.sku) ?? {};
          const priceCell = (raw.variantPrice ?? "").trim() !== "" ? iv.priceOverride ?? null : (ev.priceOverride ?? null);
          const costCell = (raw.cost ?? "").trim() !== "" ? iv.costPrice ?? null : (ev.costPrice ?? null);
          return {
            sku: iv.sku,
            name: raw.variantName ? iv.name : ev.name,
            barcode: raw.barcode ? (iv.barcode ?? null) : ev.barcode,
            priceOverride: priceCell,
            comparePrice: ev.comparePrice ?? null,
            costPrice: costCell,
            imageUrl: ev.imageUrl ?? null,
            status: ev.status as "active" | "inactive" | "archived",
            trackInventory: ev.trackInventory ?? true,
            optionValues: [],
          };
        });
        const firstRaw = group.rows[0];
        const merged: ProductInput = {
          ...v.input,
          name: v.input.name,
          slug: firstRaw.slug ? v.input.slug : existing.slug,
          sku: firstRaw.productSku ? (v.input.sku ?? null) : existing.sku,
          barcode: firstRaw.barcode ? (v.input.barcode ?? null) : existing.barcode,
          brandId: firstRaw.brand ? v.input.brandId : existing.brandId,
          categoryId: firstRaw.category ? v.input.categoryId : existing.categoryId,
          comparePrice: existing.comparePrice ?? null,
          costPrice: existing.costPrice ?? null,
          lowStockThreshold: existing.lowStockThreshold ?? null,
          weightG: existing.weightG ?? null,
          lengthMm: existing.lengthMm ?? null,
          widthMm: existing.widthMm ?? null,
          heightMm: existing.heightMm ?? null,
          variants: mergedVariants,
        };
        // Base price: keep existing when the cell was empty.
        if (firstRaw.basePrice.trim() === "") merged.basePrice = existing.basePrice;
        if (firstRaw.status.trim() === "") merged.status = existing.status as ProductInput["status"];
        if (firstRaw.featured.trim() === "") merged.featured = existing.featured ?? false;

        const id = await updateProductKeepVariants(targetId, merged);
        results.push({ product: existing.name, rows: v.rowIndexes, ok: true, id, errors: [] });
      }
    } catch (e) {
      results.push({
        product: v.product,
        rows: v.rowIndexes,
        ok: false,
        errors: [`• ${e instanceof Error ? e.message.split("\n")[0] : "Import failed"}`],
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const { audit } = await import("@/lib/audit");
  await audit(actorId, "import.products", "export", "products-import", {
    mode,
    ok: okCount,
    failed: results.length - okCount,
  }).catch(() => {});
  revalidatePath("/admin/products");
  return NextResponse.json({
    mode,
    summary: { products: results.length, imported: okCount, failed: results.length - okCount },
    results,
  });
}
