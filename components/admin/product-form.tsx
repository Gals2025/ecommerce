"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card } from "@/components/ui";
import { ImageUploader, SingleImageField } from "@/components/admin/image-uploader";
import type { ProductInput } from "@/validators";

export type ProductFormOption = { id: string; name: string };

type AttrRow = { name: string; values: string };
type VariantRow = {
  sku: string;
  name: string;
  barcode: string;
  price: string;
  compare: string;
  cost: string;
  imageUrl: string | null;
  status: "active" | "inactive" | "archived";
  trackInventory: boolean;
  optionValues: string;
};

function pesosToCentavos(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid price: ${s}`);
  return Math.round(n * 100);
}

export function ProductForm({
  initial,
  brands,
  categories,
  mode,
  submit,
}: {
  initial?: Partial<ProductInput>;
  brands: ProductFormOption[];
  categories: ProductFormOption[];
  mode: "create" | "edit";
  submit: (data: ProductInput) => Promise<string>;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [shortDescription, setShortDescription] = useState(initial?.shortDescription ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [brandId, setBrandId] = useState(initial?.brandId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [basePrice, setBasePrice] = useState(initial?.basePrice != null ? String(initial.basePrice / 100) : "");
  const [comparePrice, setComparePrice] = useState(initial?.comparePrice != null ? String(initial.comparePrice / 100) : "");
  const [costPrice, setCostPrice] = useState(initial?.costPrice != null ? String(initial.costPrice / 100) : "");
  const [trackInventory, setTrackInventory] = useState(initial?.trackInventory ?? true);
  const [lowStockThreshold, setLowStockThreshold] = useState(initial?.lowStockThreshold != null ? String(initial.lowStockThreshold) : "");
  const [weightG, setWeightG] = useState(initial?.weightG != null ? String(initial.weightG) : "");
  const [lengthMm, setLengthMm] = useState(initial?.lengthMm != null ? String(initial.lengthMm) : "");
  const [widthMm, setWidthMm] = useState(initial?.widthMm != null ? String(initial.widthMm) : "");
  const [heightMm, setHeightMm] = useState(initial?.heightMm != null ? String(initial.heightMm) : "");
  const [status, setStatus] = useState<ProductInput["status"]>(initial?.status ?? "draft");
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [attrs, setAttrs] = useState<AttrRow[]>(
    (initial?.attributes ?? []).map((a) => ({ name: a.name, values: a.values.join(", ") }))
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    (initial?.variants ?? []).map((v) => ({
      sku: v.sku,
      name: v.name ?? "",
      barcode: v.barcode ?? "",
      price: v.priceOverride != null ? String(v.priceOverride / 100) : "",
      compare: v.comparePrice != null ? String(v.comparePrice / 100) : "",
      cost: v.costPrice != null ? String(v.costPrice / 100) : "",
      imageUrl: v.imageUrl ?? null,
      status: v.status,
      trackInventory: v.trackInventory,
      optionValues: (v.optionValues ?? []).join(", "),
    }))
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setVariant(i: number, patch: Partial<VariantRow>) {
    setVariants((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (!name.trim()) throw new Error("Product name is required");
      const bp = pesosToCentavos(basePrice);
      if (bp == null) throw new Error("Base price is required");
      const num = (s: string) => (s.trim() === "" ? null : Number(s.trim()));
      const data: ProductInput = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        shortDescription: shortDescription.trim() || null,
        description: description.trim() || null,
        brandId: brandId || null,
        categoryId: categoryId || null,
        basePrice: bp,
        comparePrice: pesosToCentavos(comparePrice),
        costPrice: pesosToCentavos(costPrice),
        trackInventory,
        lowStockThreshold: lowStockThreshold.trim() === "" ? null : num(lowStockThreshold),
        weightG: weightG.trim() === "" ? null : num(weightG),
        lengthMm: lengthMm.trim() === "" ? null : num(lengthMm),
        widthMm: widthMm.trim() === "" ? null : num(widthMm),
        heightMm: heightMm.trim() === "" ? null : num(heightMm),
        status,
        featured,
        images,
        attributes: attrs
          .filter((a) => a.name.trim() !== "")
          .map((a) => ({
            name: a.name.trim(),
            values: a.values.split(",").map((s) => s.trim()).filter(Boolean),
          })),
        variants: variants
          .filter((v) => v.sku.trim() !== "")
          .map((v) => ({
            sku: v.sku.trim(),
            name: v.name.trim() || null,
            barcode: v.barcode.trim() || null,
            priceOverride: pesosToCentavos(v.price),
            comparePrice: pesosToCentavos(v.compare),
            costPrice: pesosToCentavos(v.cost),
            imageUrl: v.imageUrl,
            status: v.status,
            trackInventory: v.trackInventory,
            optionValues: v.optionValues.split(",").map((s) => s.trim()).filter(Boolean),
          })),
      };
      const id = await submit(data);
      router.push(`/admin/products/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  const field = "text-xs font-medium";
  const grid2 = "grid grid-cols-1 gap-3 sm:grid-cols-2";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <h2 className="mb-3 font-semibold">Basic info</h2>
        <div className={grid2}>
          <label className={field}>Name *<Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className={field}>Slug (auto if blank)<Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated" /></label>
          <label className={field}>SKU (required if no variants)<Input value={sku} onChange={(e) => setSku(e.target.value)} /></label>
          <label className={field}>Barcode<Input value={barcode} onChange={(e) => setBarcode(e.target.value)} /></label>
          <label className={field}>Brand
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
              <option value="">— None —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className={field}>Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={`${field} col-span-1 sm:col-span-2`}>Short description (max 500)
            <Input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} maxLength={500} />
          </label>
          <label className={`${field} col-span-1 sm:col-span-2`}>Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-md border px-3 py-2 text-sm font-normal" />
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Pricing & inventory (₱ pesos)</h2>
        <div className={grid2}>
          <label className={field}>Base price *<Input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} inputMode="decimal" placeholder="0.00" /></label>
          <label className={field}>Compare-at price<Input value={comparePrice} onChange={(e) => setComparePrice(e.target.value)} inputMode="decimal" placeholder="optional" /></label>
          <label className={field}>Cost price<Input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} inputMode="decimal" placeholder="optional" /></label>
          <label className={field}>Low-stock threshold<Input value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} inputMode="numeric" /></label>
          <label className={`${field} flex items-center gap-2 font-normal`}><input type="checkbox" checked={trackInventory} onChange={(e) => setTrackInventory(e.target.checked)} /> Track inventory</label>
          <label className={`${field} flex items-center gap-2 font-normal`}><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured product</label>
          <label className={field}>Status
            <select value={status} onChange={(e) => setStatus(e.target.value as ProductInput["status"])} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Shipping</h2>
        <div className={grid2}>
          <label className={field}>Weight (g)<Input value={weightG} onChange={(e) => setWeightG(e.target.value)} inputMode="numeric" /></label>
          <label className={field}>Length (mm)<Input value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} inputMode="numeric" /></label>
          <label className={field}>Width (mm)<Input value={widthMm} onChange={(e) => setWidthMm(e.target.value)} inputMode="numeric" /></label>
          <label className={field}>Height (mm)<Input value={heightMm} onChange={(e) => setHeightMm(e.target.value)} inputMode="numeric" /></label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Images</h2>
        <ImageUploader kind="products" images={images} onChange={setImages} />
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Attributes (Size, Color, Style, Weight…)</h2>
          <Button type="button" onClick={() => setAttrs((a) => [...a, { name: "", values: "" }])}>+ Add</Button>
        </div>
        {attrs.map((a, i) => (
          <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={a.name} onChange={(e) => setAttrs((rows) => rows.map((r, k) => k === i ? { ...r, name: e.target.value } : r))} placeholder="e.g. Size" />
            <Input value={a.values} onChange={(e) => setAttrs((rows) => rows.map((r, k) => k === i ? { ...r, values: e.target.value } : r))} placeholder="comma-separated: S, M, L" />
            <Button type="button" variant="utilityDanger" onClick={() => setAttrs((rows) => rows.filter((_, k) => k !== i))}>Remove</Button>
          </div>
        ))}
        {attrs.length === 0 && <p className="text-sm text-gray-500">No attributes. Add generic dimensions — not limited to Size/Color.</p>}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Variants</h2>
          <Button type="button" onClick={() => setVariants((v) => [...v, { sku: "", name: "", barcode: "", price: "", compare: "", cost: "", imageUrl: null, status: "active", trackInventory: true, optionValues: "" }])}>+ Add variant</Button>
        </div>
        {variants.map((v, i) => (
          <div key={i} className="mb-3 rounded border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className={field}>SKU *<Input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} /></label>
              <label className={field}>Display name<Input value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} placeholder="Red / M" /></label>
              <label className={field}>Barcode<Input value={v.barcode} onChange={(e) => setVariant(i, { barcode: e.target.value })} /></label>
              <label className={field}>Price override (₱)<Input value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} inputMode="decimal" placeholder="blank = base" /></label>
              <label className={field}>Compare (₱)<Input value={v.compare} onChange={(e) => setVariant(i, { compare: e.target.value })} inputMode="decimal" /></label>
              <label className={field}>Cost (₱)<Input value={v.cost} onChange={(e) => setVariant(i, { cost: e.target.value })} inputMode="decimal" /></label>
              <label className={field}>Attribute values (comma-separated)<Input value={v.optionValues} onChange={(e) => setVariant(i, { optionValues: e.target.value })} placeholder="Red, M" /></label>
              <label className={field}>Status
                <select value={v.status} onChange={(e) => setVariant(i, { status: e.target.value as VariantRow["status"] })} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className={`${field} flex items-center gap-2 font-normal`}><input type="checkbox" checked={v.trackInventory} onChange={(e) => setVariant(i, { trackInventory: e.target.checked })} /> Track inventory</label>
            </div>
            <div className="mt-2">
              <SingleImageField kind="variants" label="Variant image" value={v.imageUrl} onChange={(url) => setVariant(i, { imageUrl: url })} />
            </div>
            <Button type="button" variant="utilityDanger" className="mt-2" onClick={() => setVariants((rows) => rows.filter((_, k) => k !== i))}>Remove variant</Button>
          </div>
        ))}
        {variants.length === 0 && <p className="text-sm text-gray-500">No variants — product-level SKU is then required.</p>}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}</Button>
    </form>
  );
}
