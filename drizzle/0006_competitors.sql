CREATE TABLE "competitor_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"product" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"ad_text" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"image_asset_id" uuid,
	"analysis" jsonb,
	"analysis_model" text DEFAULT '' NOT NULL,
	"analysed_at" timestamp with time zone,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "photo_asset_ids" uuid[] DEFAULT '{}' NOT NULL;