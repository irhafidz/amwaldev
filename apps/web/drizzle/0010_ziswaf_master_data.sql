CREATE TABLE "jenis_infaq_master" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "jenis_infaq_master_kode_check" CHECK ("jenis_infaq_master"."kode" IN ('INFAQ_SUBUH', 'INFAQ_JUMAT', 'INFAQ_UMUM', 'SEDEKAH_YATIM', 'SEDEKAH_OPERASIONAL'))
);
--> statement-breakpoint
CREATE TABLE "jenis_zakat_master" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" "ZakatType" NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metode_infaq_master" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "jenis_infaq_master_kode_key" ON "jenis_infaq_master" USING btree ("kode" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "jenis_zakat_master_kode_key" ON "jenis_zakat_master" USING btree ("kode");