-- Additive only (db/MIGRATION_RULES.md Rules 1-2): one nullable text column holding the
-- donor prayer typed on the wakaf donation form (Doa & Harapan). Zakat and infaq
-- already store theirs; the wakaf order silently dropped it. Existing rows stay NULL
-- and the legacy app never selects the column.
ALTER TABLE "waqf_orders" ADD COLUMN "doa" text;
