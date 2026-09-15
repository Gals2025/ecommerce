import { notFound } from "next/navigation";
import { db } from "@/db";
import { customers, membershipTiers, memberships, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { tierForSpend } from "@/lib/membership";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Button, Card, Input, Select } from "@/components/ui";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const labelCls = "block text-xs text-gray-600";

export default async function AdminCustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  async function assign(formData: FormData) {
    "use server";
    const { assignMembership } = await import("@/actions/memberships");
    await assignMembership({
      customerId: id,
      tierId: String(formData.get("tierId")),
      paymentRef: String(formData.get("paymentRef") ?? "") || null,
      activate: formData.get("activate") === "on",
    });
  }

  async function change(formData: FormData) {
    "use server";
    const { changeTier } = await import("@/actions/memberships");
    await changeTier({
      membershipId: String(formData.get("membershipId")),
      newTierId: String(formData.get("newTierId")),
      paymentRef: String(formData.get("paymentRef") ?? "") || null,
    });
  }

  async function renew(formData: FormData) {
    "use server";
    const { renewMembership } = await import("@/actions/memberships");
    await renewMembership({
      membershipId: String(formData.get("membershipId")),
      paymentRef: String(formData.get("paymentRef") ?? "") || null,
    });
  }

  async function setStatus(formData: FormData) {
    "use server";
    const { setMembershipStatus } = await import("@/actions/memberships");
    await setMembershipStatus({
      membershipId: String(formData.get("membershipId")),
      to: String(formData.get("to")),
      note: String(formData.get("note") ?? "") || undefined,
    });
  }

  let customer: typeof customers.$inferSelect | null = null;
  try {
    const [c] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!c) notFound();
    customer = c;
  } catch (e) {
    if ((e as Error).message.includes("NEXT")) throw e;
    return <DbUnreachable />;
  }
  if (!customer) notFound();
  const tiers = await db.select().from(membershipTiers).orderBy(membershipTiers.priority).catch(() => []);
  const paid = await db.select().from(memberships).where(eq(memberships.customerId, id)).catch(() => []);
  const [user] = await db.select().from(users).where(eq(users.id, customer.userId)).limit(1).catch(() => []);
  const autoTier = await tierForSpend(customer.lifetimeSpend ?? 0).catch(() => null);
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const hasActive = paid.some((m) => m.status === "active");

  return (
    <PageGuard permission="memberships.manage" page="/admin/customers/[id]">
    <div>
      <PageHeader title={user?.name ?? "Customer"} description={user?.email ?? customer.userId} />
      <div className="text-sm">
        Mobile: {customer.mobile ?? "—"} • Lifetime spend: {formatPHP(customer.lifetimeSpend ?? 0)} • Auto-tier: {autoTier?.name ?? "—"}
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">Paid memberships</h2>
        <div className="mt-2 space-y-3">
          {paid.map((m) => {
            const t = tierById.get(m.tierId);
            return (
              <div key={m.id} className="rounded border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{m.membershipNo}</span>
                  <span>{t?.name ?? m.tierId.slice(0, 8)}</span>
                  <StatusBadge status={m.status} />
                  <span className="text-xs text-gray-500">
                    {formatManila(m.startedAt)} → {m.expiresAt ? formatManila(m.expiresAt) : "lifetime"}
                  </span>
                </div>
                {m.paymentRef && <div className="text-xs text-gray-500">Fee ref: {m.paymentRef}</div>}
                <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
                  <form action={change} className="flex items-end gap-1">
                    <input type="hidden" name="membershipId" value={m.id} />
                    <label className={labelCls}>Change tier
                      <Select name="newTierId">
                        {tiers.filter((x) => x.isActive && x.id !== m.tierId).map((x) => (
                          <option key={x.id} value={x.id}>{x.name} ({x.discountPct}%)</option>
                        ))}
                      </Select>
                    </label>
                    <Input name="paymentRef" placeholder="Fee ref" className="w-28" />
                    <Button type="submit" variant="outline" size="sm" disabled={!["active", "pending"].includes(m.status)}>Apply</Button>
                  </form>
                  <form action={renew} className="flex items-end gap-1">
                    <input type="hidden" name="membershipId" value={m.id} />
                    <Input name="paymentRef" placeholder="Fee ref" className="w-28" />
                    <Button type="submit" variant="outline" size="sm" disabled={!["active", "expired"].includes(m.status)}>Renew</Button>
                  </form>
                  <form action={setStatus} className="flex items-end gap-1">
                    <input type="hidden" name="membershipId" value={m.id} />
                    <Select name="to" className="w-auto">
                      {["active", "suspended", "cancelled", "expired"].filter((s) => s !== m.status).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                    <Button type="submit" variant={m.status === "cancelled" ? "outline" : "danger"} size="sm" disabled={m.status === "cancelled" || m.status === "expired"}>Set</Button>
                  </form>
                </div>
              </div>
            );
          })}
          {paid.length === 0 && <p className="text-sm text-gray-500">No paid memberships.</p>}
        </div>
        {!hasActive && tiers.length > 0 && (
          <form action={assign} className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
            <label className={labelCls}>Assign tier
              <Select name="tierId">
                {tiers.filter((x) => x.isActive).map((x) => (
                  <option key={x.id} value={x.id}>{x.name} ({x.discountPct}%{x.membershipFee ? `, ${formatPHP(x.membershipFee)}` : ", free"})</option>
                ))}
              </Select>
            </label>
            <label className={labelCls}>Fee payment ref
              <Input name="paymentRef" placeholder="GCash/bank/cash ref" />
            </label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="activate" defaultChecked /> Activate now</label>
            <Button type="submit" variant="outline" size="sm">Assign</Button>
          </form>
        )}
      </Card>
    </div>
    </PageGuard>
  );
}
