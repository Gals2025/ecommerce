import { db } from "@/db";
import { homepageCards, promotions } from "@/db/schema";
import { getHomepageCards } from "@/features/catalog/homepage-cards";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { DbUnreachable } from "@/components/ui/empty-state";
import { CardEditor } from "./card-editor";

export const dynamic = "force-dynamic";

function missingCardTable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const details = current as { code?: string; message?: string; cause?: unknown };
    if (details.code === "42P01" || /relation ["']?homepage_cards["']? does not exist/i.test(details.message ?? "")) return true;
    current = details.cause;
  }
  return false;
}

export default async function HomepageCardsAdmin() {
  let cards: Awaited<ReturnType<typeof getHomepageCards>>;
  let offers: { id: string; name: string; kind: string; value: number; isActive: boolean; startAt: Date | null; endAt: Date | null }[];
  try {
    // Surface a missing migration in Admin while the public page uses defaults.
    await db.select({ slot: homepageCards.slot }).from(homepageCards).limit(1);
    [cards, offers] = await Promise.all([
      getHomepageCards(),
      db.select({ id: promotions.id, name: promotions.name, kind: promotions.kind, value: promotions.value,
        isActive: promotions.isActive, startAt: promotions.startAt, endAt: promotions.endAt }).from(promotions),
    ]);
  } catch (error) {
    if (missingCardTable(error)) return <PageGuard permission="promotions.manage" page="/admin/homepage-cards">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <h1 className="font-display text-xl font-semibold">Homepage Cards needs its database table</h1>
        <p className="mt-2">The staging site is connected to its database, but the new <code>homepage_cards</code> table has not been created there yet.</p>
        <p className="mt-2">Apply <code>db/migrations/0014_homepage_cards.sql</code> to the staging Neon database, then refresh this page. Existing storefront cards will continue to display while the migration is pending.</p>
      </div>
    </PageGuard>;
    return <DbUnreachable />;
  }
  return <PageGuard permission="promotions.manage" page="/admin/homepage-cards">
    <div className="space-y-6">
      <PageHeader title="Homepage Cards" description="Edit the two promotional cards shown between Featured products and Best sellers. Preview and save each card separately." />
      <CardEditor card={cards.flash_sale} offers={offers.filter((p) => p.isActive && ["percent", "fixed"].includes(p.kind))} />
      <CardEditor card={cards.new_arrivals} offers={[]} />
    </div>
  </PageGuard>;
}
