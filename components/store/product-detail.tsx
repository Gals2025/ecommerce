"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/actions/catalog";
import { formatPHP } from "@/lib/money";
import { StockBadge } from "./product-card";
import { Button, Input } from "@/components/ui";
import type { StoreProductDetail } from "@/features/catalog/storefront";

export function ProductDetailClient({
  product,
  memberPct,
}: {
  product: StoreProductDetail;
  memberPct: number | null;
}) {
  const router = useRouter();
  const [imageIdx, setImageIdx] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasVariants = product.variants.length > 0;

  const resolved = useMemo(() => {
    if (!hasVariants) return null;
    // Simple product (auto-created default variant, no attributes): resolve it.
    if (product.attributes.length === 0 && product.variants.length === 1) return product.variants[0];
    const picks = Object.values(picked).filter(Boolean);
    if (picks.length === 0) return null;
    // Exact match wins; otherwise first variant containing all picks.
    return (
      product.variants.find(
        (v) => v.optionValues.length === picks.length && picks.every((p) => v.optionValues.includes(p))
      ) ??
      product.variants.find((v) => picks.every((p) => v.optionValues.includes(p))) ??
      null
    );
  }, [picked, product.variants, product.attributes, hasVariants]);

  const activeVariant = resolved ?? (hasVariants ? null : null);
  const sellPrice = activeVariant?.price ?? product.basePrice;
  const comparePrice = activeVariant?.comparePrice ?? product.comparePrice;
  const available = hasVariants ? (activeVariant ? activeVariant.available : product.variants.reduce((s, v) => s + v.available, 0)) : 0;
  const memberPrice = memberPct ? Math.round(sellPrice * (1 - memberPct / 100)) : null;
  const gallery = product.images.length > 0
    ? product.images
    : activeVariant?.imageUrl
      ? [{ url: activeVariant.imageUrl, alt: product.name }]
      : [];
  const shownImage = activeVariant?.imageUrl ?? gallery[imageIdx]?.url ?? null;

  const canAdd = !hasVariants ? false : !!activeVariant && activeVariant.available > 0;
  const needsPick = hasVariants && !activeVariant;

  async function onAdd() {
    if (!activeVariant) return;
    setError(null);
    setPending(true);
    try {
      const safeQty = Math.max(1, Math.min(activeVariant.available, Math.floor(qty) || 1));
      await addToCart(activeVariant.id, safeQty);
      router.push("/cart");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add to cart");
    } finally {
      setPending(false);
    }
  }

  function toggle(attr: string, value: string) {
    setPicked((p) => ({ ...p, [attr]: p[attr] === value ? "" : value }));
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <div className="aspect-square w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-100 shadow-soft">
          {shownImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownImage} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">No image</div>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="mt-2 grid grid-cols-5 gap-2">
            {gallery.map((img, i) => (
              <button
                key={img.url}
                onClick={() => setImageIdx(i)}
                className={`aspect-square overflow-hidden rounded-xl border border-stone-200 ${i === imageIdx ? "ring-2 ring-emerald-700" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? product.name} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        {product.brandName && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{product.brandName}</div>}
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">{product.name}</h1>
        {product.shortDescription && <p className="mt-1 text-sm text-stone-500">{product.shortDescription}</p>}
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-2xl font-semibold text-stone-900">{formatPHP(sellPrice)}</span>
          {comparePrice != null && comparePrice > sellPrice && (
            <span className="text-sm text-stone-400 line-through">{formatPHP(comparePrice)}</span>
          )}
        </div>
        {memberPrice != null && (
          <div className="mt-1 text-sm font-medium text-emerald-700">Member price {formatPHP(memberPrice)} ({memberPct}% off applied at checkout)</div>
        )}
        <div className="mt-2"><StockBadge available={available} /></div>

        {product.attributes.length > 0 && (
          <div className="mt-4 space-y-3">
            {product.attributes.map((attr) => (
              <div key={attr.name}>
                <div className="mb-1 text-sm font-medium">{attr.name}</div>
                <div className="flex flex-wrap gap-2">
                  {attr.values.map((val) => {
                    const selected = picked[attr.name] === val;
                    return (
                      <button
                        key={val}
                        onClick={() => toggle(attr.name, val)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${selected ? "border-emerald-700 bg-emerald-700 font-medium text-white" : "border-stone-300 text-stone-700 hover:border-stone-400 hover:bg-stone-50"}`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasVariants && activeVariant && (
          <p className="mt-3 text-sm text-stone-500">
            Selected: <span className="font-medium text-stone-900">{activeVariant.name ?? activeVariant.sku}</span> • {formatPHP(activeVariant.price ?? product.basePrice)} • {activeVariant.available} available
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm">Qty
            <Input
              type="number"
              min={1}
              max={Math.max(1, available)}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="ml-2 w-20"
            />
          </label>
          <Button
            onClick={onAdd}
            disabled={pending || !canAdd}
            variant="primary"
            size="lg"
            className="flex-1"
          >
            {pending ? "Adding…" : needsPick ? "Select options" : available <= 0 ? "Out of stock" : "Add to cart"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}

        {product.description && (
          <div className="mt-6">
            <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">Description</h2>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-600">{product.description}</p>
          </div>
        )}
        <div className="mt-4">
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">Specifications</h2>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {product.sku && <><dt className="text-stone-400">SKU</dt><dd className="text-stone-700">{product.sku}</dd></>}
            {product.weightG != null && <><dt className="text-stone-400">Weight</dt><dd className="text-stone-700">{product.weightG} g</dd></>}
            {(product.lengthMm != null || product.widthMm != null || product.heightMm != null) && (
              <><dt className="text-stone-400">Dimensions</dt><dd className="text-stone-700">{product.lengthMm ?? "?"} × {product.widthMm ?? "?"} × {product.heightMm ?? "?"} mm</dd></>
            )}
            {product.categoryName && <><dt className="text-stone-400">Category</dt><dd className="text-stone-700">{product.categoryName}</dd></>}
          </dl>
        </div>
      </div>
    </div>
  );
}
