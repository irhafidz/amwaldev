ALTER TABLE "fund_withdrawal_requests" ADD COLUMN "reviewed_at" timestamp(3);--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN "verification_status" "VerificationStatus" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN "verified_by_id" text;--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN "verified_at" timestamp(3);