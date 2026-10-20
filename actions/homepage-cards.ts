"use server";

import { db } from "@/db";
import { homepageCards, promotions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import type { CardSlot } from "@/features/catalog/homepage-cards";

const slots: CardSlot[] = ["flash_sale", "new_arrivals"];
const themes = ["sunset", "forest", "light", "dark"];
const field = (data: FormData, name: string, max: number) => {
  const value = String(data.get(name) ?? "").trim();
  if (!value || value.length > max) throw new Error(`${name} must be 1–${max} characters.`);
  return value;
};
const manilaDate = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error("Invalid schedule date.");
  const date = new Date(`${raw}:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid schedule date.");
  return date;
};

export async function saveHomepageCard(data: FormData) {
  const session = await getStrictAdminSession();
  if (!session?.user || !(await hasPermission(session.user.id, "promotions.manage"))) throw new Error("Forbidden");

  const slot = String(data.get("slot")) as CardSlot;
  if (!slots.includes(slot)) throw new Error("Invalid card.");
  const theme = field(data, "theme", 16);
  if (!themes.includes(theme)) throw new Error("Invalid theme.");
  const buttonHref = field(data, "buttonHref", 250);
  if (!buttonHref.startsWith("/") || buttonHref.startsWith("//") || /[\\\r\n]/.test(buttonHref)) {
    throw new Error("Button destination must be a local path beginning with /.");
  }
  const startAt = manilaDate(data.get("startAt"));
  const endAt = manilaDate(data.get("endAt"));
  if (startAt && endAt && startAt >= endAt) throw new Error("End must be after start.");
  const promotionId = slot === "flash_sale" ? String(data.get("promotionId") ?? "").trim() || null : null;
  if (promotionId) {
    const [linked] = await db.select({ id: promotions.id }).from(promotions).where(eq(promotions.id, promotionId)).limit(1);
    if (!linked) throw new Error("Promotion not found.");
  }

  const values = {
    eyebrow: field(data, "eyebrow", 40), headline: field(data, "headline", 100),
    description: field(data, "description", 240), buttonText: field(data, "buttonText", 40),
    asideText: String(data.get("asideText") ?? "").trim().slice(0, 60),
    buttonHref, theme, promotionId, startAt, endAt,
    isVisible: data.get("isVisible") === "on", updatedAt: new Date(),
  };
  await db.insert(homepageCards).values({ slot, ...values }).onConflictDoUpdate({
    target: homepageCards.slot, set: values,
  });
  await audit(session.user.id, "homepage_card.update", "homepage_cards", slot, values);
  revalidatePath("/");
  revalidatePath("/admin/homepage-cards");
}
