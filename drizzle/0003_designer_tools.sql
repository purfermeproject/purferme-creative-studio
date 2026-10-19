ALTER TABLE "assets" ADD COLUMN "kind" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "frame_index" integer;--> statement-breakpoint
ALTER TABLE "brand_settings" ADD COLUMN "kit" jsonb DEFAULT '{"logoUrl":null,"colors":{"primary":"#6b3f2a","accent":"#c8862a","text":"#ffffff","band":"#2b1d14"},"headingFont":{"name":"Bricolage Grotesque","url":null},"bodyFont":{"name":"Literata","url":null}}'::jsonb NOT NULL;