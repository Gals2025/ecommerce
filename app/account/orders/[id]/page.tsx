import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/rbac";
import { db } from "@/db";
import { orders, orderItems, orderStatusHistory, payments, returns, returnItems, refunds } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { getCategoriesTree } from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function friendly(status: string) {
  return status.replaceAll("_", " ");
}

export default async function AccountOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession().catch(() => null);
  if (!session?.user) redirect(`/login?redirect=/account/orders/${id}`);

  async function submit(formData: FormData) {
    "use server";
    const { submitProof } = await import("@/actions/order-ops");
    await submitProof({
      orderId: id,
      referenceNo: String(formData.get("referenceNo") ?? ""),
      proofUrl: String(formData.get("proofUrl") ?? "") || undefined,
    });
  }

  async function request(formData: FormData) {
    "use server";
    const { requestReturn } = await import("@/actions/admin");
    const { db: dbInner } = await import("@/db");
    const { orderItems: oiTable } = await import("@/db/schema");
    const { eq: eqInner } = await import("drizzle-orm");
    const ois = await dbInner.select({ id: oiTable.id }).from(oiTable).where(eqInner(oiTable.orderId, id));
    const lines = ois
      .map((oi) => ({ orderItemId: oi.id, qty: Math.floor(Number(formData.get(`qty_${oi.id}`) ?? 0)) }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) throw new Error("Choose at least one item to return");
    await requestReturn({ orderId: id, reason: String(formData.get("reason") ?? ""), lines });
  }

  let order: typeof orders.$inferSelect | null = null;
  let items: (typeof orderItems.$inferSelect)[] = [];
  let pay: typeof payments.$inferSelect | null = null;
  let history: (typeof orderStatusHistory.$inferSelect)[] = [];
  const myReturns: (typeof returns.$inferSelect & { lines: { qty: number; productName: string }[] })[] = [];
  let myRefunds: (typeof refunds.$inferSelect)[] = [];
  try {
    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.customerId, session.user.id)))
      .limit(1);
    if (!o) notFound();
    order = o;
    items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const [p] = await db.select().from(payments).where(eq(payments.orderId, id)).limit(1);
    pay = p ?? null;
    history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(desc(orderStatusHistory.createdAt))
      .limit(50);
    const rets = await db.select().from(returns).where(eq(returns.orderId, id)).orderBy(desc(returns.createdAt));
    for (const r of rets) {
      const ris = await db.select().from(returnItems).where(eq(returnItems.returnId, r.id));
      const withNames = [];
      for (const ri of ris) {
        const [oi] = await db.select().from(orderItems).where(eq(orderItems.id, ri.orderItemId)).limit(1);
        withNames.push({ qty: ri.qty, productName: oi?.productName ?? "?" });
      }
      myReturns.push({ ...r, lines: withNames });
    }
    myRefunds = await db.select().from(refunds).where(eq(refunds.orderId, id)).orderBy(desc(refunds.createdAt));
  } catch (e) {
    if ((e as Error).message.includes("NEXT_HTTP")) throw e;
    return <DbUnreachable />;
  }
  const cats = await getCategoriesTree().catch(() => []);
  if (!order) notFound();

  const canSubmitProof =
    pay != null &&
    ["bank_transfer", "gcash_manual"].includes(pay.method) &&
    ["pending", "rejected"].includes(pay.status) &&
    !["completed", "cancelled", "refunded"].includes(order.status);
  const publicHistory = history.filter((h) => !h.toStatus.startsWith("payment:") && !h.toStatus.startsWith("fulfillment:"));
  // Server component: evaluated once per request, so request-time clock read is stable.
  // eslint-disable-next-line react-hooks/purity
  const orderAgeDays = (Date.now() - new Date(order.createdAt).getTime()) / 86400000;
  const returnEligible =
    (order.fulfillmentStatus === "delivered" || order.status === "completed") &&
    orderAgeDays <= 30 &&
    !["cancelled", "refunded"].includes(order.status) &&
    !myReturns.some((r) => r.status === "requested");

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/account" className="text-sm underline">← Back to account</Link>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">{order.orderNo}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {friendly(order.status)} • Payment: {friendly(order.paymentStatus)} • Fulfillment: {friendly(order.fulfillmentStatus)}
        </p>
        <p className="text-xs text-gray-500">Placed {formatManila(order.createdAt)}</p>

        <section className="mt-4 rounded-xl border p-4">
          <h2 className="font-semibold">Items</h2>
          <div className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between gap-2">
                <span>{i.productName} <span className="text-gray-500">× {i.quantity}</span></span>
                <span className="font-medium">{formatPHP(i.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t pt-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatPHP(order.subtotal)}</span></div>
            {(order.discountMember + order.discountPromo) > 0 && (
              <div className="flex justify-between text-green-700"><span>Discounts</span><span>−{formatPHP(order.discountMember + order.discountPromo)}</span></div>
            )}
            <div className="flex justify-between"><span>Delivery</span><span>{order.deliveryFee > 0 ? formatPHP(order.deliveryFee) : "To be confirmed"}</span></div>
            <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span>{formatPHP(order.grandTotal)}</span></div>
          </div>
        </section>

        {pay && (
          <section className="mt-4 rounded-xl border p-4">
            <h2 className="font-semibold">Payment</h2>
            <div className="mt-1 text-sm">
              <div>Method: {friendly(pay.method)} • Status: {friendly(pay.status)}</div>
              {pay.referenceNo && <div>Reference: <span className="font-mono">{pay.referenceNo}</span></div>}
            </div>
            {canSubmitProof ? (
              <form action={submit} className="mt-3 space-y-2">
                <p className="text-sm text-gray-600">Submit your payment reference for verification.</p>
                <label className="block text-sm">Reference number
                  <Input name="referenceNo" required minLength={3} maxLength={64} placeholder="e.g. GCash ref no" className="mt-1" />
                </label>
                <label className="block text-sm">Receipt URL (optional)
                  <Input name="proofUrl" type="url" placeholder="Paste receipt link" className="mt-1" />
                </label>
                <SubmitButton pendingLabel="Submitting…">Submit for verification</SubmitButton>
              </form>
            ) : (
              pay.status === "submitted" && <p className="mt-2 text-sm text-amber-700">Proof submitted — awaiting staff verification.</p>
            )}
          </section>
        )}

        <section className="mt-4 rounded-xl border p-4">
          <h2 className="font-semibold">Returns & refunds</h2>
          {myReturns.length === 0 && myRefunds.length === 0 && !returnEligible && (
            <p className="mt-1 text-sm text-gray-500">No returns or refunds on this order.</p>
          )}
          <div className="mt-2 space-y-2 text-sm">
            {myReturns.map((r) => (
              <div key={r.id} className="rounded-lg bg-gray-50 p-2">
                <div>Return {friendly(r.status)} • {formatManila(r.createdAt)}</div>
                <div className="text-gray-600">{r.reason}</div>
                <ul className="list-disc pl-5 text-gray-600">
                  {r.lines.map((l, i) => <li key={i}>{l.productName} × {l.qty}</li>)}
                </ul>
              </div>
            ))}
            {myRefunds.map((f) => (
              <div key={f.id} className="flex flex-wrap gap-2">
                <span className="font-medium">{formatPHP(f.amount)}</span>
                <span className="text-gray-500">{friendly(f.method)} • {friendly(f.status)}{f.returnId ? "" : " • goodwill"}</span>
              </div>
            ))}
          </div>
          {returnEligible && (
            <form action={request} className="mt-3 space-y-2 border-t pt-3">
              <p className="text-sm text-gray-600">Request a return (within 30 days of delivery).</p>
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{i.productName} <span className="text-gray-500">× {i.quantity}</span></span>
                  <label className="text-xs text-gray-500">Qty
                    <input name={`qty_${i.id}`} type="number" min={0} max={i.quantity} defaultValue={0} className="ml-1 w-16 rounded border px-2 py-1 text-sm" />
                  </label>
                </div>
              ))}
              <label className="block text-sm">Reason
                <Input name="reason" required minLength={3} maxLength={1000} placeholder="Why are you returning?" className="mt-1" />
              </label>
              <SubmitButton pendingLabel="Requesting…">Request return</SubmitButton>
            </form>
          )}
        </section>

        <section className="mt-4 rounded-xl border p-4">
          <h2 className="font-semibold">Order history</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {publicHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-2">
                <span className="text-gray-500">{formatManila(h.createdAt)}</span>
                <span>{h.fromStatus ? `${friendly(h.fromStatus)} → ` : ""}{friendly(h.toStatus)}</span>
                {h.note && <span className="text-gray-600">— {h.note}</span>}
              </li>
            ))}
            {publicHistory.length === 0 && <li className="text-gray-500">No updates yet.</li>}
          </ol>
        </section>
      </main>
      <StoreFooter />
    </div>
  );
}
