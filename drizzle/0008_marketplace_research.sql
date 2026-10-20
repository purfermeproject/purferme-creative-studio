CREATE TABLE "market_playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"category" text NOT NULL,
	"product_id" uuid,
	"summary" text DEFAULT '' NOT NULL,
	"playbook" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD COLUMN "listing" jsonb;--> statement-breakpoint
ALTER TABLE "market_playbooks" ADD CONSTRAINT "market_playbooks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;