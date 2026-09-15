import { getInventoryReport } from "@/features/reports/service";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/badge";
import { DateFilter, resolveRange } from "@/components/admin/date-filter";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { from, to, range } = resolveRange(raw);
  let report: Awaited<ReturnType<typeof getInventoryReport>>;
  try {
    report = await getInventoryReport(range);
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="reports.view" page="/admin/reports/inventory">
    <div>
      <PageHeader title="Inventory Report" description="Live snapshot plus movements in range. Valuation at cost." />
      <DateFilter from={from} to={to} />
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Valuation (cost)" value={formatPHP(report.valuation)} />
        <MetricCard label="SKUs tracked" value={String(report.snapshot.length)} />
        <MetricCard label="Low stock" value={String(report.low.length)} />
        <MetricCard label="Out of stock" value={String(report.out.length)} />
      </div>

      {(report.low.length > 0 || report.out.length > 0) && (
        <section className="mt-4 rounded border p-3">
          <h2 className="font-medium">Needs attention</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.out.map((s) => (
              <li key={s.variantId} className="flex justify-between gap-2">
                <span>{s.productName} <span className="text-gray-500">• {s.sku}</span></span>
                <StatusBadge status="out of stock" />
              </li>
            ))}
            {report.low.map((s) => (
              <li key={s.variantId} className="flex justify-between gap-2">
                <span>{s.productName} <span className="text-gray-500">• {s.sku} • {s.available} avail (≤ {s.threshold ?? 5})</span></span>
                <StatusBadge status="low stock" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Current inventory</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-1 pr-2">SKU</th><th className="pr-2">Product</th>
                <th className="pr-2 text-right">On hand</th><th className="pr-2 text-right">Reserved</th>
                <th className="pr-2 text-right">Available</th><th className="pr-2 text-right">Unit cost</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {report.snapshot.map((s) => (
                <tr key={s.variantId} className="border-b last:border-0">
                  <td className="py-1 pr-2 font-mono text-xs">{s.sku}</td>
                  <td className="pr-2">{s.productName}</td>
                  <td className="pr-2 text-right">{s.onHand}</td>
                  <td className="pr-2 text-right">{s.reserved}</td>
                  <td className="pr-2 text-right font-medium">{s.available}</td>
                  <td className="pr-2 text-right">{formatPHP(s.unitCost)}</td>
                  <td className="text-right">{formatPHP(s.value)}</td>
                </tr>
              ))}
              {report.snapshot.length === 0 && <tr><td colSpan={7} className="py-2 text-gray-500">No inventory rows.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Adjustments in range ({report.adjustments.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {report.adjustments.slice(0, 50).map((m) => (
            <li key={m.id} className="flex flex-wrap gap-x-2 border-b py-1 last:border-0">
              <span className="text-gray-500">{formatManila(m.createdAt)}</span>
              <StatusBadge status={m.reason} />
              <span>Δ on-hand {m.qtyOnHandChange} • Δ reserved {m.qtyReservedChange}</span>
              {m.note && <span className="text-gray-600">— {m.note}</span>}
            </li>
          ))}
          {report.adjustments.length === 0 && <li className="text-gray-500">No adjustments in range.</li>}
        </ul>
      </section>

      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">All movements in range ({report.moves.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {report.moves.slice(0, 100).map((m) => (
            <li key={m.id} className="flex flex-wrap gap-x-2 border-b py-1 last:border-0">
              <span className="text-gray-500">{formatManila(m.createdAt)}</span>
              <StatusBadge status={m.reason} />
              <span>Δ on-hand {m.qtyOnHandChange} • Δ reserved {m.qtyReservedChange}</span>
              {m.refType && <span className="text-xs text-gray-500">{m.refType}:{m.refId?.slice(0, 8)}</span>}
            </li>
          ))}
          {report.moves.length === 0 && <li className="text-gray-500">No movements in range.</li>}
        </ul>
      </section>
    </div>
    </PageGuard>
  );
}
