ALTER TABLE "waqf_programs" ADD COLUMN IF NOT EXISTS "nama_bank" text;--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN IF NOT EXISTS "nomor_rekening_bank" text;--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD COLUMN IF NOT EXISTS "atas_nama_rekening" text;