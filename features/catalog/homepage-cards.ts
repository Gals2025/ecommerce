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
    isVisible: true, startAt: null, endAt: null, promotionId: null, draft: null, draftUpdatedAt: null,
  },
  new_arrivals: {
    slot: "new_arrivals", eyebrow: "New arrivals", headline: "Fresh gear, just landed",
    description: "The latest paddles, balls and apparel in the shop.",
    asideText: "Tournament-grade picks",
    buttonText: "Shop new", buttonHref: "/shop?sort=newest", theme: "light",
    isVisible: true, startAt: null, endAt: null, promotionId: null, draft: null, draftUpdatedAt: null,
  },
};

export async function getHomepageCards(): Promise<Record<CardSlot, HomeCard>> {
  // The storefront remains usable during a deployment before its migration runs.
  const rows = await db.select().from(homepageCards).catch(() => []);
  return Object.fromEntries((Object.keys(CARD_DEFAULTS) as CardSlot[]).map((slot) => [
    slot, rows.find((row) => row.slot === slot) ?? { ...CARD_DEFAULTS[slot], updatedAt: new Date() },
  ])) as Record<CardSlot, HomeCard>;
}

export async function getPublishedHomepageCards(): Promise<Record<CardSlot, HomeCard>> {
  // Read only published columns so the storefront still works before the draft migration runs.
  const rows = await db.select({
    slot: homepageCards.slot, eyebrow: homepageCards.eyebrow, headline: homepageCards.headline,
    description: homepageCards.description, asideText: homepageCards.asideText,
    buttonText: homepageCards.buttonText, buttonHref: homepageCards.buttonHref,
    theme: homepageCards.theme, isVisible: homepageCards.isVisible,
    startAt: homepageCards.startAt, endAt: homepageCards.endAt,
    promotionId: homepageCards.promotionId, updatedAt: homepageCards.updatedAt,
  }).from(homepageCards).catch(() => []);
  return Object.fromEntries((Object.keys(CARD_DEFAULTS) as CardSlot[]).map((slot) => {
    const published = rows.find((row) => row.slot === slot);
    return [slot, { ...CARD_DEFAULTS[slot], ...published, updatedAt: published?.updatedAt ?? new Date() }];
  })) as Record<CardSlot, HomeCard>;
}

export function cardIsVisible(card: HomeCard, now = new Date()) {
  return card.isVisible && (!card.startAt || card.startAt <= now) && (!card.endAt || card.endAt >= now);
}
