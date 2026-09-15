import { db } from "@/db";
import { membershipTiers, memberPrices, products, productVariants, customerMemberships } from "@/db/schema";
import { sql } from "drizzle-orm";
import { formatPHP, pesosToCentavos } from "@/lib/money";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/dialog";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const labelCls = "block text-xs text-gray-600";

function num(v: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default async function MembershipsPage() {
  async function create(formData: FormData) {
    "use server";
    const { createTier } = await import("@/actions/memberships");
    const benefits = String(formData.get("benefits") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await createTier({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      membershipFee: pesosToCentavos(num(formData.get("fee"))),
      validityDays: num(formData.get("validity")) > 0 ? Math.floor(num(formData.get("validity"))) : null,
      minSpend: pesosToCentavos(num(formData.get("minSpend"))),
      discountPct: Math.floor(num(formData.get("discount"))),
      benefits,
      priority: Math.floor(num(formData.get("priority"))),
      isActive: formData.get("isActive") === "on",
    });
  }

  async function update(formData: FormData) {
    "use server";
    const { updateTier } = await import("@/actions/memberships");
    const benefits = String(formData.get("benefits") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await updateTier(String(formData.get("id")), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      membershipFee: pesosToCentavos(num(formData.get("fee"))),
      validityDays: num(formData.get("validity")) > 0 ? Math.floor(num(formData.get("validity"))) : null,
      minSpend: pesosToCentavos(num(formData.get("minSpend"))),
      discountPct: Math.floor(num(formData.get("discount"))),
      benefits,
      priority: Math.floor(num(formData.get("priority"))),
      isActive: formData.get("isActive") === "on",
    });
  }

  async function addPrice(formData: FormData) {
    "use server";
    const { setMemberPrice } = await import("@/actions/memberships");
    const variantId = String(formData.get("variantId") ?? "");
    const productId = String(formData.get("productId") ?? "");
    await setMemberPrice({
      tierId: String(formData.get("tierId")),
      variantId: variantId || null,
      productId: variantId ? null : productId || null,
      price: pesosToCentavos(num(formData.get("price"))),
    });
  }

  async function dropPrice(formData: FormData) {
    "use server";
    const { removeMemberPrice } = await import("@/actions/memberships");
    await removeMemberPrice(String(formData.get("id")));
  }

  let tiers: typeof membershipTiers.$inferSelect[] = [];
  let prices: typeof memberPrices.$inferSelect[] = [];
  let counts: { tierId: string; n: number }[] = [];
  let prods: { id: string; name: string }[] = [];
  let variants: { id: string; sku: string; name: string | null }[] = [];
  try {
    tiers = await db.select().from(membershipTiers).orderBy(membershipTiers.priority);
    prices = await db.select().from(memberPrices);
    const rows = await db
      .select({ tierId: customerMemberships.tierId, n: sql<number>`COUNT(*)` })
      .from(customerMemberships)
      .groupBy(customerMemberships.tierId);
    counts = rows.map((r) => ({ tierId: r.tierId, n: Number(r.n) }));
    prods = await db.select({ id: products.id, name: products.name }).from(products).limit(200);
    variants = await db.select({ id: productVariants.id, sku: productVariants.sku, name: productVariants.name }).from(productVariants).limit(300);
  } catch {
    return <DbUnreachable />;
  }
  const countBy = new Map(counts.map((c) => [c.tierId, c.n]));
  const prodName = new Map(prods.map((p) => [p.id, p.name]));
  const varLabel = new Map(variants.map((v) => [v.id, `${v.sku}${v.name ? ` (${v.name})` : ""}`]));

  return (
    <PageGuard permission="tiers.manage" page="/admin/memberships">
    <div>
      <PageHeader title="Membership Tiers" description="Configurable tiers drive member pricing. Discounts apply before promos; explicit member prices win." />

      <Card className="mt-2">
        <h2 className="font-semibold">New tier</h2>
        <form action={create} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className={labelCls}>Name<Input name="name" required /></label>
          <label className={labelCls}>Fee (₱)<Input name="fee" type="number" min={0} step="0.01" defaultValue={0} /></label>
          <label className={labelCls}>Validity (days, blank = lifetime)<Input name="validity" type="number" min={0} /></label>
          <label className={labelCls}>Discount %<Input name="discount" type="number" min={0} max={100} defaultValue={0} /></label>
          <label className={labelCls}>Min spend (₱, auto track)<Input name="minSpend" type="number" min={0} step="0.01" defaultValue={0} /></label>
          <label className={labelCls}>Priority<Input name="priority" type="number" defaultValue={0} /></label>
          <label className={`${labelCls} col-span-2`}>Description<Input name="description" /></label>
          <label className={labelCls}>Benefits (one per line)<Textarea name="benefits" rows={2} /></label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked /> Active</label>
          <div><Button type="submit" variant="outline" size="sm">Create tier</Button></div>
        </form>
      </Card>

      <div className="mt-4 space-y-3">
        {tiers.map((t) => (
          <details key={t.id} className="rounded border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {t.name} — {t.discountPct}% off • {t.membershipFee > 0 ? `${formatPHP(t.membershipFee)} / ${t.validityDays ?? "∞"}d` : "Free"}
              {!t.isActive && <span className="ml-2"><StatusBadge status="inactive" /></span>}
              <span className="ml-2 text-xs font-normal text-gray-500">{countBy.get(t.id) ?? 0} auto-members • priority {t.priority}</span>
            </summary>
            {t.description && <p className="mt-1 text-gray-600">{t.description}</p>}
            {((t.benefits as string[] | null) ?? []).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-gray-600">
                {((t.benefits as string[]) ?? []).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            <form action={update} className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 sm:grid-cols-3">
              <input type="hidden" name="id" value={t.id} />
              <label className={labelCls}>Name<Input name="name" required defaultValue={t.name} /></label>
              <label className={labelCls}>Fee (₱)<Input name="fee" type="number" min={0} step="0.01" defaultValue={(t.membershipFee ?? 0) / 100} /></label>
              <label className={labelCls}>Validity (days)<Input name="validity" type="number" min={0} defaultValue={t.validityDays ?? ""} /></label>
              <label className={labelCls}>Discount %<Input name="discount" type="number" min={0} max={100} defaultValue={t.discountPct} /></label>
              <label className={labelCls}>Min spend (₱)<Input name="minSpend" type="number" min={0} step="0.01" defaultValue={(t.minSpend ?? 0) / 100} /></label>
              <label className={labelCls}>Priority<Input name="priority" type="number" defaultValue={t.priority} /></label>
              <label className={`${labelCls} col-span-2`}>Description<Input name="description" defaultValue={t.description ?? ""} /></label>
              <label className={labelCls}>Benefits<Textarea name="benefits" rows={2} defaultValue={((t.benefits as string[] | null) ?? []).join("\n")} /></label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={t.isActive} /> Active</label>
              <div><Button type="submit" variant="outline" size="sm">Save</Button></div>
            </form>
            <div className="mt-2 border-t pt-2">
              <div className="font-medium">Explicit member prices</div>
              <ul className="mt-1 space-y-1">
                {prices.filter((p) => p.tierId === t.id).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span>{p.variantId ? varLabel.get(p.variantId) ?? p.variantId.slice(0, 8) : prodName.get(p.productId!) ?? p.productId?.slice(0, 8)} — {formatPHP(p.price)}</span>
                    <form action={dropPrice} id={`drop-price-${p.id}`}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton
                        form={`drop-price-${p.id}`}
                        title="Remove this member price?"
                        description="The tier discount rule will apply instead. This cannot be undone."
                        confirmLabel="Remove price"
                      >
                        remove
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
                {prices.filter((p) => p.tierId === t.id).length === 0 && <li className="text-gray-500">No explicit prices — discount rule applies.</li>}
              </ul>
              <form action={addPrice} className="mt-1 flex flex-wrap items-end gap-2">
                <input type="hidden" name="tierId" value={t.id} />
                <label className={labelCls}>Variant (wins)
                  <Select name="variantId" defaultValue="">
                    <option value="">— none —</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{varLabel.get(v.id)}</option>)}
                  </Select>
                </label>
                <label className={labelCls}>…or product
                  <Select name="productId" defaultValue="">
                    <option value="">— none —</option>
                    {prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </label>
                <label className={labelCls}>Price (₱)<Input name="price" type="number" min={0} step="0.01" required className="w-28" /></label>
                <Button type="submit" variant="outline" size="sm">Set price</Button>
              </form>
            </div>
          </details>
        ))}
        {tiers.length === 0 && <p className="text-sm">No tiers. Run <code>npm run db:seed</code>.</p>}
      </div>
    </div>
    </PageGuard>
  );
}
