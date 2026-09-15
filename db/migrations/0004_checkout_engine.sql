ALTER TABLE "payments" DROP CONSTRAINT "payments_method_ck";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_uidx" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
UPDATE "payments" SET "method" = 'gcash_manual' WHERE "method" IN ('gcash','maya');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_ck" CHECK ("payments"."method" IN ('cod','bank_transfer','gcash_manual','pay_at_store'));