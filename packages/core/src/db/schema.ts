import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { PaymentInstructions } from '../payment/types';

export const asnaf = pgEnum('Asnaf', [
  'FAKIR',
  'MISKIN',
  'AMIL',
  'MUALLAF',
  'RIQAB',
  'GHARIMIN',
  'FISABILILLAH',
  'IBNU_SABIL',
]);
export const bentukWakaf = pgEnum('BentukWakaf', ['UANG', 'BARANG']);
export const chatbotDomain = pgEnum('ChatbotDomain', ['WAKAF_PRODUKTIF']);
export const chatbotRole = pgEnum('ChatbotRole', ['USER', 'ASSISTANT']);
export const educationType = pgEnum('EducationType', ['ARTIKEL', 'VIDEO']);
export const goldPriceSource = pgEnum('GoldPriceSource', [
  'LIVE_API',
  'MANUAL_FALLBACK',
]);
export const hewanBatchStatus = pgEnum('HewanBatchStatus', [
  'TERSEDIA',
  'PENUH',
  'SELESAI',
]);
export const hewanType = pgEnum('HewanType', ['SAPI', 'KAMBING']);
export const kepemilikan = pgEnum('Kepemilikan', ['INDIVIDU', 'KOLEKTIF']);
export const metodeBayar = pgEnum('MetodeBayar', [
  'TUNAI',
  'TRANSFER',
  'QRIS',
  'VA',
]);
export const nadzirDocumentType = pgEnum('NadzirDocumentType', [
  'KTP',
  'SERTIFIKAT_BWI',
]);
export const nadzirKategori = pgEnum('NadzirKategori', [
  'PERSEORANGAN',
  'ORGANISASI',
  'BADAN_HUKUM',
]);
export const oauthProvider = pgEnum('OAuthProvider', ['GOOGLE', 'FACEBOOK']);
export const opsiPesan = pgEnum('OpsiPesan', ['PASRAH', 'AMBIL_SENDIRI']);
export const permohonanStatus = pgEnum('PermohonanStatus', [
  'DIAJUKAN',
  'DISETUJUI',
  'DITOLAK',
  'DISALURKAN',
]);
export const qurbanPaymentStatus = pgEnum('QurbanPaymentStatus', [
  'BELUM_BAYAR',
  'DP',
  'LUNAS',
]);
export const role = pgEnum('Role', [
  'WAKIF',
  'NADZIR',
  'ADMIN',
  'PETUGAS_LAPANGAN',
  'BENDAHARA',
]);
export const slotStatus = pgEnum('SlotStatus', [
  'TERSEDIA',
  'TERISI',
  'TERJUAL',
  'DIBATALKAN',
]);
export const transactionPaymentStatus = pgEnum('TransactionPaymentStatus', [
  'PENDING',
  'DP',
  'LUNAS',
  'GAGAL',
]);
export const transactionType = pgEnum('TransactionType', [
  'WAKAF',
  'ZAKAT',
  'INFAQ',
  'QURBAN',
]);
export const verificationStatus = pgEnum('VerificationStatus', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);
export const waqfOrderStatus = pgEnum('WaqfOrderStatus', [
  'MENUNGGU_VERIFIKASI',
  'TERVERIFIKASI',
  'DITOLAK',
]);
export const waqfStatus = pgEnum('WaqfStatus', ['DRAFT', 'LIVE', 'SELESAI']);
export const waqfType = pgEnum('WaqfType', ['HABIS_PAKAI', 'PRODUKTIF_KEKAL']);
export const withdrawalStatus = pgEnum('WithdrawalStatus', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
]);
export const zakatDistributionStatus = pgEnum('ZakatDistributionStatus', [
  'TERSALURKAN',
  'DIBATALKAN',
]);
export const zakatOrderStatus = pgEnum('ZakatOrderStatus', [
  'MENUNGGU_VERIFIKASI',
  'TERVERIFIKASI',
  'DITOLAK',
]);
export const zakatPaymentMethod = pgEnum('ZakatPaymentMethod', [
  'TUNAI',
  'TRANSFER',
  'BERAS',
]);
export const zakatType = pgEnum('ZakatType', [
  'FITRAH',
  'MAAL_PENGHASILAN',
  'FIDYAH',
  'KAFARAT',
  'EMAS',
  'PERUSAHAAN',
  'PERTANIAN',
]);

export const waqfPrograms = pgTable(
  'waqf_programs',
  {
    id: text().primaryKey().notNull(),
    nadzirProfileId: text('nadzir_profile_id').notNull(),
    kodeProgram: varchar('kode_program', { length: 8 }),
    judul: text().notNull(),
    kategori: text(),
    deskripsi: text(),
    targetDana: numeric('target_dana', { precision: 18, scale: 2 }).notNull(),
    durasiHari: integer('durasi_hari'),
    bannerUrl: text('banner_url'),
    jenisWakaf: waqfType('jenis_wakaf').notNull(),
    status: waqfStatus().default('DRAFT').notNull(),
    rabDocumentUrl: text('rab_document_url'),
    dokumenLegalitasUrl: text('dokumen_legalitas_url'),
    provinsi: varchar('provinsi', { length: 100 }),
    kabupatenKota: varchar('kabupaten_kota', { length: 100 }),
    kecamatan: varchar('kecamatan', { length: 100 }),
    kelurahanDesa: varchar('kelurahan_desa', { length: 100 }),
    kodeWilayah: varchar('kode_wilayah', { length: 20 }),
    // Rekening penerimaan khusus program (UAT admin 2026-10-02: bank tidak
    // tersimpan). Nullable — program lama jatuh balik ke rekening Nadzir.
    namaBank: text('nama_bank'),
    nomorRekeningBank: text('nomor_rekening_bank'),
    atasNamaRekening: text('atas_nama_rekening'),
    verificationStatus: verificationStatus('verification_status')
      .default('PENDING')
      .notNull(),
    adminNotes: text('admin_notes'),
    verifiedById: text('verified_by_id'),
    verifiedAt: timestamp('verified_at', {
      precision: 3,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.nadzirProfileId],
      foreignColumns: [nadzirProfiles.id],
      name: 'waqf_programs_nadzir_profile_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    uniqueIndex('waqf_programs_kode_program_key').using(
      'btree',
      table.kodeProgram.asc().nullsLast().op('text_ops')
    ),
  ]
);

export const waqfPrincipalLedgers = pgTable(
  'waqf_principal_ledgers',
  {
    id: text().primaryKey().notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    pokokDanaTerkumpul: numeric('pokok_dana_terkumpul', {
      precision: 18,
      scale: 2,
    })
      .default('0')
      .notNull(),
    totalHasilAvailable: numeric('total_hasil_available', {
      precision: 18,
      scale: 2,
    })
      .default('0')
      .notNull(),
    hasilInvestasiTersalurkan: numeric('hasil_investasi_tersalurkan', {
      precision: 18,
      scale: 2,
    })
      .default('0')
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('waqf_principal_ledgers_waqf_program_id_key').using(
      'btree',
      table.waqfProgramId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'waqf_principal_ledgers_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const users = pgTable(
  'users',
  {
    id: text().primaryKey().notNull(),
    email: text(),
    phone: text(),
    passwordHash: text('password_hash'),
    name: text().notNull(),
    role: role().default('WAKIF').notNull(),
    oauthProvider: oauthProvider('oauth_provider'),
    oauthId: text('oauth_id'),
    avatarUrl: text('avatar_url'),
    gender: text('gender'),
    birthDate: text('birth_date'),
    address: text('address'),
    preferences: jsonb('preferences'),
    /** Admin-controlled switch; inactive accounts cannot log in or refresh. */
    isActive: boolean('is_active').default(true).notNull(),
    /** Lembaga / afiliasi shown in the admin account list. */
    institution: text('institution'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_key').using(
      'btree',
      table.email.asc().nullsLast().op('text_ops')
    ),
    uniqueIndex('users_oauth_provider_oauth_id_key').using(
      'btree',
      table.oauthProvider.asc().nullsLast().op('text_ops'),
      table.oauthId.asc().nullsLast().op('enum_ops')
    ),
    uniqueIndex('users_phone_key').using(
      'btree',
      table.phone.asc().nullsLast().op('text_ops')
    ),
  ]
);

/**
 * Feature-level permission matrix edited from `/admin/roles`. `role` is text +
 * CHECK (MIGRATION_RULES Rule 6) so it never depends on the shared `Role` enum.
 * An empty table is valid: `resolveMatrix` falls back to the factory defaults.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: text().primaryKey().notNull(),
    role: text().notNull(),
    featureKey: text('feature_key').notNull(),
    isEnabled: boolean('is_enabled').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('role_permissions_role_feature_key_key').using(
      'btree',
      table.role.asc().nullsLast().op('text_ops'),
      table.featureKey.asc().nullsLast().op('text_ops')
    ),
    check(
      'role_permissions_role_check',
      sql`${table.role} IN ('ADMIN', 'NADZIR', 'BENDAHARA', 'PETUGAS_LAPANGAN', 'WAKIF')`
    ),
  ]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    revokedAt: timestamp('revoked_at', { precision: 3, mode: 'string' }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_key').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'refresh_tokens_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

/**
 * One row per password-reset code sent by email. Only an HMAC of the 6-digit
 * code is stored (never the code itself). A row is dead once it expires, is
 * consumed by a successful reset, or reaches the attempt limit.
 */
export const passwordResetOtps = pgTable(
  'password_reset_otps',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    email: text().notNull(),
    otpHash: text('otp_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
    consumedAt: timestamp('consumed_at', { precision: 3, mode: 'string' }),
    attempts: integer().default(0).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('password_reset_otps_email_created_idx').using(
      'btree',
      table.email.asc().nullsLast().op('text_ops'),
      table.createdAt.desc().nullsLast().op('timestamp_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'password_reset_otps_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ]
);

export const nadzirProfiles = pgTable(
  'nadzir_profiles',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    kategori: nadzirKategori().notNull(),
    namaLembaga: text('nama_lembaga'),
    nomorRekeningBank: text('nomor_rekening_bank'),
    namaBank: text('nama_bank'),
    /**
     * Nomor registrasi BWI yang diinput admin saat verifikasi (D6); ditampilkan
     * di profil publik `/lembaga/$id`. NULL = belum diinput.
     */
    nomorRegistrasiBwi: text('nomor_registrasi_bwi'),
    /**
     * Narahubung resmi yang BOLEH tampil publik di `/lembaga/$id` (D6), diisi
     * admin; sengaja terpisah dari email/telepon akun pengurus. NULL = tidak ada.
     */
    kontakPublik: text('kontak_publik'),
    statusVerifikasi: verificationStatus('status_verifikasi')
      .default('PENDING')
      .notNull(),
    verifiedById: text('verified_by_id'),
    verifiedAt: timestamp('verified_at', { precision: 3, mode: 'string' }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('nadzir_profiles_user_id_key').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'nadzir_profiles_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.verifiedById],
      foreignColumns: [users.id],
      name: 'nadzir_profiles_verified_by_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const nadzirDocuments = pgTable(
  'nadzir_documents',
  {
    id: text().primaryKey().notNull(),
    nadzirProfileId: text('nadzir_profile_id').notNull(),
    tipeDokumen: nadzirDocumentType('tipe_dokumen').notNull(),
    fileUrl: text('file_url'),
    fileDeletedAt: timestamp('file_deleted_at', {
      precision: 3,
      mode: 'string',
    }),
    ocrExtractedNik: text('ocr_extracted_nik'),
    ocrExtractedNama: text('ocr_extracted_nama'),
    ocrConfidenceScore: numeric('ocr_confidence_score', {
      precision: 5,
      scale: 2,
    }),
    reviewedManually: boolean('reviewed_manually').default(false).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.nadzirProfileId],
      foreignColumns: [nadzirProfiles.id],
      name: 'nadzir_documents_nadzir_profile_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const fundWithdrawalRequests = pgTable(
  'fund_withdrawal_requests',
  {
    id: text().primaryKey().notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    peruntukan: text(),
    rekeningTujuan: text('rekening_tujuan'),
    adminNotes: text('admin_notes'),
    requestedById: text('requested_by_id').notNull(),
    approvedById: text('approved_by_id'),
    status: withdrawalStatus().default('PENDING').notNull(),
    reviewedAt: timestamp('reviewed_at', {
      precision: 3,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.approvedById],
      foreignColumns: [users.id],
      name: 'fund_withdrawal_requests_approved_by_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.requestedById],
      foreignColumns: [users.id],
      name: 'fund_withdrawal_requests_requested_by_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'fund_withdrawal_requests_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const waqfYieldEntries = pgTable(
  'waqf_yield_entries',
  {
    id: text().primaryKey().notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    sourceDescription: text('source_description').notNull(),
    recordedByAdminId: text('recorded_by_admin_id').notNull(),
    recordedAt: timestamp('recorded_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'waqf_yield_entries_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const waqfOrders = pgTable(
  'waqf_orders',
  {
    id: text().primaryKey().notNull(),
    nomorKwitansi: text('nomor_kwitansi').notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    wakifId: text('wakif_id'),
    namaWakif: text('nama_wakif').notNull(),
    noTelepon: text('no_telepon'),
    alamat: text(),
    atasNamaWakif: text('atas_nama_wakif'),
    /** Doa & harapan wakif yang ditulis di form donasi (opsional, maks. 500 karakter). */
    doa: text(),
    isAnonymous: boolean('is_anonymous').default(false).notNull(),
    bentukWakaf: bentukWakaf('bentuk_wakaf').notNull(),
    nominal: numeric({ precision: 18, scale: 2 }),
    namaBarang: text('nama_barang'),
    jumlahSatuan: integer('jumlah_satuan'),
    nilaiTaksiranRupiah: numeric('nilai_taksiran_rupiah', {
      precision: 18,
      scale: 2,
    }),
    metodePembayaran: metodeBayar('metode_pembayaran'),
    status: waqfOrderStatus().default('MENUNGGU_VERIFIKASI').notNull(),
    enteredByAmilId: text('entered_by_amil_id'),
    transactionId: text('transaction_id'),
    nomorIkrarWakaf: text('nomor_ikrar_wakaf'),
    dokumenAiwUrl: text('dokumen_aiw_url'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('waqf_orders_nomor_kwitansi_key').using(
      'btree',
      table.nomorKwitansi.asc().nullsLast().op('text_ops')
    ),
    uniqueIndex('waqf_orders_transaction_id_key').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops')
    ),
    index('waqf_orders_waqf_program_id_idx').using(
      'btree',
      table.waqfProgramId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.enteredByAmilId],
      foreignColumns: [users.id],
      name: 'waqf_orders_entered_by_amil_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'waqf_orders_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.wakifId],
      foreignColumns: [users.id],
      name: 'waqf_orders_wakif_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'waqf_orders_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const transactions = pgTable(
  'transactions',
  {
    id: text().primaryKey().notNull(),
    wakifId: text('wakif_id').notNull(),
    jenisTransaksi: transactionType('jenis_transaksi').notNull(),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    paymentMethod: text('payment_method'),
    paymentGatewayRef: text('payment_gateway_ref'),
    statusPembayaran: transactionPaymentStatus('status_pembayaran')
      .default('PENDING')
      .notNull(),
    disbursementDestination: text('disbursement_destination').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    // QA-02: instruksi bayar (QR / nomor VA / tautan e-wallet) dan tautan
    // halaman Mayar disimpan saat pembayaran dibuat, agar donatur bisa
    // melanjutkan pembayaran setelah menutup tab. Nullable (MIGRATION_RULES
    // Rule 2): transaksi lama dan aplikasi Next.js lama tidak terpengaruh.
    paymentInstructions: jsonb(
      'payment_instructions'
    ).$type<PaymentInstructions>(),
    paymentUrl: text('payment_url'),
    paymentExpiresAt: timestamp('payment_expires_at', {
      precision: 3,
      mode: 'string',
    }),
  },
  (table) => [
    uniqueIndex('transactions_payment_gateway_ref_key').using(
      'btree',
      table.paymentGatewayRef.asc().nullsLast().op('text_ops')
    ),
    // Dashboards and analytics filter verified rows by status, then by period.
    index('transactions_status_created_at_idx').using(
      'btree',
      table.statusPembayaran.asc().nullsLast().op('enum_ops'),
      table.createdAt.asc().nullsLast().op('timestamp_ops')
    ),
    // Per-donor history, retention and RFM group by donor.
    index('transactions_wakif_id_idx').using(
      'btree',
      table.wakifId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.wakifId],
      foreignColumns: [users.id],
      name: 'transactions_wakif_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

/**
 * Katalog program infaq/sedekah yang dikelola admin. `jenis` memakai daftar
 * yang sama dengan `infaq_orders.jenis` supaya donasi manual yang dialokasikan
 * ke sebuah program tetap lolos CHECK di tabel order. `target` NULL berarti
 * program terbuka tanpa target.
 */
export const infaqPrograms = pgTable(
  'infaq_programs',
  {
    id: text().primaryKey().notNull(),
    nama: text().notNull(),
    jenis: text().notNull(),
    deskripsi: text(),
    target: numeric({ precision: 18, scale: 2 }),
    status: text().default('AKTIF').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    check(
      'infaq_programs_jenis_check',
      sql`${table.jenis} IN ('INFAQ_SUBUH', 'INFAQ_JUMAT', 'INFAQ_UMUM', 'SEDEKAH_YATIM', 'SEDEKAH_OPERASIONAL')`
    ),
    check(
      'infaq_programs_status_check',
      sql`${table.status} IN ('AKTIF', 'SELESAI', 'DRAF')`
    ),
  ]
);

export const infaqOrders = pgTable(
  'infaq_orders',
  {
    id: text().primaryKey().notNull(),
    orderId: text('order_id').notNull(),
    userId: text('user_id'),
    namaPenginfaq: text('nama_penginfaq').notNull(),
    teleponPenginfaq: text('telepon_penginfaq'),
    emailPenginfaq: text('email_penginfaq'),
    nominal: numeric({ precision: 18, scale: 2 }).notNull(),
    jenis: text().notNull(),
    doa: text(),
    status: text().default('PENDING').notNull(),
    snapToken: text('snap_token'),
    snapRedirectUrl: text('snap_redirect_url'),
    transactionId: text('transaction_id'),
    /** Program katalog tujuan alokasi; NULL untuk donasi tanpa program. */
    programId: text('program_id'),
    /**
     * Kanal penerimaan untuk donasi yang dicatat manual oleh admin (tunai,
     * transfer yang dikonfirmasi kasir). NULL untuk order payment gateway —
     * kolom ini sekaligus penanda order manual yang boleh diubah/dihapus.
     */
    metodeManual: text('metode_manual'),
    /**
     * Bukti donasi manual (foto struk / PDF): object key penyimpanan privat,
     * mis. `amwal-receipts/infaq-<id>/<ulid>.jpg`. NULL = tanpa lampiran;
     * hanya order manual yang memakainya. Tautan unduh dibuat sesaat (signed URL).
     */
    buktiTransaksi: varchar('bukti_transaksi', { length: 255 }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('infaq_orders_order_id_key').using(
      'btree',
      table.orderId.asc().nullsLast().op('text_ops')
    ),
    uniqueIndex('infaq_orders_transaction_id_key').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops')
    ),
    check(
      'infaq_orders_jenis_check',
      sql`${table.jenis} IN ('INFAQ_SUBUH', 'INFAQ_JUMAT', 'INFAQ_UMUM', 'SEDEKAH_YATIM', 'SEDEKAH_OPERASIONAL')`
    ),
    check(
      'infaq_orders_status_check',
      sql`${table.status} IN ('PENDING', 'SETTLED', 'EXPIRED', 'FAILED')`
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'infaq_orders_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'infaq_orders_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.programId],
      foreignColumns: [infaqPrograms.id],
      name: 'infaq_orders_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    index('infaq_orders_program_id_idx').using(
      'btree',
      table.programId.asc().nullsLast().op('text_ops')
    ),
  ]
);

export const zakatCalculations = pgTable(
  'zakat_calculations',
  {
    id: text().primaryKey().notNull(),
    wakifId: text('wakif_id').notNull(),
    jenisZakat: zakatType('jenis_zakat').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    nisabDigunakan: numeric('nisab_digunakan', { precision: 18, scale: 2 }),
    hasilKewajiban: numeric('hasil_kewajiban', { precision: 18, scale: 2 }),
    zakatOrderId: text('zakat_order_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.wakifId],
      foreignColumns: [users.id],
      name: 'zakat_calculations_wakif_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.zakatOrderId],
      foreignColumns: [zakatOrders.id],
      name: 'zakat_calculations_zakat_order_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const zakatOrders = pgTable(
  'zakat_orders',
  {
    id: text().primaryKey().notNull(),
    tahunHijriah: text('tahun_hijriah'),
    nomorKwitansi: text('nomor_kwitansi').notNull(),
    muzakkiId: text('muzakki_id'),
    namaMuzakki: text('nama_muzakki').notNull(),
    namaDizakatkan: text('nama_dizakatkan'),
    noTelepon: text('no_telepon'),
    alamat: text(),
    isAnonymous: boolean('is_anonymous').default(false).notNull(),
    jenisZakat: zakatType('jenis_zakat').notNull(),
    metodePembayaran: zakatPaymentMethod('metode_pembayaran').notNull(),
    nominal: numeric({ precision: 18, scale: 2 }),
    beratBerasKg: numeric('berat_beras_kg', { precision: 10, scale: 2 }),
    jumlahJiwa: integer('jumlah_jiwa'),
    buktiTransferUrl: text('bukti_transfer_url'),
    status: zakatOrderStatus().default('MENUNGGU_VERIFIKASI').notNull(),
    notes: text(),
    enteredByAmilId: text('entered_by_amil_id'),
    transactionId: text('transaction_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('zakat_orders_nomor_kwitansi_key').using(
      'btree',
      table.nomorKwitansi.asc().nullsLast().op('text_ops')
    ),
    uniqueIndex('zakat_orders_transaction_id_key').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.enteredByAmilId],
      foreignColumns: [users.id],
      name: 'zakat_orders_entered_by_amil_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.muzakkiId],
      foreignColumns: [users.id],
      name: 'zakat_orders_muzakki_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'zakat_orders_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const mustahiqProfiles = pgTable('mustahiq_profiles', {
  id: text().primaryKey().notNull(),
  namaMustahiq: text('nama_mustahiq').notNull(),
  nik: text(),
  kategoriAsnaf: asnaf('kategori_asnaf').notNull(),
  alamat: text(),
  noTelepon: text('no_telepon'),
  statusVerifikasi: verificationStatus('status_verifikasi')
    .default('PENDING')
    .notNull(),
  adminNotes: text('admin_notes'),
  createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp('updated_at', {
    precision: 3,
    mode: 'string',
  }).notNull(),
});

export const programProgressReports = pgTable(
  'program_progress_reports',
  {
    id: text().primaryKey().notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    persentaseFisik: numeric('persentase_fisik', { precision: 5, scale: 2 }),
    deskripsi: text(),
    kuitansiUrls: jsonb('kuitansi_urls'),
    createdById: text('created_by_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdById],
      foreignColumns: [users.id],
      name: 'program_progress_reports_created_by_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'program_progress_reports_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const zakatFitrahConfig = pgTable('zakat_fitrah_config', {
  id: text().primaryKey().notNull(),
  jenisBeras: text('jenis_beras').notNull(),
  konversiHargaPerJiwa: numeric('konversi_harga_per_jiwa', {
    precision: 18,
    scale: 2,
  }).notNull(),
  referensiSk: text('referensi_sk'),
  tahunBerlaku: text('tahun_berlaku'),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at', {
    precision: 3,
    mode: 'string',
  }).notNull(),
});

export const zakatGoldPriceHistory = pgTable('zakat_gold_price_history', {
  id: text().primaryKey().notNull(),
  pricePerGram: numeric('price_per_gram', {
    precision: 18,
    scale: 2,
  }).notNull(),
  source: goldPriceSource().notNull(),
  fetchedAt: timestamp('fetched_at', { precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const fundPools = pgTable(
  'fund_pools',
  {
    id: text().primaryKey().notNull(),
    kode: text().notNull(),
    nama: text().notNull(),
    balance: numeric({ precision: 18, scale: 2 }).default('0').notNull(),
    totalDistributed: numeric('total_distributed', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp('updated_at', {
      precision: 3,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('fund_pools_kode_key').using(
      'btree',
      table.kode.asc().nullsLast().op('text_ops')
    ),
  ]
);

export const qurbanOrders = pgTable(
  'qurban_orders',
  {
    id: text().primaryKey().notNull(),
    wakifId: text('wakif_id'),
    namaPengqurban: text('nama_pengqurban').notNull(),
    teleponPengqurban: text('telepon_pengqurban'),
    alamatPengqurban: text('alamat_pengqurban'),
    jenisHewan: hewanType('jenis_hewan').notNull(),
    tipeKepemilikan: kepemilikan('tipe_kepemilikan').notNull(),
    opsiPesan: opsiPesan('opsi_pesan').default('PASRAH').notNull(),
    metodePembayaran: metodeBayar('metode_pembayaran').notNull(),
    statusPembayaran: qurbanPaymentStatus('status_pembayaran')
      .default('BELUM_BAYAR')
      .notNull(),
    totalHarga: numeric('total_harga', { precision: 18, scale: 2 }).notNull(),
    nominalDibayar: numeric('nominal_dibayar', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    sisaTagihan: numeric('sisa_tagihan', { precision: 18, scale: 2 })
      .default('0')
      .notNull(),
    enteredByPetugasId: text('entered_by_petugas_id'),
    transactionId: text('transaction_id'),
    akadWakalahText: text('akad_wakalah_text'),
    akadWakalahAcceptedAt: timestamp('akad_wakalah_accepted_at', {
      precision: 3,
      mode: 'string',
    }),
    /**
     * Lafazh nama shohibul qurban (bin/binti) bila berbeda dari pemesan
     * (`nama_pengqurban`). NULL = atas nama pemesan sendiri.
     */
    namaShohibul: text('nama_shohibul'),
    /**
     * Daftar nama shohibul sebagai larik (QA-13): satu sapi utuh boleh
     * diqurbankan atas 1-7 nama. `nama_shohibul` tetap berisi gabungan
     * "A, B, C" untuk pembaca lama; NULL = pesanan sebelum kolom ini ada.
     */
    namaShohibulList: jsonb('nama_shohibul_list').$type<string[]>(),
    /** Terakhir kali laporan sembelih dikirim via WhatsApp. */
    laporanTerkirimAt: timestamp('laporan_terkirim_at', {
      precision: 3,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('qurban_orders_transaction_id_key').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.enteredByPetugasId],
      foreignColumns: [petugasLapanganProfiles.id],
      name: 'qurban_orders_entered_by_petugas_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'qurban_orders_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.wakifId],
      foreignColumns: [users.id],
      name: 'qurban_orders_wakif_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const petugasLapanganProfiles = pgTable(
  'petugas_lapangan_profiles',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    wilayahTugas: text('wilayah_tugas'),
    noHp: text('no_hp'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('petugas_lapangan_profiles_user_id_key').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'petugas_lapangan_profiles_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const qurbanDistributionReports = pgTable(
  'qurban_distribution_reports',
  {
    id: text().primaryKey().notNull(),
    qurbanOrderId: text('qurban_order_id').notNull(),
    buktiFotoUrl: text('bukti_foto_url'),
    lokasiPenyaluran: text('lokasi_penyaluran'),
    lokasiLat: numeric('lokasi_lat', { precision: 10, scale: 6 }),
    lokasiLng: numeric('lokasi_lng', { precision: 10, scale: 6 }),
    jumlahPenerima: integer('jumlah_penerima'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.qurbanOrderId],
      foreignColumns: [qurbanOrders.id],
      name: 'qurban_distribution_reports_qurban_order_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const setoranPetugasLapangan = pgTable(
  'setoran_petugas_lapangan',
  {
    id: text().primaryKey().notNull(),
    petugasId: text('petugas_id').notNull(),
    nomorUrut: integer('nomor_urut'),
    tanggal: date().notNull(),
    jumlahSetor: numeric('jumlah_setor', { precision: 18, scale: 2 }).notNull(),
    keterangan: text(),
    verifiedByAdminId: text('verified_by_admin_id'),
    verifiedAt: timestamp('verified_at', { precision: 3, mode: 'string' }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.petugasId],
      foreignColumns: [petugasLapanganProfiles.id],
      name: 'setoran_petugas_lapangan_petugas_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.verifiedByAdminId],
      foreignColumns: [users.id],
      name: 'setoran_petugas_lapangan_verified_by_admin_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const zakatDistributions = pgTable(
  'zakat_distributions',
  {
    id: text().primaryKey().notNull(),
    mustahiqId: text('mustahiq_id').notNull(),
    jenisZakat: zakatType('jenis_zakat').notNull(),
    nominal: numeric({ precision: 18, scale: 2 }),
    beratBerasKg: numeric('berat_beras_kg', { precision: 10, scale: 2 }),
    buktiPenerimaanUrl: text('bukti_penerimaan_url'),
    lokasiLat: numeric('lokasi_lat', { precision: 10, scale: 6 }),
    lokasiLng: numeric('lokasi_lng', { precision: 10, scale: 6 }),
    jumlahPenerima: integer('jumlah_penerima'),
    status: zakatDistributionStatus().default('TERSALURKAN').notNull(),
    notes: text(),
    distributedByAmilId: text('distributed_by_amil_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.distributedByAmilId],
      foreignColumns: [users.id],
      name: 'zakat_distributions_distributed_by_amil_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.mustahiqId],
      foreignColumns: [mustahiqProfiles.id],
      name: 'zakat_distributions_mustahiq_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const hewanBatches = pgTable('hewan_batches', {
  id: text().primaryKey().notNull(),
  jenisHewan: hewanType('jenis_hewan').notNull(),
  totalSlot: integer('total_slot').default(1).notNull(),
  hargaPerSlot: numeric('harga_per_slot', {
    precision: 18,
    scale: 2,
  }).notNull(),
  status: hewanBatchStatus().default('TERSEDIA').notNull(),
  ras: text(),
  kelasGrade: text('kelas_grade'),
  estimasiBeratKg: numeric('estimasi_berat_kg', { precision: 10, scale: 2 }),
  jenisKelamin: text('jenis_kelamin'),
  wilayahPenyaluran: text('wilayah_penyaluran'),
  targetPenerimaManfaat: integer('target_penerima_manfaat'),
  tanggalPenyembelihanEstimasi: date('tanggal_penyembelihan_estimasi'),
  galeriFotoUrls: jsonb('galeri_foto_urls'),
  /** Label kelompok/hewan di panel admin, mis. "Sapi 01 (PO Sukabumi)". */
  namaBatch: text('nama_batch'),
  lokasiRph: text('lokasi_rph'),
  timJuleha: text('tim_juleha'),
  /** Tautan rekaman penyembelihan (YouTube/Drive/stream) untuk laporan. */
  dokumentasiVideoUrl: text('dokumentasi_video_url'),
  /** Tautan foto/video dokumentasi tambahan: `{ url, label, type }[]`. */
  dokumentasiMedia: jsonb('dokumentasi_media'),
  createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const qurbanDistributionAllocations = pgTable(
  'qurban_distribution_allocations',
  {
    id: text().primaryKey().notNull(),
    permohonanId: text('permohonan_id'),
    qurbanOrderId: text('qurban_order_id'),
    hewanBatchId: text('hewan_batch_id').notNull(),
    jumlahBagian: numeric('jumlah_bagian', { precision: 10, scale: 2 }),
    tanggalSalur: date('tanggal_salur'),
    buktiFotoUrl: text('bukti_foto_url'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.hewanBatchId],
      foreignColumns: [hewanBatches.id],
      name: 'qurban_distribution_allocations_hewan_batch_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.permohonanId],
      foreignColumns: [permohonanPenyaluranInstitusional.id],
      name: 'qurban_distribution_allocations_permohonan_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.qurbanOrderId],
      foreignColumns: [qurbanOrders.id],
      name: 'qurban_distribution_allocations_qurban_order_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const certificates = pgTable(
  'certificates',
  {
    id: text().primaryKey().notNull(),
    transactionId: text('transaction_id').notNull(),
    jenisSertifikat: text('jenis_sertifikat'),
    nomorInternalAmwal: text('nomor_internal_amwal').notNull(),
    nomorRegistrasiBwi: text('nomor_registrasi_bwi'),
    pdfUrl: text('pdf_url'),
    issuedAt: timestamp('issued_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('certificates_nomor_internal_amwal_key').using(
      'btree',
      table.nomorInternalAmwal.asc().nullsLast().op('text_ops')
    ),
    uniqueIndex('certificates_transaction_id_key').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'certificates_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

// Sprint 11 [I-9]: kolom CMS ditambahkan secara aditif. `status` memakai
// text + CHECK, bukan nilai enum baru — aplikasi Next.js lama membaca tabel
// ini dan Prisma-nya melempar error saat menemui nilai enum asing
// (db/MIGRATION_RULES.md Rule 6).
export const educationContents = pgTable(
  'education_contents',
  {
    id: text().primaryKey().notNull(),
    judul: text().notNull(),
    tipe: educationType().notNull(),
    kontenUrl: text('konten_url'),
    kategori: text(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    slug: text(),
    body: text(),
    coverUrl: text('cover_url'),
    publishedAt: timestamp('published_at', { precision: 3, mode: 'string' }),
    authorId: text('author_id'),
    status: text().default('DRAFT').notNull(),
    likesCount: integer('likes_count').default(0).notNull(),
  },
  (table) => [
    check(
      'education_contents_status_check',
      sql`${table.status} IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`
    ),
    // Parsial: baris lama tanpa slug tetap sah, dan banyak NULL tidak
    // saling bentrok.
    uniqueIndex('education_contents_slug_key')
      .using('btree', table.slug.asc().nullsLast().op('text_ops'))
      .where(sql`${table.slug} IS NOT NULL`),
    index('education_contents_status_published_idx').using(
      'btree',
      table.status.asc().nullsLast().op('text_ops'),
      table.publishedAt.asc().nullsLast().op('timestamp_ops')
    ),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.id],
      name: 'education_contents_author_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const gamificationPointLedgers = pgTable(
  'gamification_point_ledgers',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    activityType: text('activity_type').notNull(),
    pointsEarned: integer('points_earned').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    // Sprint 11 [I-10]: tanpa UNIQUE ini, satu webhook yang terkirim dua kali
    // memberi poin dua kali. Nullable supaya baris lama tetap sah — Postgres
    // mengizinkan banyak NULL di bawah UNIQUE.
    idempotencyKey: text('idempotency_key'),
    sourceRef: text('source_ref'),
  },
  (table) => [
    uniqueIndex('gamification_point_ledgers_idempotency_key_key').using(
      'btree',
      table.idempotencyKey.asc().nullsLast().op('text_ops')
    ),
    index('gamification_point_ledgers_user_created_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamp_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'gamification_point_ledgers_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const setoranQurbanOrderLinks = pgTable(
  'setoran_qurban_order_links',
  {
    id: text().primaryKey().notNull(),
    setoranId: text('setoran_id').notNull(),
    qurbanOrderId: text('qurban_order_id').notNull(),
  },
  (table) => [
    uniqueIndex(
      'setoran_qurban_order_links_setoran_id_qurban_order_id_key'
    ).using(
      'btree',
      table.setoranId.asc().nullsLast().op('text_ops'),
      table.qurbanOrderId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.qurbanOrderId],
      foreignColumns: [qurbanOrders.id],
      name: 'setoran_qurban_order_links_qurban_order_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.setoranId],
      foreignColumns: [setoranPetugasLapangan.id],
      name: 'setoran_qurban_order_links_setoran_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const permohonanPenyaluranInstitusional = pgTable(
  'permohonan_penyaluran_institusional',
  {
    id: text().primaryKey().notNull(),
    namaPemohon: text('nama_pemohon').notNull(),
    namaLembaga: text('nama_lembaga'),
    alamatPemohon: text('alamat_pemohon'),
    nomorSuratPermohonan: text('nomor_surat_permohonan'),
    kontak: text(),
    penanggungJawab: text('penanggung_jawab'),
    nomorRekeningPemohon: text('nomor_rekening_pemohon'),
    namaBank: text('nama_bank'),
    status: permohonanStatus().default('DIAJUKAN').notNull(),
    adminNotes: text('admin_notes'),
    alokasiDagingDisetujuiKg: numeric('alokasi_daging_disetujui_kg', {
      precision: 10,
      scale: 2,
    }),
    approvedByAdminId: text('approved_by_admin_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.approvedByAdminId],
      foreignColumns: [users.id],
      name: 'permohonan_penyaluran_institusional_approved_by_admin_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const mauqufAlaihDistributions = pgTable(
  'mauquf_alaih_distributions',
  {
    id: text().primaryKey().notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    withdrawalRequestId: text('withdrawal_request_id'),
    namaPenerimaManfaat: text('nama_penerima_manfaat').notNull(),
    kategoriPenerima: text('kategori_penerima'),
    nominalDisalurkan: numeric('nominal_disalurkan', {
      precision: 18,
      scale: 2,
    }),
    barangDisalurkan: text('barang_disalurkan'),
    tanggalPenyaluran: date('tanggal_penyaluran'),
    buktiPenyaluranUrl: text('bukti_penyaluran_url'),
    notes: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'mauquf_alaih_distributions_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.withdrawalRequestId],
      foreignColumns: [fundWithdrawalRequests.id],
      name: 'mauquf_alaih_distributions_withdrawal_request_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const qurbanAnimalSlots = pgTable(
  'qurban_animal_slots',
  {
    id: text().primaryKey().notNull(),
    hewanBatchId: text('hewan_batch_id').notNull(),
    nomorSlot: integer('nomor_slot').notNull(),
    qurbanOrderId: text('qurban_order_id'),
    status: slotStatus().default('TERSEDIA').notNull(),
  },
  (table) => [
    uniqueIndex('qurban_animal_slots_hewan_batch_id_nomor_slot_key').using(
      'btree',
      table.hewanBatchId.asc().nullsLast().op('int4_ops'),
      table.nomorSlot.asc().nullsLast().op('int4_ops')
    ),
    foreignKey({
      columns: [table.hewanBatchId],
      foreignColumns: [hewanBatches.id],
      name: 'qurban_animal_slots_hewan_batch_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.qurbanOrderId],
      foreignColumns: [qurbanOrders.id],
      name: 'qurban_animal_slots_qurban_order_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: text().primaryKey().notNull(),
    educationContentId: text('education_content_id'),
    judul: text().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.educationContentId],
      foreignColumns: [educationContents.id],
      name: 'quizzes_education_content_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: text().primaryKey().notNull(),
    quizId: text('quiz_id').notNull(),
    pertanyaan: text().notNull(),
    opsiJawaban: jsonb('opsi_jawaban').notNull(),
    jawabanBenar: text('jawaban_benar').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_questions_quiz_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: text().primaryKey().notNull(),
    quizId: text('quiz_id').notNull(),
    userId: text('user_id').notNull(),
    skor: numeric({ precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_attempts_quiz_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'quiz_attempts_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const chatbotConversations = pgTable(
  'chatbot_conversations',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    domainScope: chatbotDomain('domain_scope')
      .default('WAKAF_PRODUKTIF')
      .notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'chatbot_conversations_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const chatbotMessages = pgTable(
  'chatbot_messages',
  {
    id: text().primaryKey().notNull(),
    conversationId: text('conversation_id').notNull(),
    role: chatbotRole().notNull(),
    content: text().notNull(),
    citedSources: jsonb('cited_sources'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [chatbotConversations.id],
      name: 'chatbot_messages_conversation_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: text().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    isRead: boolean('is_read').default(false).notNull(),
    relatedEntityId: text('related_entity_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'notifications_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

export const wilayah = pgTable(
  'wilayah',
  {
    kode: varchar('kode', { length: 13 }).primaryKey().notNull(),
    nama: varchar('nama', { length: 100 }).notNull(),
  },
  (table) => [
    index('wilayah_nama_idx').using(
      'btree',
      table.nama.asc().nullsLast().op('text_ops')
    ),
  ]
);

// =============================================================================
// Sprint 11 — seluruh tabel baru. Aditif saja; lihat db/MIGRATION_RULES.md.
// =============================================================================

// [I-1] Sumber nomor urut order 12 digit. `formatOrderId()` hanya memformat
// string — keunikan di bawah konkurensi tidak bisa dijamin TypeScript, hanya
// database. Nomor dinaikkan atomik di dalam transaksi anchor:
//
//   INSERT INTO order_sequences (scope_key, current_sequence) VALUES ($1, 1)
//   ON CONFLICT (scope_key) DO UPDATE
//     SET current_sequence = order_sequences.current_sequence + 1,
//         updated_at = CURRENT_TIMESTAMP
//   RETURNING current_sequence;
//
// scope_key = '<kode modul>-<YY><MM>-<sub-program>', mis. '80-2609-00'.
// CHECK membuat nomor ke-10.000 ditolak database, bukan sekadar oleh aplikasi.
export const orderSequences = pgTable(
  'order_sequences',
  {
    scopeKey: text('scope_key').primaryKey().notNull(),
    currentSequence: integer('current_sequence').notNull(),
    updatedAt: timestamp('updated_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    check(
      'order_sequences_current_sequence_range',
      sql`${table.currentSequence} >= 1 AND ${table.currentSequence} <= 9999`
    ),
  ]
);

// [I-2] Lampiran bukti belanja program. Hanya object key privat yang
// disimpan — URL publik tidak pernah masuk database; akses lewat signed URL
// berumur pendek. FK bertipe text mengikuti waqf_programs.id dan
// program_progress_reports.id yang keduanya text.
export const programReceiptAttachments = pgTable(
  'program_receipt_attachments',
  {
    id: text().primaryKey().notNull(),
    waqfProgramId: text('waqf_program_id').notNull(),
    progressReportId: text('progress_report_id'),
    objectKey: text('object_key').notNull(),
    fileName: text('file_name').notNull(),
    title: text(),
    vendorName: text('vendor_name'),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    nominal: numeric('nominal', { precision: 18, scale: 2 }),
    isPhotoEvidence: boolean('is_photo_evidence').default(false).notNull(),
    uploadedById: text('uploaded_by_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    check(
      'program_receipt_attachments_mime_type_check',
      sql`${table.mimeType} IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`
    ),
    check(
      'program_receipt_attachments_file_size_check',
      sql`${table.fileSize} > 0 AND ${table.fileSize} <= 5242880`
    ),
    uniqueIndex('program_receipt_attachments_object_key_key').using(
      'btree',
      table.objectKey.asc().nullsLast().op('text_ops')
    ),
    index('program_receipt_attachments_program_idx').using(
      'btree',
      table.waqfProgramId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamp_ops')
    ),
    foreignKey({
      columns: [table.waqfProgramId],
      foreignColumns: [waqfPrograms.id],
      name: 'program_receipt_attachments_waqf_program_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.progressReportId],
      foreignColumns: [programProgressReports.id],
      name: 'program_receipt_attachments_progress_report_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.uploadedById],
      foreignColumns: [users.id],
      name: 'program_receipt_attachments_uploaded_by_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

// [I-4] Kode referral opak — sengaja bukan turunan user id supaya tidak
// membocorkan identitas pemilik kode.
export const affiliateCodes = pgTable(
  'affiliate_codes',
  {
    userId: text('user_id').primaryKey().notNull(),
    code: text().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('affiliate_codes_code_key').using(
      'btree',
      table.code.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'affiliate_codes_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

// [I-4] Atribusi first-touch. transaction_id sebagai PRIMARY KEY membuat
// reward ganda mustahil walau webhook dikirim berkali-kali — idempotensi
// ditegakkan bentuk tabel, bukan oleh logika aplikasi.
export const affiliateAttributions = pgTable(
  'affiliate_attributions',
  {
    transactionId: text('transaction_id').primaryKey().notNull(),
    referrerUserId: text('referrer_user_id').notNull(),
    referralCode: text('referral_code').notNull(),
    capturedAt: timestamp('captured_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('affiliate_attributions_referrer_idx').using(
      'btree',
      table.referrerUserId.asc().nullsLast().op('text_ops'),
      table.capturedAt.asc().nullsLast().op('timestamp_ops')
    ),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'affiliate_attributions_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.referrerUserId],
      foreignColumns: [users.id],
      name: 'affiliate_attributions_referrer_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

// [I-4] Klik hanya untuk analitik, nol poin. click_hash =
// HMAC(ip + user agent, salt + tanggal WIB); IP mentah tidak pernah
// disimpan. UNIQUE menegakkan dedup harian di database.
export const affiliateClicks = pgTable(
  'affiliate_clicks',
  {
    id: text().primaryKey().notNull(),
    referralCode: text('referral_code').notNull(),
    clickHash: text('click_hash').notNull(),
    clickDate: date('click_date').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('affiliate_clicks_code_hash_date_key').using(
      'btree',
      table.referralCode.asc().nullsLast().op('text_ops'),
      table.clickHash.asc().nullsLast().op('text_ops'),
      table.clickDate.asc().nullsLast().op('date_ops')
    ),
  ]
);

// [I-6] Redaksi akad tidak pernah di-UPDATE di tempat: setiap perubahan admin
// menerbitkan versi baru. Append-only supaya bukti hukum donasi lama tidak
// ikut berubah saat redaksi direvisi.
export const akadTemplates = pgTable(
  'akad_templates',
  {
    id: text().primaryKey().notNull(),
    module: text().notNull(),
    version: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    createdById: text('created_by_id'),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    check(
      'akad_templates_module_check',
      sql`${table.module} IN ('WAKAF', 'ZAKAT', 'INFAQ', 'SEDEKAH', 'QURBAN')`
    ),
    check('akad_templates_version_check', sql`${table.version} >= 1`),
    uniqueIndex('akad_templates_module_version_key').using(
      'btree',
      table.module.asc().nullsLast().op('text_ops'),
      table.version.asc().nullsLast().op('int4_ops')
    ),
    // Hanya satu versi aktif per modul, ditegakkan database.
    uniqueIndex('akad_templates_one_active_per_module')
      .using('btree', table.module.asc().nullsLast().op('text_ops'))
      .where(sql`${table.isActive}`),
    foreignKey({
      columns: [table.createdById],
      foreignColumns: [users.id],
      name: 'akad_templates_created_by_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

// [I-6] Versi dan hash isi akad direkam saat donasi, bukan sekadar referensi
// template — kalau baris template hilang, bukti persetujuan tetap utuh.
export const akadAcceptances = pgTable(
  'akad_acceptances',
  {
    transactionId: text('transaction_id').primaryKey().notNull(),
    akadTemplateId: text('akad_template_id').notNull(),
    version: integer().notNull(),
    bodySha256: text('body_sha256').notNull(),
    acceptedAt: timestamp('accepted_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transactions.id],
      name: 'akad_acceptances_transaction_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.akadTemplateId],
      foreignColumns: [akadTemplates.id],
      name: 'akad_acceptances_akad_template_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ]
);

// =============================================================================
// Sprint 12 — Master Data (draft "[Add] Master Data - Dashboard Admin").
// Additive-only, new tables (db/MIGRATION_RULES.md Rule 1 & 6): replaces the
// hardcoded "Akad / Jenis Wakaf" and "Kategori Program" <select> option
// lists in `wakaf-programs-view.tsx`'s create-program form with
// admin-editable picklists.
// =============================================================================

export const akadWaqafMaster = pgTable('akad_waqaf_master', {
  id: text().primaryKey().notNull(),
  label: text().notNull(),
  description: text(),
  /**
   * Akad menentukan `waqf_programs.jenis_wakaf` program yang dibuat. Nullable
   * hanya karena kolom ditambahkan belakangan (Rule 2); akad tanpa pemetaan
   * tidak ditampilkan di form Buat Program Wakaf.
   */
  jenisWakaf: waqfType('jenis_wakaf'),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const kategoriWaqafMaster = pgTable('kategori_waqaf_master', {
  id: text().primaryKey().notNull(),
  label: text().notNull(),
  description: text(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * Master data jenis zakat & infaq. `kode` dikunci ke nilai yang diizinkan
 * tabel order (enum `ZakatType` / CHECK `infaq_orders.jenis`) — enum & CHECK
 * itu dipakai bersama aplikasi Next.js lama sehingga tidak boleh diubah.
 * Admin mengelola label, deskripsi, urutan, dan status aktif; baris baru
 * hanya muncul lewat sinkronisasi dengan daftar kode tersebut.
 */
export const jenisZakatMaster = pgTable(
  'jenis_zakat_master',
  {
    id: text().primaryKey().notNull(),
    kode: zakatType('kode').notNull(),
    label: text().notNull(),
    description: text(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('jenis_zakat_master_kode_key').using(
      'btree',
      table.kode.asc().nullsLast()
    ),
  ]
);

export const jenisInfaqMaster = pgTable(
  'jenis_infaq_master',
  {
    id: text().primaryKey().notNull(),
    kode: text().notNull(),
    label: text().notNull(),
    description: text(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('jenis_infaq_master_kode_key').using(
      'btree',
      table.kode.asc().nullsLast().op('text_ops')
    ),
    check(
      'jenis_infaq_master_kode_check',
      sql`${table.kode} IN ('INFAQ_SUBUH', 'INFAQ_JUMAT', 'INFAQ_UMUM', 'SEDEKAH_YATIM', 'SEDEKAH_OPERASIONAL')`
    ),
  ]
);

/** Kanal penerimaan donasi infaq manual (`infaq_orders.metode_manual`). */
export const metodeInfaqMaster = pgTable('metode_infaq_master', {
  id: text().primaryKey().notNull(),
  label: text().notNull(),
  description: text(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// =============================================================================
// Admin Edukasi — kategori & video (Batch: Education Videos Schema).
// `education_contents` sudah menjadi tabel artikel (tipe='ARTIKEL'); tabel
// video dipisah sendiri karena bidangnya beda (speaker/thumbnail/source_type,
// bukan body/slug artikel). Sengaja TIDAK ada duration/views_count — belum
// diminta dan belum ada sumber datanya.
// =============================================================================

export const educationCategories = pgTable(
  'education_categories',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    type: varchar('type', { length: 20 })
      .notNull()
      .$type<'article' | 'video'>(),
    slug: varchar('slug', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    check(
      'education_categories_type_check',
      sql`${table.type} IN ('article', 'video')`
    ),
    // Unik per (tipe, slug): kategori artikel dan video boleh sama nama.
    uniqueIndex('education_categories_type_slug_key').using(
      'btree',
      table.type.asc().nullsLast().op('text_ops'),
      table.slug.asc().nullsLast().op('text_ops')
    ),
  ]
);

export const educationVideos = pgTable(
  'education_videos',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    categoryId: uuid('category_id'),
    title: varchar('title', { length: 255 }).notNull(),
    sourceType: varchar('source_type', { length: 20 })
      .notNull()
      .$type<'upload' | 'embed'>(),
    videoUrl: text('video_url').notNull(),
    speaker: varchar('speaker', { length: 150 }),
    thumbnailUrl: text('thumbnail_url').notNull(),
    description: text(),
    likesCount: integer('likes_count').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('published').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    check(
      'education_videos_source_type_check',
      sql`${table.sourceType} IN ('upload', 'embed')`
    ),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [educationCategories.id],
      name: 'education_videos_category_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

// =============================================================================
// Admin Edukasi — artikel & kuis pemahaman (Batch: Education Articles & Quiz
// Engine). Sengaja TIDAK ada excerpt (ringkasan diambil dinamis dari 120
// karakter pertama `content`) dan TIDAK ada `points` per-soal (pembobotan
// dihitung dinamis: 100 / total soal).
// =============================================================================

export const educationArticles = pgTable(
  'education_articles',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    categoryId: uuid('category_id'),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    coverImageUrl: text('cover_image_url'),
    authorName: varchar('author_name', { length: 150 })
      .default('Super Admin Edukasi Amwal')
      .notNull(),
    content: text().notNull(),
    status: varchar('status', { length: 20 }).default('published').notNull(),
    likesCount: integer('likes_count').default(0).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [educationCategories.id],
      name: 'education_articles_category_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    uniqueIndex('education_articles_slug_key').using(
      'btree',
      table.slug.asc().nullsLast().op('text_ops')
    ),
  ]
);

export const educationQuizQuestions = pgTable(
  'education_quiz_questions',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    articleId: uuid('article_id').notNull(),
    question: text().notNull(),
    options: jsonb().notNull().$type<{ key: string; text: string }[]>(),
    correctKey: varchar('correct_key', { length: 5 }).notNull(),
    explanation: text(),
    orderIndex: integer('order_index').default(0).notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.articleId],
      foreignColumns: [educationArticles.id],
      name: 'education_quiz_questions_article_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ]
);

// =============================================================================
// Publik /edukasi — riwayat skor kuis & diskusi artikel (Batch: Public
// Education & Interactive Quiz Views). `userId` nullable: skor kuis boleh
// dicatat untuk tamu (belum login), tapi komentar tetap wajib login (guard
// di router, bukan di skema) supaya identitas penulis diskusi jelas.
// =============================================================================

/**
 * Satu baris per (pengguna, konten) yang disukai — sebelumnya tombol "suka"
 * hanya mengubah angka di state browser dan hilang saat dimuat ulang (UAT
 * admin 2026-10-02). `content_id` polimorfik (artikel/video) sehingga tanpa
 * FK; `education_*.likes_count` tetap menjadi hitungan siap-baca.
 */
export const educationContentLikes = pgTable(
  'education_content_likes',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    userId: text('user_id').notNull(),
    contentType: varchar('content_type', { length: 10 })
      .notNull()
      .$type<'article' | 'video'>(),
    contentId: uuid('content_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    check(
      'education_content_likes_type_check',
      sql`${table.contentType} IN ('article', 'video')`
    ),
    uniqueIndex('education_content_likes_user_content_key').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops'),
      table.contentType.asc().nullsLast().op('text_ops'),
      table.contentId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'education_content_likes_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ]
);

export const educationQuizAttempts = pgTable(
  'education_quiz_attempts',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    articleId: uuid('article_id').notNull(),
    userId: text('user_id'),
    score: integer().notNull(),
    correctCount: integer('correct_count').notNull(),
    totalQuestions: integer('total_questions').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.articleId],
      foreignColumns: [educationArticles.id],
      name: 'education_quiz_attempts_article_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'education_quiz_attempts_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);

export const educationArticleComments = pgTable(
  'education_article_comments',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    articleId: uuid('article_id').notNull(),
    userId: text('user_id'),
    authorName: varchar('author_name', { length: 150 }).notNull(),
    comment: text().notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.articleId],
      foreignColumns: [educationArticles.id],
      name: 'education_article_comments_article_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'education_article_comments_user_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
);
