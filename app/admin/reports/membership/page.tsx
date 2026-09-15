import { getMembershipReport } from "@/features/reports/service";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Donut } from "@/components/admin/charts";
import { StatusBadge } from "@/components/ui/badge";
import { formatManila } from "@/lib/datetime";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function MembershipReportPage() {
  async function remind(formData: FormData) {
    "use server";
    const { sendExpiryReminder } = await import("@/actions/memberships");
    await sendExpiryReminder(String(formData.get("membershipId")));
  }

  let report: Awaited<ReturnType<typeof getMembershipReport>>;
  try {
    report = await getMembershipReport();
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard permission="reports.view" page="/admin/reports/membership">
    <div>
      <PageHeader title="Membership Report" description="Active, expiring (≤30 days), expired, and tier distribution. Real membership rows." />
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Active" value={String(report.activeCount)} />
        <MetricCard label="Expiring ≤30d" value={String(report.expiring.length)} />
        <MetricCard label="Expired" value={String(report.expired.length)} />
      </div>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-medium">Tier distribution (active)</h2>
        <div className="mt-2"><Donut data={report.tierDist} /></div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded border p-3">
          <h2 className="font-medium">Expiring soon ({report.expiring.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.expiring.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-2 border-b py-1 last:border-0">
                <span className="font-mono">{m.membershipNo}</span>
                <span>{m.tierName}</span>
                <span className="text-amber-700">{m.expiresAt ? formatManila(m.expiresAt, "MMM d, yyyy") : "lifetime"}</span>
                <form action={remind} className="ml-auto">
                  <input type="hidden" name="membershipId" value={m.id} />
                  <button type="submit" className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50">Send reminder</button>
                </form>
              </li>
            ))}
            {report.expiring.length === 0 && <li className="text-gray-500">Nothing expiring in the next 30 days.</li>}
          </ul>
        </section>
        <section className="rounded border p-3">
          <h2 className="font-medium">Expired ({report.expired.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.expired.slice(0, 50).map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-2 border-b py-1 last:border-0">
                <span className="font-mono">{m.membershipNo}</span>
                <span>{m.tierName}</span>
                <StatusBadge status={m.status} />
              </li>
            ))}
            {report.expired.length === 0 && <li className="text-gray-500">No expired memberships.</li>}
          </ul>
        </section>
      </div>
    </div>
    </PageGuard>
  );
}
