import Link from "next/link";
import { listOrdersForStaff } from "@/actions/order-ops";
import { ORDER_STATUSES, PAYMENT_STATUSES, FULFILLMENT_STATUSES } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Button, Input, Select } from "@/components/ui";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function FilterSelect({ name, value, options, label }: { name: string; value: string; options: readonly string[]; label: string }) {
  return (
    <label className="text-xs text-gray-600">
      {label}
      <Select name={name} defaultValue={value} className="ml-1 w-auto">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </label>
  );
}

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const status = first(raw.status);
  const payment = first(raw.payment);
  const fulfillment = first(raw.fulfillment);
  const q = first(raw.q);

  let list: Awaited<ReturnType<typeof listOrdersForStaff>> = [];
  try {
    list = await listOrdersForStaff({
      status: (ORDER_STATUSES as string[]).includes(status) ? status : undefined,
      payment: (PAYMENT_STATUSES as string[]).includes(payment) ? payment : undefined,
      fulfillment: (FULFILLMENT_STATUSES as string[]).includes(fulfillment) ? fulfillment : undefined,
      q: q || undefined,
    });
  } catch {
    return <DbUnreachable />;
  }

  return (
    <PageGuard permission="orders.verify_payment" page="/admin/orders">
    <div>
      <PageHeader title="Orders" description="Order pipeline, payment verification, and fulfillment." />
      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <FilterSelect name="status" value={status} options={ORDER_STATUSES} label="Order" />
        <FilterSelect name="payment" value={payment} options={PAYMENT_STATUSES} label="Payment" />
        <FilterSelect name="fulfillment" value={fulfillment} options={FULFILLMENT_STATUSES} label="Fulfillment" />
        <label className="text-xs text-gray-600">
          Search
          <Input name="q" defaultValue={q} placeholder="Order no / promo" className="ml-1 w-auto" />
        </label>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(status || payment || fulfillment || q) && (
          <Link href="/admin/orders" className="text-sm text-gray-500 hover:underline">Clear</Link>
        )}
      </form>
      <div className="mt-4 space-y-2">
        {list.map((o) => (
          <Link key={o.id} href={`/admin/orders/${o.id}`} className="block rounded border p-3 text-sm hover:bg-gray-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{o.orderNo}</span>
              <StatusBadge status={o.status} />
              <StatusBadge status={o.paymentStatus} />
              <StatusBadge status={o.fulfillmentStatus} />
              <span className="ml-auto font-semibold">{formatPHP(o.grandTotal)}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {o.fulfillment} • {formatManila(o.createdAt)}{o.promoCode ? ` • Promo ${o.promoCode}` : ""}
            </div>
          </Link>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-gray-500">No orders match. <Link href="/admin/orders" className="underline">Clear filters</Link></p>
        )}
      </div>
    </div>
    </PageGuard>
  );
}
