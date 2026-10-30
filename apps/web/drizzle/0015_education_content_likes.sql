CREATE TABLE IF NOT EXISTS "education_content_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"content_type" varchar(10) NOT NULL,
	"content_id" uuid NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "education_content_likes_type_check" CHECK ("education_content_likes"."content_type" IN ('article', 'video'))
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "education_content_likes" ADD CONSTRAINT "education_content_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "education_content_likes_user_content_key" ON "education_content_likes" USING btree ("user_id" text_ops,"content_type" text_ops,"content_id" uuid_ops);
