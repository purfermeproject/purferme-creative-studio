ALTER TABLE "competitor_ads" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD COLUMN "focus" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;