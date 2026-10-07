CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "brand_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"brand_context" text DEFAULT '' NOT NULL,
	"hard_rules" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"angles" text[] DEFAULT '{}' NOT NULL,
	"personas" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"verdict_thresholds" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"regex" text NOT NULL,
	"severity" text NOT NULL,
	"platform" text,
	"product_slug" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"product_id" uuid,
	"creative_type" text NOT NULL,
	"title" text NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"angle" text DEFAULT '' NOT NULL,
	"format" text DEFAULT '' NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"frames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"copy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_prompt" text DEFAULT '' NOT NULL,
	"needs_real_person" boolean DEFAULT false NOT NULL,
	"ai_label_needed" boolean DEFAULT false NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why_it_fits" text DEFAULT '' NOT NULL,
	"scan_result" jsonb DEFAULT '{"hits":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"qa_checked" integer[] DEFAULT '{}' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user" text NOT NULL,
	"kind" text DEFAULT 'generate' NOT NULL,
	"platform" text,
	"product_id" uuid,
	"prompt_hash" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_rules" (
	"platform" text PRIMARY KEY NOT NULL,
	"creative_types" text[] DEFAULT '{}' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"guide_markdown" text DEFAULT '' NOT NULL,
	"comparison" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"price_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"status_reason" text DEFAULT '' NOT NULL,
	"green_claims" text[] DEFAULT '{}' NOT NULL,
	"amber_claims" text[] DEFAULT '{}' NOT NULL,
	"red_claims" text[] DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"allergens" text DEFAULT '' NOT NULL,
	"pack_image_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" uuid,
	"platform" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verdict" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;