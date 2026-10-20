CREATE TABLE "idea_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"platform" text NOT NULL,
	"creative_type" text NOT NULL,
	"placement" text DEFAULT '' NOT NULL,
	"proposals" jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_sets" ADD CONSTRAINT "idea_sets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;