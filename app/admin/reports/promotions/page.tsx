import { getPromoReport } from "@/features/reports/service";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { HBar } from "@/components/admin/charts";
import { DateFilter, resolveRange } from "@/components/admin/date-filter";
import { formatPHP } from "@/lib/money";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function PromotionsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { from, to, range } = resolveRange(raw);
  let report: Awaited<ReturnType<typeof getPromoReport>>;
  try {
    report = await getPromoReport(range);
  } catch {
    return <DbUnreachable />;
  }
  const totalDiscount = report.reduce((s, p) => s + p.discountIssued, 0);
  const totalUses = report.reduce((s, p) => s + p.uses, 0);
  const totalRevenue = report.reduce((s, p) => s + p.revenueAssociated, 0);
  return (
    <PageGuard permission="reports.view" page="/admin/reports/promotions">
    <div>
      <PageHeader title="Promotions Report" description="Usage, discount issued, and associated order revenue from applied-discount history." />
      <DateFilter from={from} to={to} />
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Applications" value={String(totalUses)} />
        <MetricCard label="Discount issued" value={formatPHP(totalDiscount)} />
        <MetricCard label="Revenue associated" value={formatPHP(totalRevenue)} />
      </div>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Discount issued by promotion</h2>
        <div className="mt-2">
          <HBar
            data={report.slice(0, 12).map((p) => ({ label: p.name, value: p.discountIssued }))}
            format={(v) => formatPHP(v)}
            sub={(i) => `• ${report[i].uses} uses • ${formatPHP(report[i].revenueAssociated)} revenue`}
          />
        </div>
      </section>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Detail</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-1 pr-2">Promotion</th>
                <th className="pr-2 text-right">Uses</th>
                <th className="pr-2 text-right">Discount issued</th>
                <th className="text-right">Revenue associated</th>
              </tr>
            </thead>
            <tbody>
              {report.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-1 pr-2">{p.name}</td>
                  <td className="pr-2 text-right">{p.uses}</td>
                  <td className="pr-2 text-right">{formatPHP(p.discountIssued)}</td>
                  <td className="text-right">{formatPHP(p.revenueAssociated)}</td>
                </tr>
              ))}
              {report.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">No promotion applications in range.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    </PageGuard>
  );
}
