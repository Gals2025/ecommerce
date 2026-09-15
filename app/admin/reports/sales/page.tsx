import { getSalesReport } from "@/features/reports/service";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { VBar, HBar } from "@/components/admin/charts";
import { DateFilter, resolveRange } from "@/components/admin/date-filter";
import { formatPHP } from "@/lib/money";
import type { Bucket } from "@/lib/reports";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const pesoShort = (v: number) => `₱${Math.round(v / 100).toLocaleString("en-PH")}`;

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { from, to, range } = resolveRange(raw);
  const bucket = (["day", "week", "month"] as Bucket[]).includes(first(raw.bucket) as Bucket)
    ? (first(raw.bucket) as Bucket)
    : "day";
  let report: Awaited<ReturnType<typeof getSalesReport>>;
  try {
    report = await getSalesReport(range, bucket);
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="reports.view" page="/admin/reports/sales">
    <div>
      <PageHeader title="Sales Report" description="Revenue = non-cancelled orders minus completed refunds. All real data, Asia/Manila." />
      <DateFilter from={from} to={to} showBucket bucket={bucket} extra={bucket !== "day" ? { bucket } : {}} />
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Revenue" value={formatPHP(report.totals.revenue)} />
        <MetricCard label="Orders" value={String(report.totals.orders)} />
        <MetricCard label="Refunded" value={formatPHP(report.totals.refunds)} />
      </div>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Revenue over time ({bucket})</h2>
        <div className="mt-2"><VBar data={report.buckets.map((b) => ({ label: b.label.slice(bucket === "month" ? 0 : 5), value: b.revenue }))} format={pesoShort} /></div>
      </section>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Orders over time ({bucket})</h2>
        <div className="mt-2"><VBar data={report.buckets.map((b) => ({ label: b.label.slice(bucket === "month" ? 0 : 5), value: b.orders }))} /></div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded border p-3">
          <h2 className="font-medium">By product</h2>
          <div className="mt-2">
            <HBar data={report.byProduct.slice(0, 10).map((p) => ({ label: p.name, value: p.revenue }))} format={(v) => formatPHP(v)} sub={(i) => `• ${report.byProduct[i].units} sold`} />
          </div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">By category</h2>
          <div className="mt-2"><HBar data={report.byCategory.slice(0, 10)} format={(v) => formatPHP(v)} /></div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">By customer</h2>
          <div className="mt-2">
            <HBar data={report.byCustomer.slice(0, 10).map((c) => ({ label: c.name, value: c.revenue }))} format={(v) => formatPHP(v)} sub={(i) => `• ${report.byCustomer[i].orders} orders`} />
          </div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">By membership tier</h2>
          <div className="mt-2">
            <HBar data={report.byTier.map((t) => ({ label: t.label, value: t.revenue }))} format={(v) => formatPHP(v)} sub={(i) => `• ${report.byTier[i].orders} orders`} />
          </div>
        </section>
      </div>
    </div>
    </PageGuard>
  );
}
