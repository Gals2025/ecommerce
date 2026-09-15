import { getCustomerReport } from "@/features/reports/service";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { HBar } from "@/components/admin/charts";
import { DateFilter, resolveRange } from "@/components/admin/date-filter";
import { formatPHP } from "@/lib/money";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function CustomersReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { from, to, range } = resolveRange(raw);
  let report: Awaited<ReturnType<typeof getCustomerReport>>;
  try {
    report = await getCustomerReport(range);
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="reports.view" page="/admin/reports/customers">
    <div>
      <PageHeader title="Customers Report" description="Acquisition, top spenders, and lifetime value." />
      <DateFilter from={from} to={to} />
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="New customers (range)" value={String(report.newCount)} />
        <MetricCard label="Top customer spend" value={report.topCustomers[0] ? formatPHP(report.topCustomers[0].lifetimeSpend) : formatPHP(0)} sub={report.topCustomers[0]?.name} />
        <MetricCard label="Total lifetime tracked" value={formatPHP(report.lifetime.reduce((s, c) => s + c.lifetimeSpend, 0))} />
      </div>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Top customers</h2>
        <div className="mt-2">
          <HBar
            data={report.topCustomers.slice(0, 10).map((c) => ({ label: c.name, value: c.lifetimeSpend }))}
            format={(v) => formatPHP(v)}
          />
        </div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded border p-3">
          <h2 className="font-medium">New in range ({report.newCustomers.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.newCustomers.slice(0, 50).map((c) => (
              <li key={c.id} className="flex justify-between gap-2 border-b py-1 last:border-0">
                <span>{c.name}</span><span className="font-medium">{formatPHP(c.lifetimeSpend)}</span>
              </li>
            ))}
            {report.newCustomers.length === 0 && <li className="text-gray-500">No new customers in range.</li>}
          </ul>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Lifetime spending leaderboard</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.lifetime.slice(0, 50).map((c, i) => (
              <li key={c.id} className="flex justify-between gap-2 border-b py-1 last:border-0">
                <span>{i + 1}. {c.name}</span><span className="font-medium">{formatPHP(c.lifetimeSpend)}</span>
              </li>
            ))}
            {report.lifetime.length === 0 && <li className="text-gray-500">No customers yet.</li>}
          </ul>
        </section>
      </div>
    </div>
    </PageGuard>
  );
}
