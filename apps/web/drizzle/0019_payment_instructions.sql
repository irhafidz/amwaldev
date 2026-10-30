-- Additive only (db/MIGRATION_RULES.md Rules 1-2): three nullable columns so a
-- pending payment can be resumed after the donor closes the tab (QA-02). The
-- legacy Next.js app never selects them; existing rows stay NULL.
ALTER TABLE "transactions" ADD COLUMN "payment_instructions" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_url" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_expires_at" timestamp(3);