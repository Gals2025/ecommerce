import Link from "next/link";
import { db } from "@/db";
import { returns, orders } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatManila } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { Button, Select } from "@/components/ui";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const STATUSES = ["requested", "approved", "rejected", "completed"] as const;

export default async function AdminReturns({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const status = first(raw.status);
  let list: (typeof returns.$inferSelect & { orderNo: string | null })[] = [];
  try {
    const rows = await db
      .select({ ret: returns, orderNo: orders.orderNo })
      .from(returns)
      .leftJoin(orders, eq(returns.orderId, orders.id))
      .where(status && (STATUSES as readonly string[]).includes(status) ? eq(returns.status, status) : undefined)
      .orderBy(desc(returns.createdAt))
      .limit(100);
    list = rows.map((r) => ({ ...r.ret, orderNo: r.orderNo }));
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="orders.manage_returns" page="/admin/returns">
    <div>
      <PageHeader title="Returns" description="Review requests, set restock/damaged per line, and issue refunds." />
      <form method="get" className="mt-3 flex items-end gap-2">
        <label className="text-xs text-gray-600">
          Status
          <Select name="status" defaultValue={status} className="ml-1 w-auto">
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
      </form>
      <div className="mt-4 space-y-2">
        {list.map((r) => (
          <Link key={r.id} href={`/admin/returns/${r.id}`} className="block rounded-lg border p-4 text-sm hover:bg-gray-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.orderNo ?? r.orderId.slice(0, 8)}</span>
              <StatusBadge status={r.status} />
              <span className="ml-auto text-xs text-gray-500">{formatManila(r.createdAt)}</span>
            </div>
            <div className="mt-1 line-clamp-2 text-gray-600">{r.reason}</div>
          </Link>
        ))}
        {list.length === 0 && <p className="text-sm text-gray-500">No returns match.</p>}
      </div>
    </div>
    </PageGuard>
  );
}
