CREATE TABLE "infaq_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"jenis" text NOT NULL,
	"deskripsi" text,
	"target" numeric(18, 2),
	"status" text DEFAULT 'AKTIF' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infaq_programs_jenis_check" CHECK ("infaq_programs"."jenis" IN ('INFAQ_SUBUH', 'INFAQ_JUMAT', 'INFAQ_UMUM', 'SEDEKAH_YATIM', 'SEDEKAH_OPERASIONAL')),
	CONSTRAINT "infaq_programs_status_check" CHECK ("infaq_programs"."status" IN ('AKTIF', 'SELESAI', 'DRAF'))
);
--> statement-breakpoint
ALTER TABLE "infaq_orders" ADD COLUMN "program_id" text;--> statement-breakpoint
ALTER TABLE "infaq_orders" ADD COLUMN "metode_manual" text;--> statement-breakpoint
ALTER TABLE "infaq_orders" ADD CONSTRAINT "infaq_orders_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."infaq_programs"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "infaq_orders_program_id_idx" ON "infaq_orders" USING btree ("program_id" text_ops);