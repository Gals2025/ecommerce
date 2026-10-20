import { db } from "@/db";
import { homepageCards, promotions } from "@/db/schema";
import { getHomepageCards } from "@/features/catalog/homepage-cards";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { DbUnreachable } from "@/components/ui/empty-state";
import { CardEditor } from "./card-editor";

export const dynamic = "force-dynamic";

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
  } catch {
    return <DbUnreachable />;
  }
  return <PageGuard permission="promotions.manage" page="/admin/homepage-cards">
    <div className="space-y-6">
      <PageHeader title="Homepage Cards" description="Edit the two promotional cards shown between Featured products and Best sellers. Preview changes before publishing." />
      <CardEditor card={cards.flash_sale} offers={offers.filter((p) => p.isActive && ["percent", "fixed"].includes(p.kind))} />
      <CardEditor card={cards.new_arrivals} offers={[]} />
    </div>
  </PageGuard>;
}
