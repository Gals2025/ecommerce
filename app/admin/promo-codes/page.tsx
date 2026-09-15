import { db } from "@/db";
import { promotionCodes, promotions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { StatusBadge } from "@/components/ui/badge";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function PromoCodesPage() {
  let codes: typeof promotionCodes.$inferSelect[] = [];
  let promos: typeof promotions.$inferSelect[] = [];
  try {
    codes = await db.select().from(promotionCodes).orderBy(desc(promotionCodes.createdAt)).limit(200);
    promos = await db.select().from(promotions);
  } catch {
    return <DbUnreachable />;
  }
  const nameByPromo = new Map(promos.map((p) => [p.id, p.name]));
  return (
    <PageGuard permission="promotions.manage" page="/admin/promo-codes">
    <div>
      <PageHeader title="Promo Codes" description="Issue and track redemption. Configure per-promotion codes under Promotions." />
      <div className="mt-4 space-y-2">
        {codes.map((c) => (
          <div key={c.id} className="rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium">{c.code}</span>
              <span className="text-gray-600">{nameByPromo.get(c.promotionId) ?? c.promotionId.slice(0, 8)}</span>
              {!c.isActive && <StatusBadge status="inactive" />}
              <span className="ml-auto text-gray-500">
                used {c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : " / ∞"} • per-customer {c.perCustomerLimit}
              </span>
            </div>
          </div>
        ))}
        {codes.length === 0 && <p className="text-sm text-gray-500">No codes issued.</p>}
      </div>
    </div>
    </PageGuard>
  );
}
