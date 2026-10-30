CREATE TYPE "public"."Asnaf" AS ENUM('FAKIR', 'MISKIN', 'AMIL', 'MUALLAF', 'RIQAB', 'GHARIMIN', 'FISABILILLAH', 'IBNU_SABIL');--> statement-breakpoint
CREATE TYPE "public"."BentukWakaf" AS ENUM('UANG', 'BARANG');--> statement-breakpoint
CREATE TYPE "public"."ChatbotDomain" AS ENUM('WAKAF_PRODUKTIF');--> statement-breakpoint
CREATE TYPE "public"."ChatbotRole" AS ENUM('USER', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."EducationType" AS ENUM('ARTIKEL', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."GoldPriceSource" AS ENUM('LIVE_API', 'MANUAL_FALLBACK');--> statement-breakpoint
CREATE TYPE "public"."HewanBatchStatus" AS ENUM('TERSEDIA', 'PENUH', 'SELESAI');--> statement-breakpoint
CREATE TYPE "public"."HewanType" AS ENUM('SAPI', 'KAMBING');--> statement-breakpoint
CREATE TYPE "public"."Kepemilikan" AS ENUM('INDIVIDU', 'KOLEKTIF');--> statement-breakpoint
CREATE TYPE "public"."MetodeBayar" AS ENUM('TUNAI', 'TRANSFER', 'QRIS', 'VA');--> statement-breakpoint
CREATE TYPE "public"."NadzirDocumentType" AS ENUM('KTP', 'SERTIFIKAT_BWI');--> statement-breakpoint
CREATE TYPE "public"."NadzirKategori" AS ENUM('PERSEORANGAN', 'ORGANISASI', 'BADAN_HUKUM');--> statement-breakpoint
CREATE TYPE "public"."OAuthProvider" AS ENUM('GOOGLE', 'FACEBOOK');--> statement-breakpoint
CREATE TYPE "public"."OpsiPesan" AS ENUM('PASRAH', 'AMBIL_SENDIRI');--> statement-breakpoint
CREATE TYPE "public"."PermohonanStatus" AS ENUM('DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DISALURKAN');--> statement-breakpoint
CREATE TYPE "public"."QurbanPaymentStatus" AS ENUM('BELUM_BAYAR', 'DP', 'LUNAS');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('WAKIF', 'NADZIR', 'ADMIN', 'PETUGAS_LAPANGAN');--> statement-breakpoint
CREATE TYPE "public"."SlotStatus" AS ENUM('TERSEDIA', 'TERISI', 'TERJUAL', 'DIBATALKAN');--> statement-breakpoint
CREATE TYPE "public"."TransactionPaymentStatus" AS ENUM('PENDING', 'DP', 'LUNAS', 'GAGAL');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('WAKAF', 'ZAKAT', 'INFAQ', 'QURBAN');--> statement-breakpoint
CREATE TYPE "public"."VerificationStatus" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."WaqfOrderStatus" AS ENUM('MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK');--> statement-breakpoint
CREATE TYPE "public"."WaqfStatus" AS ENUM('DRAFT', 'LIVE', 'SELESAI');--> statement-breakpoint
CREATE TYPE "public"."WaqfType" AS ENUM('HABIS_PAKAI', 'PRODUKTIF_KEKAL');--> statement-breakpoint
CREATE TYPE "public"."WithdrawalStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED');--> statement-breakpoint
CREATE TYPE "public"."ZakatDistributionStatus" AS ENUM('TERSALURKAN', 'DIBATALKAN');--> statement-breakpoint
CREATE TYPE "public"."ZakatOrderStatus" AS ENUM('MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK');--> statement-breakpoint
CREATE TYPE "public"."ZakatPaymentMethod" AS ENUM('TUNAI', 'TRANSFER', 'BERAS');--> statement-breakpoint
CREATE TYPE "public"."ZakatType" AS ENUM('FITRAH', 'MAAL_PENGHASILAN', 'FIDYAH', 'KAFARAT', 'EMAS', 'PERUSAHAAN', 'PERTANIAN');--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"jenis_sertifikat" text,
	"nomor_internal_amwal" text NOT NULL,
	"nomor_registrasi_bwi" text,
	"pdf_url" text,
	"issued_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"domain_scope" "ChatbotDomain" DEFAULT 'WAKAF_PRODUKTIF' NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "ChatbotRole" NOT NULL,
	"content" text NOT NULL,
	"cited_sources" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_contents" (
	"id" text PRIMARY KEY NOT NULL,
	"judul" text NOT NULL,
	"tipe" "EducationType" NOT NULL,
	"konten_url" text,
	"kategori" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_pools" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_distributed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_withdrawal_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"waqf_program_id" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"peruntukan" text,
	"rekening_tujuan" text,
	"admin_notes" text,
	"requested_by_id" text NOT NULL,
	"approved_by_id" text,
	"status" "WithdrawalStatus" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_point_ledgers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"points_earned" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hewan_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"jenis_hewan" "HewanType" NOT NULL,
	"total_slot" integer DEFAULT 1 NOT NULL,
	"harga_per_slot" numeric(18, 2) NOT NULL,
	"status" "HewanBatchStatus" DEFAULT 'TERSEDIA' NOT NULL,
	"ras" text,
	"kelas_grade" text,
	"estimasi_berat_kg" numeric(10, 2),
	"jenis_kelamin" text,
	"wilayah_penyaluran" text,
	"target_penerima_manfaat" integer,
	"tanggal_penyembelihan_estimasi" date,
	"galeri_foto_urls" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mauquf_alaih_distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"waqf_program_id" text NOT NULL,
	"withdrawal_request_id" text,
	"nama_penerima_manfaat" text NOT NULL,
	"kategori_penerima" text,
	"nominal_disalurkan" numeric(18, 2),
	"barang_disalurkan" text,
	"tanggal_penyaluran" date,
	"bukti_penyaluran_url" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "mustahiq_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"nama_mustahiq" text NOT NULL,
	"nik" text,
	"kategori_asnaf" "Asnaf" NOT NULL,
	"alamat" text,
	"no_telepon" text,
	"status_verifikasi" "VerificationStatus" DEFAULT 'PENDING' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nadzir_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"nadzir_profile_id" text NOT NULL,
	"tipe_dokumen" "NadzirDocumentType" NOT NULL,
	"file_url" text,
	"file_deleted_at" timestamp(3),
	"ocr_extracted_nik" text,
	"ocr_extracted_nama" text,
	"ocr_confidence_score" numeric(5, 2),
	"reviewed_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nadzir_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kategori" "NadzirKategori" NOT NULL,
	"nama_lembaga" text,
	"nomor_rekening_bank" text,
	"nama_bank" text,
	"status_verifikasi" "VerificationStatus" DEFAULT 'PENDING' NOT NULL,
	"verified_by_id" text,
	"verified_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_entity_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permohonan_penyaluran_institusional" (
	"id" text PRIMARY KEY NOT NULL,
	"nama_pemohon" text NOT NULL,
	"nama_lembaga" text,
	"alamat_pemohon" text,
	"nomor_surat_permohonan" text,
	"kontak" text,
	"penanggung_jawab" text,
	"nomor_rekening_pemohon" text,
	"nama_bank" text,
	"status" "PermohonanStatus" DEFAULT 'DIAJUKAN' NOT NULL,
	"admin_notes" text,
	"alokasi_daging_disetujui_kg" numeric(10, 2),
	"approved_by_admin_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petugas_lapangan_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wilayah_tugas" text,
	"no_hp" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_progress_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"waqf_program_id" text NOT NULL,
	"persentase_fisik" numeric(5, 2),
	"deskripsi" text,
	"kuitansi_urls" jsonb,
	"created_by_id" text NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"user_id" text NOT NULL,
	"skor" numeric(5, 2),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"pertanyaan" text NOT NULL,
	"opsi_jawaban" jsonb NOT NULL,
	"jawaban_benar" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" text PRIMARY KEY NOT NULL,
	"education_content_id" text,
	"judul" text NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qurban_animal_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"hewan_batch_id" text NOT NULL,
	"nomor_slot" integer NOT NULL,
	"qurban_order_id" text,
	"status" "SlotStatus" DEFAULT 'TERSEDIA' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qurban_distribution_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"permohonan_id" text,
	"qurban_order_id" text,
	"hewan_batch_id" text NOT NULL,
	"jumlah_bagian" numeric(10, 2),
	"tanggal_salur" date,
	"bukti_foto_url" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qurban_distribution_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"qurban_order_id" text NOT NULL,
	"bukti_foto_url" text,
	"lokasi_penyaluran" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qurban_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"wakif_id" text,
	"nama_pengqurban" text NOT NULL,
	"telepon_pengqurban" text,
	"alamat_pengqurban" text,
	"jenis_hewan" "HewanType" NOT NULL,
	"tipe_kepemilikan" "Kepemilikan" NOT NULL,
	"opsi_pesan" "OpsiPesan" DEFAULT 'PASRAH' NOT NULL,
	"metode_pembayaran" "MetodeBayar" NOT NULL,
	"status_pembayaran" "QurbanPaymentStatus" DEFAULT 'BELUM_BAYAR' NOT NULL,
	"total_harga" numeric(18, 2) NOT NULL,
	"nominal_dibayar" numeric(18, 2) DEFAULT '0' NOT NULL,
	"sisa_tagihan" numeric(18, 2) DEFAULT '0' NOT NULL,
	"entered_by_petugas_id" text,
	"transaction_id" text,
	"akad_wakalah_text" text,
	"akad_wakalah_accepted_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"revoked_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setoran_petugas_lapangan" (
	"id" text PRIMARY KEY NOT NULL,
	"petugas_id" text NOT NULL,
	"nomor_urut" integer,
	"tanggal" date NOT NULL,
	"jumlah_setor" numeric(18, 2) NOT NULL,
	"keterangan" text,
	"verified_by_admin_id" text,
	"verified_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setoran_qurban_order_links" (
	"id" text PRIMARY KEY NOT NULL,
	"setoran_id" text NOT NULL,
	"qurban_order_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"wakif_id" text NOT NULL,
	"jenis_transaksi" "TransactionType" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"payment_method" text,
	"payment_gateway_ref" text,
	"status_pembayaran" "TransactionPaymentStatus" DEFAULT 'PENDING' NOT NULL,
	"disbursement_destination" text NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"name" text NOT NULL,
	"role" "Role" DEFAULT 'WAKIF' NOT NULL,
	"oauth_provider" "OAuthProvider",
	"oauth_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waqf_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"nomor_kwitansi" text NOT NULL,
	"waqf_program_id" text NOT NULL,
	"wakif_id" text,
	"nama_wakif" text NOT NULL,
	"no_telepon" text,
	"alamat" text,
	"atas_nama_wakif" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"bentuk_wakaf" "BentukWakaf" NOT NULL,
	"nominal" numeric(18, 2),
	"nama_barang" text,
	"jumlah_satuan" integer,
	"nilai_taksiran_rupiah" numeric(18, 2),
	"metode_pembayaran" "MetodeBayar",
	"status" "WaqfOrderStatus" DEFAULT 'MENUNGGU_VERIFIKASI' NOT NULL,
	"entered_by_amil_id" text,
	"transaction_id" text,
	"nomor_ikrar_wakaf" text,
	"dokumen_aiw_url" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waqf_principal_ledgers" (
	"id" text PRIMARY KEY NOT NULL,
	"waqf_program_id" text NOT NULL,
	"pokok_dana_terkumpul" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_hasil_available" numeric(18, 2) DEFAULT '0' NOT NULL,
	"hasil_investasi_tersalurkan" numeric(18, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waqf_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"nadzir_profile_id" text NOT NULL,
	"judul" text NOT NULL,
	"kategori" text,
	"deskripsi" text,
	"target_dana" numeric(18, 2) NOT NULL,
	"durasi_hari" integer,
	"banner_url" text,
	"jenis_wakaf" "WaqfType" NOT NULL,
	"status" "WaqfStatus" DEFAULT 'DRAFT' NOT NULL,
	"rab_document_url" text,
	"dokumen_legalitas_url" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waqf_yield_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"waqf_program_id" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"source_description" text NOT NULL,
	"recorded_by_admin_id" text NOT NULL,
	"recorded_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wilayah" (
	"kode" varchar(13) PRIMARY KEY NOT NULL,
	"nama" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zakat_calculations" (
	"id" text PRIMARY KEY NOT NULL,
	"wakif_id" text NOT NULL,
	"jenis_zakat" "ZakatType" NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"nisab_digunakan" numeric(18, 2),
	"hasil_kewajiban" numeric(18, 2),
	"zakat_order_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zakat_distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"mustahiq_id" text NOT NULL,
	"jenis_zakat" "ZakatType" NOT NULL,
	"nominal" numeric(18, 2),
	"berat_beras_kg" numeric(10, 2),
	"bukti_penerimaan_url" text,
	"status" "ZakatDistributionStatus" DEFAULT 'TERSALURKAN' NOT NULL,
	"notes" text,
	"distributed_by_amil_id" text NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zakat_fitrah_config" (
	"id" text PRIMARY KEY NOT NULL,
	"jenis_beras" text NOT NULL,
	"konversi_harga_per_jiwa" numeric(18, 2) NOT NULL,
	"referensi_sk" text,
	"tahun_berlaku" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zakat_gold_price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"price_per_gram" numeric(18, 2) NOT NULL,
	"source" "GoldPriceSource" NOT NULL,
	"fetched_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zakat_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tahun_hijriah" text,
	"nomor_kwitansi" text NOT NULL,
	"muzakki_id" text,
	"nama_muzakki" text NOT NULL,
	"nama_dizakatkan" text,
	"no_telepon" text,
	"alamat" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"jenis_zakat" "ZakatType" NOT NULL,
	"metode_pembayaran" "ZakatPaymentMethod" NOT NULL,
	"nominal" numeric(18, 2),
	"berat_beras_kg" numeric(10, 2),
	"jumlah_jiwa" integer,
	"bukti_transfer_url" text,
	"status" "ZakatOrderStatus" DEFAULT 'MENUNGGU_VERIFIKASI' NOT NULL,
	"notes" text,
	"entered_by_amil_id" text,
	"transaction_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chatbot_conversations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fund_withdrawal_requests" ADD CONSTRAINT "fund_withdrawal_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fund_withdrawal_requests" ADD CONSTRAINT "fund_withdrawal_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fund_withdrawal_requests" ADD CONSTRAINT "fund_withdrawal_requests_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "gamification_point_ledgers" ADD CONSTRAINT "gamification_point_ledgers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mauquf_alaih_distributions" ADD CONSTRAINT "mauquf_alaih_distributions_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mauquf_alaih_distributions" ADD CONSTRAINT "mauquf_alaih_distributions_withdrawal_request_id_fkey" FOREIGN KEY ("withdrawal_request_id") REFERENCES "public"."fund_withdrawal_requests"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nadzir_documents" ADD CONSTRAINT "nadzir_documents_nadzir_profile_id_fkey" FOREIGN KEY ("nadzir_profile_id") REFERENCES "public"."nadzir_profiles"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nadzir_profiles" ADD CONSTRAINT "nadzir_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nadzir_profiles" ADD CONSTRAINT "nadzir_profiles_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "permohonan_penyaluran_institusional" ADD CONSTRAINT "permohonan_penyaluran_institusional_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "petugas_lapangan_profiles" ADD CONSTRAINT "petugas_lapangan_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "program_progress_reports" ADD CONSTRAINT "program_progress_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "program_progress_reports" ADD CONSTRAINT "program_progress_reports_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_education_content_id_fkey" FOREIGN KEY ("education_content_id") REFERENCES "public"."education_contents"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_animal_slots" ADD CONSTRAINT "qurban_animal_slots_hewan_batch_id_fkey" FOREIGN KEY ("hewan_batch_id") REFERENCES "public"."hewan_batches"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_animal_slots" ADD CONSTRAINT "qurban_animal_slots_qurban_order_id_fkey" FOREIGN KEY ("qurban_order_id") REFERENCES "public"."qurban_orders"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_distribution_allocations" ADD CONSTRAINT "qurban_distribution_allocations_hewan_batch_id_fkey" FOREIGN KEY ("hewan_batch_id") REFERENCES "public"."hewan_batches"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_distribution_allocations" ADD CONSTRAINT "qurban_distribution_allocations_permohonan_id_fkey" FOREIGN KEY ("permohonan_id") REFERENCES "public"."permohonan_penyaluran_institusional"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_distribution_allocations" ADD CONSTRAINT "qurban_distribution_allocations_qurban_order_id_fkey" FOREIGN KEY ("qurban_order_id") REFERENCES "public"."qurban_orders"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_distribution_reports" ADD CONSTRAINT "qurban_distribution_reports_qurban_order_id_fkey" FOREIGN KEY ("qurban_order_id") REFERENCES "public"."qurban_orders"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_orders" ADD CONSTRAINT "qurban_orders_entered_by_petugas_id_fkey" FOREIGN KEY ("entered_by_petugas_id") REFERENCES "public"."petugas_lapangan_profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_orders" ADD CONSTRAINT "qurban_orders_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "qurban_orders" ADD CONSTRAINT "qurban_orders_wakif_id_fkey" FOREIGN KEY ("wakif_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "setoran_petugas_lapangan" ADD CONSTRAINT "setoran_petugas_lapangan_petugas_id_fkey" FOREIGN KEY ("petugas_id") REFERENCES "public"."petugas_lapangan_profiles"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "setoran_petugas_lapangan" ADD CONSTRAINT "setoran_petugas_lapangan_verified_by_admin_id_fkey" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "setoran_qurban_order_links" ADD CONSTRAINT "setoran_qurban_order_links_qurban_order_id_fkey" FOREIGN KEY ("qurban_order_id") REFERENCES "public"."qurban_orders"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "setoran_qurban_order_links" ADD CONSTRAINT "setoran_qurban_order_links_setoran_id_fkey" FOREIGN KEY ("setoran_id") REFERENCES "public"."setoran_petugas_lapangan"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wakif_id_fkey" FOREIGN KEY ("wakif_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_orders" ADD CONSTRAINT "waqf_orders_entered_by_amil_id_fkey" FOREIGN KEY ("entered_by_amil_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_orders" ADD CONSTRAINT "waqf_orders_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_orders" ADD CONSTRAINT "waqf_orders_wakif_id_fkey" FOREIGN KEY ("wakif_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_orders" ADD CONSTRAINT "waqf_orders_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_principal_ledgers" ADD CONSTRAINT "waqf_principal_ledgers_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_programs" ADD CONSTRAINT "waqf_programs_nadzir_profile_id_fkey" FOREIGN KEY ("nadzir_profile_id") REFERENCES "public"."nadzir_profiles"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waqf_yield_entries" ADD CONSTRAINT "waqf_yield_entries_waqf_program_id_fkey" FOREIGN KEY ("waqf_program_id") REFERENCES "public"."waqf_programs"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_calculations" ADD CONSTRAINT "zakat_calculations_wakif_id_fkey" FOREIGN KEY ("wakif_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_calculations" ADD CONSTRAINT "zakat_calculations_zakat_order_id_fkey" FOREIGN KEY ("zakat_order_id") REFERENCES "public"."zakat_orders"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_distributions" ADD CONSTRAINT "zakat_distributions_distributed_by_amil_id_fkey" FOREIGN KEY ("distributed_by_amil_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_distributions" ADD CONSTRAINT "zakat_distributions_mustahiq_id_fkey" FOREIGN KEY ("mustahiq_id") REFERENCES "public"."mustahiq_profiles"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_orders" ADD CONSTRAINT "zakat_orders_entered_by_amil_id_fkey" FOREIGN KEY ("entered_by_amil_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_orders" ADD CONSTRAINT "zakat_orders_muzakki_id_fkey" FOREIGN KEY ("muzakki_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "zakat_orders" ADD CONSTRAINT "zakat_orders_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_nomor_internal_amwal_key" ON "certificates" USING btree ("nomor_internal_amwal");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_transaction_id_key" ON "certificates" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_pools_kode_key" ON "fund_pools" USING btree ("kode");--> statement-breakpoint
CREATE UNIQUE INDEX "nadzir_profiles_user_id_key" ON "nadzir_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "petugas_lapangan_profiles_user_id_key" ON "petugas_lapangan_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qurban_animal_slots_hewan_batch_id_nomor_slot_key" ON "qurban_animal_slots" USING btree ("hewan_batch_id","nomor_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "qurban_orders_transaction_id_key" ON "qurban_orders" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "setoran_qurban_order_links_setoran_id_qurban_order_id_key" ON "setoran_qurban_order_links" USING btree ("setoran_id","qurban_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_payment_gateway_ref_key" ON "transactions" USING btree ("payment_gateway_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oauth_provider_oauth_id_key" ON "users" USING btree ("oauth_provider","oauth_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "waqf_orders_nomor_kwitansi_key" ON "waqf_orders" USING btree ("nomor_kwitansi");--> statement-breakpoint
CREATE UNIQUE INDEX "waqf_orders_transaction_id_key" ON "waqf_orders" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waqf_principal_ledgers_waqf_program_id_key" ON "waqf_principal_ledgers" USING btree ("waqf_program_id");--> statement-breakpoint
CREATE INDEX "wilayah_nama_idx" ON "wilayah" USING btree ("nama");--> statement-breakpoint
CREATE UNIQUE INDEX "zakat_orders_nomor_kwitansi_key" ON "zakat_orders" USING btree ("nomor_kwitansi");--> statement-breakpoint
CREATE UNIQUE INDEX "zakat_orders_transaction_id_key" ON "zakat_orders" USING btree ("transaction_id");
