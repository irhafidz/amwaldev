-- Additive only (db/MIGRATION_RULES.md Rules 1-2): one nullable varchar column holding the
-- private storage object key of the proof (receipt photo / PDF) attached to a manually
-- recorded infaq donation. Existing rows stay NULL and the legacy app never selects it.
ALTER TABLE "infaq_orders" ADD COLUMN "bukti_transaksi" varchar(255);