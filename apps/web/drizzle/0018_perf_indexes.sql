-- Additive only (db/MIGRATION_RULES.md): read-path indexes. They only speed up
-- queries; the legacy app is unaffected. Plain CREATE INDEX takes a brief write
-- lock per table, which is negligible at current table sizes.
CREATE INDEX IF NOT EXISTS "transactions_status_created_at_idx" ON "transactions" USING btree ("status_pembayaran" enum_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_wakif_id_idx" ON "transactions" USING btree ("wakif_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waqf_orders_waqf_program_id_idx" ON "waqf_orders" USING btree ("waqf_program_id" text_ops);