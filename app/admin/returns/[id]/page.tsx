import { notFound } from "next/navigation";
import { db } from "@/db";
import { returns, returnItems, orderItems, orders, refunds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatPHP, pesosToCentavos } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Card, Input, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/dialog";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AdminReturnDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  async function decide(formData: FormData) {
    "use server";
    const { approveReturn } = await import("@/actions/admin");
    const { db: dbInner } = await import("@/db");
    const { returnItems: riTable } = await import("@/db/schema");
    const { eq: eqInner } = await import("drizzle-orm");
    const approve = String(formData.get("decision")) === "approve";
    const items = await dbInner.select({ id: riTable.id }).from(riTable).where(eqInner(riTable.returnId, id));
    const lines = items.map((ri) => ({
      returnItemId: ri.id,
      disposition: (String(formData.get(`disp_${ri.id}`)) === "damaged" ? "damaged" : "restock") as "restock" | "damaged",
    }));
    const amountRaw = String(formData.get("refundAmount") ?? "").trim();
    await approveReturn({
      returnId: id,
      approve,
      lines: approve ? lines : [],
      refundAmount: approve && amountRaw !== "" ? pesosToCentavos(Number(amountRaw)) : null,
      method: (String(formData.get("method") ?? "") || undefined) as "cash" | "cod" | "bank_transfer" | "gcash_manual" | "pay_at_store" | undefined,
    });
  }

  let ret: typeof returns.$inferSelect | null = null;
  const lines: { ri: typeof returnItems.$inferSelect; productName: string; sku: string; unitPrice: number }[] = [];
  let order: typeof orders.$inferSelect | null = null;
  let orderRefunds: typeof refunds.$inferSelect[] = [];
  try {
    const [r] = await db.select().from(returns).where(eq(returns.id, id)).limit(1);
    if (!r) notFound();
    ret = r;
    const ris = await db.select().from(returnItems).where(eq(returnItems.returnId, id));
    for (const ri of ris) {
      const [oi] = await db.select().from(orderItems).where(eq(orderItems.id, ri.orderItemId)).limit(1);
      lines.push({ ri, productName: oi?.productName ?? "?", sku: oi?.sku ?? "?", unitPrice: oi?.effectiveUnitPrice ?? 0 });
    }
    const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId)).limit(1);
    order = o ?? null;
    orderRefunds = await db.select().from(refunds).where(eq(refunds.orderId, r.orderId));
  } catch (e) {
    if ((e as Error).message.includes("NEXT")) throw e;
    return <DbUnreachable />;
  }
  if (!ret) notFound();
  const isOpen = ret.status === "requested";
  const defaultRefund = lines.reduce((s, l) => s + l.unitPrice * l.ri.qty, 0);

  return (
    <PageGuard permission="orders.manage_returns" page="/admin/returns/[id]">
    <div>
      <PageHeader title={`Return ${order?.orderNo ?? ret.orderId.slice(0, 8)}`} description={`Requested ${formatManila(ret.createdAt)}`} />
      <div className="flex flex-wrap gap-2"><StatusBadge status={ret.status} /></div>
      <p className="mt-2 text-sm">Reason: {ret.reason}</p>
      {order && (
        <p className="mt-1 text-xs text-gray-500">
          Order total {formatPHP(order.grandTotal)} (preserved) • Payment {order.paymentStatus} • Fulfillment {order.fulfillmentStatus}
        </p>
      )}

      <form action={decide} id="return-decide" className="mt-4 rounded-lg border p-4">
        <h2 className="font-semibold">Lines & disposition</h2>
        <div className="mt-2 space-y-2 text-sm">
          {lines.map((l) => (
            <div key={l.ri.id} className="flex flex-wrap items-center gap-3 border-b py-1 last:border-0">
              <span className="min-w-40">{l.productName} <span className="text-gray-500">• {l.sku} × {l.ri.qty}</span></span>
              <span>{formatPHP(l.unitPrice)} each</span>
              {isOpen ? (
                <span className="ml-auto flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`disp_${l.ri.id}`} value="restock" defaultChecked /> Restock
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`disp_${l.ri.id}`} value="damaged" /> Damaged (no restock)
                  </label>
                </span>
              ) : (
                <span className="ml-auto"><StatusBadge status={l.ri.disposition} /></span>
              )}
            </div>
          ))}
        </div>
        {isOpen ? (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div className="text-sm text-gray-600">Default refund {formatPHP(defaultRefund)} (effective-price sum, adjustable down).</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="block text-xs text-gray-600">Refund ₱ (blank = default)
                <Input name="refundAmount" type="number" min={0} step="0.01" placeholder={String(defaultRefund / 100)} />
              </label>
              <label className="block text-xs text-gray-600">Method (blank = original)
                <Select name="method" defaultValue="">
                  <option value="">Original payment method</option>
                  <option value="cash">Cash</option>
                  <option value="cod">COD</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="gcash_manual">GCash manual</option>
                  <option value="pay_at_store">Pay at store</option>
                </Select>
              </label>
            </div>
            <div className="flex gap-2">
              <ConfirmButton
                form="return-decide"
                title="Approve this return?"
                description="Chosen lines restock (damaged lines are written off with no restock) and the refund is raised. This cannot be undone."
                confirmLabel="Approve return"
                name="decision"
                value="approve"
              >
                Approve (restock/damage + refund)
              </ConfirmButton>
              <ConfirmButton
                form="return-decide"
                title="Reject this return?"
                description="The request closes with no stock movement and no refund."
                confirmLabel="Reject return"
                name="decision"
                value="reject"
              >
                Reject
              </ConfirmButton>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Decision recorded — dispositions above are final.</p>
        )}
      </form>

      <Card className="mt-4">
        <h2 className="font-semibold">Refunds on this order</h2>
        <div className="mt-2 space-y-1 text-sm">
          {orderRefunds.map((f) => (
            <div key={f.id} className="flex flex-wrap gap-2 border-b py-1 last:border-0">
              <span className="font-medium">{formatPHP(f.amount)}</span>
              <span className="text-gray-500">{f.method} • {f.status}{f.returnId ? "" : " • goodwill"}</span>
              {f.reason && <span className="text-gray-600">— {f.reason}</span>}
            </div>
          ))}
          {orderRefunds.length === 0 && <p className="text-gray-500">No refunds yet.</p>}
        </div>
      </Card>
    </div>
    </PageGuard>
  );
}
