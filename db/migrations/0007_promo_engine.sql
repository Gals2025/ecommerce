CREATE TABLE "order_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"code_id" uuid,
	"scope" text DEFAULT 'cart' NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_promotions_scope_ck" CHECK ("order_promotions"."scope" IN ('line','cart','shipping'))
);
--> statement-breakpoint
ALTER TABLE "promotions" DROP CONSTRAINT "promotions_kind_ck";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_waiver" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_code_id_promotion_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."promotion_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_promotions_order_idx" ON "order_promotions" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_kind_ck" CHECK ("promotions"."kind" IN ('percent','fixed','bogo','bundle','free_shipping'));