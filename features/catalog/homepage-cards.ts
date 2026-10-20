import { db } from "@/db";
import { homepageCards } from "@/db/schema";

export type CardSlot = "flash_sale" | "new_arrivals";
export type HomeCard = typeof homepageCards.$inferSelect;

export const CARD_DEFAULTS: Record<CardSlot, Omit<HomeCard, "updatedAt">> = {
  flash_sale: {
    slot: "flash_sale", eyebrow: "Flash sale", headline: "Deals up to 50% off",
    description: "Member prices, bundle deals and event promos.",
    asideText: "",
    buttonText: "Shop the deals", buttonHref: "/promotions", theme: "sunset",
    isVisible: true, startAt: null, endAt: null, promotionId: null,
  },
  new_arrivals: {
    slot: "new_arrivals", eyebrow: "New arrivals", headline: "Fresh gear, just landed",
    description: "The latest paddles, balls and apparel in the shop.",
    asideText: "Tournament-grade picks",
    buttonText: "Shop new", buttonHref: "/shop?sort=newest", theme: "light",
    isVisible: true, startAt: null, endAt: null, promotionId: null,
  },
};

export async function getHomepageCards(): Promise<Record<CardSlot, HomeCard>> {
  // The storefront remains usable during a deployment before its migration runs.
  const rows = await db.select().from(homepageCards).catch(() => []);
  return Object.fromEntries((Object.keys(CARD_DEFAULTS) as CardSlot[]).map((slot) => [
    slot, rows.find((row) => row.slot === slot) ?? { ...CARD_DEFAULTS[slot], updatedAt: new Date() },
  ])) as Record<CardSlot, HomeCard>;
}

export function cardIsVisible(card: HomeCard, now = new Date()) {
  return card.isVisible && (!card.startAt || card.startAt <= now) && (!card.endAt || card.endAt >= now);
}
