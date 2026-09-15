import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./commerce";
import { users } from "./auth";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    diff: text("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
  ]
);

export const settings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const EMAIL_TEMPLATES = [
  "welcome",
  "order_confirmation",
  "payment_received",
  "payment_verified",
  "order_processing",
  "ready_for_pickup",
  "shipped",
  "completed",
  "cancelled",
  "membership_activated",
  "membership_expiring",
  "password_reset",
  "refund",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

// Delivery references for every transactional send. Rows start as queued;
// the fire-and-forget sender flips them to sent (+ Resend ID), failed, or
// skipped (no API key in dev). Never written inside a business transaction.
export const emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    resendId: text("resend_id"),
    status: text("status").notNull().default("queued"), // queued|sent|failed|skipped
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_logs_order_idx").on(t.orderId, t.createdAt),
    index("email_logs_user_idx").on(t.userId, t.createdAt),
    check("email_logs_status_ck", sql`${t.status} IN ('queued','sent','failed','skipped')`),
  ]
);
