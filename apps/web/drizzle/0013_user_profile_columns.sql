ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_date" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb;
