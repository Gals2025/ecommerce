import Link from "next/link";
import { db } from "@/db";
import { customers, customerMemberships, membershipTiers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatPHP } from "@/lib/money";
import { PageGuard } from "@/components/admin/page-guard";
import { DbUnreachable } from "@/components/ui/empty-state";

export default async function AdminCustomers() {
  let list: typeof customers.$inferSelect[] = [];
  try {
    list = await db.select().from(customers).limit(100);
  } catch {
    return <DbUnreachable />;
  }
  const tiers = await db.select().from(membershipTiers).catch(() => []);
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  return (
    <PageGuard permission="orders.verify_payment" page="/admin/customers">
    <div>
      <h1 className="text-xl font-bold">Customers</h1>
      <div className="mt-4 space-y-2">
        {list.map((c) => (
          <CustomerRow key={c.id} customer={c} tierName={null} tierMap={Object.fromEntries([...tierById].map(([k, v]) => [k, v.name]))} />
        ))}
        {list.length === 0 && <p className="text-sm">No customers yet.</p>}
      </div>
    </div>
    </PageGuard>
  );
}

async function CustomerRow({
  customer,
  tierMap,
}: {
  customer: typeof customers.$inferSelect;
  tierName: string | null;
  tierMap: Record<string, string>;
}) {
  let membership: { tierId: string } | null = null;
  try {
    const rows = await db
      .select({ tierId: customerMemberships.tierId })
      .from(customerMemberships)
      .where(eq(customerMemberships.customerId, customer.id))
      .limit(1);
    membership = rows[0] ?? null;
  } catch {
    membership = null;
  }
  return (
    <Link href={`/admin/customers/${customer.id}`} className="block rounded-lg border p-4 text-sm hover:bg-gray-50">
      <div className="font-medium">{customer.mobile ?? customer.userId.slice(0, 8)}…</div>
      <div>
        Lifetime spend: {formatPHP(customer.lifetimeSpend ?? 0)} • Tier:{" "}
        {membership ? tierMap[membership.tierId] ?? membership.tierId.slice(0, 8) : "—"}
      </div>
    </Link>
  );
}
