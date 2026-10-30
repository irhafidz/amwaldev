CREATE TABLE "education_article_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" text,
	"author_name" varchar(150) NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" text,
	"score" integer NOT NULL,
	"correct_count" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "education_article_comments" ADD CONSTRAINT "education_article_comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."education_articles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "education_article_comments" ADD CONSTRAINT "education_article_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "education_quiz_attempts" ADD CONSTRAINT "education_quiz_attempts_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."education_articles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "education_quiz_attempts" ADD CONSTRAINT "education_quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;