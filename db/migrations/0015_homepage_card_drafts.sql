ALTER TABLE "homepage_cards" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "homepage_cards" ADD COLUMN "draft_updated_at" timestamp with time zone;
