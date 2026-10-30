CREATE TABLE "education_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"cover_image_url" text,
	"author_name" varchar(150) DEFAULT 'Super Admin Edukasi Amwal' NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "education_categories_type_check" CHECK ("education_categories"."type" IN ('article', 'video'))
);
--> statement-breakpoint
CREATE TABLE "education_quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_key" varchar(5) NOT NULL,
	"explanation" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"title" varchar(255) NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"video_url" text NOT NULL,
	"speaker" varchar(150),
	"thumbnail_url" text NOT NULL,
	"description" text,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "education_videos_source_type_check" CHECK ("education_videos"."source_type" IN ('upload', 'embed'))
);
--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "likes_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "program_receipt_attachments" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "program_receipt_attachments" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "program_receipt_attachments" ADD COLUMN "nominal" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN "kode_program" varchar(8);--> statement-breakpoint
ALTER TABLE "education_articles" ADD CONSTRAINT "education_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."education_categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "education_quiz_questions" ADD CONSTRAINT "education_quiz_questions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."education_articles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "education_videos" ADD CONSTRAINT "education_videos_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."education_categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "education_articles_slug_key" ON "education_articles" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "education_categories_slug_key" ON "education_categories" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "waqf_programs_kode_program_key" ON "waqf_programs" USING btree ("kode_program" text_ops);