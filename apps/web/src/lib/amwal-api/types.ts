import type { PaymentMethodCode } from '@amwal/core/payment/methods';
import type { ResumablePayment } from '@amwal/core/payment/resume';
import type { PaymentInstructions } from '@amwal/core/payment/types';
export type WaqfJenis = 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL';
export type WaqfStatus = 'DRAFT' | 'LIVE' | 'SELESAI';
export type WaqfOrderStatus =
  | 'MENUNGGU_VERIFIKASI'
  | 'TERVERIFIKASI'
  | 'DITOLAK';
/** Kode `paymentMethod` Mayar: qris, va/bni, ewallet/gopay, ... */
export type WaqfPaymentType = PaymentMethodCode;
export type TransactionPaymentStatus =
  | 'PENDING'
  | 'LUNAS'
  | 'GAGAL'
  | 'KADALUARSA';

export interface WaqfProgramReceipt {
  id: string;
  title: string | null;
  vendorName?: string | null;
  nominal: string | null;
  fileName: string;
  mimeType?: string;
  isPhotoEvidence?: boolean;
  createdAt: string;
}

export interface WaqfProgramProgressReport {
  id: string;
  persentaseFisik: string | null;
  deskripsi: string | null;
  createdAt: string;
}

export interface WaqfProgram {
  id: string;
  nadzirProfileId: string;
  kodeProgram?: string | null;
  judul: string;
  kategori: string | null;
  deskripsi: string | null;
  targetDana: string;
  durasiHari: number | null;
  bannerUrl: string | null;
  jenisWakaf: WaqfJenis;
  status: WaqfStatus;
  rabDocumentUrl: string | null;
  dokumenLegalitasUrl: string | null;
  provinsi?: string | null;
  kabupatenKota?: string | null;
  kecamatan?: string | null;
  kelurahanDesa?: string | null;
  kodeWilayah?: string | null;
  latestProgressFisik?: string | null;
  receipts?: WaqfProgramReceipt[];
  progressReports?: WaqfProgramProgressReport[];
  createdAt: string;
  updatedAt: string;
  principalLedger?: {
    id: string;
    pokokDanaTerkumpul: string;
    totalHasilAvailable: string;
    hasilInvestasiTersalurkan: string;
    updatedAt: string;
  } | null;
  nadzirProfile?: {
    id: string;
    namaLembaga: string | null;
    kategori: string | null;
    statusVerifikasi: string;
  } | null;
}

/** Profil publik lembaga nazhir (`waqf.lembaga`, D6). */
export interface LembagaProfile {
  id: string;
  kategori: string;
  namaLembaga: string | null;
  kontakPublik: string | null;
  nomorRegistrasiBwi: string | null;
  programs: WaqfProgram[];
  statusVerifikasi: string;
  verifiedAt: string | null;
  wilayah: string[];
}

/** Agregat publik beranda tamu (`stats.public`). */
export interface PublicStats {
  activePrograms: number;
  donorCount: number;
  totalRaised: number;
}

/** Satu baris tabel donatur infaq publik (`infaq.donatur`). */
export interface InfaqDonor {
  createdAt: string;
  donorName: string;
  id: string;
  jenis: string;
  nominal: string;
}

export interface WaqfDonor {
  id?: string;
  donorName: string;
  nominal: string | null;
  status: WaqfOrderStatus;
  metodePembayaran?: string | null;
  createdAt?: string;
  doaMessage?: string | null;
}

import type { AkadAcceptanceInput } from '@amwal/core/contracts/akad';

export interface CreateWaqfOrderInput {
  programId: string;
  amount: number;
  paymentType: WaqfPaymentType;
  donorName: string;
  donorEmail?: string;
  donorPhone?: string;
  isAnonymous?: boolean;
  /** Doa & harapan wakif (opsional, maks. 500 karakter); disimpan di pesanan. */
  doa?: string;
  akadAcceptance?: AkadAcceptanceInput;
}

export interface DonorProfile {
  name: string;
  email?: string;
  phone: string | null;
}

export interface CreateWaqfOrderResult {
  orderId: string;
  transactionId: string;
  redirectUrl: string;
  payment: {
    providerRef: string;
    redirectUrl: string;
    paymentType: string;
    qrCodeUrl?: string;
    instructions?: PaymentInstructions;
    provider?: string;
    expiredAt?: string;
  };
}

export interface WaqfOrderStatusResult {
  /** Instruksi tersimpan untuk melanjutkan pembayaran (QA-02); null bila tidak bisa. */
  payment?: ResumablePayment | null;
  /** `owner` = the order's donor (or an admin); `public` = redacted view. */
  access: 'owner' | 'public';
  order: {
    id: string;
    nomorKwitansi: string | null;
    namaWakif: string;
    isAnonymous: boolean;
    bentukWakaf: string;
    nominal: string | null;
    metodePembayaran: string | null;
    status: WaqfOrderStatusUnion;
    createdAt: string;
  };
  transaction: {
    /** Null for non-owners: the history/certificate links are owner-only. */
    id: string | null;
    statusPembayaran: TransactionPaymentStatus;
    amount: string;
    paymentMethod: string | null;
    paymentGatewayRef: string | null;
    createdAt: string;
  } | null;
  program: {
    id: string;
    judul: string;
    kategori: string | null;
  } | null;
}

export type WaqfOrderStatusUnion = WaqfOrderStatus;

export type HewanJenis = 'SAPI' | 'KAMBING';
export type QurbanBatchStatus = 'TERSEDIA' | 'PENUH' | 'SELESAI';
export type QurbanSlotStatus = 'TERSEDIA' | 'TERISI' | 'TERJUAL' | 'DIBATALKAN';

export interface QurbanBatch {
  id: string;
  jenisHewan: HewanJenis;
  totalSlot: number;
  hargaPerSlot: string;
  status: QurbanBatchStatus;
  ras: string | null;
  kelasGrade: string | null;
  estimasiBeratKg: string | null;
  jenisKelamin: string | null;
  wilayahPenyaluran: string | null;
  targetPenerimaManfaat: number | null;
  tanggalPenyembelihanEstimasi: string | null;
  galeriFotoUrls: unknown;
  createdAt: string;
  /** Hanya diisi oleh `qurban.list` (hitung slot TERSEDIA per batch). */
  availableSlots?: number;
}

export interface QurbanSlot {
  id: string;
  hewanBatchId: string;
  nomorSlot: number;
  qurbanOrderId: string | null;
  status: QurbanSlotStatus;
}

export interface QurbanBatchDetail {
  batch: QurbanBatch;
  slots: QurbanSlot[];
  availableSlots: number;
}

export type QurbanKepemilikan = 'INDIVIDU' | 'KOLEKTIF';
export type QurbanOpsiPesan = 'PASRAH' | 'AMBIL_SENDIRI';

/**
 * Matches `createQurbanOrderSchema` (`@amwal/core/contracts/qurban`) — the
 * real oRPC contract `router.qurban.createOrder` validates against.
 * Previously this shape (`batchId`/`slotIds`/`donorName`) never matched any
 * backend, REST or oRPC; the qurban order button was a PRATINJAU stub.
 */
export interface CreateQurbanOrderInput {
  hewanBatchId: string;
  jumlahSlotDiminta: number;
  /**
   * Nomor WhatsApp tujuan blast laporan qurban. Wajib — divalidasi & dinormalkan
   * ke `62xxxxxxxxx` oleh `createQurbanOrderSchema` di backend.
   */
  teleponPengqurban: string;
  tipeKepemilikan: QurbanKepemilikan;
  opsiPesan?: QurbanOpsiPesan;
  paymentType?: WaqfPaymentType;
  alamatPengqurban?: string;
  akadWakalahAccepted: true;
  akadAcceptance?: AkadAcceptanceInput;
  namaShohibul?: string[];
  /** Hanya untuk tamu (QA-04): nama pemesan wajib; email opsional. */
  donorName?: string;
  donorEmail?: string;
}

export type CreateQurbanOrderResult = CreateWaqfOrderResult;

export interface QurbanOrderStatusResult {
  /** Instruksi tersimpan untuk melanjutkan pembayaran (QA-02); null bila tidak bisa. */
  payment?: ResumablePayment | null;
  order: {
    id: string;
    jenisHewan: HewanJenis;
    tipeKepemilikan: QurbanKepemilikan;
    opsiPesan: QurbanOpsiPesan;
    metodePembayaran: string;
    statusPembayaran: 'BELUM_BAYAR' | 'DP' | 'LUNAS';
    totalHarga: string;
    namaPengqurban: string;
    namaShohibul: string | null;
    /** Larik nama shohibul (QA-13); null untuk pesanan lama dan non-pemilik. */
    namaShohibulList?: string[] | null;
    createdAt: string;
  };
  transaction: {
    /** Null untuk non-pemilik (tamu): tautan riwayat/sertifikat hanya untuk pemilik. */
    id: string | null;
    statusPembayaran: TransactionPaymentStatus;
    paymentMethod: string | null;
  } | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  relatedEntityId: string | null;
  createdAt: string;
}

export type InfaqJenis =
  | 'INFAQ_SUBUH'
  | 'INFAQ_JUMAT'
  | 'INFAQ_UMUM'
  | 'SEDEKAH_YATIM'
  | 'SEDEKAH_OPERASIONAL';

/**
 * Matches `createInfaqSchema` (`@amwal/core/contracts/infaq`) — the real
 * oRPC contract `router.infaq.createOrder` validates against. Previously
 * this shape (`programId`/`amount`/`donorName`/`paymentType`) never matched
 * any backend; the infaq order button was a PRATINJAU stub.
 */
export interface CreateInfaqOrderInput {
  nominal: number;
  jenis: InfaqJenis;
  namaPenginfaq: string;
  teleponPenginfaq?: string;
  emailPenginfaq?: string;
  doa?: string;
  akadAcceptance?: AkadAcceptanceInput;
  paymentType?: WaqfPaymentType;
  isAnonymous?: boolean;
}

export interface CreateInfaqOrderResult {
  orderId: string;
  snapToken: string;
  snapRedirectUrl: string;
  payment: CreateWaqfOrderResult['payment'];
}

export interface InfaqOrderStatusResult {
  /** Instruksi tersimpan untuk melanjutkan pembayaran (QA-02); null bila tidak bisa. */
  payment?: ResumablePayment | null;
  orderId: string;
  jenis: InfaqJenis;
  nominal: string;
  namaPenginfaq: string;
  status: 'PENDING' | 'SETTLED' | 'EXPIRED' | 'FAILED';
  createdAt: string;
  transaction: {
    id: string;
    statusPembayaran: TransactionPaymentStatus;
    paymentMethod: string | null;
  } | null;
}

export interface LiveGoldPrice {
  price: string;
  isStale: boolean;
  fetchedAt: string;
  source: string;
}

export type ZakatCalculatorInput =
  | {
      jenisZakat: 'FITRAH';
      jumlahJiwa: number;
    }
  | {
      jenisZakat: 'MAAL_PENGHASILAN';
      totalWealth: number;
    };

export interface ZakatCalculatorResult {
  jenisZakat: 'FITRAH' | 'MAAL_PENGHASILAN';
  jumlahJiwa?: number;
  mencapaiNisab: boolean;
  nisab: string | null;
  zakatAmount: string;
  hargaAcuan: {
    goldPricePerGram?: string;
    fitrahPricePerJiwa?: string;
    isStale?: boolean;
    fetchedAt?: string;
    source?: string;
  };
}

export type ZakatDigitalPaymentType = PaymentMethodCode;

export interface CreateZakatOrderInput {
  programId: string;
  amount: number;
  paymentType: ZakatDigitalPaymentType;
  isAnonymous?: boolean;
  jenisZakat?: 'FITRAH' | 'MAAL_PENGHASILAN' | 'EMAS' | 'PERUSAHAAN';
  akadAcceptance?: AkadAcceptanceInput;
  jumlahJiwa?: number;
  namaDizakatkan?: string;
  doa?: string;
  /** Hanya untuk tamu (QA-04): nama wajib; email/HP opsional. */
  donorName?: string;
  donorEmail?: string;
  donorPhone?: string;
}

/**
 * `zakat.createOrder`'s handler also serves offline `tunai`/`beras` payment
 * types (manual-verification branch, no redirect), even though this client
 * only ever sends a `ZakatDigitalPaymentType` — the return type still has to
 * cover both since it's inferred from the whole procedure.
 */
export type CreateZakatOrderResult =
  | {
      orderId: string;
      transactionId: string;
      redirectUrl: string;
      payment: {
        providerRef: string;
        redirectUrl: string;
        paymentType: string;
        qrCodeUrl?: string;
        instructions?: PaymentInstructions;
        provider?: string;
        expiredAt?: string;
      };
    }
  | {
      orderId: string;
      zakatOrderId: string;
      paymentType: string;
      requiresManualVerification: boolean;
    };

export interface TransactionListItem {
  id: string;
  orderId?: string;
  nomorKwitansi?: string;
  jenisTransaksi?: string;
  module?: 'WAQF' | 'ZAKAT' | 'QURBAN' | 'INFAQ';
  programTitle?: string;
  nazhirName?: string;
  amount: string;
  paymentMethod?: string;
  statusPembayaran: TransactionPaymentStatus;
  status?: WaqfOrderStatus;
  createdAt: string;
  /** Batas waktu pembayaran PENDING (ISO), bila tersimpan. */
  paymentExpiresAt?: string;
  /** PENDING, belum kedaluwarsa, dan instruksi/tautan bayar tersimpan. */
  canResume?: boolean;
}

export interface TransactionDetail extends TransactionListItem {
  /** Instruksi untuk "Lanjutkan Pembayaran"; null bila tidak bisa dilanjutkan. */
  resume?: {
    instructions: PaymentInstructions | null;
    url: string | null;
    expiresAt: string;
  } | null;
  donorName?: string;
  isAnonymous?: boolean;
  disbursementDestination?: string;
  paymentGatewayRef?: string;
  certificate?: {
    nomorInternalAmwal?: string;
    nomorRegistrasiBwi?: string;
    pdfUrl?: string;
    issuedAt?: string;
  } | null;
}

export interface WilayahOption {
  kode: string;
  nama: string;
}

export interface ZakatOrderStatusResult {
  /** Instruksi tersimpan untuk melanjutkan pembayaran (QA-02); null bila tidak bisa. */
  payment?: ResumablePayment | null;
  order: {
    id: string;
    jenisZakat: string;
    metodePembayaran: string;
    nominal: string | null;
    jumlahJiwa: number | null;
    namaDizakatkan: string | null;
    namaMuzakki: string;
    isAnonymous: boolean;
    status: string;
    createdAt: string;
  };
  transaction: {
    /** Null untuk non-pemilik (tamu): tautan riwayat/sertifikat hanya untuk pemilik. */
    id: string | null;
    statusPembayaran: TransactionPaymentStatus;
    paymentMethod: string | null;
  } | null;
}
