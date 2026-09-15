import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/rbac";
import { db } from "@/db";
import { customers, customerAddresses, membershipTiers, memberships, orders } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import { tierForSpend, getActiveMembership } from "@/lib/membership";
import { getCategoriesTree } from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession().catch(() => null);
  if (!session?.user) redirect("/login?redirect=/account");
  const userId = session.user.id;

  let customer: typeof customers.$inferSelect | null = null;
  let tierName: string | null = null;
  let nextTier: { name: string; minSpend: number | null; discountPct: number | null } | null = null;
  let paid: Awaited<ReturnType<typeof getActiveMembership>> = null;
  let myMemberships: (typeof memberships.$inferSelect & { tierName: string | null })[] = [];
  let myOrders: { id: string; orderNo: string; status: string; grandTotal: number; createdAt: Date }[] = [];
  let addressCount = 0;
  try {
    const c = await db.select().from(customers).where(eq(customers.userId, userId)).limit(1);
    customer = c[0] ?? null;
    if (customer) {
      const tier = await tierForSpend(customer.lifetimeSpend ?? 0);
      tierName = tier?.name ?? null;
      const allTiers = await db.select().from(membershipTiers);
      const sorted = [...allTiers].sort((a, b) => (a.minSpend ?? 0) - (b.minSpend ?? 0));
      nextTier = sorted.find((t) => (t.minSpend ?? 0) > (customer?.lifetimeSpend ?? 0)) ?? null;
      const addrs = await db.select({ id: customerAddresses.id }).from(customerAddresses).where(eq(customerAddresses.customerId, customer.id));
      addressCount = addrs.length;
      paid = await getActiveMembership(customer.id).catch(() => null);
      const rows = await db.select().from(memberships).where(eq(memberships.customerId, customer.id)).catch(() => []);
      const tierRows = await db.select().from(membershipTiers).catch(() => []);
      const nameById = new Map(tierRows.map((t) => [t.id, t.name]));
      myMemberships = rows.map((m) => ({ ...m, tierName: nameById.get(m.tierId) ?? null }));
    }
    myOrders = await db
      .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status, grandTotal: orders.grandTotal, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.customerId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(20);
  } catch {
    return <DbUnreachable />;
  }
  const cats = await getCategoriesTree().catch(() => []);
  // Server component: evaluated once per request, so request-time clock read is stable.
  // eslint-disable-next-line react-hooks/purity
  const expiringSoon = paid?.expiresAt != null && paid.expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold sm:text-2xl">My account</h1>
        <p className="text-sm text-gray-600">{session.user.name ?? "Member"} • {session.user.email}</p>

        <section className="mt-4 rounded-xl border p-4">
          <h2 className="font-semibold">Membership</h2>
          {customer ? (
            <div className="mt-1 text-sm">
              <div>Spend tier: <span className="font-medium">{tierName ?? "—"}</span></div>
              {paid ? (
                <div className="mt-2 rounded-lg bg-green-50 p-2">
                  <div><span className="font-mono font-medium">{paid.membershipNo}</span> • <span className="font-medium">{paid.tierName}</span> ({paid.discountPct}% off)</div>
                  {paid.benefits.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-gray-700">
                      {paid.benefits.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                  <div className="mt-1 text-gray-600">
                    {paid.expiresAt ? (
                      expiringSoon ? (
                        <span className="font-medium text-amber-700" role="alert">Expiring today — renew in store to keep benefits.</span>
                      ) : (
                        <>Valid until {formatManila(paid.expiresAt)}</>
                      )
                    ) : (
                      <>Lifetime membership</>
                    )}
                  </div>
                </div>
              ) : myMemberships.length > 0 ? (
                <div className="mt-2 rounded-lg bg-gray-50 p-2 text-gray-600">
                  No active membership benefits
                  {myMemberships[0].status === "expired" ? " — your membership expired." : ` (status: ${myMemberships[0].status}).`}
                </div>
              ) : (
                <div className="mt-1 text-gray-600">No paid membership — ask staff about Gold / VIP.</div>
              )}
              <div className="mt-2 text-gray-600">Lifetime spend: {formatPHP(customer.lifetimeSpend ?? 0)}</div>
              {nextTier && (
                <div className="text-gray-600">
                  Next: {nextTier.name} at {formatPHP(nextTier.minSpend ?? 0)} ({formatPHP(Math.max(0, (nextTier.minSpend ?? 0) - (customer.lifetimeSpend ?? 0)))} to go)
                </div>
              )}
              <div className="text-gray-600">Saved addresses: {addressCount}</div>
              <Link href="/membership" className="mt-2 inline-block text-sm underline">Tier benefits</Link>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-600">No customer profile yet — it is created on your first checkout.</p>
          )}
        </section>

        <section className="mt-4">
          <h2 className="font-semibold">Order history</h2>
          <div className="mt-2 space-y-2">
            {myOrders.map((o) => (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm hover:bg-gray-50">
                <div>
                  <div className="font-medium">{o.orderNo}</div>
                  <div className="text-xs text-gray-500">{o.status} • {formatManila(o.createdAt)}</div>
                </div>
                <div className="font-semibold">{formatPHP(o.grandTotal)}</div>
              </Link>
            ))}
            {myOrders.length === 0 && <p className="text-sm text-gray-500">No orders yet. <Link href="/shop" className="underline">Start shopping</Link>.</p>}
          </div>
        </section>
      </main>
      <StoreFooter />
    </div>
  );
}
