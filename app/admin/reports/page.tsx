import Link from "next/link";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

const REPORTS = [
  ["Sales", "/admin/reports/sales", "Daily, weekly, monthly revenue, orders, and breakdowns by product, category, customer, and tier."],
  ["Inventory", "/admin/reports/inventory", "Current stock, valuation, low/out lists, movements, and adjustments."],
  ["Customers", "/admin/reports/customers", "New customers, top spenders, and lifetime value."],
  ["Membership", "/admin/reports/membership", "Active, expiring, expired memberships and tier distribution."],
  ["Promotions", "/admin/reports/promotions", "Usage, discount issued, and associated revenue per promotion."],
] as const;

export default function ReportsHub() {
  return (
    <PageGuard permission="reports.view" page="/admin/reports">
    <div>
      <PageHeader title="Reports" description="Operational reporting on real database data. Every report supports date filters." />
      <div className="mt-4 space-y-2">
        {REPORTS.map(([label, href, desc]) => (
          <Link key={href} href={href} className="block rounded border p-3 hover:bg-gray-50">
            <div className="font-medium">{label}</div>
            <div className="text-sm text-gray-600">{desc}</div>
          </Link>
        ))}
      </div>
    </div>
    </PageGuard>
  );
}
