CREATE TABLE "order_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_ck";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_status" text DEFAULT 'unfulfilled' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference_no" text;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_notes_order_idx" ON "order_notes" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_fulfillment_status_idx" ON "orders" USING btree ("fulfillment_status");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_ck" CHECK ("orders"."payment_status" IN ('unpaid','pending_verification','paid','partially_paid','failed','refunded','partially_refunded'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_status_ck" CHECK ("orders"."fulfillment_status" IN ('unfulfilled','processing','ready','partially_fulfilled','fulfilled','shipped','delivered','returned'));--> statement-breakpoint
UPDATE "orders" SET "status" = CASE "status" WHEN 'paid' THEN 'confirmed' WHEN 'fulfilled' THEN 'completed' WHEN 'returned' THEN 'completed' ELSE "status" END WHERE "status" IN ('paid','fulfilled','returned');--> statement-breakpoint
UPDATE "orders" SET "payment_status" = 'paid' WHERE "status" = 'confirmed' AND "payment_status" = 'unpaid';--> statement-breakpoint
UPDATE "orders" SET "fulfillment_status" = 'delivered' WHERE "status" = 'completed' AND "fulfillment_status" = 'unfulfilled' AND NOT EXISTS (SELECT 1 FROM "returns" WHERE "returns"."order_id" = "orders"."id" AND "returns"."status" = 'approved');--> statement-breakpoint
UPDATE "orders" SET "fulfillment_status" = 'returned' WHERE "status" = 'completed' AND "fulfillment_status" = 'unfulfilled' AND EXISTS (SELECT 1 FROM "returns" WHERE "returns"."order_id" = "orders"."id" AND "returns"."status" = 'approved');--> statement-breakpoint
UPDATE "orders" SET "payment_status" = 'refunded' WHERE "status" = 'refunded';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_ck" CHECK ("orders"."status" IN ('pending','awaiting_payment','payment_verification','confirmed','processing','ready_for_pickup','shipped','completed','cancelled','refunded'));