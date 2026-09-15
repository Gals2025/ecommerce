CREATE TABLE "member_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"price" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_prices_price_ck" CHECK ("member_prices"."price" >= 0),
	CONSTRAINT "member_prices_scope_ck" CHECK (("member_prices"."variant_id" IS NULL) <> ("member_prices"."product_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"membership_no" text NOT NULL,
	"tier_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"payment_ref" text,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_membership_no_unique" UNIQUE("membership_no"),
	CONSTRAINT "memberships_status_ck" CHECK ("memberships"."status" IN ('pending','active','expired','suspended','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "snapshot_membership_no" text;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "membership_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "validity_days" integer;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "benefits" jsonb;--> statement-breakpoint
ALTER TABLE "member_prices" ADD CONSTRAINT "member_prices_tier_id_membership_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."membership_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_prices" ADD CONSTRAINT "member_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_prices" ADD CONSTRAINT "member_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tier_id_membership_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."membership_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_prices_tier_variant_uidx" ON "member_prices" USING btree ("tier_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_prices_tier_product_uidx" ON "member_prices" USING btree ("tier_id","product_id");--> statement-breakpoint
CREATE INDEX "member_prices_tier_idx" ON "member_prices" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "memberships_customer_idx" ON "memberships" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "memberships_status_idx" ON "memberships" USING btree ("status");--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_fee_ck" CHECK ("membership_tiers"."membership_fee" >= 0);--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_validity_ck" CHECK ("membership_tiers"."validity_days" IS NULL OR "membership_tiers"."validity_days" > 0);