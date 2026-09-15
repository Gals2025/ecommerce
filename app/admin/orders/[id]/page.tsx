import { notFound } from "next/navigation";
import { getStaffOrderDetail } from "@/actions/order-ops";
import { ORDER_TRANSITIONS, FULFILLMENT_TRANSITIONS } from "@/lib/orders";
import type { OrderStatus, OrderFulfillmentStatus } from "@/types";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Button, Card, Input, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/dialog";
import type { PaymentDecision } from "@/validators";

export const dynamic = "force-dynamic";

function DecisionButtons({ canAct }: { canAct: boolean }) {
  const decisions: { value: PaymentDecision; label: string }[] = [
    { value: "approve", label: "Verify & capture" },
    { value: "mark_paid", label: "Mark paid" },
    { value: "mark_partial", label: "Mark partial" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {decisions.map((d) => (
        <Button
          key={d.value}
          type="submit"
          name="decision"
          value={d.value}
          disabled={!canAct}
          variant="outline"
          size="sm"
        >
          {d.label}
        </Button>
      ))}
      {canAct && (
        <ConfirmButton
          form="payment-decide"
          title="Reject payment?"
          description="The payment will be marked rejected and the customer asked to submit valid proof. Reservations stay in place."
          confirmLabel="Reject payment"
          name="decision"
          value="reject"
        >
          Reject
        </ConfirmButton>
      )}
    </div>
  );
}

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  async function decide(formData: FormData) {
    "use server";
    const { decidePayment } = await import("@/actions/order-ops");
    await decidePayment(id, String(formData.get("decision")) as PaymentDecision, String(formData.get("note") ?? "") || undefined);
  }

  async function advance(formData: FormData) {
    "use server";
    const { setFulfillmentStatus } = await import("@/actions/order-ops");
    await setFulfillmentStatus({ orderId: id, to: String(formData.get("to")), note: String(formData.get("note") ?? "") || undefined });
  }

  async function cancel(formData: FormData) {
    "use server";
    const { cancelOrderFull } = await import("@/actions/order-ops");
    await cancelOrderFull({ orderId: id, note: String(formData.get("note") ?? "") || undefined });
  }

  async function addNote(formData: FormData) {
    "use server";
    const { addOrderNote } = await import("@/actions/order-ops");
    await addOrderNote({ orderId: id, body: String(formData.get("body") ?? "") });
  }

  async function complete(formData: FormData) {
    "use server";
    const { completeRefund } = await import("@/actions/admin");
    await completeRefund(String(formData.get("refundId")));
  }

  async function issue(formData: FormData) {
    "use server";
    const { issueStandaloneRefund } = await import("@/actions/admin");
    const { pesosToCentavos } = await import("@/lib/money");
    await issueStandaloneRefund({
      orderId: id,
      amount: pesosToCentavos(Number(formData.get("amount") ?? 0)),
      method: String(formData.get("method") ?? "cash"),
      reason: String(formData.get("reason") ?? ""),
    });
  }

  let d: Awaited<ReturnType<typeof getStaffOrderDetail>>;
  try {
    d = await getStaffOrderDetail(id);
  } catch {
    notFound();
  }
  const { order, items, payment, shipment, shippingMethod, history, notes, appliedPromos, refunds: orderRefunds, emails: emailHistory, customer } = d;
  const payActionable = payment != null && ["pending", "submitted"].includes(payment.status);
  const cancellable = (ORDER_TRANSITIONS[order.status as OrderStatus] ?? []).includes("cancelled");
  const nextFulfillment = (FULFILLMENT_TRANSITIONS[order.fulfillmentStatus as OrderFulfillmentStatus] ?? []);

  const timeline = [
    ...history.map((h) => ({ at: h.createdAt, kind: "status" as const, from: h.fromStatus, to: h.toStatus, actor: h.actorId, note: h.note })),
    ...notes.map((n) => ({ at: n.createdAt, kind: "note" as const, from: null as string | null, to: "internal-note", actor: n.authorId, note: n.body })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return (
    <PageGuard permission="orders.verify_payment" page="/admin/orders/[id]">
    <div>
      <PageHeader title={order.orderNo} description={`Placed ${formatManila(order.createdAt)} • ${order.fulfillment}`} />
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={order.status} />
        <StatusBadge status={order.paymentStatus} />
        <StatusBadge status={order.fulfillmentStatus} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Customer</h2>
          {customer ? (
            <div className="mt-1 text-sm">
              <div>{customer.name ?? "—"} • {customer.email ?? "—"}</div>
              <div className="text-gray-600">Mobile: {customer.mobile ?? "—"} • Tier: {customer.tier ?? "—"}</div>
              <div className="text-gray-600">Lifetime spend: {formatPHP(customer.lifetimeSpend)}</div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Guest order (no customer profile).</p>
          )}
          {shipment?.address != null && (
            <div className="mt-2 text-sm">
              <div className="font-medium">Delivery snapshot</div>
              <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(shipment.address, null, 2)}</pre>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Totals</h2>
          <div className="mt-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatPHP(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>Member discount</span><span>−{formatPHP(order.discountMember)}</span></div>
            <div className="flex justify-between"><span>Promo discount{payment && order.promoCode ? ` (${order.promoCode})` : ""}</span><span>−{formatPHP(order.discountPromo)}</span></div>
            <div className="flex justify-between"><span>Delivery fee ({shippingMethod?.name ?? order.fulfillment})</span><span>{formatPHP(order.deliveryFee)}</span></div>
            <div className="mt-1 flex justify-between font-semibold"><span>Grand total</span><span>{formatPHP(order.grandTotal)}</span></div>
          </div>
          {order.shippingWaiver != null && (
            <p className="mt-1 text-xs text-green-700">Shipping waiver: staff fee capped at {formatPHP(order.shippingWaiver)}</p>
          )}
          {appliedPromos.length > 0 && (
            <div className="mt-2 border-t pt-2 text-xs">
              <div className="font-medium">Applied promotions</div>
              <ul className="mt-1 space-y-0.5">
                {appliedPromos.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>{a.name ?? a.promotionId.slice(0, 8)} <span className="text-gray-500">({a.scope}{a.code ? ` • ${a.code}` : ""})</span></span>
                    <span>{a.discount > 0 ? `−${formatPHP(a.discount)}` : "waiver"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {order.notes && <p className="mt-2 text-xs text-gray-600">Customer notes: {order.notes}</p>}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">Items ({items.length})</h2>
        <div className="mt-2 space-y-1 text-sm">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
              <span>{i.productName} <span className="text-gray-500">• {i.variantName ?? i.sku} × {i.quantity}</span></span>
              <span>{formatPHP(i.originalUnitPrice)} → <b>{formatPHP(i.lineTotal)}</b> {i.discountAmount > 0 && <span className="text-green-700">( −{formatPHP(i.discountAmount)} )</span>}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Payment verification</h2>
        {payment ? (
          <div className="mt-1 text-sm">
            <div>Method: <b>{payment.method}</b> • Amount: <b>{formatPHP(payment.amount)}</b> • <StatusBadge status={payment.status} /></div>
            {payment.referenceNo && <div>Reference: <span className="font-mono">{payment.referenceNo}</span></div>}
            {payment.proofUrl && <div>Proof: <a href={payment.proofUrl} target="_blank" rel="noopener noreferrer" className="underline">open receipt</a></div>}
            <form action={decide} id="payment-decide" className="mt-2 space-y-2">
              <Input name="note" placeholder="Verification note (optional)" maxLength={500} />
              <DecisionButtons canAct={payActionable} />
              {!payActionable && <p className="text-xs text-gray-500">Payment is {payment.status} — terminal, no further action.</p>}
            </form>
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-500">No payment record.</p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Fulfillment controls</h2>
        {nextFulfillment.length > 0 ? (
          <form action={advance} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-sm">Move to
              <Select name="to" className="ml-1 w-auto">
                {nextFulfillment.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </label>
            <Input name="note" placeholder="Note (optional)" className="min-w-40 flex-1" maxLength={500} />
            <Button type="submit" variant="outline" size="sm">Apply</Button>
          </form>
        ) : (
          <p className="mt-1 text-sm text-gray-500">Fulfillment is {order.fulfillmentStatus} — terminal.</p>
        )}
        {cancellable && (
          <form action={cancel} id="order-cancel" className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
            <Input name="note" placeholder="Cancellation reason" className="min-w-40 flex-1" maxLength={500} />
            <ConfirmButton
              form="order-cancel"
              title="Cancel this order?"
              description="Reservations release (or captured stock restocks), promo slots free up, and the customer is emailed. This cannot be undone."
              confirmLabel="Cancel order"
            >
              Cancel order (releases / restocks inventory)
            </ConfirmButton>
          </form>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Refunds (order total preserved: {formatPHP(order.grandTotal)})</h2>
        <div className="mt-2 space-y-1 text-sm">
          {orderRefunds.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 border-b py-1 last:border-0">
              <span className="font-medium">{formatPHP(f.amount)}</span>
              <span className="text-gray-500">{f.method} • {f.status}{f.returnId ? "" : " • goodwill"}</span>
              {f.reason && <span className="text-gray-600">— {f.reason}</span>}
              {f.status === "pending" && (
                <form action={complete} id={`refund-complete-${f.id}`} className="ml-auto">
                  <input type="hidden" name="refundId" value={f.id} />
                  <ConfirmButton
                    form={`refund-complete-${f.id}`}
                    title={`Mark ${formatPHP(f.amount)} refund completed?`}
                    description="This finalizes the payout and may flip the order to refunded."
                    confirmLabel="Mark completed"
                  >
                    Mark completed
                  </ConfirmButton>
                </form>
              )}
            </div>
          ))}
          {orderRefunds.length === 0 && <p className="text-gray-500">No refunds.</p>}
        </div>
        <form action={issue} id="refund-issue" className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          <label className="text-sm">Amount ₱
            <Input name="amount" type="number" min={0.01} step="0.01" required className="ml-1 w-28" />
          </label>
          <label className="text-sm">Method
            <Select name="method" className="ml-1 w-auto">
              <option value="cash">Cash</option>
              <option value="cod">COD</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="gcash_manual">GCash manual</option>
              <option value="pay_at_store">Pay at store</option>
            </Select>
          </label>
          <Input name="reason" required placeholder="Goodwill reason" className="min-w-40 flex-1" maxLength={1000} />
          <ConfirmButton
            form="refund-issue"
            title="Issue goodwill refund?"
            description="A pending refund row is created against this order's refundable balance."
            confirmLabel="Issue refund"
          >
            Issue goodwill refund
          </ConfirmButton>
        </form>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Emails ({emailHistory.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {emailHistory.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2 border-b py-1 last:border-0">
              <span className="text-gray-500">{formatManila(e.createdAt)}</span>
              <span className="font-mono text-xs">{e.template}</span>
              <span className="text-gray-600">→ {e.toEmail}</span>
              <StatusBadge status={e.status} />
              {e.resendId && <span className="font-mono text-xs text-gray-500">{e.resendId}</span>}
              {e.error && <span className="text-xs text-red-600">{e.error}</span>}
            </li>
          ))}
          {emailHistory.length === 0 && <li className="text-gray-500">No emails logged for this order yet.</li>}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">Status timeline</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {timeline.map((t, i) => (
            <li key={i} className="flex flex-wrap gap-x-2 border-b py-1 last:border-0">
              <span className="text-gray-500">{formatManila(t.at)}</span>
              {t.kind === "status" ? (
                <span><span className="font-mono text-xs">{t.from ?? "∅"}</span> → <span className="font-mono text-xs">{t.to}</span></span>
              ) : (
                <span className="rounded bg-gray-100 px-1 text-xs">internal note</span>
              )}
              {t.note && <span className="text-gray-700">— {t.note}</span>}
              {t.actor && <span className="ml-auto text-xs text-gray-400">{t.actor.slice(0, 8)}</span>}
            </li>
          ))}
          {timeline.length === 0 && <li className="text-gray-500">No history yet.</li>}
        </ol>
        <form action={addNote} className="mt-2 flex gap-2">
          <Input name="body" required placeholder="Add internal note (staff only)" maxLength={2000} />
          <Button type="submit" variant="outline" size="sm">Add</Button>
        </form>
      </Card>
    </div>
    </PageGuard>
  );
}
