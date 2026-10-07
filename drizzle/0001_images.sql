CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime" text NOT NULL,
	"data_base64" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "image_ids" uuid[] DEFAULT '{}' NOT NULL;