-- Additive only (db/MIGRATION_RULES.md Rules 1-2): one nullable jsonb column so a
-- whole cow can carry 1-7 shohibul names (QA-13). The legacy Next.js app never
-- selects it; existing rows stay NULL and keep using `nama_shohibul`.
ALTER TABLE "qurban_orders" ADD COLUMN "nama_shohibul_list" jsonb;
