ALTER TABLE "hewan_batches" ADD COLUMN "nama_batch" text;--> statement-breakpoint
ALTER TABLE "hewan_batches" ADD COLUMN "lokasi_rph" text;--> statement-breakpoint
ALTER TABLE "hewan_batches" ADD COLUMN "tim_juleha" text;--> statement-breakpoint
ALTER TABLE "hewan_batches" ADD COLUMN "dokumentasi_video_url" text;--> statement-breakpoint
ALTER TABLE "hewan_batches" ADD COLUMN "dokumentasi_media" jsonb;--> statement-breakpoint
ALTER TABLE "qurban_orders" ADD COLUMN "nama_shohibul" text;--> statement-breakpoint
ALTER TABLE "qurban_orders" ADD COLUMN "laporan_terkirim_at" timestamp(3);