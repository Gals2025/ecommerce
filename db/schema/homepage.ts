import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { promotions } from "./promos";

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
