import { api } from '@/lib/api/client';
import { orpc } from '@/lib/orpc/client';

/**
 * Admin backoffice data layer (Putaran 17, Batch 4).
 *
 * Every function below keeps its ORIGINAL name and return shape from the
 * REST era — only the transport changed, from `api.request('/api/admin/…')`
 * to the equivalent `orpc.admin.*` procedure. This means every consumer
 * component under `components/admin/*` needed zero changes: `useResource()`
 * just wants a `() => Promise<T>`, and an oRPC client call satisfies that
 * exactly like the REST wrapper did. `probeTierCEndpoint` is the one
 * exception — it deliberately keeps hitting raw REST paths, because it
 * exists to prove a Tier C stub (berita/edukasi/kesetiaan/segmentasi, none
 * of which moved this batch) still honestly returns 501.
 */

// ---- Programs -----------------------------------------------------------

export interface AdminWaqfProgramRow {
  id: string;
  kodeProgram: string | null;
  judul: string;
  kategori: string | null;
  deskripsi: string | null;
  durasiHari: number | null;
  jenisWakaf: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL';
  status: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  targetDana: string;
  adminNotes: string | null;
  bannerUrl: string | null;
  rabDocumentUrl: string | null;
  dokumenLegalitasUrl: string | null;
  provinsi: string | null;
  kabupatenKota: string | null;
  kecamatan: string | null;
  kelurahanDesa: string | null;
  kodeWilayah: string | null;
  createdAt: string;
  nadzirProfileId: string;
  namaLembaga: string | null;
  nadzirStatus: string | null;
  namaBank: string | null;
  nomorRekeningBank: string | null;
  atasNamaRekening: string | null;
  pokokDanaTerkumpul: string | null;
  totalHasilAvailable: string | null;
  hasilInvestasiTersalurkan: string | null;
  latestProgressFisik: string | null;
}

export function getAdminWaqfPrograms(): Promise<AdminWaqfProgramRow[]> {
  return orpc.admin.waqf.programsList().then((r) => r.data);
}

export interface WaqfProgramWilayahAndDocsInput {
  bannerUrl?: string;
  rabDocumentUrl?: string;
  dokumenLegalitasUrl?: string;
  provinsi?: string;
  kabupatenKota?: string;
  kecamatan?: string;
  kelurahanDesa?: string;
  kodeWilayah?: string;
  namaBank?: string;
  nomorRekeningBank?: string;
  atasNamaRekening?: string;
}

export interface CreateWaqfProgramInput extends WaqfProgramWilayahAndDocsInput {
  nadzirProfileId: string;
  judul: string;
  deskripsi: string;
  kategori: string;
  targetDana: number;
  durasiHari: number;
  jenisWakaf: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL';
}

export interface CreatedWaqfProgramRow {
  id: string;
  kodeProgram: string | null;
  judul: string;
  kategori: string | null;
  deskripsi: string | null;
  targetDana: string;
  bannerUrl: string | null;
  rabDocumentUrl: string | null;
  dokumenLegalitasUrl: string | null;
  provinsi: string | null;
  kabupatenKota: string | null;
  kecamatan: string | null;
  kelurahanDesa: string | null;
  kodeWilayah: string | null;
}

export function createWaqfProgram(
  input: CreateWaqfProgramInput
): Promise<CreatedWaqfProgramRow> {
  return orpc.admin.waqf.createProgram(input).then((r) => r.data);
}

export interface UpdateWaqfProgramInput extends WaqfProgramWilayahAndDocsInput {
  judul?: string;
  deskripsi?: string;
  kategori?: string;
  targetDana?: number;
  durasiHari?: number;
}

export function updateWaqfProgram(
  id: string,
  input: UpdateWaqfProgramInput
): Promise<CreatedWaqfProgramRow> {
  return orpc.admin.waqf.updateProgram({ id, ...input }).then((r) => r.data);
}

export function deleteWaqfProgram(id: string): Promise<unknown> {
  return orpc.admin.waqf.deleteProgram({ id });
}

export function verifyWaqfProgram(
  id: string,
  body: { status: 'VERIFIED' | 'REJECTED'; adminNotes?: string }
): Promise<unknown> {
  return orpc.admin.waqf.verifyProgram({ id, ...body }).then((r) => r.data);
}

export function recordWaqfYield(
  id: string,
  body: { nominal: number; periodDate: string; description: string }
): Promise<unknown> {
  return orpc.admin.waqf.recordYield({ id, ...body }).then((r) => r.data);
}

// ---- Withdrawal requests ---------------------------------------------

export interface AdminWithdrawalRow {
  id: string;
  waqfProgramId: string;
  amount: string;
  peruntukan: string | null;
  rekeningTujuan: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISBURSED';
  adminNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  judul: string | null;
  jenisWakaf: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL' | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
}

// ---- Laporan progres & lampiran kuitansi ----------------------------

export interface AdminProgressReportRow {
  id: string;
  waqfProgramId: string;
  persentaseFisik: string | null;
  deskripsi: string | null;
  kuitansiUrls: unknown;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
}

export function getAdminProgressReports(
  waqfProgramId: string
): Promise<AdminProgressReportRow[]> {
  return orpc.admin.waqf
    .progressList({ id: waqfProgramId })
    .then((r) => r.data);
}

export interface AdminReceiptAttachmentRow {
  id: string;
  waqfProgramId: string;
  progressReportId: string | null;
  fileName: string;
  title: string | null;
  vendorName: string | null;
  mimeType: string;
  fileSize: number;
  nominal: string | null;
  isPhotoEvidence: boolean;
  createdAt: string;
}

export function getProgramReceipts(
  waqfProgramId: string
): Promise<AdminReceiptAttachmentRow[]> {
  return orpc.receipts.waqf.list({ waqfProgramId }).then((r) => r.data);
}

export function addWaqfProgress(
  waqfProgramId: string,
  body: { persentaseFisik: number; deskripsi: string; attachmentIds?: string[] }
): Promise<unknown> {
  return orpc.admin.waqf
    .addProgress({ id: waqfProgramId, ...body })
    .then((r) => r.data);
}

/**
 * Unggahan berkas biner tidak lewat oRPC (JSON-RPC): rute HTTP murni
 * `POST /api/uploads/receipts` memvalidasi magic bytes, ukuran, dan peran
 * ADMIN, lalu mengembalikan baris `program_receipt_attachments`.
 */
export async function uploadProgramReceipt(input: {
  waqfProgramId: string;
  file: File;
  isPhotoEvidence: boolean;
  nominal?: number;
  title?: string;
  vendorName?: string;
}): Promise<AdminReceiptAttachmentRow> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('waqfProgramId', input.waqfProgramId);
  form.append('isPhotoEvidence', String(input.isPhotoEvidence));
  if (input.nominal !== undefined) {
    form.append('nominal', String(input.nominal));
  }
  if (input.title) {
    form.append('title', input.title);
  }
  if (input.vendorName) {
    form.append('vendorName', input.vendorName);
  }

  const res = await globalThis.fetch('/api/uploads/receipts', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  const payload = (await res.json().catch(() => null)) as {
    data?: AdminReceiptAttachmentRow;
    error?: string;
  } | null;

  if (!(res.ok && payload?.data)) {
    throw new Error(
      payload?.error ?? `Unggah berkas gagal (HTTP ${res.status})`
    );
  }
  return payload.data;
}

/** Signed URL berumur pendek; jangan disimpan, minta ulang saat dibutuhkan. */
export function getReceiptSignedUrl(id: string): Promise<string> {
  return orpc.receipts.waqf.url({ id }).then((r) => r.data.signedUrl);
}

export function updateProgramReceipt(
  id: string,
  body: { title?: string; vendorName?: string; nominal?: number }
): Promise<AdminReceiptAttachmentRow> {
  return orpc.receipts.waqf.update({ id, ...body }).then((r) => r.data);
}

export function deleteProgramReceipt(id: string): Promise<unknown> {
  return orpc.receipts.waqf.remove({ id });
}

// ---- Wakif & Siaran WA -----------------------------------------------

export interface AdminWakifRow {
  id: string;
  namaWakif: string;
  noTelepon: string | null;
  nominal: string | null;
  bentukWakaf: 'UANG' | 'BARANG';
  nomorKwitansi: string;
  createdAt: string;
  statusPembayaran: 'PENDING' | 'LUNAS' | 'GAGAL' | 'DP' | null;
  nomorInternalAmwal: string | null;
  nomorRegistrasiBwi: string | null;
}

export function getAdminWakifList(
  waqfProgramId: string
): Promise<AdminWakifRow[]> {
  return orpc.admin.waqf.wakifList({ id: waqfProgramId }).then((r) => r.data);
}

export interface BroadcastProgressResult {
  totalRecipients: number;
  sent: number;
}

export function broadcastWakifProgress(
  waqfProgramId: string,
  message: string
): Promise<BroadcastProgressResult> {
  return orpc.admin.waqf
    .broadcastProgress({ id: waqfProgramId, message })
    .then((r) => r.data);
}

export function getWithdrawalRequests(
  status?: 'PENDING' | 'APPROVED' | 'REJECTED'
): Promise<AdminWithdrawalRow[]> {
  return orpc.admin.waqf.withdrawalsList({ status }).then((r) => r.data);
}

export function reviewWithdrawal(
  id: string,
  body: { action: 'APPROVE' | 'REJECT'; adminNotes?: string }
): Promise<unknown> {
  return orpc.admin.waqf.reviewWithdrawal({ id, ...body }).then((r) => r.data);
}

// ---- Nadzir --------------------------------------------------------

export interface AdminNadzirRow {
  id: string;
  userId: string;
  kategori: string;
  namaLembaga: string | null;
  nomorRekeningBank: string | null;
  namaBank: string | null;
  nomorRegistrasiBwi: string | null;
  kontakPublik: string | null;
  statusVerifikasi: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedAt: string | null;
  createdAt: string;
  /** Kontak akun ketua; `null` bila akun tidak ditemukan. */
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
}

export function getAdminNadzirList(): Promise<AdminNadzirRow[]> {
  return orpc.admin.waqf.nadzirList().then((r) => r.data);
}

export function verifyNadzir(
  id: string,
  body: {
    status: 'VERIFIED' | 'REJECTED';
    adminNotes?: string;
    nomorRegistrasiBwi?: string;
    kontakPublik?: string;
  }
): Promise<unknown> {
  return orpc.admin.waqf.verifyNadzir({ id, ...body }).then((r) => r.data);
}

/** Ubah nomor BWI / narahubung publik lembaga terverifikasi (D6). */
export function updateNadzirPublicProfile(
  id: string,
  body: { nomorRegistrasiBwi?: string; kontakPublik?: string }
): Promise<unknown> {
  return orpc.admin.waqf
    .updateNadzirPublicProfile({ id, ...body })
    .then((r) => r.data);
}

// ---- ZISWAF: Zakat --------------------------------------------------

export interface AdminZakatOrderRow {
  id: string;
  nomorKwitansi: string;
  namaMuzakki: string;
  isAnonymous: boolean;
  jenisZakat: string;
  metodePembayaran: string;
  nominal: string | null;
  beratBerasKg: string | null;
  jumlahJiwa: number | null;
  status: string;
  createdAt: string;
}

export interface AdminZakatDistributionRow {
  id: string;
  jenisZakat: string;
  nominal: string | null;
  beratBerasKg: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  mustahiqId: string;
  namaMustahiq: string | null;
  kategoriAsnaf: string | null;
}

export interface AdminMustahiqRow {
  id: string;
  namaMustahiq: string;
  kategoriAsnaf: string;
  alamat: string | null;
  noTelepon: string | null;
  statusVerifikasi: string;
  adminNotes: string | null;
  createdAt: string;
}

export function getAdminZakatOrders(
  jenis?: 'FITRAH' | 'MAAL'
): Promise<AdminZakatOrderRow[]> {
  return orpc.admin.zakat.ordersList({ jenis }).then((r) => r.data);
}

export function getAdminZakatDistributions(): Promise<
  AdminZakatDistributionRow[]
> {
  return orpc.admin.zakat.distributionsList().then((r) => r.data);
}

export function getAdminMustahiq(): Promise<AdminMustahiqRow[]> {
  return orpc.admin.zakat.mustahiqList().then((r) => r.data);
}

export type AsnafCategory =
  | 'FAKIR'
  | 'MISKIN'
  | 'AMIL'
  | 'MUALLAF'
  | 'RIQAB'
  | 'GHARIMIN'
  | 'FISABILILLAH'
  | 'IBNU_SABIL';

export function createAdminMustahiq(body: {
  namaMustahiq: string;
  kategoriAsnaf: AsnafCategory;
  alamat?: string;
  noTelepon?: string;
  nik?: string;
}): Promise<{ id: string }> {
  return orpc.admin.zakat.createMustahiq(body).then((r) => r.data);
}

export function addAdminZakatDistribution(body: {
  mustahiqId: string;
  jenisZakat: string;
  nominal?: number;
  beratBerasKg?: number;
  notes?: string;
}): Promise<unknown> {
  return orpc.admin.zakat.addDistribution(body as never).then((r) => r.data);
}

export function overrideGoldPrice(pricePerGram: number): Promise<unknown> {
  return orpc.admin.zakat.setGoldPrice({ pricePerGram }).then((r) => r.data);
}

// ---- ZISWAF: Qurban ----------------------------------------------

/** One animal slot inside a batch — drives the workbench slot map (issue #54). */
export interface AdminHewanBatchSlotRow {
  id: string;
  nomorSlot: number;
  status: string;
}

export interface AdminHewanBatchRow {
  id: string;
  jenisHewan: string;
  totalSlot: number;
  hargaPerSlot: string;
  status: string;
  ras: string | null;
  kelasGrade: string | null;
  wilayahPenyaluran: string | null;
  namaBatch: string | null;
  slots: AdminHewanBatchSlotRow[];
  slotTerpakai: number;
  slotTotal: number;
  createdAt: string;
}

export interface AdminQurbanOrderRow {
  id: string;
  namaPengqurban: string;
  teleponPengqurban: string | null;
  jenisHewan: string;
  tipeKepemilikan: string;
  metodePembayaran: string;
  statusPembayaran: string;
  totalHarga: string;
  nominalDibayar: string;
  sisaTagihan: string;
  akadWakalahAcceptedAt: string | null;
  createdAt: string;
}

export interface AdminQurbanDistributionRow {
  id: string;
  hewanBatchId: string;
  qurbanOrderId: string | null;
  jumlahBagian: string | null;
  tanggalSalur: string | null;
  buktiFotoUrl: string | null;
  createdAt: string;
  jenisHewan: string | null;
  wilayahPenyaluran: string | null;
}

export function getAdminHewanBatches(): Promise<AdminHewanBatchRow[]> {
  return orpc.admin.qurban.batchesList().then((r) => r.data);
}

export function createHewanBatch(body: {
  jenisHewan: 'SAPI' | 'KAMBING';
  totalSlot: number;
  hargaPerSlot: number;
  ras?: string;
  wilayahPenyaluran?: string;
}): Promise<unknown> {
  return orpc.admin.qurban.createBatch(body).then((r) => r.data);
}

/** Izin unggah foto katalog hewan; `publicUrl` disimpan sebagai `fotoUrl`. */
export function getQurbanPhotoUploadUrl(file: File) {
  return orpc.admin.qurban.photoUploadUrl({
    fileName: file.name,
    contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
    size: file.size,
  });
}

export function getAdminQurbanOrders(): Promise<AdminQurbanOrderRow[]> {
  return orpc.admin.qurban.ordersList().then((r) => r.data);
}

export function getAdminQurbanDistributions(): Promise<
  AdminQurbanDistributionRow[]
> {
  return orpc.admin.qurban.distributionsList().then((r) => r.data);
}

export function createQurbanDistribution(body: {
  hewanBatchId: string;
  qurbanOrderId?: string;
  jumlahBagian?: number;
  tanggalSalur?: string;
  buktiFotoUrl?: string;
}) {
  return orpc.admin.qurban.addDistribution(body);
}

// ---- ZISWAF: Infaq ---------------------------------------------

export interface AdminInfaqOrderRow {
  id: string;
  orderId: string;
  namaPenginfaq: string;
  teleponPenginfaq: string | null;
  nominal: string;
  jenis: string;
  doa: string | null;
  status: string;
  createdAt: string;
  hasBukti: boolean;
}

export function getAdminInfaqOrders(
  jenis?: string
): Promise<AdminInfaqOrderRow[]> {
  return orpc.admin.infaq.ordersList({ jenis }).then((r) => r.data);
}

/** Unggah/ganti bukti donasi manual lewat rute HTTP (batas 5 MB ditegakkan server). */
export async function uploadInfaqProof(input: {
  file: File;
  infaqOrderId: string;
}): Promise<void> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('infaqOrderId', input.infaqOrderId);
  const res = await globalThis.fetch('/api/uploads/infaq-proof', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Unggah bukti gagal (HTTP ${res.status})`
    );
  }
}

/** Tautan unduh sesaat; minta ulang tiap dibuka, jangan disimpan. */
export function getInfaqProofUrl(id: string): Promise<string> {
  return orpc.admin.infaq.proofUrl({ id }).then((r) => r.data.signedUrl);
}

export function removeInfaqProof(id: string): Promise<unknown> {
  return orpc.admin.infaq.removeProof({ id });
}

// ---- Operasional: Dokumen Legalitas -------------------------------

export interface AdminDocumentRow {
  id: string;
  nadzirProfileId: string;
  tipeDokumen: string;
  fileUrl: string | null;
  fileDeletedAt: string | null;
  ocrExtractedNama: string | null;
  ocrConfidenceScore: string | null;
  reviewedManually: boolean;
  createdAt: string;
  namaLembaga: string | null;
  nadzirStatus: string | null;
}

export function getAdminDocuments(): Promise<AdminDocumentRow[]> {
  return orpc.admin.documents.list().then((r) => r.data);
}

export function verifyDocument(
  id: string,
  reviewedManually: boolean
): Promise<unknown> {
  return orpc.admin.documents
    .verify({ id, reviewedManually })
    .then((r) => r.data);
}

// ---- Operasional: Transparansi ----------------------------------

export interface TransparencyLogs {
  transactions: {
    id: string;
    jenisTransaksi: string;
    amount: string;
    statusPembayaran: string;
    disbursementDestination: string;
    createdAt: string;
  }[];
  waqfDistributions: {
    id: string;
    namaPenerimaManfaat: string;
    nominalDisalurkan: string | null;
    tanggalPenyaluran: string | null;
    judul: string | null;
  }[];
  zakatDistributions: {
    id: string;
    jenisZakat: string;
    nominal: string | null;
    beratBerasKg: string | null;
    status: string;
    createdAt: string;
  }[];
}

export function getTransparencyLogs(): Promise<TransparencyLogs> {
  return orpc.admin.transparency.logs().then((r) => r.data);
}

// ---- Operasional: Pengaturan / Baileys ------------------------

export interface BaileysStatus {
  status: string;
  phoneNumber?: string;
  reason?: string;
}

export interface BaileysQr {
  qrCodeBase64: string | null;
  status: string;
  reason?: string;
}

export function getBaileysStatus(): Promise<BaileysStatus> {
  return orpc.admin.settings
    .baileysStatus()
    .then((r) => r.data as BaileysStatus);
}

export type AdminRuntimeSettings = Awaited<
  ReturnType<typeof orpc.admin.settings.runtime>
>['data'];

export function getAdminRuntimeSettings(): Promise<AdminRuntimeSettings> {
  return orpc.admin.settings.runtime().then((r) => r.data);
}

export function getBaileysQr(): Promise<BaileysQr> {
  return orpc.admin.settings.baileysQr().then((r) => r.data as BaileysQr);
}

export type WaGatewayState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'SCAN_QR'
  | 'SERVICE_OFFLINE';

export interface WaGatewayStatus {
  phone?: string;
  qrCodeDataUrl?: string;
  reason?: string;
  status: WaGatewayState;
}

export function getWaGatewayStatus(): Promise<WaGatewayStatus> {
  return orpc.admin.wa.getStatus().then((r) => r.data as WaGatewayStatus);
}

export function disconnectWaGateway(): Promise<WaGatewayStatus> {
  return orpc.admin.wa.disconnect().then((r) => r.data as WaGatewayStatus);
}

// ---- Operasional: Entri Amil Offline --------------------------

export interface OfflineZakatInput {
  namaMuzakki: string;
  noTelepon?: string;
  alamat?: string;
  isAnonymous: boolean;
  jenisZakat:
    | 'FITRAH'
    | 'MAAL_PENGHASILAN'
    | 'FIDYAH'
    | 'KAFARAT'
    | 'EMAS'
    | 'PERUSAHAAN'
    | 'PERTANIAN';
  metodePembayaran: 'TUNAI' | 'BERAS';
  nominal?: number;
  beratBerasKg?: number;
  jumlahJiwa?: number;
  notes?: string;
}

export function submitOfflineZakat(body: OfflineZakatInput): Promise<{
  id: string;
  nomorKwitansi: string;
}> {
  return orpc.amil
    .offlineZakat(body)
    .then((r) => ({ id: r.data.id, nomorKwitansi: r.data.nomorKwitansi }));
}

// ---- Ringkasan Utama: KPI operasional (Tier A) ----------------------

export interface AdminOverviewKpi {
  /** Σ nominal transaksi berstatus LUNAS — string numeric dari Drizzle. */
  totalFundsCollected: string;
  paidTransactions: number;
  totalTransactions: number;
  activePrograms: number;
}

export function getAdminOverviewKpi(): Promise<AdminOverviewKpi> {
  return orpc.admin.overview.kpi();
}

// ---- Analitik periode WIB (I-7) --------------------------------------

export interface AnalyticsTrendPoint {
  label: string;
  uniqueDonors: number;
  totalTransactions: number;
}

export interface AnalyticsAccumulationPoint {
  label: string;
  amount: number;
  cumulativeAmount: number;
}

export interface AnalyticsCompositionPoint {
  module: string;
  amount: number;
}

export function getAnalyticsTrend(
  year: number
): Promise<AnalyticsTrendPoint[]> {
  return orpc.admin.analytics.trend({ year }).then((r) => r.data);
}

export function getAnalyticsAccumulation(
  year: number
): Promise<AnalyticsAccumulationPoint[]> {
  return orpc.admin.analytics.accumulation({ year }).then((r) => r.data);
}

export function getAnalyticsComposition(
  year: number
): Promise<AnalyticsCompositionPoint[]> {
  return orpc.admin.analytics.composition({ year }).then((r) => r.data);
}

// ---- Tier C: probe stub 501 --------------------------------------------

export interface TierCProbe {
  /** Selalu false — endpoint Tier C belum diimplementasikan. */
  implemented: false;
  /** Kode HTTP nyata dari server, apa pun itu. */
  status: number;
}

/**
 * Memanggil endpoint stub Tier C dan melaporkan status HTTP-nya apa adanya.
 * View memakai ini untuk menampilkan keadaan jujur alih-alih memalsukan data
 * — AMW-10 / AMW-11.
 *
 * Sejak `apps/server` dinonaktifkan (Batch 6) jalur ini menjawab 404, bukan
 * 501 seperti era stub Hono: tidak ada lagi yang melayaninya. Fungsi ini
 * sengaja tidak menormalkan kode tersebut — memaksakan 501 justru akan
 * menyembunyikan fakta bahwa backend-nya memang tidak ada.
 * Tetap REST murni: berita/edukasi/kesetiaan/segmentasi belum pindah ke oRPC.
 */
export async function probeTierCEndpoint(path: string): Promise<TierCProbe> {
  const res = await api.request<unknown>(path);
  return { implemented: false, status: res.status };
}

// ---- Edukasi: statistik header & kategori ----------------------------

export interface AdminEducationStats {
  totalArtikel: number;
  totalVideo: number;
  totalLike: number;
}

export function getAdminEducationStats(): Promise<AdminEducationStats> {
  return orpc.admin.education.stats().then((r) => r.data);
}

export interface AdminEducationCategoryRow {
  id: string;
  name: string;
  type: 'article' | 'video';
  slug: string;
  createdAt: string;
}

export function getAdminEducationCategories(
  type: 'article' | 'video'
): Promise<AdminEducationCategoryRow[]> {
  return orpc.admin.education.categories.list({ type }).then((r) => r.data);
}

export function createAdminEducationCategory(
  name: string,
  type: 'article' | 'video'
): Promise<AdminEducationCategoryRow> {
  return orpc.admin.education.categories
    .create({ name, type })
    .then((r) => r.data);
}

export function updateAdminEducationCategory(
  id: string,
  name: string
): Promise<AdminEducationCategoryRow> {
  return orpc.admin.education.categories
    .update({ id, name })
    .then((r) => r.data);
}

export function deleteAdminEducationCategory(id: string): Promise<unknown> {
  return orpc.admin.education.categories.delete({ id });
}

export interface AdminEducationVideoRow {
  id: string;
  title: string;
  categoryId: string | null;
  sourceType: 'upload' | 'embed';
  videoUrl: string;
  speaker: string | null;
  thumbnailUrl: string;
  description: string | null;
  likesCount: number;
  status: string;
  createdAt: string;
}

export interface AdminEducationVideoInput {
  title: string;
  categoryId?: string | null;
  /** Tautan YouTube apa pun yang lazim; server menormalkannya. */
  videoUrl: string;
  speaker?: string;
  /** Kosong = thumbnail resmi YouTube. */
  thumbnailUrl?: string;
  description?: string;
}

export function createAdminEducationVideo(
  input: AdminEducationVideoInput
): Promise<AdminEducationVideoRow> {
  return orpc.admin.education.videos
    .create({ ...input, status: 'published' })
    .then((r) => r.data);
}

export interface AdminEducationVideoListRow extends AdminEducationVideoRow {
  categoryName: string | null;
}

export function getAdminEducationVideos(): Promise<
  AdminEducationVideoListRow[]
> {
  return orpc.admin.education.videos.list().then((r) => r.data);
}

export function deleteAdminEducationVideo(id: string): Promise<unknown> {
  return orpc.admin.education.videos.delete({ id });
}

export interface UpdateAdminEducationVideoInput {
  id: string;
  title: string;
  categoryId?: string | null;
  videoUrl: string;
  speaker?: string;
  authorName?: string;
  thumbnailUrl?: string;
  description?: string;
  durationSeconds?: number;
  status?: 'published' | 'draft';
}

export function updateAdminEducationVideo(
  input: UpdateAdminEducationVideoInput
): Promise<AdminEducationVideoRow> {
  return orpc.admin.education.videos
    .update(input)
    .then((r) => r.data as unknown as AdminEducationVideoRow);
}

export interface AdminEducationQuizOption {
  key: string;
  text: string;
}

export interface AdminEducationQuizQuestionInput {
  question: string;
  options: AdminEducationQuizOption[];
  correctKey: string;
  explanation?: string;
}

export interface AdminEducationArticleRow {
  id: string;
  title: string;
  slug: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  authorName: string;
  content: string;
  status: string;
  likesCount: number;
  createdAt: string;
}

export interface AdminEducationArticleListRow extends AdminEducationArticleRow {
  categoryName: string | null;
  quizQuestionsCount: number;
}

export interface AdminEducationArticleInput {
  title: string;
  categoryId?: string | null;
  coverImageUrl?: string;
  authorName?: string;
  content: string;
  quiz?: AdminEducationQuizQuestionInput[];
}

export function getAdminEducationArticles(): Promise<
  AdminEducationArticleListRow[]
> {
  return orpc.admin.education.articles.list().then((r) => r.data);
}

export function createAdminEducationArticle(
  input: AdminEducationArticleInput
): Promise<AdminEducationArticleRow> {
  return orpc.admin.education.articles.create(input).then((r) => r.data);
}

export interface AdminEducationArticleDetail extends AdminEducationArticleRow {
  quiz: AdminEducationQuizQuestionInput[];
}

export function getAdminEducationArticle(
  id: string
): Promise<AdminEducationArticleDetail> {
  return orpc.admin.education.articles.get({ id }).then((r) => r.data);
}

export function updateAdminEducationArticle(
  id: string,
  input: AdminEducationArticleInput
): Promise<AdminEducationArticleRow> {
  return orpc.admin.education.articles
    .update({ id, ...input })
    .then((r) => r.data);
}

export function deleteAdminEducationArticle(id: string): Promise<unknown> {
  return orpc.admin.education.articles.delete({ id });
}

// ---- User management + RBAC matrix --------------------------------

type AdminUsersList = Awaited<ReturnType<typeof orpc.admin.users.list>>['data'];
export type AdminUsersPage = AdminUsersList;
export type AdminUserRow = AdminUsersList['items'][number];
export type RoleMatrixData = Awaited<
  ReturnType<typeof orpc.admin.roles.getMatrix>
>['data']['matrix'];
export type RoleMatrixChange = Parameters<
  typeof orpc.admin.roles.updateMatrix
>[0]['changes'][number];
export type CreateStaffInput = Parameters<
  typeof orpc.admin.users.createStaff
>[0];
export type CreatedStaff = Awaited<
  ReturnType<typeof orpc.admin.users.createStaff>
>['data'];

export function getAdminUsers(
  params: Parameters<typeof orpc.admin.users.list>[0]
): Promise<AdminUsersPage> {
  return orpc.admin.users.list(params).then((r) => r.data);
}

export function updateAdminUserRole(
  input: Parameters<typeof orpc.admin.users.updateRole>[0]
) {
  return orpc.admin.users.updateRole(input).then((r) => r.data);
}

export function setAdminUserActive(userId: string, isActive: boolean) {
  return orpc.admin.users
    .toggleStatus({ userId, isActive })
    .then((r) => r.data);
}

export function createAdminStaff(
  input: CreateStaffInput
): Promise<CreatedStaff> {
  return orpc.admin.users.createStaff(input).then((r) => r.data);
}

export function getRoleMatrix(): Promise<RoleMatrixData> {
  return orpc.admin.roles.getMatrix().then((r) => r.data.matrix);
}

export function updateRoleMatrix(
  changes: RoleMatrixChange[]
): Promise<RoleMatrixData> {
  return orpc.admin.roles.updateMatrix({ changes }).then((r) => r.data.matrix);
}

// ---- Transparency ledger + donor analytics ------------------------

type LedgerResponse = Awaited<
  ReturnType<typeof orpc.admin.transparency.getLedger>
>['data'];
export type AdminLedgerPage = LedgerResponse;
export type AdminLedgerRow = LedgerResponse['items'][number];
export type AdminLedgerInput = Parameters<
  typeof orpc.admin.transparency.getLedger
>[0];

type RealizationResponse = Awaited<
  ReturnType<typeof orpc.admin.transparency.getRealizationLog>
>['data'];
export type AdminRealizationPage = RealizationResponse;
export type AdminRealizationRow = RealizationResponse['items'][number];
export type AdminRealizationInput = Parameters<
  typeof orpc.admin.transparency.getRealizationLog
>[0];

type RfmResponse = Awaited<
  ReturnType<typeof orpc.admin.analytics.getRFMSegments>
>['data'];
export type AdminRfmPage = RfmResponse;
export type AdminRfmDonor = RfmResponse['items'][number];
export type AdminRfmInput = Parameters<
  typeof orpc.admin.analytics.getRFMSegments
>[0];

type CohortResponse = Awaited<
  ReturnType<typeof orpc.admin.analytics.getRetentionCohort>
>['data'];
export type AdminCohortData = CohortResponse;
export type AdminCohortInput = Parameters<
  typeof orpc.admin.analytics.getRetentionCohort
>[0];

export function getAdminLedger(input: AdminLedgerInput) {
  return orpc.admin.transparency.getLedger(input).then((r) => r.data);
}

export function getAdminRealizationLog(input: AdminRealizationInput) {
  return orpc.admin.transparency.getRealizationLog(input).then((r) => r.data);
}

export function getAdminRfmSegments(input: AdminRfmInput) {
  return orpc.admin.analytics.getRFMSegments(input).then((r) => r.data);
}

export function getAdminRetentionCohort(input: AdminCohortInput) {
  return orpc.admin.analytics.getRetentionCohort(input).then((r) => r.data);
}
