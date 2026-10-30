CREATE TABLE "infaq_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text,
	"nama_penginfaq" text NOT NULL,
	"telepon_penginfaq" text,
	"email_penginfaq" text,
	"nominal" numeric(18, 2) NOT NULL,
	"jenis" text NOT NULL,
	"doa" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"snap_token" text,
	"snap_redirect_url" text,
	"transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infaq_orders_jenis_check" CHECK ("infaq_orders"."jenis" IN ('INFAQ_SUBUH', 'INFAQ_JUMAT', 'INFAQ_UMUM', 'SEDEKAH_YATIM', 'SEDEKAH_OPERASIONAL')),
	CONSTRAINT "infaq_orders_status_check" CHECK ("infaq_orders"."status" IN ('PENDING', 'SETTLED', 'EXPIRED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "infaq_orders" ADD CONSTRAINT "infaq_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "infaq_orders" ADD CONSTRAINT "infaq_orders_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "infaq_orders_order_id_key" ON "infaq_orders" USING btree ("order_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "infaq_orders_transaction_id_key" ON "infaq_orders" USING btree ("transaction_id" text_ops);