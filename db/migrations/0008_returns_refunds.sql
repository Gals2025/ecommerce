ALTER TABLE "return_items" ADD COLUMN "disposition" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_ck" CHECK ("refunds"."amount" > 0);--> statement-breakpoint
UPDATE "refunds" SET "method" = 'gcash_manual' WHERE "method" IN ('gcash','maya');--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_method_ck" CHECK ("refunds"."method" IN ('cash','cod','bank_transfer','gcash_manual','pay_at_store'));--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_qty_ck" CHECK ("return_items"."qty" > 0);--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_disposition_ck" CHECK ("return_items"."disposition" IN ('pending','restock','damaged'));