CREATE TABLE "homepage_cards" (
  "slot" text PRIMARY KEY NOT NULL,
  "eyebrow" text NOT NULL,
  "headline" text NOT NULL,
  "description" text NOT NULL,
  "aside_text" text DEFAULT '' NOT NULL,
  "button_text" text NOT NULL,
  "button_href" text NOT NULL,
  "theme" text NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "promotion_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "homepage_cards" ADD CONSTRAINT "homepage_cards_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;
