-- Additive only (db/MIGRATION_RULES.md Rules 1-2): one nullable text column for the
-- BWI registration number an admin types while verifying a nazhir (D6). The
-- legacy Next.js app never selects it; existing rows stay NULL.
ALTER TABLE "nadzir_profiles" ADD COLUMN "nomor_registrasi_bwi" text;
