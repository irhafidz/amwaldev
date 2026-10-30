-- Additive only (db/MIGRATION_RULES.md): a new table for email OTP password reset.
-- Stores only an HMAC of the code; rows are short-lived and single-use.
CREATE TABLE IF NOT EXISTS "password_reset_otps" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"consumed_at" timestamp(3),
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_otps" ADD CONSTRAINT "password_reset_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_otps_email_created_idx" ON "password_reset_otps" USING btree ("email" text_ops,"created_at" timestamp_ops);