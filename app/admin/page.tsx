import Link from "next/link";
import { PageGuard } from "@/components/admin/page-guard";
import { getDashboardMetrics } from "@/features/dashboard/service";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable } from "@/components/admin/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { VBar, HBar, Donut } from "@/components/admin/charts";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const result = await getDashboardMetrics();
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Business overview in Philippine Peso (₱), Asia/Manila time." />
        <EmptyState
          title="Database not connected"
          description="Set DATABASE_URL, then run npm run db:push && npm run db:seed to populate metrics."
        />
      </div>
    );
  }
  const { data } = result;
  return (
    <PageGuard permission="reports.view" page="/admin">
    <div>
      <PageHeader title="Dashboard" description={`Asia/Manila • ${formatManila(new Date())}`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Sales Today" value={formatPHP(data.salesToday)} />
        <MetricCard label="Sales This Month" value={formatPHP(data.salesMonth)} />
        <MetricCard label="Orders Today" value={String(data.ordersToday)} />
        <MetricCard label="Pending Orders" value={String(data.pendingOrders)} sub="Pending / awaiting / verifying" />
        <MetricCard label="Awaiting Payment Verification" value={String(data.awaitingVerification)} />
        <MetricCard label="Customers" value={String(data.customerCount)} />
        <MetricCard label="Active Members" value={String(data.activeMembers)} />
        <MetricCard label="Low Stock" value={String(data.lowStock)} sub="At/under threshold" />
        <MetricCard label="Out of Stock" value={String(data.outOfStock)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded border p-3">
          <h2 className="font-medium">Revenue — last 30 days</h2>
          <div className="mt-2"><VBar data={data.revenueDaily.map((d) => ({ label: d.label, value: d.revenue }))} format={(v) => `₱${Math.round(v / 100).toLocaleString("en-PH")}`} /></div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Orders — last 30 days</h2>
          <div className="mt-2"><VBar data={data.revenueDaily.map((d) => ({ label: d.label, value: d.orders }))} /></div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Sales by category</h2>
          <div className="mt-2"><HBar data={data.categorySales} format={(v) => formatPHP(v)} /></div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Top products (by units)</h2>
          <div className="mt-2">
            <HBar
              data={data.topProducts}
              format={(v) => formatPHP(v)}
              sub={(i) => `• ${data.topProducts[i].units} sold`}
            />
          </div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Membership distribution</h2>
          <div className="mt-2"><Donut data={data.membershipDist} /></div>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Reports</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {[
              ["Sales", "/admin/reports/sales"],
              ["Inventory", "/admin/reports/inventory"],
              ["Customers", "/admin/reports/customers"],
              ["Membership", "/admin/reports/membership"],
              ["Promotions", "/admin/reports/promotions"],
            ].map(([label, href]) => (
              <li key={href}><Link href={href} className="underline">{label} report</Link></li>
            ))}
          </ul>
        </section>
      </div>

      <h2 className="mb-2 mt-6 font-medium">Recent orders</h2>
      <DataTable
        columns={[
          { key: "no", header: "Order", value: (r) => r.orderNo, sortable: true },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "total", header: "Total", value: (r) => r.grandTotal, render: (r) => formatPHP(r.grandTotal), sortable: true },
        ]}
        rows={data.recentOrders}
        emptyTitle="No orders yet"
        emptyDescription="Orders will appear here once customers check out."
      />
    </div>
    </PageGuard>
  );
}
