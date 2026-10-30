CREATE TABLE "affiliate_attributions" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"referrer_user_id" text NOT NULL,
	"referral_code" text NOT NULL,
	"captured_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"referral_code" text NOT NULL,
	"click_hash" text NOT NULL,
	"click_date" date NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_codes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "akad_acceptances" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"akad_template_id" text NOT NULL,
	"version" integer NOT NULL,
	"body_sha256" text NOT NULL,
	"accepted_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "akad_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "akad_templates_module_check" CHECK ("akad_templates"."module" IN ('WAKAF', 'ZAKAT', 'INFAQ', 'SEDEKAH', 'QURBAN')),
	CONSTRAINT "akad_templates_version_check" CHECK ("akad_templates"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "order_sequences" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"current_sequence" integer NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "order_sequences_current_sequence_range" CHECK ("order_sequences"."current_sequence" >= 1 AND "order_sequences"."current_sequence" <= 9999)
);
--> statement-breakpoint
CREATE TABLE "program_receipt_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"waqf_program_id" text NOT NULL,
	"progress_report_id" text,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"is_photo_evidence" boolean DEFAULT false NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "program_receipt_attachments_mime_type_check" CHECK ("program_receipt_attachments"."mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
	CONSTRAINT "program_receipt_attachments_file_size_check" CHECK ("program_receipt_attachments"."file_size" > 0 AND "program_receipt_attachments"."file_size" <= 5242880)
);
--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "published_at" timestamp(3);--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "education_contents" ADD COLUMN "status" text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "gamification_point_ledgers" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "gamification_point_ledgers" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "affiliate_codes" ADD CONSTRAINT "affiliate_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "akad_acceptances" ADD CONSTRAINT "akad_acceptances_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "akad_acceptances" ADD CONSTRAINT "akad_acceptances_akad_template_id_fkey" FOREIGN KEY ("akad_template_id") REFERENCES "public"."akad_templates"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "akad_templates" ADD CONSTRAINT "akad_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "program_receipt_attachments" ADD CONSTRAINT "program_receipt_attachments_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "program_receipt_attachments" ADD CONSTRAINT "program_receipt_attachments_progress_report_id_fkey" FOREIGN KEY ("progress_report_id") REFERENCES "public"."program_progress_reports"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "program_receipt_attachments" ADD CONSTRAINT "program_receipt_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "affiliate_attributions_referrer_idx" ON "affiliate_attributions" USING btree ("referrer_user_id" text_ops,"captured_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_clicks_code_hash_date_key" ON "affiliate_clicks" USING btree ("referral_code" text_ops,"click_hash" text_ops,"click_date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_codes_code_key" ON "affiliate_codes" USING btree ("code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "akad_templates_module_version_key" ON "akad_templates" USING btree ("module" text_ops,"version" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "akad_templates_one_active_per_module" ON "akad_templates" USING btree ("module" text_ops) WHERE "akad_templates"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "program_receipt_attachments_object_key_key" ON "program_receipt_attachments" USING btree ("object_key" text_ops);--> statement-breakpoint
CREATE INDEX "program_receipt_attachments_program_idx" ON "program_receipt_attachments" USING btree ("waqf_program_id" text_ops,"created_at" timestamp_ops);--> statement-breakpoint
ALTER TABLE "education_contents" ADD CONSTRAINT "education_contents_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "education_contents_slug_key" ON "education_contents" USING btree ("slug" text_ops) WHERE "education_contents"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "education_contents_status_published_idx" ON "education_contents" USING btree ("status" text_ops,"published_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "gamification_point_ledgers_idempotency_key_key" ON "gamification_point_ledgers" USING btree ("idempotency_key" text_ops);--> statement-breakpoint
CREATE INDEX "gamification_point_ledgers_user_created_idx" ON "gamification_point_ledgers" USING btree ("user_id" text_ops,"created_at" timestamp_ops);--> statement-breakpoint
ALTER TABLE "education_contents" ADD CONSTRAINT "education_contents_status_check" CHECK ("education_contents"."status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));