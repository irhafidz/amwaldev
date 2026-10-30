-- Additive only (db/MIGRATION_RULES.md Rules 1-2): one nullable text column holding
-- the official public contact an admin enters for a nazhir (D6). It is separate from
-- the account email/phone, which are never public. Legacy app never selects it.
ALTER TABLE "nadzir_profiles" ADD COLUMN "kontak_publik" text;
