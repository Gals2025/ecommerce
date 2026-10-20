import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { promotions } from "./promos";

export type HomepageCardDraft = {
  eyebrow: string;
  headline: string;
  description: string;
  asideText: string;
  buttonText: string;
  buttonHref: string;
  theme: string;
  isVisible: boolean;
  startAt: string | null;
  endAt: string | null;
  promotionId: string | null;
};

export const homepageCards = pgTable("homepage_cards", {
  slot: text("slot").primaryKey(), // flash_sale | new_arrivals
  eyebrow: text("eyebrow").notNull(),
  headline: text("headline").notNull(),
  description: text("description").notNull(),
  asideText: text("aside_text").notNull().default(""),
  buttonText: text("button_text").notNull(),
  buttonHref: text("button_href").notNull(),
  theme: text("theme").notNull(),
  isVisible: boolean("is_visible").notNull().default(true),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  promotionId: uuid("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
  draft: jsonb("draft").$type<HomepageCardDraft | null>(),
  draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
