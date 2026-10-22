CREATE TABLE "shopify_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"product_ids" uuid[] DEFAULT '{}' NOT NULL,
	"listing" jsonb NOT NULL,
	"image_ids" uuid[] DEFAULT '{}' NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_store" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
