ALTER TABLE "qurban_distribution_reports" ADD COLUMN "lokasi_lat" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "qurban_distribution_reports" ADD COLUMN "lokasi_lng" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "qurban_distribution_reports" ADD COLUMN "jumlah_penerima" integer;--> statement-breakpoint
ALTER TABLE "zakat_distributions" ADD COLUMN "lokasi_lat" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "zakat_distributions" ADD COLUMN "lokasi_lng" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "zakat_distributions" ADD COLUMN "jumlah_penerima" integer;