CREATE TABLE "creative_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source" text DEFAULT 'autosave' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"email" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "source_asset_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "objective" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "deliverable" text DEFAULT 'concept' NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "generation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "claims_reviewed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "claims_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "approved_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ingredients" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "messaging_priorities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "claim_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_versions_creative_idx" ON "creative_versions" USING btree ("creative_id","revision");