import { db } from "@/db";
import {
  promotions,
  promotionCodes,
  promotionProducts,
  promotionVariants,
  promotionCategories,
  promotionBrands,
  promotionMembershipTiers,
  promotionRules,
  products,
  productVariants,
  categories,
  brands,
  membershipTiers,
} from "@/db/schema";
import { formatPHP, pesosToCentavos } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Button, Input, Select } from "@/components/ui";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const labelCls = "block text-xs text-gray-600";

function ScopeMulti({ name, items, selected }: { name: string; items: { id: string; name: string }[]; selected: string[] }) {
  return (
    <label className={labelCls}>{name} (empty = all)
      <Select name={name} multiple size={Math.min(5, Math.max(2, items.length))} defaultValue={selected}>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </Select>
    </label>
  );
}

function num(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function multi(fd: FormData, key: string): string[] {
  return fd.getAll(key).map(String).filter(Boolean);
}

function dt(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(+d) ? null : d.toISOString();
}

export default async function AdminPromos() {
  async function create(formData: FormData) {
    "use server";
    const { createPromotion } = await import("@/actions/promotions");
    const kind = String(formData.get("kind"));
    await createPromotion({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      type: String(formData.get("type")),
      kind,
      value: kind === "percent" ? Math.floor(num(formData.get("value"))) : pesosToCentavos(num(formData.get("value"))),
      config: (() => {
        try {
          const raw = String(formData.get("config") ?? "").trim();
          return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        } catch {
          throw new Error("Config must be valid JSON");
        }
      })(),
      minSpend: pesosToCentavos(num(formData.get("minSpend"))),
      maxDiscount: String(formData.get("maxDiscount") ?? "").trim() === "" ? null : pesosToCentavos(num(formData.get("maxDiscount"))),
      startAt: dt(formData.get("startAt")),
      endAt: dt(formData.get("endAt")),
      stackable: formData.get("stackable") === "on",
      priority: Math.floor(num(formData.get("priority"))),
      isActive: formData.get("isActive") === "on",
      productIds: multi(formData, "productIds"),
      variantIds: multi(formData, "variantIds"),
      categoryIds: multi(formData, "categoryIds"),
      brandIds: multi(formData, "brandIds"),
      tierIds: multi(formData, "tierIds"),
      firstOrderOnly: formData.get("firstOrderOnly") === "on",
      minQty: String(formData.get("minQty") ?? "").trim() === "" ? null : Math.floor(num(formData.get("minQty"))),
    });
  }

  async function save(formData: FormData) {
    "use server";
    const { updatePromotion } = await import("@/actions/promotions");
    const kind = String(formData.get("kind"));
    await updatePromotion(String(formData.get("id")), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      type: String(formData.get("type")),
      kind,
      value: kind === "percent" ? Math.floor(num(formData.get("value"))) : pesosToCentavos(num(formData.get("value"))),
      config: (() => {
        try {
          const raw = String(formData.get("config") ?? "").trim();
          return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        } catch {
          throw new Error("Config must be valid JSON");
        }
      })(),
      minSpend: pesosToCentavos(num(formData.get("minSpend"))),
      maxDiscount: String(formData.get("maxDiscount") ?? "").trim() === "" ? null : pesosToCentavos(num(formData.get("maxDiscount"))),
      startAt: dt(formData.get("startAt")),
      endAt: dt(formData.get("endAt")),
      stackable: formData.get("stackable") === "on",
      priority: Math.floor(num(formData.get("priority"))),
      isActive: formData.get("isActive") === "on",
      productIds: multi(formData, "productIds"),
      variantIds: multi(formData, "variantIds"),
      categoryIds: multi(formData, "categoryIds"),
      brandIds: multi(formData, "brandIds"),
      tierIds: multi(formData, "tierIds"),
      firstOrderOnly: formData.get("firstOrderOnly") === "on",
      minQty: String(formData.get("minQty") ?? "").trim() === "" ? null : Math.floor(num(formData.get("minQty"))),
    });
  }

  async function toggle(formData: FormData) {
    "use server";
    const { togglePromotion } = await import("@/actions/promotions");
    await togglePromotion(String(formData.get("id")), formData.get("to") === "on");
  }

  async function addCode(formData: FormData) {
    "use server";
    const { createPromoCode } = await import("@/actions/promotions");
    await createPromoCode({
      promotionId: String(formData.get("promotionId")),
      code: String(formData.get("code") ?? ""),
      usageLimit: String(formData.get("usageLimit") ?? "").trim() === "" ? null : Math.floor(num(formData.get("usageLimit"))),
      perCustomerLimit: Math.max(1, Math.floor(num(formData.get("perCustomerLimit"), 1))),
    });
  }

  async function toggleCode(formData: FormData) {
    "use server";
    const { togglePromoCode } = await import("@/actions/promotions");
    await togglePromoCode(String(formData.get("id")), formData.get("to") === "on");
  }

  let promos: typeof promotions.$inferSelect[] = [];
  let codes: typeof promotionCodes.$inferSelect[] = [];
  const scopeMaps: Record<string, { products: string[]; variants: string[]; categories: string[]; brands: string[]; tiers: string[]; rules: Record<string, string> }> = {};
  let prods: { id: string; name: string }[] = [];
  let variants: { id: string; sku: string }[] = [];
  let cats: { id: string; name: string }[] = [];
  let brs: { id: string; name: string }[] = [];
  let tiers: { id: string; name: string }[] = [];
  try {
    promos = await db.select().from(promotions).orderBy(promotions.priority);
    codes = await db.select().from(promotionCodes).limit(200);
    const [pp, pv, pc, pb, pt, pr] = await Promise.all([
      db.select().from(promotionProducts),
      db.select().from(promotionVariants),
      db.select().from(promotionCategories),
      db.select().from(promotionBrands),
      db.select().from(promotionMembershipTiers),
      db.select().from(promotionRules),
    ]);
    for (const p of promos) {
      scopeMaps[p.id] = {
        products: pp.filter((r) => r.promotionId === p.id).map((r) => r.productId),
        variants: pv.filter((r) => r.promotionId === p.id).map((r) => r.variantId),
        categories: pc.filter((r) => r.promotionId === p.id).map((r) => r.categoryId),
        brands: pb.filter((r) => r.promotionId === p.id).map((r) => r.brandId),
        tiers: pt.filter((r) => r.promotionId === p.id).map((r) => r.tierId),
        rules: Object.fromEntries(pr.filter((r) => r.promotionId === p.id).map((r) => [r.key, JSON.stringify(r.value)])),
      };
    }
    prods = (await db.select({ id: products.id, name: products.name }).from(products).limit(200));
    variants = (await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants).limit(300));
    cats = (await db.select({ id: categories.id, name: categories.name }).from(categories).limit(100));
    brs = (await db.select({ id: brands.id, name: brands.name }).from(brands).limit(100));
    tiers = (await db.select({ id: membershipTiers.id, name: membershipTiers.name }).from(membershipTiers));
  } catch {
    return <DbUnreachable />;
  }

  const valueLabel = (p: typeof promotions.$inferSelect) =>
    p.kind === "percent" ? `${p.value}%`
    : p.kind === "free_shipping" ? (p.value === 0 ? "waive all" : `cover up to ${formatPHP(p.value)}`)
    : formatPHP(p.value);

  return (
    <PageGuard permission="promotions.manage" page="/admin/promotions">
    <div>
      <PageHeader title="Promotions" description="Central discount engine: line promos → member → auto cart → code → shipping waiver. Scopes restrict; empty scope = everything." />

      <details className="mt-2 rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">New promotion</summary>
        <form action={create} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className={labelCls}>Name<Input name="name" required /></label>
          <label className={labelCls}>Type
            <Select name="type"><option value="auto">Automatic</option><option value="code">Promo code</option></Select>
          </label>
          <label className={labelCls}>Kind
            <Select name="kind">
              <option value="percent">Percent %</option><option value="fixed">Fixed ₱</option>
              <option value="bogo">Buy X Get Y</option><option value="bundle">Bundle price</option>
              <option value="free_shipping">Free shipping</option>
            </Select>
          </label>
          <label className={labelCls}>Value (% or ₱)<Input name="value" type="number" min={0} step="0.01" defaultValue={0} /></label>
          <label className={labelCls}>Min spend (₱)<Input name="minSpend" type="number" min={0} step="0.01" defaultValue={0} /></label>
          <label className={labelCls}>Max discount (₱, blank = none)<Input name="maxDiscount" type="number" min={0} step="0.01" /></label>
          <label className={labelCls}>Start<Input name="startAt" type="datetime-local" /></label>
          <label className={labelCls}>End<Input name="endAt" type="datetime-local" /></label>
          <label className={labelCls}>Priority<Input name="priority" type="number" defaultValue={0} /></label>
          <label className={`${labelCls} col-span-2`}>Description<Input name="description" /></label>
          <label className={`${labelCls} col-span-2`}>BOGO/bundle config JSON (buyVariantId?, buyProductId?, buyQty, getQty?, getPct? / bundleVariantIds[])
            <Input name="config" placeholder='{"buyQty":2,"getQty":1}' />
          </label>
          <ScopeMulti name="productIds" items={prods} selected={[]} />
          <ScopeMulti name="variantIds" items={variants.map((v) => ({ id: v.id, name: v.sku }))} selected={[]} />
          <ScopeMulti name="categoryIds" items={cats} selected={[]} />
          <ScopeMulti name="brandIds" items={brs} selected={[]} />
          <ScopeMulti name="tierIds" items={tiers} selected={[]} />
          <label className={labelCls}>Min matched qty (blank = none)<Input name="minQty" type="number" min={1} /></label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="firstOrderOnly" /> First orders only</label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="stackable" /> Stackable</label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked /> Active</label>
          <div><Button type="submit" variant="outline" size="sm">Create</Button></div>
        </form>
      </details>

      <div className="mt-4 space-y-3">
        {promos.map((p) => {
          const sc = scopeMaps[p.id];
          const promoCodes = codes.filter((c) => c.promotionId === p.id);
          return (
            <details key={p.id} className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer">
                <span className="font-medium">{p.name}</span> • {p.type}/{p.kind} • {valueLabel(p)}
                {!p.isActive && <span className="ml-2"><StatusBadge status="inactive" /></span>}
                <span className="ml-2 text-xs text-gray-500">pri {p.priority}{p.stackable ? " • stackable" : " • exclusive"}</span>
              </summary>
              {p.description && <p className="mt-1 text-gray-600">{p.description}</p>}
              <div className="mt-1 text-xs text-gray-500">
                Scopes: {[...sc.products.length ? [`${sc.products.length} products`] : [], ...sc.variants.length ? [`${sc.variants.length} variants`] : [], ...sc.categories.length ? [`${sc.categories.length} cats`] : [], ...sc.brands.length ? [`${sc.brands.length} brands`] : [], ...sc.tiers.length ? [`${sc.tiers.length} tiers`] : []].join(", ") || "everything"}
                {Object.keys(sc.rules).length > 0 && <> • Rules: {Object.entries(sc.rules).map(([k, v]) => `${k}=${v}`).join(", ")}</>}
                {(p.startAt || p.endAt) && <> • {p.startAt ? formatManila(p.startAt) : "…"} → {p.endAt ? formatManila(p.endAt) : "…"}</>}
              </div>
              <form action={save} className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 sm:grid-cols-3">
                <input type="hidden" name="id" value={p.id} />
                <label className={labelCls}>Name<Input name="name" required defaultValue={p.name} /></label>
                <label className={labelCls}>Type
                  <Select name="type" defaultValue={p.type}><option value="auto">Automatic</option><option value="code">Promo code</option></Select>
                </label>
                <label className={labelCls}>Kind
                  <Select name="kind" defaultValue={p.kind}>
                    <option value="percent">Percent %</option><option value="fixed">Fixed ₱</option>
                    <option value="bogo">Buy X Get Y</option><option value="bundle">Bundle price</option>
                    <option value="free_shipping">Free shipping</option>
                  </Select>
                </label>
                <label className={labelCls}>Value ({p.kind === "percent" ? "%" : "₱"})
                  <Input name="value" type="number" min={0} step="0.01" defaultValue={p.kind === "percent" ? p.value : (p.value ?? 0) / 100} />
                </label>
                <label className={labelCls}>Min spend (₱)<Input name="minSpend" type="number" min={0} step="0.01" defaultValue={(p.minSpend ?? 0) / 100} /></label>
                <label className={labelCls}>Max discount (₱)<Input name="maxDiscount" type="number" min={0} step="0.01" defaultValue={p.maxDiscount != null ? p.maxDiscount / 100 : ""} /></label>
                <label className={labelCls}>Priority<Input name="priority" type="number" defaultValue={p.priority} /></label>
                <label className={`${labelCls} col-span-2`}>Description<Input name="description" defaultValue={p.description ?? ""} /></label>
                <label className={`${labelCls} col-span-2`}>Config JSON<Input name="config" defaultValue={p.config ? JSON.stringify(p.config) : ""} /></label>
                <ScopeMulti name="productIds" items={prods} selected={sc.products} />
                <ScopeMulti name="variantIds" items={variants.map((v) => ({ id: v.id, name: v.sku }))} selected={sc.variants} />
                <ScopeMulti name="categoryIds" items={cats} selected={sc.categories} />
                <ScopeMulti name="brandIds" items={brs} selected={sc.brands} />
                <ScopeMulti name="tierIds" items={tiers} selected={sc.tiers} />
                <label className={labelCls}>Min matched qty<Input name="minQty" type="number" min={1} defaultValue={sc.rules.min_qty ? JSON.parse(sc.rules.min_qty) : ""} /></label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="firstOrderOnly" defaultChecked={sc.rules.first_order_only === "true"} /> First orders only</label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="stackable" defaultChecked={p.stackable} /> Stackable</label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={p.isActive} /> Active</label>
                <div className="flex gap-2"><Button type="submit" variant="outline" size="sm">Save</Button></div>
              </form>
              <div className="mt-2 border-t pt-2">
                <div className="font-medium">Codes</div>
                <ul className="mt-1 space-y-1 text-xs">
                  {promoCodes.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-medium">{c.code}</span>
                      <span className="text-gray-500">used {c.usedCount}{c.usageLimit != null ? `/${c.usageLimit}` : ""} • per-customer {c.perCustomerLimit}</span>
                      {!c.isActive && <StatusBadge status="inactive" />}
                      <form action={toggleCode}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="to" value={c.isActive ? "off" : "on"} />
                        <Button type="submit" variant="link">({c.isActive ? "disable" : "enable"})</Button>
                      </form>
                    </li>
                  ))}
                  {promoCodes.length === 0 && <li className="text-gray-500">{p.type === "code" ? "No codes yet — add one below." : "Auto promotion (no code needed)."}</li>}
                </ul>
                <form action={addCode} className="mt-1 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="promotionId" value={p.id} />
                  <label className={labelCls}>Code<Input name="code" required className="w-32" /></label>
                  <label className={labelCls}>Usage limit<Input name="usageLimit" type="number" min={1} className="w-24" /></label>
                  <label className={labelCls}>Per customer<Input name="perCustomerLimit" type="number" min={1} defaultValue={1} className="w-24" /></label>
                  <Button type="submit" variant="outline" size="sm">Add code</Button>
                </form>
              </div>
              <form action={toggle} className="mt-2 border-t pt-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="to" value={p.isActive ? "off" : "on"} />
                <Button type="submit" variant="outline" size="sm">{p.isActive ? "Deactivate" : "Activate"}</Button>
              </form>
            </details>
          );
        })}
        {promos.length === 0 && (
          <EmptyState title="No promotions" description="Create your first promotion above to start discounting." />
        )}
      </div>
    </div>
    </PageGuard>
  );
}
