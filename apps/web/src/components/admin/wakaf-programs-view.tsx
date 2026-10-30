import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  CreditCard,
  DollarSign,
  Download,
  Edit3,
  Eye,
  FileText,
  Landmark,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sliders,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import {
  DocumentationGallery,
  ReceiptThumb,
} from '@/components/admin/receipt-preview';
import {
  useMasterData,
  withCurrentOption,
} from '@/components/admin/use-master-data';
import { confirmAction } from '@/components/ui/confirm-action';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { useDirtyGuard } from '@/components/ui/use-dirty-guard';
import {
  getDistricts,
  getProvinces,
  getRegencies,
  getVillages,
} from '@/lib/amwal-api';
import {
  addWaqfProgress,
  broadcastWakifProgress,
  createWaqfProgram,
  deleteProgramReceipt,
  deleteWaqfProgram,
  getAdminNadzirList,
  getAdminWakifList,
  getAdminWaqfPrograms,
  getProgramReceipts,
  getReceiptSignedUrl,
  getWithdrawalRequests,
  recordWaqfYield,
  reviewWithdrawal,
  updateProgramReceipt,
  updateWaqfProgram,
  uploadProgramReceipt,
} from '@/lib/amwal-api/admin';
import type { WilayahOption } from '@/lib/amwal-api/types';
import {
  clearDraft,
  readDraft,
  type StoredDraft,
  writeDraft,
} from '@/lib/form-draft';
import { describeRpcError } from '@/lib/orpc/error-message';
import { sanitizePercentInput } from '@/lib/percent-input';
import { formatFileSize, validateReceiptFile } from '@/lib/receipt-file';

export interface ReceiptItem {
  id: string;
  title: string;
  vendor?: string;
  amount: number;
  fileName: string;
  mimeType?: string;
  date: string;
  status?: string;
  ocrDetected?: boolean;
  notes?: string;
}

export interface TerminItem {
  id: string;
  programId: string;
  terminKe: string;
  nominal: number;
  targetRekening: string;
  status: string;
  rawStatus?: string;
  adminNotes?: string;
  tanggalPengajuan: string;
  dokumen: string;
  requestedBy?: string;
  approvedBy?: string | null;
}

export interface YieldItem {
  id: string;
  programId: string;
  nominal: number;
  sourceDescription: string;
  recordedAt: string;
}

export interface WakifItem {
  id: string;
  orderId: string;
  programId: string;
  name: string;
  phone: string;
  nominal: number;
  tanggal: string;
  akad: string;
  nomorKwitansi?: string;
  sertifikatNo: string;
  nomorRegistrasiBwi?: string | null;
  statusSertifikat: string;
}

export interface WaqfProgramItem {
  id: string;
  kodeProgram: string | null;
  name: string;
  akad: 'Wakaf Uang' | 'Wakaf Melalui Uang';
  kategori: string;
  targetAmount: number;
  collectedAmount: number;
  availableYield?: number;
  distributedYield?: number;
  description: string;
  status:
    | 'Aktif'
    | 'Menunggu Persetujuan Super Admin'
    | 'Butuh Revisi'
    | 'Ditolak'
    | 'Selesai'
    | 'Draft';
  rawStatus?: string;
  targetPenerimaManfaat?: string;
  bannerUrl: string;
  rabDocumentUrl?: string;
  dokumenLegalitasUrl?: string;
  supportingDoc?: string;
  durationStart?: string;
  durationEnd?: string;
  duration?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  bankAccount?: string;
  province: string;
  city: string;
  kecamatan?: string;
  kelurahanDesa?: string;
  kodeWilayah?: string;
  locationDetail?: string;
  jenisWakaf: 'Wakaf Uang' | 'Wakaf Melalui Uang';
  rawJenisWakaf?: string;
  menerimaWakafBarang: 'Ya' | 'Tidak';
  progressFisik: number;
  receipts: ReceiptItem[];
  terminList?: TerminItem[];
  yieldList?: YieldItem[];
  wakifList?: WakifItem[];
  submitterName?: string;
  submitterRole?: string;
}

/**
 * "Aktif" mengikuti kolom `status` (DRAFT/LIVE/SELESAI) — status riil program
 * di database, bukan `verificationStatus` (PENDING/VERIFIED/REJECTED), yang
 * merupakan alur tinjauan admin terpisah dan boleh tetap PENDING sementara
 * program sudah LIVE menerima donasi.
 */
function programStatusLabel(
  status: string,
  verificationStatus: string
): WaqfProgramItem['status'] {
  if (status === 'LIVE') {
    return 'Aktif';
  }
  if (status === 'SELESAI') {
    return 'Selesai';
  }
  if (verificationStatus === 'REJECTED') {
    return 'Ditolak';
  }
  if (verificationStatus === 'PENDING') {
    return 'Menunggu Persetujuan Super Admin';
  }
  return 'Draft';
}

/** Status sertifikat AIW ditampilkan di tab Daftar Wakif. */
function wakifCertificateStatus(
  nomorInternalAmwal: string | null,
  statusPembayaran: string | null
): string {
  if (nomorInternalAmwal) {
    return 'Terbit & Terverifikasi BWI';
  }
  if (statusPembayaran === 'LUNAS') {
    return 'Menunggu Penerbitan Sertifikat';
  }
  return 'Menunggu Pembayaran';
}

const NON_DIGITS_LOCAL_REGEX = /\D/g;

/** `https://wa.me/<62xxxx>?text=...` — Personal fallback saat bot WA offline. */
function toWaMeLink(phone: string, message: string): string {
  const digits = phone.replace(NON_DIGITS_LOCAL_REGEX, '');
  const withCountryCode = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

/** Draf siaran progres — data riil, bukan placeholder. */
function buildProgressBroadcastMessage(program: WaqfProgramItem): string {
  const realisasiBelanja = program.receipts.reduce(
    (acc, r) => acc + r.amount,
    0
  );

  return [
    "Assalamu'alaikum warahmatullahi wabarakatuh,",
    '',
    `Alhamdulillah, kami sampaikan perkembangan program wakaf "${program.name}":`,
    '',
    `- Progres fisik pembangunan: ${program.progressFisik}%`,
    `- Dana terkumpul: Rp ${program.collectedAmount.toLocaleString('id-ID')} dari target Rp ${program.targetAmount.toLocaleString('id-ID')}`,
    `- Realisasi penggunaan dana (nota & kuitansi belanja): Rp ${realisasiBelanja.toLocaleString('id-ID')}`,
    '',
    'Semoga Allah SWT menerima wakaf Bapak/Ibu sebagai amal jariyah yang terus mengalir keberkahannya. Barakallahu fiikum.',
    '',
    'Amwal - Platform Islamic Social Finance',
  ].join('\n');
}

/** "Semester I - 2026 (Jan - Jun 2026)" gaya format Laporan BWI. */
function currentSemesterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const isFirstHalf = now.getMonth() < 6;
  return isFirstHalf
    ? `Semester I - ${year} (Jan - Jun ${year})`
    : `Semester II - ${year} (Jul - Des ${year})`;
}

async function loadWaqfPrograms(): Promise<WaqfProgramItem[]> {
  const [programs, withdrawals] = await Promise.all([
    getAdminWaqfPrograms(),
    getWithdrawalRequests().catch(() => []),
  ]);

  if (!programs || programs.length === 0) {
    return [];
  }

  const [receiptsPerProgram, wakifPerProgram] = await Promise.all([
    Promise.all(
      programs.map((program) => getProgramReceipts(program.id).catch(() => []))
    ),
    Promise.all(
      programs.map((program) => getAdminWakifList(program.id).catch(() => []))
    ),
  ]);

  return programs.map((program, index) => {
    const isProduktif = program.jenisWakaf === 'PRODUKTIF_KEKAL';
    const akad: WaqfProgramItem['akad'] = isProduktif
      ? 'Wakaf Uang'
      : 'Wakaf Melalui Uang';

    const receipts: ReceiptItem[] = (receiptsPerProgram[index] ?? []).map(
      (attachment) => ({
        id: attachment.id,
        title: attachment.title || attachment.fileName,
        vendor: attachment.vendorName || undefined,
        amount: Number(attachment.nominal ?? 0),
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        date: new Date(attachment.createdAt).toLocaleDateString('id-ID'),
        status: attachment.isPhotoEvidence ? 'Foto Bukti' : 'Kuitansi',
      })
    );

    const wakifList: WakifItem[] = (wakifPerProgram[index] ?? []).map(
      (row) => ({
        id: row.id,
        orderId: row.id,
        programId: program.id,
        name: row.namaWakif,
        phone: row.noTelepon || '',
        nominal: Number(row.nominal ?? 0),
        tanggal: new Date(row.createdAt).toLocaleDateString('id-ID'),
        akad: row.bentukWakaf === 'UANG' ? 'Wakaf Uang' : 'Wakaf Melalui Uang',
        nomorKwitansi: row.nomorKwitansi,
        sertifikatNo: row.nomorInternalAmwal || '—',
        nomorRegistrasiBwi: row.nomorRegistrasiBwi,
        statusSertifikat: wakifCertificateStatus(
          row.nomorInternalAmwal,
          row.statusPembayaran
        ),
      })
    );

    const terminList: TerminItem[] = withdrawals
      .filter((row) => row.waqfProgramId === program.id)
      .map((row, terminIndex) => ({
        id: row.id,
        programId: program.id,
        terminKe: row.peruntukan || `Termin ${terminIndex + 1}`,
        nominal: Number(row.amount),
        targetRekening: row.rekeningTujuan || '—',
        status: row.status,
        rawStatus: row.status,
        adminNotes: row.adminNotes || '',
        tanggalPengajuan: new Date(row.createdAt).toLocaleDateString('id-ID'),
        dokumen: 'SPK_Pencairan.pdf',
        requestedBy: row.requestedByName || '—',
      }));

    return {
      id: program.id,
      kodeProgram: program.kodeProgram,
      name: program.judul,
      akad,
      kategori: program.kategori || 'Infrastruktur & Sosial',
      targetAmount: Number(program.targetDana),
      collectedAmount: Number(program.pokokDanaTerkumpul ?? 0),
      availableYield: Number(program.totalHasilAvailable ?? 0),
      distributedYield: Number(program.hasilInvestasiTersalurkan ?? 0),
      description: program.deskripsi || '',
      targetPenerimaManfaat:
        (program as { targetPenerimaManfaat?: string }).targetPenerimaManfaat ??
        undefined,
      status: programStatusLabel(program.status, program.verificationStatus),
      rawStatus: program.status,
      bannerUrl: program.bannerUrl || FALLBACK_BANNER_URL,
      rabDocumentUrl: program.rabDocumentUrl ?? undefined,
      dokumenLegalitasUrl: program.dokumenLegalitasUrl ?? undefined,
      duration: program.durasiHari ? `${program.durasiHari} Hari` : '60 Hari',
      bankName: program.namaBank ?? undefined,
      bankAccountNumber: program.nomorRekeningBank ?? undefined,
      bankAccountHolder:
        program.atasNamaRekening ?? program.namaLembaga ?? undefined,
      bankAccount: [program.namaBank, program.nomorRekeningBank]
        .filter(Boolean)
        .join(' - '),
      province: program.provinsi || '',
      city: program.kabupatenKota || '',
      kecamatan: program.kecamatan ?? undefined,
      kelurahanDesa: program.kelurahanDesa ?? undefined,
      kodeWilayah: program.kodeWilayah ?? undefined,
      locationDetail: '',
      jenisWakaf: akad,
      rawJenisWakaf: program.jenisWakaf,
      menerimaWakafBarang: 'Ya',
      progressFisik: Math.round(Number(program.latestProgressFisik ?? 0)),
      receipts,
      terminList,
      yieldList: [],
      wakifList: [],
    };
  });
}

export interface WakafProgramsViewProps {
  initialPrograms?: WaqfProgramItem[];
  nadzirProfiles?: Array<{
    id: string;
    namaLembaga: string | null;
    namaBank: string | null;
    nomorRekeningBank: string | null;
  }>;
  view?: 'list' | 'create' | 'receipts';
}

/** Placeholder shown for programs without a banner — never persisted. */
const FALLBACK_BANNER_URL =
  '/assets/images/wakaf/wakaf-air-bersih-desa-nurul-amanah.png';

export const BANK_OPTIONS = [
  'BSI',
  'Bank Muamalat',
  'BCA Syariah',
  'Bank Mega Syariah',
  'Bank Mandiri',
  'BRI',
  'BNI',
  'BCA',
];

/** Label akad internal form (dipakai logika simpan) dari jenis wakaf master. */
function akadJenisWakafLabel(
  jenisWakaf: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL' | null | undefined
): '' | 'Wakaf Uang' | 'Wakaf Melalui Uang' {
  if (jenisWakaf === 'PRODUKTIF_KEKAL') {
    return 'Wakaf Uang';
  }
  return jenisWakaf === 'HABIS_PAKAI' ? 'Wakaf Melalui Uang' : '';
}

const NON_DIGITS_REGEX = /\D/g;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_BANNER_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_LEGAL_DOC_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Format ketikan nominal dengan pemisah ribuan id-ID, angka mentah saja. */
function toThousandsDisplay(rawValue: string): string {
  const digits = rawValue.replace(NON_DIGITS_REGEX, '');
  return digits ? Number(digits).toLocaleString('id-ID') : '';
}

/** Nilai numerik murni dari string yang sudah diberi pemisah ribuan. */
function parseThousands(displayValue: string): number {
  return Number(displayValue.replace(NON_DIGITS_REGEX, '')) || 0;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Selisih hari inklusif antara dua tanggal, minimal 1 hari. */
function durationDaysBetween(startDate: string, endDate: string): number {
  if (!(startDate && endDate)) {
    return 60;
  }
  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.max(1, Math.ceil(diffMs / MS_PER_DAY));
}

const PROGRAM_DRAFT_KEY = 'amwal:wakaf-program-draft:v1';

/** Berkas base64 (banner, RAB, legalitas) terlalu besar untuk sessionStorage. */
function withoutDraftFiles<
  T extends {
    bannerUrl: string;
    dokumenLegalitasName: string;
    dokumenLegalitasUrl: string;
    rabDocumentName: string;
    rabDocumentUrl: string;
  },
>(form: T) {
  const {
    bannerUrl: _banner,
    dokumenLegalitasName: _legalName,
    dokumenLegalitasUrl: _legalUrl,
    rabDocumentName: _rabName,
    rabDocumentUrl: _rabUrl,
    ...rest
  } = form;
  return rest;
}

/** Foto dokumentasi kegiatan (bukan nota belanja). */
function isPhotoReceipt(receipt: ReceiptItem): boolean {
  return Boolean(
    receipt.status?.includes('Foto') || receipt.status?.includes('Dokumentasi')
  );
}

function receiptsForTab(receipts: ReceiptItem[], tab: string): ReceiptItem[] {
  return receipts.filter((receipt) =>
    tab === 'docs' ? isPhotoReceipt(receipt) : !isPhotoReceipt(receipt)
  );
}

/** Label tahap konstruksi dari persentase progres fisik. */
function progressStageLabel(percent: number): string {
  if (percent >= 80) {
    return 'Tahap Akhir';
  }
  if (percent >= 50) {
    return 'Konstruksi Berjalan';
  }
  return 'Fondasi & Awal';
}

/** Kelas lencana status program pada row card daftar. */
function programStatusBadgeClass(status: WaqfProgramItem['status']): string {
  if (status === 'Aktif') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-800';
  }
  if (status === 'Selesai') {
    return 'border-blue-200 bg-blue-100 text-blue-800';
  }
  if (status === 'Draft') {
    return 'border-amber-200 bg-amber-100 text-amber-800';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

/** Kelas lencana status termin pencairan. */
function terminBadgeClass(status: string, rawStatus?: string): string {
  if (status.includes('Selesai') || rawStatus === 'APPROVED') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-800';
  }
  if (status.includes('Ditolak') || rawStatus === 'REJECTED') {
    return 'border-rose-200 bg-rose-100 text-rose-800';
  }
  return 'border-amber-200 bg-amber-100 text-amber-800';
}

/** Label tombol simpan pada modal program. */
function saveProgramLabel(saving: boolean, editingId: string | null): string {
  if (saving) {
    return 'Menyimpan...';
  }
  return editingId ? 'Simpan Perubahan' : 'Terbitkan Program';
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
export function WakafProgramsView({
  initialPrograms = [],
  nadzirProfiles = [],
  view,
}: WakafProgramsViewProps) {
  const { showToast } = useToast();
  // Picklist form Buat Program Wakaf dari Master Data admin.
  const akadMaster = useMasterData('AKAD_WAQAF');
  const kategoriMaster = useMasterData('KATEGORI_WAQAF');
  const akadOptions = akadMaster.activeOptions.filter((o) => o.jenisWakaf);
  const [selectedAkadId, setSelectedAkadId] = useState('');
  // Saat edit, akad program yang kini nonaktif tetap ditampilkan terpilih.
  const selectedAkad = akadMaster.rows.find((o) => o.id === selectedAkadId);
  const akadSelectOptions =
    selectedAkad && !akadOptions.includes(selectedAkad)
      ? [selectedAkad, ...akadOptions]
      : akadOptions;

  const [programs, setPrograms] = useState<WaqfProgramItem[]>(initialPrograms);
  const [activeView, setActiveView] = useState<'main' | 'detail'>('main');
  const [selectedProgId, setSelectedProgId] = useState<string>(
    initialPrograms[0]?.id || ''
  );
  // Urutan tab mengikuti siklus dana: termin dicairkan -> belanja dengan
  // kuitansi -> dokumentasi fisik di lapangan (UAT #4, Mbak Liha).
  const [workbenchTab, setWorkbenchTab] = useState<
    'termin' | 'receipts' | 'docs' | 'wakif' | 'bwi'
  >('termin');
  const [searchProgramQuery, setSearchProgramQuery] = useState('');
  const [filterKategori, setFilterKategori] = useState<string>('SEMUA');
  const [filterStatus, setFilterStatus] = useState<string>('SEMUA');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Rute `/admin/wakaf` merender tanpa `initialPrograms`, jadi daftar
  // sesungguhnya dimuat dari oRPC di sini. Hasilnya masuk ke state yang sama
  // supaya seluruh aksi lokal (slider progres, stub) tetap bekerja. Kegagalan
  // TIDAK disamarkan dengan data dummy — tampilkan apa adanya supaya masalah
  // sesi/koneksi DB terlihat, bukan tersembunyi di balik angka palsu.
  useEffect(() => {
    let active = true;
    loadWaqfPrograms()
      .then((loaded) => {
        if (!active) {
          return;
        }
        setLoadError(null);
        setPrograms(loaded);
        setSelectedProgId((current) => current || loaded[0]?.id || '');
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Gagal memuat data program wakaf dari server.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Sync if initialPrograms update
  useEffect(() => {
    if (initialPrograms && initialPrograms.length > 0) {
      setPrograms(initialPrograms);
      if (
        !(
          selectedProgId && initialPrograms.find((p) => p.id === selectedProgId)
        )
      ) {
        setSelectedProgId(initialPrograms[0].id);
      }
    }
  }, [initialPrograms, selectedProgId]);

  // Handle URL query parameters for direct tab navigation
  // biome-ignore lint/correctness/useExhaustiveDependencies: `handleOpenAddModal` dideklarasikan SESUDAH efek ini pada berkas hasil restorasi; memasukkannya ke daftar dependensi memicu temporal dead zone, dan memindahkan deklarasinya berarti menata ulang isi komponen yang wajib identik
  useEffect(() => {
    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const viewParam = view || params.get('view');
    const tabParam = params.get('tab');
    if (
      viewParam === 'receipts' ||
      tabParam === 'kuitansi' ||
      tabParam === 'audit'
    ) {
      setActiveView('detail');
      setWorkbenchTab('receipts');
    } else if (viewParam === 'create') {
      handleOpenAddModal();
    }
  }, [view]);

  // Modal / Form state for Add / Edit Program
  const [showModal, setShowModal] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);

  // Rute `/admin/wakaf` tidak mengirim prop `nadzirProfiles` (lembaga
  // pengelola wajib diisi FK di `waqf_programs`), jadi daftarnya dimuat di
  // sini dari oRPC yang sudah ada (`admin.waqf.nadzirList`).
  const [loadedNadzirProfiles, setLoadedNadzirProfiles] = useState<
    NonNullable<WakafProgramsViewProps['nadzirProfiles']>
  >([]);
  useEffect(() => {
    let active = true;
    getAdminNadzirList()
      .then((rows) => {
        if (active) {
          setLoadedNadzirProfiles(rows);
        }
      })
      .catch(() => {
        // Selector tetap kosong; submit akan gagal dengan pesan server yang jelas.
      });
    return () => {
      active = false;
    };
  }, []);
  const effectiveNadzirProfiles =
    nadzirProfiles.length > 0 ? nadzirProfiles : loadedNadzirProfiles;

  // Kunci scroll halaman utama selagi modal terbuka — background yang
  // ter-blur tidak boleh ikut bergeser, hanya konten di dalam modal.
  useEffect(() => {
    if (!showModal) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showModal]);

  // State for Rejecting Withdrawal Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<
    string | null
  >(null);
  const [rejectReason, setRejectReason] = useState('');

  // State for Yield Entry Modal (Wakaf Produktif)
  const [showYieldModal, setShowYieldModal] = useState(false);
  const [yieldAmount, setYieldAmount] = useState('');
  const [yieldDescription, setYieldDescription] = useState('');

  // State for Adding Receipt
  const [newReceiptTitle, setNewReceiptTitle] = useState('');
  const [newReceiptVendor, setNewReceiptVendor] = useState('');
  const [newReceiptAmount, setNewReceiptAmount] = useState('');
  const [newReceiptFile, setNewReceiptFile] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null
  );
  const [bankErrors, setBankErrors] = useState<{
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountHolder?: string;
  }>({});
  // Jenis lampiran ditentukan tab yang terbuka (Kuitansi vs Dokumentasi).
  const newReceiptType: 'KUITANSI' | 'DOKUMENTASI' =
    workbenchTab === 'docs' ? 'DOKUMENTASI' : 'KUITANSI';

  // Isian satu form dipakai dua tab: kosongkan saat berpindah agar judul,
  // vendor, nominal, dan berkas tab sebelumnya tidak terbawa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada pergantian tab
  useEffect(() => {
    setNewReceiptTitle('');
    setNewReceiptVendor('');
    setNewReceiptAmount('');
    setNewReceiptFile('');
    setReceiptFileObject(null);
    setReceiptPreviewUrl(null);
  }, [workbenchTab]);

  // File Input Refs
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const rabFileInputRef = useRef<HTMLInputElement>(null);
  const dokumenLegalitasFileInputRef = useRef<HTMLInputElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  // Object URL dilepas saat pratinjau diganti/dibuang atau komponen ditutup.
  useEffect(
    () => () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    },
    [receiptPreviewUrl]
  );
  // Berkas asli disimpan supaya unggahan benar-benar terkirim ke
  // `POST /api/uploads/receipts`; sebelumnya hanya nama berkas yang dicatat.
  const [receiptFileObject, setReceiptFileObject] = useState<File | null>(null);

  // Lightbox: Detail Bukti Kuitansi & Nota Belanja
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptItem | null>(
    null
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleOpenReceiptPreview = async (rcp: ReceiptItem) => {
    setPreviewReceipt(rcp);
    setPreviewImageUrl(null);
    setIsLoadingPreview(true);
    try {
      const url = await getReceiptSignedUrl(rcp.id);
      setPreviewImageUrl(url);
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Memuat Preview',
        description:
          (error instanceof Error && error.message) ||
          'Tidak dapat memuat berkas kuitansi',
        type: 'error',
      });
      setPreviewReceipt(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Kunci scroll halaman utama selagi lightbox kuitansi terbuka.
  useEffect(() => {
    if (!previewReceipt) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewReceipt]);

  // Modal: Edit Kuitansi (Judul, Vendor, Nominal)
  const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(
    null
  );
  const [editReceiptTitle, setEditReceiptTitle] = useState('');
  const [editReceiptVendor, setEditReceiptVendor] = useState('');
  const [editReceiptAmount, setEditReceiptAmount] = useState('');
  const [isSavingReceiptEdit, setIsSavingReceiptEdit] = useState(false);

  const handleOpenEditReceipt = (rcp: ReceiptItem) => {
    setEditingReceipt(rcp);
    setEditReceiptTitle(rcp.title);
    setEditReceiptVendor(rcp.vendor || '');
    setEditReceiptAmount(String(rcp.amount || ''));
  };

  const handleSaveEditReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(editingReceipt && editReceiptTitle.trim())) {
      return;
    }
    const amountNum = Number.parseFloat(editReceiptAmount) || 0;
    setIsSavingReceiptEdit(true);
    try {
      const updated = await updateProgramReceipt(editingReceipt.id, {
        title: editReceiptTitle.trim(),
        vendorName: editReceiptVendor.trim(),
        nominal: amountNum,
      });

      setPrograms((prev) =>
        prev.map((p) => ({
          ...p,
          receipts: p.receipts.map((r) =>
            r.id === editingReceipt.id
              ? {
                  ...r,
                  title: updated.title || editReceiptTitle.trim(),
                  vendor: updated.vendorName || editReceiptVendor.trim(),
                  amount: Number(updated.nominal ?? amountNum),
                }
              : r
          ),
        }))
      );

      showToast({
        title: 'Kuitansi Diperbarui',
        description: `Data kuitansi "${editReceiptTitle}" berhasil disimpan.`,
        type: 'success',
      });
      setEditingReceipt(null);
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Memperbarui Kuitansi',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    } finally {
      setIsSavingReceiptEdit(false);
    }
  };

  const handleDeleteReceipt = async (receiptId: string, title: string) => {
    const confirmed = await confirmAction({
      title: 'Hapus Kuitansi?',
      description: `Kuitansi "${title}" akan dihapus dari program ini.`,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteProgramReceipt(receiptId);
      setPrograms((prev) =>
        prev.map((p) => ({
          ...p,
          receipts: p.receipts.filter((r) => r.id !== receiptId),
        }))
      );
      showToast({
        title: 'Kuitansi Dihapus',
        description: `Kuitansi "${title}" telah dihapus permanen.`,
        type: 'info',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menghapus Kuitansi',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  // Kunci scroll halaman utama selagi modal edit kuitansi terbuka.
  useEffect(() => {
    if (!editingReceipt) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingReceipt]);

  // Modal: Siaran Perkembangan Proyek ke Wakif
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  const handleOpenBroadcastModal = (program: WaqfProgramItem) => {
    setBroadcastMessage(buildProgressBroadcastMessage(program));
    setShowBroadcastModal(true);
  };

  const handleSendBroadcastViaBot = async (programId: string) => {
    if (!broadcastMessage.trim()) {
      return;
    }
    setIsSendingBroadcast(true);
    try {
      const result = await broadcastWakifProgress(programId, broadcastMessage);
      showToast({
        title: 'Siaran WA Terkirim',
        description: `${result.sent} dari ${result.totalRecipients} wakif berhasil menerima pesan via Bot WA.`,
        type: result.sent > 0 ? 'success' : 'warning',
      });
      setShowBroadcastModal(false);
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Mengirim via Bot WA',
        description:
          (error instanceof Error && error.message) ||
          'Bot WhatsApp tidak dapat dihubungi, gunakan Kirim Personal',
        type: 'error',
      });
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  // Kunci scroll halaman utama selagi modal siaran WA terbuka.
  useEffect(() => {
    if (!showBroadcastModal) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showBroadcastModal]);

  // Modal: Laporan Semester BWI Formal (cetak / simpan sebagai PDF)
  const [showBwiReportModal, setShowBwiReportModal] = useState(false);

  useEffect(() => {
    if (!showBwiReportModal) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showBwiReportModal]);

  // Master Data Wilayah: cascading Provinsi -> Kab/Kota -> Kecamatan ->
  // Kelurahan lewat `router/wilayah.ts` (katalog Kepmendagri, ~91k baris,
  // difetch per jenjang — bukan sekali unduh seluruh tabel).
  const [provinceOptions, setProvinceOptions] = useState<WilayahOption[]>([]);
  const [regencyOptions, setRegencyOptions] = useState<WilayahOption[]>([]);
  const [districtOptions, setDistrictOptions] = useState<WilayahOption[]>([]);
  const [villageOptions, setVillageOptions] = useState<WilayahOption[]>([]);
  const [loadingRegencies, setLoadingRegencies] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);

  // Physical Progress Save State
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  // Teks yang sedang diketik pada kolom persentase (null = tampilkan nilai tersimpan).
  const [percentDraft, setPercentDraft] = useState<string | null>(null);

  // Catatan lapangan dikosongkan tiap kali admin berpindah ke program lain,
  // supaya catatan program sebelumnya tidak ikut terkirim tanpa sengaja.
  useEffect(() => {
    setProgressNote('');
    setPercentDraft(null);
  }, [selectedProgId]);

  // Form Data — semua pilihan kosong secara default (item 4: tanpa auto-fill),
  // admin wajib memilih/mengisi sendiri sebelum submit.
  const [formData, setFormData] = useState({
    name: '',
    targetPenerimaManfaat: '',
    description: '',
    bannerUrl: '',
    rabDocumentUrl: '',
    rabDocumentName: '',
    dokumenLegalitasUrl: '',
    dokumenLegalitasName: '',
    targetAmount: '',
    startDate: toIsoDate(new Date()),
    endDate: addDays(toIsoDate(new Date()), 60),
    bankName: '',
    bankAccountNumber: '',
    bankAccountHolder: '',
    provinceCode: '',
    provinceName: '',
    regencyCode: '',
    regencyName: '',
    districtCode: '',
    districtName: '',
    villageCode: '',
    villageName: '',
    locationDetail: '',
    jenisWakaf: '' as '' | 'Wakaf Uang' | 'Wakaf Melalui Uang',
    kategori: '',
    menerimaWakafBarang: 'Ya' as 'Ya' | 'Tidak',
    nadzirProfileId: effectiveNadzirProfiles[0]?.id || '',
  });

  // Default lembaga Nadzir begitu daftarnya selesai dimuat dari server.
  useEffect(() => {
    if (effectiveNadzirProfiles.length === 0) {
      return;
    }
    setFormData((prev) =>
      prev.nadzirProfileId
        ? prev
        : { ...prev, nadzirProfileId: effectiveNadzirProfiles[0].id }
    );
  }, [effectiveNadzirProfiles]);

  // Modal form program: isiannya panjang, jadi klik di latar tidak menutupnya
  // dan Esc / tombol tutup bertanya dulu bila sudah ada yang diubah (UAT #4).
  // Berkas base64 dibandingkan lewat panjangnya agar tiap render tetap murah;
  // lembaga bawaan diisi asinkron sehingga tidak dihitung sebagai ubahan.
  const closeProgramForm = useCallback(() => {
    setShowModal(false);
    clearDraft(PROGRAM_DRAFT_KEY);
  }, []);
  const { nadzirProfileId: _nadzir, ...formGuardFields } = formData;
  const { isDirty: isProgramFormDirty, requestClose: requestCloseProgramForm } =
    useDirtyGuard({
      open: showModal,
      value: {
        ...formGuardFields,
        bannerUrl: formData.bannerUrl.length,
        rabDocumentUrl: formData.rabDocumentUrl.length,
        dokumenLegalitasUrl: formData.dokumenLegalitasUrl.length,
      },
      onClose: closeProgramForm,
    });

  // Draf form BARU disimpan ke sessionStorage (tertunda 600 ms) selama diisi,
  // supaya refresh yang tak disengaja tidak membuang isiannya.
  type ProgramDraft = {
    form: Partial<ReturnType<typeof withoutDraftFiles<typeof formData>>>;
    selectedAkadId: string;
  };
  const draftRef = useRef<{ hadFiles: boolean; value: ProgramDraft }>({
    hadFiles: false,
    value: { form: {}, selectedAkadId: '' },
  });
  draftRef.current = {
    hadFiles: Boolean(
      formData.bannerUrl ||
        formData.rabDocumentUrl ||
        formData.dokumenLegalitasUrl
    ),
    value: { form: withoutDraftFiles(formData), selectedAkadId },
  };
  const draftJson = JSON.stringify(draftRef.current.value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: draftJson mewakili isi draf terbaru (dibaca lewat ref)
  useEffect(() => {
    if (!(showModal && isProgramFormDirty) || editingProgramId) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeDraft(
        PROGRAM_DRAFT_KEY,
        draftRef.current.value,
        draftRef.current.hadFiles
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftJson, showModal, isProgramFormDirty, editingProgramId]);

  const [draftOffer, setDraftOffer] =
    useState<StoredDraft<ProgramDraft> | null>(null);
  useEffect(() => {
    setDraftOffer(readDraft<ProgramDraft>(PROGRAM_DRAFT_KEY));
  }, []);

  // Tutup modal secara otomatis saat pengguna menekan tombol Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) {
        return;
      }
      if (previewReceipt) {
        setPreviewReceipt(null);
      } else if (editingReceipt) {
        setEditingReceipt(null);
      } else if (showModal) {
        requestCloseProgramForm();
      } else if (rejectModalOpen) {
        setRejectModalOpen(false);
      } else if (showYieldModal) {
        setShowYieldModal(false);
      } else if (showBroadcastModal) {
        setShowBroadcastModal(false);
      } else if (showBwiReportModal) {
        setShowBwiReportModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    previewReceipt,
    editingReceipt,
    showModal,
    rejectModalOpen,
    showYieldModal,
    showBroadcastModal,
    showBwiReportModal,
    requestCloseProgramForm,
  ]);

  useEffect(() => {
    getProvinces()
      .then(setProvinceOptions)
      .catch(() => {
        // Selector tetap kosong; submit akan gagal dengan validasi form.
      });
  }, []);

  const handleProvinceChange = (kode: string) => {
    const nama = provinceOptions.find((p) => p.kode === kode)?.nama || '';
    setFormData((prev) => ({
      ...prev,
      provinceCode: kode,
      provinceName: nama,
      regencyCode: '',
      regencyName: '',
      districtCode: '',
      districtName: '',
      villageCode: '',
      villageName: '',
    }));
    setRegencyOptions([]);
    setDistrictOptions([]);
    setVillageOptions([]);
    if (!kode) {
      return;
    }
    setLoadingRegencies(true);
    getRegencies(kode)
      .then(setRegencyOptions)
      .finally(() => setLoadingRegencies(false));
  };

  const handleRegencyChange = (kode: string) => {
    const nama = regencyOptions.find((r) => r.kode === kode)?.nama || '';
    setFormData((prev) => ({
      ...prev,
      regencyCode: kode,
      regencyName: nama,
      districtCode: '',
      districtName: '',
      villageCode: '',
      villageName: '',
    }));
    setDistrictOptions([]);
    setVillageOptions([]);
    if (!kode) {
      return;
    }
    setLoadingDistricts(true);
    getDistricts(kode)
      .then(setDistrictOptions)
      .finally(() => setLoadingDistricts(false));
  };

  const handleDistrictChange = (kode: string) => {
    const nama = districtOptions.find((d) => d.kode === kode)?.nama || '';
    setFormData((prev) => ({
      ...prev,
      districtCode: kode,
      districtName: nama,
      villageCode: '',
      villageName: '',
    }));
    setVillageOptions([]);
    if (!kode) {
      return;
    }
    setLoadingVillages(true);
    getVillages(kode)
      .then(setVillageOptions)
      .finally(() => setLoadingVillages(false));
  };

  const handleVillageChange = (kode: string) => {
    const nama = villageOptions.find((v) => v.kode === kode)?.nama || '';
    setFormData((prev) => ({ ...prev, villageCode: kode, villageName: nama }));
  };

  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast({
        title: 'Format Berkas Tidak Didukung',
        description: 'Pilih berkas gambar PNG, JPG, atau WEBP.',
        type: 'error',
      });
      return;
    }
    if (file.size > MAX_BANNER_FILE_SIZE_BYTES) {
      showToast({
        title: 'Berkas Terlalu Besar',
        description: 'Ukuran maksimal banner adalah 5MB.',
        type: 'error',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setFormData((prev) => ({ ...prev, bannerUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  /** RAB & Dokumen Legalitas berbagi satu validator: PDF saja, maks 10MB. */
  const handleLegalDocFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'rabDocumentUrl' | 'dokumenLegalitasUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.type !== 'application/pdf') {
      showToast({
        title: 'Format Berkas Tidak Didukung',
        description: 'Pilih berkas PDF.',
        type: 'error',
      });
      return;
    }
    if (file.size > MAX_LEGAL_DOC_FILE_SIZE_BYTES) {
      showToast({
        title: 'Berkas Terlalu Besar',
        description: 'Ukuran maksimal dokumen adalah 10MB.',
        type: 'error',
      });
      return;
    }
    const nameField =
      field === 'rabDocumentUrl' ? 'rabDocumentName' : 'dokumenLegalitasName';
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setFormData((prev) => ({
          ...prev,
          [field]: result,
          [nameField]: file.name,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Pratinjau memakai object URL (tanpa membaca seluruh berkas menjadi base64
  // di thread utama, penyebab lag pada foto kamera berukuran besar).
  const handleReceiptFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Kosongkan agar berkas yang sama bisa dipilih ulang setelah dicoret.
    e.target.value = '';
    if (!file) {
      return;
    }
    const problem = validateReceiptFile(file);
    if (problem) {
      showToast({ ...problem, type: 'error' });
      return;
    }
    setNewReceiptFile(file.name);
    setReceiptFileObject(file);
    setReceiptPreviewUrl(
      file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    );
  };

  const handleOpenAddModal = () => {
    setEditingProgramId(null);
    setBankErrors({});
    setRegencyOptions([]);
    setDistrictOptions([]);
    setVillageOptions([]);
    setFormData({
      name: '',
      targetPenerimaManfaat: '',
      description: '',
      bannerUrl: '',
      rabDocumentUrl: '',
      rabDocumentName: '',
      dokumenLegalitasUrl: '',
      dokumenLegalitasName: '',
      targetAmount: '',
      startDate: toIsoDate(new Date()),
      endDate: addDays(toIsoDate(new Date()), 60),
      bankName: '',
      bankAccountNumber: '',
      bankAccountHolder: '',
      provinceCode: '',
      provinceName: '',
      regencyCode: '',
      regencyName: '',
      districtCode: '',
      districtName: '',
      villageCode: '',
      villageName: '',
      locationDetail: '',
      jenisWakaf: '',
      kategori: '',
      menerimaWakafBarang: 'Ya',
      nadzirProfileId: effectiveNadzirProfiles[0]?.id || '',
    });
    setSelectedAkadId('');
    setShowModal(true);
  };

  const discardProgramDraft = () => {
    clearDraft(PROGRAM_DRAFT_KEY);
    setDraftOffer(null);
  };

  const restoreProgramDraft = async () => {
    const draft = draftOffer;
    if (!draft) {
      return;
    }
    setDraftOffer(null);
    handleOpenAddModal();
    // Isian dipasang SETELAH modal terbuka dengan form kosong, sehingga form
    // yang dipulihkan terhitung "sudah diisi" (Esc bertanya, draf terus tersimpan).
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { form, selectedAkadId: akadId } = draft.value;
    setFormData((prev) => ({ ...prev, ...form }));
    setSelectedAkadId(akadId);
    try {
      if (provinceOptions.length === 0) {
        setProvinceOptions(await getProvinces());
      }
      if (form.provinceCode) {
        setRegencyOptions(await getRegencies(form.provinceCode));
      }
      if (form.regencyCode) {
        setDistrictOptions(await getDistricts(form.regencyCode));
      }
      if (form.districtCode) {
        setVillageOptions(await getVillages(form.districtCode));
      }
    } catch {
      // Pilihan wilayah dimuat ulang begitu admin memilih lagi.
    }
  };

  const handleOpenEditModal = async (prog: WaqfProgramItem) => {
    setEditingProgramId(prog.id);
    setBankErrors({});
    const durasiHariMatch = (prog.duration || '').match(/\d+/);
    const durasiHari = durasiHariMatch ? Number(durasiHariMatch[0]) : 60;
    const bankMatch = (prog.bankAccount || '').match(
      /^(.*?)\s*-\s*(.*?)\s*a\.n\.\s*(.*)$/
    );

    const kw = prog.kodeWilayah || '';
    let provCode = kw.length >= 2 ? kw.slice(0, 2) : '';
    let regCode = kw.length >= 5 ? kw.slice(0, 5) : '';
    let distCode = kw.length >= 8 ? kw.slice(0, 8) : '';
    let villCode = kw.length >= 13 ? kw : '';

    let currentProvinces = provinceOptions;
    if (currentProvinces.length === 0) {
      try {
        currentProvinces = await getProvinces();
        setProvinceOptions(currentProvinces);
      } catch {
        currentProvinces = [];
      }
    }

    const matchedProv = currentProvinces.find(
      (p) =>
        (provCode && p.kode === provCode) ||
        (prog.province &&
          p.nama.trim().toLowerCase() === prog.province.trim().toLowerCase())
    );
    if (matchedProv) {
      provCode = matchedProv.kode;
    }

    let currentRegencies: WilayahOption[] = [];
    let matchedReg: WilayahOption | undefined;
    if (provCode) {
      try {
        currentRegencies = await getRegencies(provCode);
        setRegencyOptions(currentRegencies);
        matchedReg = currentRegencies.find(
          (r) =>
            (regCode && r.kode === regCode) ||
            (prog.city &&
              r.nama.trim().toLowerCase() === prog.city.trim().toLowerCase())
        );
        if (matchedReg) {
          regCode = matchedReg.kode;
        }
      } catch {
        setRegencyOptions([]);
      }
    } else {
      setRegencyOptions([]);
    }

    let currentDistricts: WilayahOption[] = [];
    let matchedDist: WilayahOption | undefined;
    if (regCode) {
      try {
        currentDistricts = await getDistricts(regCode);
        setDistrictOptions(currentDistricts);
        matchedDist = currentDistricts.find(
          (d) =>
            (distCode && d.kode === distCode) ||
            (prog.kecamatan &&
              d.nama.trim().toLowerCase() ===
                prog.kecamatan.trim().toLowerCase())
        );
        if (matchedDist) {
          distCode = matchedDist.kode;
        }
      } catch {
        setDistrictOptions([]);
      }
    } else {
      setDistrictOptions([]);
    }

    let currentVillages: WilayahOption[] = [];
    let matchedVill: WilayahOption | undefined;
    if (distCode) {
      try {
        currentVillages = await getVillages(distCode);
        setVillageOptions(currentVillages);
        matchedVill = currentVillages.find(
          (v) =>
            (villCode && v.kode === villCode) ||
            (prog.kelurahanDesa &&
              v.nama.trim().toLowerCase() ===
                prog.kelurahanDesa.trim().toLowerCase())
        );
        if (matchedVill) {
          villCode = matchedVill.kode;
        }
      } catch {
        setVillageOptions([]);
      }
    } else {
      setVillageOptions([]);
    }

    setFormData({
      name: prog.name || '',
      targetPenerimaManfaat: prog.targetPenerimaManfaat || '',
      description: prog.description || '',
      bannerUrl:
        prog.bannerUrl === FALLBACK_BANNER_URL ? '' : prog.bannerUrl || '',
      rabDocumentUrl: prog.rabDocumentUrl || '',
      rabDocumentName: prog.rabDocumentUrl ? 'Dokumen RAB tersimpan' : '',
      dokumenLegalitasUrl: prog.dokumenLegalitasUrl || '',
      dokumenLegalitasName: prog.dokumenLegalitasUrl
        ? 'Dokumen legalitas tersimpan'
        : '',
      targetAmount: prog.targetAmount
        ? prog.targetAmount.toLocaleString('id-ID')
        : '',
      startDate: toIsoDate(new Date()),
      endDate: addDays(toIsoDate(new Date()), durasiHari),
      bankName: bankMatch?.[1] || prog.bankName || '',
      bankAccountNumber: bankMatch?.[2] || prog.bankAccountNumber || '',
      bankAccountHolder: bankMatch?.[3] || prog.bankAccountHolder || '',
      provinceCode: provCode,
      provinceName: matchedProv?.nama || prog.province || '',
      regencyCode: regCode,
      regencyName: matchedReg?.nama || prog.city || '',
      districtCode: distCode,
      districtName: matchedDist?.nama || prog.kecamatan || '',
      villageCode: villCode,
      villageName: matchedVill?.nama || prog.kelurahanDesa || '',
      locationDetail: prog.locationDetail || '',
      jenisWakaf: prog.jenisWakaf || '',
      kategori: prog.kategori || '',
      menerimaWakafBarang: prog.menerimaWakafBarang || 'Ya',
      nadzirProfileId: effectiveNadzirProfiles[0]?.id || '',
    });
    setSelectedAkadId(
      akadMaster.rows.find((o) => o.jenisWakaf === prog.rawJenisWakaf)?.id ?? ''
    );
    setShowModal(true);
  };

  // Gabungkan 3 field rekening terstruktur ke format string kolom lama.
  function composeBankAccount(): string {
    return `${formData.bankName} - ${formData.bankAccountNumber} a.n. ${formData.bankAccountHolder}`;
  }

  // Rangkai breadcrumb Provinsi/Kab-Kota/Kecamatan/Kelurahan + detail alamat
  // manual menjadi satu string terstruktur. Tidak ada kolom `lokasi` di
  // `waqf_programs` dan skema tabel TIDAK diubah — string ini murni tampilan
  // lokal (field `city`/`province`/`locationDetail` pada `WaqfProgramItem`),
  // persis seperti perilaku form sebelum cascading wilayah dipasang.
  function composeLocation(): string {
    const breadcrumb = [
      formData.villageName,
      formData.districtName,
      formData.regencyName,
      formData.provinceName,
    ]
      .filter(Boolean)
      .join(', ');
    return [formData.locationDetail.trim(), breadcrumb]
      .filter(Boolean)
      .join(', ');
  }

  // 1. CREATE / EDIT PROGRAM (FULLSTACK)
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return;
    }
    if (!formData.jenisWakaf) {
      showToast({
        title: 'Akad Wakaf Belum Dipilih',
        description: 'Pilih Akad / Jenis Wakaf terlebih dahulu.',
        type: 'warning',
      });
      return;
    }
    if (!formData.kategori) {
      showToast({
        title: 'Kategori Belum Dipilih',
        description: 'Pilih Kategori Program terlebih dahulu.',
        type: 'warning',
      });
      return;
    }
    const newBankErrors: {
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountHolder?: string;
    } = {};
    if (!formData.bankName) {
      newBankErrors.bankName = 'Nama bank wajib dipilih.';
    }
    if (!formData.bankAccountNumber.trim()) {
      newBankErrors.bankAccountNumber = 'Nomor rekening bank wajib diisi.';
    }
    if (!formData.bankAccountHolder.trim()) {
      newBankErrors.bankAccountHolder =
        'Nama pemilik rekening (atas nama) wajib diisi.';
    }
    if (Object.keys(newBankErrors).length > 0) {
      setBankErrors(newBankErrors);
      showToast({
        title: 'Rekening Bank Belum Lengkap',
        description:
          'Mohon lengkapi seluruh data rekening bank (Nama Bank, Nomor Rekening, dan Atas Nama).',
        type: 'warning',
      });
      return;
    }

    const jenisWakaf = formData.jenisWakaf;
    setIsLoading(true);
    try {
      const isWakafUang = jenisWakaf === 'Wakaf Uang';
      const targetDanaNum = parseThousands(formData.targetAmount);
      const durasiNum = durationDaysBetween(
        formData.startDate,
        formData.endDate
      );
      const bankAccount = composeBankAccount();
      const composedLocation = composeLocation();

      const wilayahAndDocs = {
        rabDocumentUrl: formData.rabDocumentUrl || undefined,
        dokumenLegalitasUrl: formData.dokumenLegalitasUrl || undefined,
        provinsi: formData.provinceName || undefined,
        kabupatenKota: formData.regencyName || undefined,
        kecamatan: formData.districtName || undefined,
        kelurahanDesa: formData.villageName || undefined,
        kodeWilayah:
          formData.villageCode ||
          formData.districtCode ||
          formData.regencyCode ||
          formData.provinceCode ||
          undefined,
        namaBank: formData.bankName || undefined,
        nomorRekeningBank: formData.bankAccountNumber.trim() || undefined,
        atasNamaRekening: formData.bankAccountHolder.trim() || undefined,
      };

      if (editingProgramId) {
        // PATCH existing program — `admin.waqf.updateProgram` (Audit Remote
        // Supabase). Nadzir/akad/status tidak pernah dikirim di sini (lihat
        // komentar di `updateProgramSchema`), hanya metadata tampilan,
        // target dana/durasi, dan wilayah/dokumen pendukung.
        const updated = await updateWaqfProgram(editingProgramId, {
          judul: formData.name,
          deskripsi: formData.description,
          kategori: formData.kategori,
          targetDana: targetDanaNum,
          durasiHari: durasiNum,
          bannerUrl: formData.bannerUrl || undefined,
          ...wilayahAndDocs,
        });

        setPrograms((prev) =>
          prev.map((p) =>
            p.id === editingProgramId
              ? {
                  ...p,
                  name: updated.judul,
                  targetPenerimaManfaat: formData.targetPenerimaManfaat,
                  description: updated.deskripsi || formData.description,
                  bannerUrl: updated.bannerUrl || formData.bannerUrl,
                  rabDocumentUrl: updated.rabDocumentUrl ?? undefined,
                  dokumenLegalitasUrl: updated.dokumenLegalitasUrl ?? undefined,
                  targetAmount: Number(updated.targetDana),
                  duration: `${durasiNum} Hari`,
                  bankAccount,
                  bankName: formData.bankName,
                  bankAccountNumber: formData.bankAccountNumber,
                  bankAccountHolder: formData.bankAccountHolder,
                  jenisWakaf,
                  kategori: updated.kategori || formData.kategori,
                  akad: jenisWakaf,
                  province: updated.provinsi || formData.provinceName,
                  city: updated.kabupatenKota || formData.regencyName,
                  kecamatan: updated.kecamatan ?? undefined,
                  kelurahanDesa: updated.kelurahanDesa ?? undefined,
                  kodeWilayah: updated.kodeWilayah ?? undefined,
                }
              : p
          )
        );

        showToast({
          title: 'Program Berhasil Diperbarui',
          description: `Data program "${formData.name}" tersimpan permanen di database.`,
          type: 'success',
        });
      } else {
        // POST new program — ditulis langsung ke `waqf_programs` +
        // `waqf_principal_ledgers` lewat `admin.waqf.createProgram`.
        const created = await createWaqfProgram({
          nadzirProfileId: formData.nadzirProfileId,
          judul: formData.name,
          deskripsi: formData.description,
          kategori: formData.kategori,
          targetDana: targetDanaNum,
          durasiHari: durasiNum,
          jenisWakaf: isWakafUang ? 'PRODUKTIF_KEKAL' : 'HABIS_PAKAI',
          bannerUrl: formData.bannerUrl || undefined,
          ...wilayahAndDocs,
        });

        const newProgItem: WaqfProgramItem = {
          id: created.id,
          kodeProgram: created.kodeProgram,
          name: created.judul,
          targetPenerimaManfaat: formData.targetPenerimaManfaat,
          akad: jenisWakaf,
          kategori: created.kategori || formData.kategori,
          targetAmount: Number(created.targetDana),
          collectedAmount: 0,
          availableYield: 0,
          distributedYield: 0,
          description: created.deskripsi || formData.description,
          bannerUrl: created.bannerUrl || formData.bannerUrl,
          rabDocumentUrl: created.rabDocumentUrl ?? undefined,
          dokumenLegalitasUrl: created.dokumenLegalitasUrl ?? undefined,
          duration: `${durasiNum} Hari`,
          bankAccount,
          bankName: formData.bankName,
          bankAccountNumber: formData.bankAccountNumber,
          bankAccountHolder: formData.bankAccountHolder,
          province: created.provinsi || formData.provinceName,
          city: created.kabupatenKota || formData.regencyName,
          kecamatan: created.kecamatan ?? undefined,
          kelurahanDesa: created.kelurahanDesa ?? undefined,
          kodeWilayah: created.kodeWilayah ?? undefined,
          locationDetail: composedLocation,
          jenisWakaf,
          rawJenisWakaf: isWakafUang ? 'PRODUKTIF_KEKAL' : 'HABIS_PAKAI',
          menerimaWakafBarang: formData.menerimaWakafBarang,
          progressFisik: 0,
          status: 'Aktif',
          receipts: [],
          terminList: [],
          yieldList: [],
          wakifList: [],
        };

        setPrograms((prev) => [newProgItem, ...prev]);
        setSelectedProgId(newProgItem.id);

        showToast({
          title: 'Program Berhasil Diterbitkan',
          description: `Program "${formData.name}" tersimpan di database & siap menerima donasi wakaf.`,
          type: 'success',
        });
      }

      closeProgramForm();
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menyimpan Program',
        description: describeRpcError(error, 'Terjadi kesalahan sistem'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. DELETE PROGRAM (FULLSTACK)
  const handleDeleteProgram = async (id: string, name: string) => {
    const confirmed = await confirmAction({
      title: 'Hapus Program Wakaf?',
      description: `Program "${name}" akan dihapus permanen. Program yang sudah memiliki donasi, hasil, pencairan atau penyaluran tidak dapat dihapus.`,
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteWaqfProgram(id);

      setPrograms((prev) => prev.filter((p) => p.id !== id));
      if (selectedProgId === id) {
        setSelectedProgId(programs.find((p) => p.id !== id)?.id || '');
      }

      showToast({
        title: 'Program Dihapus',
        description: `Program "${name}" telah dihapus permanen dari sistem.`,
        type: 'info',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menghapus',
        description: describeRpcError(error, 'Program tidak dapat dihapus'),
        type: 'error',
      });
    }
  };

  // 3. SLIDER PROGRESS LOCAL CHANGE
  const handleSliderChange = (progId: string, newProgress: number) => {
    setPrograms((prev) =>
      prev.map((p) =>
        p.id === progId ? { ...p, progressFisik: newProgress } : p
      )
    );
  };

  // 3b. SAVE PHYSICAL PROGRESS SLIDER (FULLSTACK)
  const handleSaveProgressFisik = async (progId: string) => {
    const prog = programs.find((p) => p.id === progId);
    if (!prog) {
      return;
    }

    const newProgress = prog.progressFisik;
    const trimmedNote = progressNote.trim();
    const deskripsi =
      trimmedNote.length >= 3
        ? trimmedNote
        : `Pembaruan progres fisik pembangunan lapangan menjadi ${newProgress}%.`;
    setIsSavingProgress(true);

    try {
      // Invarian backend: laporan progres WAJIB punya minimal satu foto
      // bukti pada program ini. Bila belum ada, `addProgress` menolak dengan
      // pesan "Butuh minimal satu foto bukti" dan toast di bawah menampilkan
      // pesan itu apa adanya.
      await addWaqfProgress(progId, {
        persentaseFisik: newProgress,
        deskripsi,
      });

      setProgressNote('');

      showToast({
        title: 'Progres Fisik Tersimpan',
        description: `Progres fisik berhasil diperbarui menjadi ${newProgress}%.`,
        type: 'success',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Simpan Progres',
        description:
          (error instanceof Error && error.message) ||
          'Gagal memperbarui progres fisik di server',
        type: 'error',
      });
    } finally {
      setIsSavingProgress(false);
    }
  };

  // 4. ADD RECEIPT (FULLSTACK)
  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReceiptTitle.trim() || isUploadingReceipt) {
      return;
    }
    if (newReceiptType === 'KUITANSI' && !newReceiptAmount) {
      showToast({
        title: 'Nominal Wajib Diisi',
        description: 'Masukkan nominal pengeluaran untuk bukti nota/kuitansi.',
        type: 'warning',
      });
      return;
    }

    const isDokumentasi = newReceiptType === 'DOKUMENTASI';
    const amountNum = Number.parseFloat(newReceiptAmount) || 0;

    setIsUploadingReceipt(true);
    try {
      if (!receiptFileObject) {
        throw new Error(
          isDokumentasi
            ? 'Pilih berkas foto dokumentasi kegiatan terlebih dahulu.'
            : 'Pilih berkas kuitansi terlebih dahulu — lampiran disimpan sebagai berkas, bukan catatan teks'
        );
      }

      // Lampiran diunggah lewat rute HTTP biner `POST /api/uploads/receipts`
      // (satu-satunya jalur unggah; oRPC hanya membawa JSON). Judul, vendor,
      // dan nominal semuanya persisten (kolom `title`/`vendor_name`/`nominal`)
      // — nama file asli tetap terpisah di `file_name`.
      const uploaded = await uploadProgramReceipt({
        waqfProgramId: selectedProgId,
        file: receiptFileObject,
        isPhotoEvidence: isDokumentasi,
        nominal: amountNum,
        title: newReceiptTitle,
        vendorName: newReceiptVendor,
      });

      const newRcp: ReceiptItem = {
        id: uploaded.id,
        title: uploaded.title || newReceiptTitle,
        vendor: uploaded.vendorName || newReceiptVendor || undefined,
        amount: Number(uploaded.nominal ?? amountNum),
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        date: new Date(uploaded.createdAt).toLocaleDateString('id-ID'),
        status: isDokumentasi
          ? 'Foto Dokumentasi Kegiatan'
          : 'Terverifikasi Super Admin',
      };

      setPrograms((prev) =>
        prev.map((p) =>
          p.id === selectedProgId
            ? { ...p, receipts: [newRcp, ...p.receipts] }
            : p
        )
      );

      showToast({
        title: isDokumentasi
          ? 'Dokumentasi Berhasil Diunggah'
          : 'Kuitansi Berhasil Dicatat & Diverifikasi',
        description: isDokumentasi
          ? `Dokumentasi kegiatan "${newReceiptTitle}" berhasil diunggah.`
          : `Nota "${newReceiptTitle}" sebesar Rp ${amountNum.toLocaleString('id-ID')} telah tersimpan permanen di database.`,
        type: 'success',
      });

      setNewReceiptTitle('');
      setNewReceiptVendor('');
      setNewReceiptAmount('');
      setNewReceiptFile('');
      setReceiptFileObject(null);
      setReceiptPreviewUrl(null);
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menambah Kuitansi',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  // 6. APPROVE WITHDRAWAL REQUEST (FULLSTACK)
  const handleApproveWithdrawal = async (withdrawalId: string) => {
    try {
      await reviewWithdrawal(withdrawalId, { action: 'APPROVE' });

      setPrograms((prev) =>
        prev.map((p) => ({
          ...p,
          terminList: (p.terminList || []).map((t) =>
            t.id === withdrawalId
              ? { ...t, status: 'Selesai Dicairkan', rawStatus: 'APPROVED' }
              : t
          ),
        }))
      );

      showToast({
        title: 'Pencairan Dana Disetujui',
        description:
          'Pengajuan penarikan dana berhasil disetujui & mutasi saldo termin telah diperbarui.',
        type: 'success',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menyetujui',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  // 7. REJECT WITHDRAWAL REQUEST (FULLSTACK)
  const handleRejectWithdrawalConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(selectedWithdrawalId && rejectReason.trim())) {
      showToast({
        title: 'Alasan Penolakan Wajib Diisi',
        description: 'Mohon tuliskan alasan audit penolakan termin.',
        type: 'warning',
      });
      return;
    }

    try {
      await reviewWithdrawal(selectedWithdrawalId, {
        action: 'REJECT',
        adminNotes: rejectReason.trim(),
      });

      setPrograms((prev) =>
        prev.map((p) => ({
          ...p,
          terminList: (p.terminList || []).map((t) =>
            t.id === selectedWithdrawalId
              ? {
                  ...t,
                  status: 'Ditolak',
                  rawStatus: 'REJECTED',
                  adminNotes: rejectReason.trim(),
                }
              : t
          ),
        }))
      );

      setRejectModalOpen(false);
      setSelectedWithdrawalId(null);
      setRejectReason('');

      showToast({
        title: 'Pengajuan Penarikan Ditolak',
        description:
          'Status pengajuan termin telah diperbarui menjadi REJECTED.',
        type: 'info',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menolak',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  // 8. RECORD WAQF YIELD ENTRY (FULLSTACK)
  const handleRecordYield = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(yieldAmount && yieldDescription.trim())) {
      return;
    }

    const amountNum = Number.parseFloat(yieldAmount) || 0;

    try {
      // Adapter kontrak: `amount`/`sourceDescription` pada komponen lama
      // menjadi `nominal`/`description`; `periodDate` wajib diisi kontrak
      // dan diambil dari tanggal hari ini.
      const entry = (await recordWaqfYield(selectedProgram.id, {
        nominal: amountNum,
        periodDate: new Date().toISOString(),
        description: yieldDescription.trim(),
      })) as { id?: string; amount?: string; sourceDescription?: string };

      const newYieldItem: YieldItem = {
        id: entry.id ?? `YLD-${Date.now()}`,
        programId: selectedProgram.id,
        nominal: Number(entry.amount ?? amountNum),
        sourceDescription: entry.sourceDescription ?? yieldDescription.trim(),
        recordedAt: new Date().toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      };

      setPrograms((prev) =>
        prev.map((p) =>
          p.id === selectedProgram.id
            ? {
                ...p,
                availableYield: (p.availableYield || 0) + amountNum,
                yieldList: [newYieldItem, ...(p.yieldList || [])],
              }
            : p
        )
      );

      setShowYieldModal(false);
      setYieldAmount('');
      setYieldDescription('');

      showToast({
        title: 'Bagi Hasil Berhasil Dicatat',
        description: `Surplus hasil investasi sebesar Rp ${amountNum.toLocaleString('id-ID')} telah masuk ke totalHasilAvailable.`,
        type: 'success',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Mencatat Bagi Hasil',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  const kategoriOptions = Array.from(
    new Set(programs.map((p) => p.kategori).filter(Boolean))
  );

  const filteredPrograms = programs.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchProgramQuery.toLowerCase()) ||
      p.city.toLowerCase().includes(searchProgramQuery.toLowerCase()) ||
      p.kategori.toLowerCase().includes(searchProgramQuery.toLowerCase());
    const matchesKategori =
      filterKategori === 'SEMUA' || p.kategori === filterKategori;
    const matchesStatus = filterStatus === 'SEMUA' || p.status === filterStatus;
    return matchesSearch && matchesKategori && matchesStatus;
  });

  const selectedProgram =
    programs.find((p) => p.id === selectedProgId) || programs[0];

  const activePrograms = programs.filter((p) => p.status === 'Aktif');

  const currentTerminList = selectedProgram?.terminList || [];
  const currentYieldList = selectedProgram?.yieldList || [];
  const currentWakifList = selectedProgram?.wakifList || [];

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. HALAMAN UTAMA: DAFTAR PROGRAM WAKAF & KELOLA                           */}
      {/* ========================================================================= */}
      {activeView === 'main' && (
        <>
          {loadError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Gagal memuat program wakaf dari database: {loadError}</span>
            </div>
          )}
          {draftOffer && !showModal && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 text-sm"
              role="status"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <strong>Ditemukan draf yang belum disimpan.</strong>{' '}
                {draftOffer.value.form.name
                  ? `Program "${draftOffer.value.form.name}", `
                  : ''}
                disimpan pukul{' '}
                {new Date(draftOffer.savedAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . Pulihkan?
                {draftOffer.hadFiles &&
                  ' Banner, RAB, dan dokumen legalitas perlu diunggah ulang.'}
              </span>
              <button
                className="cursor-pointer rounded-lg bg-[#1B5E20] px-3.5 py-1.5 font-bold text-white hover:bg-[#144716]"
                onClick={restoreProgramDraft}
                type="button"
              >
                Pulihkan
              </button>
              <button
                className="cursor-pointer rounded-lg border border-amber-400 bg-white px-3.5 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
                onClick={discardProgramDraft}
                type="button"
              >
                Buang
              </button>
            </div>
          )}
          {/* Header */}
          <AdminPageHeader
            actions={
              <button
                className={HERO_BUTTON_PRIMARY}
                onClick={handleOpenAddModal}
                type="button"
              >
                <Plus className="h-4 w-4" />
                <span>Terbitkan Program Baru</span>
              </button>
            }
            description="Pusat pembuatan program baru, pemantauan slider progres fisik lapangan, upload kuitansi digital, dan tata kelola pencairan termin bertahap Nadzir."
            icon={<Layers aria-hidden="true" />}
            title="Manajemen &amp; Pengawasan Program Wakaf"
          />

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3.5">
              <div>
                <span className="block font-bold text-xs text-emerald-800 uppercase">
                  Total Program Aktif
                </span>
                <span className="font-extrabold text-emerald-950 text-lg">
                  {activePrograms.length} Proyek
                </span>
              </div>
              <Layers className="h-7 w-7 text-emerald-600/40" />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div>
                <span className="block font-bold text-xs text-slate-600 uppercase">
                  Target Penghimpunan
                </span>
                <span className="font-extrabold font-mono text-lg text-slate-900">
                  Rp{' '}
                  {activePrograms
                    .reduce((acc, p) => acc + p.targetAmount, 0)
                    .toLocaleString('id-ID')}
                </span>
              </div>
              <Landmark className="h-7 w-7 text-slate-400/40" />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 p-3.5">
              <div>
                <span className="block font-bold text-xs text-amber-800 uppercase">
                  Terkumpul Nyata (Ledger Pokok)
                </span>
                <span className="font-extrabold font-mono text-amber-950 text-lg">
                  Rp{' '}
                  {activePrograms
                    .reduce((acc, p) => acc + p.collectedAmount, 0)
                    .toLocaleString('id-ID')}
                </span>
              </div>
              <DollarSign className="h-7 w-7 text-amber-600/40" />
            </div>
          </div>

          {/* Program List Cards */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="flex flex-col justify-between gap-3 border-slate-100 border-b pb-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                  <Layers className="h-5 w-5 text-emerald-800" />
                  Daftar Program Wakaf Terkelola ({filteredPrograms.length}{' '}
                  Program)
                </h3>
                <p className="mt-0.5 text-slate-500 text-xs">
                  Pilih program untuk membuka workbench manajemen progres fisik,
                  kuitansi belanja digital, dan pencairan termin bertahap.
                </p>
              </div>

              {/* Search & Filter */}
              <div className="flex flex-row flex-wrap items-center gap-2 md:flex-nowrap">
                <div className="relative">
                  <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-3.5 w-3.5 text-slate-400" />
                  <input
                    className="w-48 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-slate-800 text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-700 sm:w-56"
                    onChange={(e) => setSearchProgramQuery(e.target.value)}
                    placeholder="Cari program / lokasi..."
                    type="text"
                    value={searchProgramQuery}
                  />
                </div>

                <SelectField
                  onChange={(e) => setFilterKategori(e.target.value)}
                  value={filterKategori}
                >
                  <option value="SEMUA">Semua Kategori</option>
                  {kategoriOptions.map((kategori) => (
                    <option key={kategori} value={kategori}>
                      {kategori}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  onChange={(e) => setFilterStatus(e.target.value)}
                  value={filterStatus}
                >
                  <option value="SEMUA">Semua Status</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Selesai">Selesai</option>
                  <option value="Draft">Draft</option>
                </SelectField>
              </div>
            </div>

            {/* List of Programs Grid */}
            {filteredPrograms.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 border-dashed bg-slate-50 p-12 text-center">
                <Layers className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="font-bold text-slate-700 text-xs">
                  Belum ada program wakaf yang cocok dengan kriteria pencarian.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Klik tombol &ldquo;Terbitkan Program Baru&rdquo; untuk
                  menambahkan program wakaf pertama.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {filteredPrograms.map((prog) => {
                  const isSelected = prog.id === selectedProgId;
                  const pct =
                    prog.targetAmount > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (prog.collectedAmount / prog.targetAmount) * 100
                          )
                        )
                      : 0;
                  const durasiLabel =
                    prog.durationStart && prog.durationEnd
                      ? `${prog.durationStart} - ${prog.durationEnd}`
                      : prog.duration;

                  return (
                    // biome-ignore lint/nursery/noNoninteractiveElementInteractions: dipulihkan 1:1 dari origin/awan (PR #28) — menjadikannya <button> akan mengubah DOM
                    // biome-ignore lint/a11y/useKeyWithClickEvents: dipulihkan 1:1 dari origin/awan (PR #28) — handler papan ketik menyusul saat a11y pass; mengubah elemen sekarang akan mengubah DOM
                    // biome-ignore lint/a11y/noStaticElementInteractions: dipulihkan 1:1 dari origin/awan (PR #28) — menjadikannya <button> akan mengubah DOM
                    <div
                      className={`flex cursor-pointer flex-col gap-3 rounded-2xl border bg-white p-3.5 shadow-2xs transition hover:shadow-md sm:flex-row sm:items-center ${
                        isSelected
                          ? 'border-[#1B5E20] ring-2 ring-[#1B5E20]/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      key={prog.id}
                      onClick={() => setSelectedProgId(prog.id)}
                    >
                      {/* Thumbnail */}
                      {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                      <img
                        alt={prog.name}
                        className="h-24 w-full shrink-0 rounded-xl border border-slate-200 object-cover sm:w-40"
                        src={prog.bannerUrl}
                      />

                      {/* Middle */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="font-semibold text-base text-slate-900">
                            {prog.name}
                          </h4>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-xs text-slate-600">
                            {prog.kategori}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-xs text-slate-600">
                            {prog.jenisWakaf}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-emerald-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs text-slate-600">
                            Rp {prog.collectedAmount.toLocaleString('id-ID')} /
                            Rp {prog.targetAmount.toLocaleString('id-ID')} (
                            {pct}%)
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Sliders className="h-3 w-3 shrink-0 text-emerald-700" />
                            Fisik: {prog.progressFisik}%
                          </span>
                          <span className="flex max-w-[180px] items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                            {prog.city}, {prog.province}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                            {durasiLabel}
                          </span>
                        </div>
                      </div>

                      {/* Right: Status + Actions */}
                      <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-slate-100 border-t pt-2 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 font-bold text-xs ${programStatusBadgeClass(prog.status)}`}
                        >
                          {prog.status}
                        </span>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-3.5 py-2 font-bold text-white text-xs shadow-2xs transition hover:bg-[#144716] hover:shadow-xs min-h-[38px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProgId(prog.id);
                              setActiveView('detail');
                            }}
                            type="button"
                          >
                            <Sliders className="h-4 w-4" />
                            <span>Kelola Progres</span>
                          </button>
                          <button
                            className="flex h-9 w-9 min-h-[38px] min-w-[38px] items-center justify-center cursor-pointer rounded-xl bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(prog);
                            }}
                            title="Edit Program"
                            type="button"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            className="flex h-9 w-9 min-h-[38px] min-w-[38px] items-center justify-center cursor-pointer rounded-xl bg-rose-50 p-2 text-rose-700 transition hover:bg-rose-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProgram(prog.id, prog.name);
                            }}
                            title="Hapus Program"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. HALAMAN DEDIKASI KELOLA PROGRAM (DETAIL WORKBENCH VIEW)                */}
      {/* ========================================================================= */}
      {activeView === 'detail' && selectedProgram && (
        <div className="fade-in animate-in space-y-6 duration-200">
          {/* Breadcrumb / Back to List Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <button
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 font-bold text-slate-800 text-xs shadow-2xs transition hover:bg-slate-200 hover:shadow-xs"
                onClick={() => setActiveView('main')}
                type="button"
              >
                <ArrowLeft className="h-4 w-4 text-[#1B5E20]" />
                <span>Kembali ke Daftar Program</span>
              </button>
              <span className="text-slate-300">/</span>
              <span className="max-w-[260px] truncate font-semibold text-slate-900 text-xs sm:max-w-md">
                {selectedProgram.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-slate-500">
                Kode Program:
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-bold font-mono text-xs text-slate-800">
                {selectedProgram.kodeProgram ?? '—'}
              </span>
            </div>
          </div>

          {/* Workbench: Kelola Per Program Terpilih */}
          <div className="space-y-6 rounded-2xl border-2 border-emerald-800/30 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-slate-100 border-b pb-4 md:flex-row md:items-center">
              <div>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 font-bold text-xs text-emerald-800">
                  Program Aktif Terpilih
                </span>
                <h3 className="mt-1 font-bold text-base text-slate-900">
                  {selectedProgram.name}
                </h3>
                <p className="mt-0.5 text-slate-500 text-xs">
                  Kode Program: {selectedProgram.kodeProgram ?? '—'} •{' '}
                  {selectedProgram.city}, {selectedProgram.province} •{' '}
                  {selectedProgram.jenisWakaf} • Rekening:{' '}
                  {selectedProgram.bankName || selectedProgram.bankAccount}
                </p>
                {selectedProgram.targetPenerimaManfaat && (
                  <p className="mt-1 font-semibold text-emerald-800 text-xs">
                    Target Penerima:{' '}
                    <span className="font-normal text-slate-700">
                      {selectedProgram.targetPenerimaManfaat}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Persistent Financial KPI Cards — tetap terlihat di semua tab wizard */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="block font-bold text-xs text-slate-500 uppercase">
                  Pokok Dana Terkumpul
                </span>
                <span className="mt-1 block font-extrabold font-mono text-slate-900 text-sm">
                  Rp {selectedProgram.collectedAmount.toLocaleString('id-ID')}
                </span>
                <span className="mt-0.5 block font-semibold text-xs text-emerald-700">
                  Target: Rp{' '}
                  {selectedProgram.targetAmount.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                <span className="block font-bold text-xs text-emerald-800 uppercase">
                  Dana Telah Dicairkan
                </span>
                <span className="mt-1 block font-extrabold font-mono text-emerald-950 text-sm">
                  Rp{' '}
                  {currentTerminList
                    .filter(
                      (t) =>
                        t.rawStatus === 'APPROVED' ||
                        t.status.includes('Selesai')
                    )
                    .reduce((acc, t) => acc + t.nominal, 0)
                    .toLocaleString('id-ID')}
                </span>
                <span className="mt-0.5 block font-semibold text-xs text-emerald-700">
                  {
                    currentTerminList.filter(
                      (t) =>
                        t.rawStatus === 'APPROVED' ||
                        t.status.includes('Selesai')
                    ).length
                  }{' '}
                  Termin Selesai
                </span>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <span className="block font-bold text-xs text-amber-800 uppercase">
                  Realisasi Belanja Kuitansi
                </span>
                <span className="mt-1 block font-extrabold font-mono text-amber-950 text-sm">
                  Rp{' '}
                  {selectedProgram.receipts
                    .reduce((acc, r) => acc + r.amount, 0)
                    .toLocaleString('id-ID')}
                </span>
                <span className="mt-0.5 block font-semibold text-xs text-amber-700">
                  {receiptsForTab(selectedProgram.receipts, 'receipts').length}{' '}
                  Nota Terunggah
                </span>
              </div>
            </div>

            {/* Sub-Tab Navigation Bar in Program Detail */}
            <AdminTabs
              className="mb-0"
              label="Bagian detail program wakaf"
              onChange={setWorkbenchTab}
              tabs={[
                {
                  id: 'termin',
                  label: '1. Pencairan Termin',
                  icon: <Landmark className="h-3.5 w-3.5" />,
                  count: currentTerminList.length,
                },
                {
                  id: 'receipts',
                  label: '2. Kuitansi & Nota Belanja',
                  icon: <Receipt className="h-3.5 w-3.5" />,
                  count: receiptsForTab(selectedProgram.receipts, 'receipts')
                    .length,
                },
                {
                  id: 'docs',
                  label: '3. Dokumentasi & Progres Fisik',
                  icon: <Camera className="h-3.5 w-3.5" />,
                  count: receiptsForTab(selectedProgram.receipts, 'docs')
                    .length,
                },
                {
                  id: 'wakif',
                  label: 'Daftar Wakif & Kabar WA',
                  icon: <Send className="h-3.5 w-3.5" />,
                  count: currentWakifList.length,
                },
                {
                  id: 'bwi',
                  label: 'Laporan Semester BWI (UU 41/2004)',
                  icon: <ShieldCheck className="h-3.5 w-3.5" />,
                },
              ]}
              value={workbenchTab}
            />

            {/* SUB-TAB 1: KUITANSI BELANJA DIGITAL */}
            {(workbenchTab === 'receipts' || workbenchTab === 'docs') && (
              <div className="space-y-4">
                {workbenchTab === 'docs' && (
                  <div className="space-y-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-slate-50 p-5">
                    {receiptsForTab(selectedProgram.receipts, 'docs').length ===
                    0 ? (
                      <div
                        className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm"
                        role="alert"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                          <strong>
                            Minimal 1 foto dokumentasi kegiatan wajib diunggah
                          </strong>{' '}
                          sebelum progres fisik bisa disimpan. Unggah lewat
                          formulir di bawah.
                        </p>
                      </div>
                    ) : (
                      <p className="flex items-center gap-2 font-semibold text-emerald-800 text-sm">
                        <Camera className="h-4 w-4" />
                        {
                          receiptsForTab(selectedProgram.receipts, 'docs')
                            .length
                        }{' '}
                        foto dokumentasi sudah diunggah
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sliders className="h-4 w-4 text-[#1B5E20]" />
                        <span className="font-bold text-slate-900 text-xs">
                          Progres Fisik Pembangunan Proyek (0% - 100%)
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-1">
                          <input
                            aria-label="Persentase progres fisik"
                            className="w-16 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-right font-extrabold font-mono text-[#1B5E20] text-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                            inputMode="numeric"
                            maxLength={3}
                            onBlur={() => setPercentDraft(null)}
                            onChange={(e) => {
                              const clean = sanitizePercentInput(
                                e.target.value
                              );
                              setPercentDraft(clean);
                              handleSliderChange(
                                selectedProgram.id,
                                clean === '' ? 0 : Number(clean)
                              );
                            }}
                            onFocus={(e) => e.target.select()}
                            pattern="[0-9]*"
                            type="text"
                            value={
                              percentDraft ??
                              String(selectedProgram.progressFisik)
                            }
                          />
                          <span className="font-extrabold font-mono text-[#1B5E20] text-xl">
                            %
                          </span>
                        </div>

                        <input
                          className="w-48 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                          onChange={(e) => setProgressNote(e.target.value)}
                          placeholder="Contoh: Pengecoran fondasi lantai 1"
                          type="text"
                          value={progressNote}
                        />

                        <span className="rounded-md bg-emerald-800 px-2.5 py-1 font-bold text-xs text-white">
                          {progressStageLabel(selectedProgram.progressFisik)}
                        </span>

                        <button
                          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-3.5 py-1.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                          disabled={
                            isSavingProgress ||
                            receiptsForTab(selectedProgram.receipts, 'docs')
                              .length === 0
                          }
                          onClick={() =>
                            handleSaveProgressFisik(selectedProgram.id)
                          }
                          title={
                            receiptsForTab(selectedProgram.receipts, 'docs')
                              .length === 0
                              ? 'Unggah minimal 1 foto dokumentasi dulu'
                              : undefined
                          }
                          type="button"
                        >
                          {isSavingProgress ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Menyimpan...</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Simpan Progres</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between font-semibold text-xs text-slate-500">
                      <span>0% (Tahap Pengadaan/Perizinan)</span>
                      <span>50% (Pengerjaan Struktur)</span>
                      <span>100% (Serah Terima / Rampung)</span>
                    </div>
                  </div>
                )}
                <form
                  className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs"
                  onSubmit={handleAddReceipt}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      {newReceiptType === 'KUITANSI' ? (
                        <Receipt className="h-4 w-4 text-[#1B5E20]" />
                      ) : (
                        <Camera className="h-4 w-4 text-sky-700" />
                      )}
                      <span>
                        {newReceiptType === 'KUITANSI'
                          ? 'Form Unggah Bukti Nota / Kuitansi Belanja Digital'
                          : 'Form Unggah Dokumentasi Kegiatan / Progres Fisik'}
                      </span>
                    </h4>
                    <span className="text-xs text-slate-400">
                      Verifikasi Dokumen Transparan
                    </span>
                  </div>

                  <input
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleReceiptFileSelect}
                    ref={receiptFileInputRef}
                    type="file"
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div
                      className={
                        newReceiptType === 'KUITANSI'
                          ? 'sm:col-span-2'
                          : 'sm:col-span-3'
                      }
                    >
                      <label
                        className="mb-1 block font-semibold text-slate-700"
                        htmlFor="wakafprograms-f1537"
                      >
                        {newReceiptType === 'KUITANSI'
                          ? 'Nama Nota / Pengeluaran Belanja'
                          : 'Nama Kegiatan / Dokumentasi Progres'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                        id="wakafprograms-f1537"
                        onChange={(e) => setNewReceiptTitle(e.target.value)}
                        placeholder={
                          newReceiptType === 'KUITANSI'
                            ? 'Contoh: Pengadaan Material Semen & Pasir Cor'
                            : 'Contoh: Pengecoran Fondasi Lantai 1 Bersama Pekerja'
                        }
                        required
                        type="text"
                        value={newReceiptTitle}
                      />
                    </div>
                    {newReceiptType === 'KUITANSI' && (
                      <div>
                        <label
                          className="mb-1 block font-semibold text-slate-700"
                          htmlFor="wakafprograms-f1550"
                        >
                          Nominal (Rp){' '}
                          {newReceiptType === 'KUITANSI' ? (
                            <span className="text-red-500">*</span>
                          ) : (
                            <span className="text-xs text-slate-400">
                              (Opsional)
                            </span>
                          )}
                        </label>
                        <RupiahInput
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                          id="wakafprograms-f1550"
                          onChange={setNewReceiptAmount}
                          placeholder="5.500.000"
                          required={newReceiptType === 'KUITANSI'}
                          value={newReceiptAmount}
                        />
                        {newReceiptAmount && (
                          <div className="mt-1 flex flex-col gap-0.5 text-xs">
                            <span className="text-slate-500">
                              Total Realisasi Baru:{' '}
                              <strong className="font-bold text-slate-800">
                                Rp{' '}
                                {(
                                  selectedProgram.receipts.reduce(
                                    (acc, r) => acc + r.amount,
                                    0
                                  ) + (Number(newReceiptAmount) || 0)
                                ).toLocaleString('id-ID')}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {newReceiptType === 'KUITANSI' && (
                      <div>
                        <label
                          className="mb-1 block font-semibold text-slate-700"
                          htmlFor="wakafprograms-f1566"
                        >
                          Nama Vendor / Toko / Pelaksana
                        </label>
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                          id="wakafprograms-f1566"
                          onChange={(e) => setNewReceiptVendor(e.target.value)}
                          placeholder="Contoh: TB Berkah Bangunan Mandiri"
                          type="text"
                          value={newReceiptVendor}
                        />
                      </div>
                    )}
                    <div className="flex items-end">
                      <div className="flex w-full items-center gap-2">
                        <button
                          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 font-bold text-emerald-800 text-xs shadow-2xs transition hover:bg-emerald-50"
                          onClick={() => receiptFileInputRef.current?.click()}
                          type="button"
                        >
                          <Upload className="h-3.5 w-3.5 text-emerald-700" />
                          <span>
                            {newReceiptType === 'KUITANSI'
                              ? 'Pilih File Kuitansi'
                              : 'Pilih Foto Dokumentasi'}
                          </span>
                        </button>
                        <span className="grow truncate font-mono font-semibold text-xs text-slate-600">
                          {newReceiptFile || (
                            <span className="text-slate-400 italic">
                              Belum ada berkas dipilih
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {receiptFileObject && (
                    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="block font-bold text-emerald-900 text-sm">
                          Pratinjau Berkas Terpilih
                        </span>
                        <span className="font-mono text-slate-500 text-xs">
                          {formatFileSize(receiptFileObject.size)}
                        </span>
                      </div>
                      {receiptPreviewUrl ? (
                        <div className="flex max-h-72 min-h-40 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
                          {/* biome-ignore lint/performance/noImgElement: pratinjau object URL lokal, bukan aset yang perlu dioptimasi */}
                          <img
                            alt="Pratinjau berkas yang akan diunggah"
                            className="max-h-72 w-full object-contain"
                            src={receiptPreviewUrl}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-3 text-slate-700 text-sm">
                          <FileText className="h-5 w-5 shrink-0 text-blue-600" />
                          <span className="break-all">{newReceiptFile}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end border-slate-200 border-t pt-1">
                    <button
                      className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-sm text-white shadow-xs transition hover:bg-[#144716] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isUploadingReceipt}
                      type="submit"
                    >
                      {isUploadingReceipt && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {isUploadingReceipt && 'Mengunggah...'}
                      {!isUploadingReceipt &&
                        (newReceiptType === 'KUITANSI'
                          ? 'Tambah Kuitansi'
                          : 'Simpan Dokumentasi')}
                    </button>
                  </div>
                </form>

                {/* Table of uploaded receipts */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                      <Receipt className="h-4 w-4 text-slate-600" />
                      {workbenchTab === 'docs'
                        ? 'Foto Dokumentasi Kegiatan Terunggah ('
                        : 'Daftar Kuitansi & Nota Belanja Terunggah ('}
                      {
                        receiptsForTab(selectedProgram.receipts, workbenchTab)
                          .length
                      }{' '}
                      Berkas)
                    </h4>
                    <span
                      className={`text-xs text-slate-500 ${workbenchTab === 'docs' ? 'hidden' : ''}`}
                    >
                      Total Realisasi Belanja:{' '}
                      <strong>
                        Rp{' '}
                        {selectedProgram.receipts
                          .reduce((acc, r) => acc + r.amount, 0)
                          .toLocaleString('id-ID')}
                      </strong>
                    </span>
                  </div>

                  {receiptsForTab(selectedProgram.receipts, workbenchTab)
                    .length === 0 ? (
                    <div className="rounded-xl border border-slate-200 border-dashed bg-slate-50 p-8 text-center text-slate-500 text-sm">
                      {workbenchTab === 'docs'
                        ? 'Belum ada foto dokumentasi kegiatan untuk program ini. Unggah foto lewat formulir di atas.'
                        : 'Belum ada kuitansi atau nota belanja untuk program ini. Unggah lewat formulir di atas.'}
                    </div>
                  ) : workbenchTab === 'docs' ? (
                    <DocumentationGallery
                      items={receiptsForTab(selectedProgram.receipts, 'docs')}
                      onDelete={(rcp) => handleDeleteReceipt(rcp.id, rcp.title)}
                      onEdit={handleOpenEditReceipt}
                      onOpen={handleOpenReceiptPreview}
                    />
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="border-slate-200 border-b bg-slate-50 font-semibold text-slate-600">
                          <tr>
                            <th className="px-4 py-3">Pratinjau</th>
                            <th className="px-4 py-3">
                              Judul Pengeluaran / Kegiatan
                            </th>
                            <th className="px-4 py-3">Vendor / Pelaksana</th>
                            <th className="px-4 py-3">Tanggal Nota</th>
                            <th className="px-4 py-3">Nominal (Rp)</th>
                            <th className="px-4 py-3">Berkas Lampiran</th>
                            <th className="px-4 py-3 text-center">
                              Jenis &amp; Status
                            </th>
                            <th className="px-4 py-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {receiptsForTab(
                            selectedProgram.receipts,
                            'receipts'
                          ).map((rcp) => (
                            <tr
                              className="transition hover:bg-slate-50/70"
                              key={rcp.id}
                            >
                              <td className="px-4 py-3">
                                <ReceiptThumb
                                  onOpen={() => handleOpenReceiptPreview(rcp)}
                                  receipt={rcp}
                                />
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-900">
                                {rcp.title}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">
                                {rcp.vendor || '-'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                                {rcp.date}
                              </td>
                              <td className="px-4 py-3 font-bold font-mono text-slate-900">
                                Rp {rcp.amount.toLocaleString('id-ID')}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-blue-700">
                                <button
                                  className="flex cursor-pointer items-center gap-1 hover:underline"
                                  onClick={() => handleOpenReceiptPreview(rcp)}
                                  type="button"
                                >
                                  <FileText className="h-3 w-3 text-blue-600" />
                                  {rcp.fileName}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  className={`cursor-pointer inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-bold text-xs transition ${
                                    rcp.status?.includes('Foto') ||
                                    rcp.status?.includes('Dokumentasi')
                                      ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                  }`}
                                  onClick={() => handleOpenReceiptPreview(rcp)}
                                  type="button"
                                >
                                  {rcp.status?.includes('Foto') ||
                                  rcp.status?.includes('Dokumentasi') ? (
                                    <>
                                      <Camera className="h-3 w-3" />
                                      <span>Dokumentasi Kegiatan</span>
                                    </>
                                  ) : (
                                    <>
                                      <Receipt className="h-3 w-3" />
                                      <span>Kwitansi Sah</span>
                                    </>
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    className="flex h-9 w-9 min-h-[38px] min-w-[38px] items-center justify-center cursor-pointer rounded-xl bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
                                    onClick={() => handleOpenEditReceipt(rcp)}
                                    title="Edit Kuitansi"
                                    type="button"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    className="flex h-9 w-9 min-h-[38px] min-w-[38px] items-center justify-center cursor-pointer rounded-xl bg-rose-50 p-2 text-rose-700 transition hover:bg-rose-100"
                                    onClick={() =>
                                      handleDeleteReceipt(rcp.id, rcp.title)
                                    }
                                    title="Hapus Kuitansi"
                                    type="button"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: PENCAIRAN TERMIN & KAS ESCROW */}
            {workbenchTab === 'termin' && (
              <div className="space-y-5">
                {/* Bagi Hasil Wakaf Produktif Section if applicable */}
                {currentYieldList.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <h4 className="flex items-center gap-1.5 font-bold text-emerald-950 text-xs">
                      <TrendingUp className="h-4 w-4 text-emerald-700" />
                      Riwayat Pencatatan Bagi Hasil Wakaf Produktif
                      (WaqfYieldEntry)
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="border-emerald-200 border-b bg-emerald-50/70 font-semibold text-emerald-900">
                          <tr>
                            <th className="px-3 py-2.5">
                              Sumber Pendapatan / Usaha
                            </th>
                            <th className="px-3 py-2.5">Tanggal Catat</th>
                            <th className="px-3 py-2.5 text-right">
                              Nominal Hasil (Rp)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-100 text-slate-700">
                          {currentYieldList.map((ye) => (
                            <tr key={ye.id}>
                              <td className="px-3 py-2 font-semibold text-slate-900">
                                {ye.sourceDescription}
                              </td>
                              <td className="px-3 py-2 text-slate-500">
                                {ye.recordedAt}
                              </td>
                              <td className="px-3 py-2 text-right font-bold font-mono text-emerald-900">
                                + Rp {ye.nominal.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                    <Landmark className="h-4 w-4 text-[#1B5E20]" />
                    Riwayat Pengajuan &amp; Termin Pencairan Dana Proyek (
                    {currentTerminList.length} Pengajuan)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Pencairan dana dilakukan bertahap sesuai SPK &amp; Berita
                    Acara Progres Fisik dengan pengawasan DPS &amp; Super Admin.
                  </p>
                </div>

                {currentTerminList.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 border-dashed bg-slate-50 p-8 text-center text-slate-500 text-xs">
                    Belum ada pengajuan termin pencairan dana untuk program ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="border-slate-200 border-b bg-slate-50 font-semibold text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Tahap / Termin</th>
                          <th className="px-4 py-3">Nominal Pencairan</th>
                          <th className="px-4 py-3">Rekening Tujuan</th>
                          <th className="px-4 py-3">Tgl Pengajuan</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-center">
                            Aksi Verifikasi Super Admin
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {currentTerminList.map((t) => {
                          const isPending =
                            t.rawStatus === 'PENDING' ||
                            t.status.includes('Menunggu');

                          return (
                            <tr
                              className="transition hover:bg-slate-50/70"
                              key={t.id}
                            >
                              <td className="px-4 py-3 font-bold text-slate-900">
                                {t.terminKe}
                                <span className="block font-mono font-normal text-xs text-slate-400">
                                  ID: {t.id}
                                </span>
                                {t.adminNotes && (
                                  <span className="mt-0.5 block text-xs text-rose-600 italic">
                                    Catatan: {t.adminNotes}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-extrabold font-mono text-slate-900">
                                Rp {t.nominal.toLocaleString('id-ID')}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                {t.targetRekening}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                                {t.tanggalPengajuan}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-block rounded-full border px-2.5 py-1 font-bold text-xs ${terminBadgeClass(
                                    t.status,
                                    t.rawStatus
                                  )}`}
                                >
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isPending ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      className="flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-xs text-white shadow-2xs transition hover:bg-emerald-700"
                                      onClick={() =>
                                        handleApproveWithdrawal(t.id)
                                      }
                                      type="button"
                                    >
                                      <Check className="h-3 w-3" />
                                      <span>Setujui</span>
                                    </button>
                                    <button
                                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-bold text-xs text-rose-700 transition hover:bg-rose-100"
                                      onClick={() => {
                                        setSelectedWithdrawalId(t.id);
                                        setRejectReason('');
                                        setRejectModalOpen(true);
                                      }}
                                      type="button"
                                    >
                                      <X className="h-3 w-3" />
                                      <span>Tolak</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-medium text-xs text-slate-400">
                                    Telah Diproses
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 3: DAFTAR WAKIF & KABAR PROGRES WA */}
            {workbenchTab === 'wakif' && (
              <div className="space-y-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                      <Send className="h-4 w-4 text-[#1B5E20]" />
                      Daftar Wakif &amp; Layanan Silaturahmi Progres Pembangunan
                      ({currentWakifList.length} Donatur)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Kirim update laporan progres pembangunan{' '}
                      {selectedProgram.progressFisik}% langsung ke WhatsApp
                      Wakif dan cetak Akta Ikrar Wakaf (AIW).
                    </p>
                  </div>

                  <button
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 font-bold text-emerald-900 text-xs shadow-2xs hover:bg-emerald-100 sm:self-auto"
                    onClick={() => handleOpenBroadcastModal(selectedProgram)}
                    type="button"
                  >
                    <Send className="h-3.5 w-3.5 text-emerald-700" />
                    <span>
                      Siarkan Update WA ({selectedProgram.progressFisik}%)
                    </span>
                  </button>
                </div>

                {currentWakifList.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 border-dashed bg-slate-50 p-8 text-center text-slate-500 text-xs">
                    Belum ada transaksi wakaf terverifikasi untuk program ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="border-slate-200 border-b bg-slate-50 font-semibold text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Nama Wakif / Donatur</th>
                          <th className="px-4 py-3">Nominal Wakaf</th>
                          <th className="px-4 py-3">Akad Wakaf</th>
                          <th className="px-4 py-3">No. Kwitansi / AIW</th>
                          <th className="px-4 py-3">Status Sertifikat</th>
                          <th className="px-4 py-3 text-center">
                            Aksi Silaturahmi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {currentWakifList.map((w) => (
                          <tr
                            className="transition hover:bg-slate-50/70"
                            key={w.id}
                          >
                            <td className="px-4 py-3">
                              <span className="block font-bold text-slate-900">
                                {w.name}
                              </span>
                              <span className="font-mono text-xs text-slate-500">
                                {w.phone} • Tgl: {w.tanggal}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold font-mono text-slate-900">
                              Rp {w.nominal.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-semibold text-xs text-slate-700">
                                {w.akad}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">
                              {w.sertifikatNo}
                              {w.nomorKwitansi && (
                                <span className="block text-xs text-slate-400">
                                  Kwitansi: {w.nomorKwitansi}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-bold text-xs text-emerald-800">
                                {w.statusSertifikat}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {w.phone && (
                                  <a
                                    className="flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-xs text-white shadow-2xs transition hover:bg-emerald-700"
                                    href={toWaMeLink(
                                      w.phone,
                                      buildProgressBroadcastMessage(
                                        selectedProgram
                                      )
                                    )}
                                    rel="noopener"
                                    target="_blank"
                                  >
                                    <Send className="h-3 w-3" />
                                    <span>Kabar WA</span>
                                  </a>
                                )}
                                <button
                                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-xs text-slate-700 transition hover:bg-slate-100"
                                  onClick={() =>
                                    showToast({
                                      title: 'Akta Ikrar Wakaf (AIW)',
                                      description: `Membuka sertifikat resmi ${w.sertifikatNo} a.n. ${w.name}...`,
                                      type: 'info',
                                    })
                                  }
                                  type="button"
                                >
                                  <FileText className="h-3 w-3 text-slate-500" />
                                  <span>Cetak AIW</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 4: LAPORAN SEMESTER BWI */}
            {workbenchTab === 'bwi' && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs">
                <div className="flex flex-col justify-between gap-3 border-slate-200 border-b pb-3 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                      <ShieldCheck className="h-4 w-4 text-[#1B5E20]" />
                      Format Pelaporan Berkala Semesteran Badan Wakaf Indonesia
                      (BWI)
                    </h4>
                    <p className="mt-0.5 text-slate-500 text-xs">
                      Kewajiban pelaporan berkala 6 bulan sekali sesuai amanat
                      UU No. 41 Tahun 2004 &amp; Peraturan BWI No. 4 Tahun 2010.
                    </p>
                  </div>

                  <button
                    className="flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716] sm:self-auto"
                    onClick={() => setShowBwiReportModal(true)}
                    type="button"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Unduh Dokumen Laporan BWI (PDF)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <span className="block font-bold text-xs text-slate-500">
                      Status Nazhir Terdaftar
                    </span>
                    <span className="mt-0.5 block font-bold text-slate-900">
                      {selectedProgram.bankAccountHolder || 'Platform Amwal'}
                    </span>
                    <span className="font-mono text-xs text-emerald-700">
                      No. Registrasi: BWI.3.1.0028/2024
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <span className="block font-bold text-xs text-slate-500">
                      Periode Pelaporan
                    </span>
                    <span className="mt-0.5 block font-bold text-slate-900">
                      Semester I - 2026 (Jan - Jun 2026)
                    </span>
                    <span className="text-xs text-slate-500">
                      Status: Lengkap &amp; Siap Submit
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <span className="block font-bold text-xs text-slate-500">
                      Pemeriksaan Dewan Pengawas Syariah
                    </span>
                    <span className="mt-0.5 block font-bold text-emerald-800">
                      Opini Syariah Terpenuhi (WTP)
                    </span>
                    <span className="text-xs text-slate-500">
                      DPS: Dewan Pengawas Syariah Amwal
                    </span>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <span className="block font-bold text-slate-900 text-xs">
                    Komponen Rekapitulasi Pelaporan:
                  </span>
                  <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
                    <li>
                      Daftar seluruh penghimpunan wakaf uang &amp; wakaf melalui
                      uang:{' '}
                      <strong>
                        Rp{' '}
                        {selectedProgram.collectedAmount.toLocaleString(
                          'id-ID'
                        )}
                      </strong>
                    </li>
                    <li>
                      Realisasi belanja operasional dan fisik proyek:{' '}
                      <strong>
                        Rp{' '}
                        {selectedProgram.receipts
                          .reduce((acc, r) => acc + r.amount, 0)
                          .toLocaleString('id-ID')}
                      </strong>
                    </li>
                    <li>
                      Progres capaian fisik konstruksi:{' '}
                      <strong>{selectedProgram.progressFisik}%</strong>
                    </li>
                    <li>
                      Sertifikat Akta Ikrar Wakaf (AIW) terbit:{' '}
                      <strong>{currentWakifList.length} Lembar Resmi</strong>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL FORM PEMBUATAN / EDIT PROGRAM BARU */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-3 backdrop-blur-xs sm:p-4">
          <div className="fade-in zoom-in-95 my-auto flex max-h-[90vh] w-full max-w-2xl animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-slate-100 border-b p-4 pb-3 sm:p-6 sm:pb-4">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                  <Layers className="h-5 w-5 text-emerald-800" />
                  {editingProgramId
                    ? 'Edit Program Wakaf'
                    : 'Form Pembuatan Program Baru'}
                </h3>
                <p className="text-slate-500 text-xs">
                  Lengkapi data program untuk diterbitkan di Amwal Platform
                </p>
              </div>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={requestCloseProgramForm}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="grow space-y-4 overflow-y-auto p-4 text-sm sm:p-6"
              onSubmit={handleSaveProgram}
            >
              {/* Nama Program & Deskripsi */}
              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-f2255"
                >
                  Nama Program <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  id="wakafprograms-f2255"
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Contoh: Wakaf Pembangunan Gedung Asrama Tahfidz"
                  required
                  type="text"
                  value={formData.name}
                />
              </div>

              {/* Target Penerima Manfaat (Opsional) */}
              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-target-penerima"
                >
                  Target Penerima Manfaat{' '}
                  <span className="font-normal text-slate-400 text-xs">
                    (Opsional)
                  </span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  id="wakafprograms-target-penerima"
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      targetPenerimaManfaat: e.target.value,
                    })
                  }
                  placeholder="Contoh: 150 Santri Penghafal Quran & Warga Dhuafa di Bojonegoro"
                  type="text"
                  value={formData.targetPenerimaManfaat}
                />
              </div>

              {/* Akad / Jenis Wakaf & Kategori Program */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block font-bold text-slate-800"
                    htmlFor="wakafprograms-jeniswakaf"
                  >
                    Akad / Jenis Wakaf <span className="text-red-500">*</span>
                  </label>
                  <SelectField
                    className="w-full"
                    id="wakafprograms-jeniswakaf"
                    onChange={(e) => {
                      const akad = akadMaster.rows.find(
                        (o) => o.id === e.target.value
                      );
                      setSelectedAkadId(e.target.value);
                      setFormData({
                        ...formData,
                        // Akad master memetakan jenis wakaf program (enum DB).
                        jenisWakaf: akadJenisWakafLabel(akad?.jenisWakaf),
                      });
                    }}
                    value={selectedAkadId}
                  >
                    <option value="">-- Pilih Akad Wakaf --</option>
                    {akadSelectOptions.map((akad) => (
                      <option key={akad.id} value={akad.id}>
                        {akad.isActive
                          ? akad.label
                          : `${akad.label} (nonaktif)`}
                      </option>
                    ))}
                  </SelectField>
                  {akadOptions.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Belum ada akad aktif di Master Data → Akad Waqaf.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="mb-1 block font-bold text-slate-800"
                    htmlFor="wakafprograms-kategori"
                  >
                    Kategori Program <span className="text-red-500">*</span>
                  </label>
                  <SelectField
                    className="w-full"
                    id="wakafprograms-kategori"
                    onChange={(e) =>
                      setFormData({ ...formData, kategori: e.target.value })
                    }
                    value={formData.kategori}
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {withCurrentOption(
                      kategoriMaster.activeOptions,
                      kategoriMaster.labels,
                      formData.kategori,
                      (o) => o.label
                    ).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                  {kategoriMaster.activeOptions.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Belum ada kategori aktif di Master Data → Kategori Waqaf.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-f2271"
                >
                  Deskripsi Lengkap <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  id="wakafprograms-f2271"
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Jelaskan tujuan program, manfaat bagi jamaah/dhuafa, dan rencana alokasi..."
                  required
                  rows={3}
                  value={formData.description}
                />
              </div>

              {/* Nadzir Profile Selector */}
              {effectiveNadzirProfiles.length > 0 && (
                <div>
                  <label
                    className="mb-1 block flex items-center gap-1 font-bold text-slate-800"
                    htmlFor="wakafprograms-f2289"
                  >
                    <Building2 className="h-3.5 w-3.5 text-emerald-700" />{' '}
                    Lembaga Nadzir Pengelola
                  </label>
                  <SelectField
                    className="w-full"
                    id="wakafprograms-f2289"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nadzirProfileId: e.target.value,
                      })
                    }
                    value={formData.nadzirProfileId}
                  >
                    {effectiveNadzirProfiles.map((np) => (
                      <option key={np.id} value={np.id}>
                        {np.namaLembaga || 'Platform Amwal'} (
                        {np.namaBank || 'BSI'} -{' '}
                        {np.nomorRekeningBank || 'Rekening Operasional'})
                      </option>
                    ))}
                  </SelectField>
                </div>
              )}

              {/* Unggah Banner dengan Tombol Pilih File & Live Preview Gambar */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5">
                <div className="flex items-center justify-between">
                  <label
                    className="flex items-center gap-1.5 font-bold text-slate-900 text-xs"
                    htmlFor="wakafprograms-f2317"
                  >
                    <Eye className="h-4 w-4 text-emerald-800" />
                    <span>Banner Program *</span>
                  </label>
                  <span className="font-medium text-xs text-slate-500">
                    Rekomendasi 1200x630 (16:9)
                  </span>
                </div>

                <input
                  accept="image/*"
                  className="hidden"
                  id="wakafprograms-f2317"
                  onChange={handleBannerFileSelect}
                  ref={bannerFileInputRef}
                  type="file"
                />

                {formData.bannerUrl ? (
                  <div className="group relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                    <img
                      alt="Preview Banner Program"
                      className="h-full w-full object-cover"
                      src={formData.bannerUrl}
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition group-hover:opacity-100">
                      <button
                        className="flex cursor-pointer items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 font-bold text-xs text-slate-900 shadow-xs hover:bg-white"
                        onClick={() => bannerFileInputRef.current?.click()}
                        type="button"
                      >
                        <RefreshCw className="h-3 w-3 text-emerald-800" /> Ganti
                        Gambar
                      </button>
                      <button
                        className="flex cursor-pointer items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 font-bold text-xs text-rose-700 shadow-xs hover:bg-white"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, bannerUrl: '' }))
                        }
                        type="button"
                      >
                        <Trash2 className="h-3 w-3" /> Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  // biome-ignore lint/a11y/noStaticElementInteractions: dipulihkan 1:1 dari origin/awan (PR #28) — menjadikannya <button> akan mengubah DOM
                  // biome-ignore lint/a11y/useKeyWithClickEvents: dipulihkan 1:1 dari origin/awan (PR #28) — handler papan ketik menyusul saat a11y pass; mengubah elemen sekarang akan mengubah DOM
                  // biome-ignore lint/nursery/noNoninteractiveElementInteractions: dipulihkan 1:1 dari origin/awan (PR #28) — menjadikannya <button> akan mengubah DOM
                  <div
                    className="group flex aspect-[16/9] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-emerald-300 border-dashed bg-white text-center shadow-2xs transition hover:border-emerald-600 hover:bg-emerald-50/50"
                    onClick={() => bannerFileInputRef.current?.click()}
                  >
                    <div className="rounded-full bg-emerald-100 p-2 text-emerald-800 transition group-hover:bg-emerald-200">
                      <Upload className="h-4 w-4 text-emerald-800" />
                    </div>
                    <div>
                      <span className="mb-1 inline-block rounded-lg bg-emerald-800 px-2.5 py-1 font-bold text-white text-xs shadow-2xs hover:bg-emerald-700">
                        Pilih File Gambar Banner
                      </span>
                      <p className="text-xs text-slate-600">
                        Klik untuk memilih dari HP/Komputer atau seret file ke
                        sini
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-400">
                      PNG, JPG, WEBP (Maks. 5MB)
                    </span>
                  </div>
                )}
              </div>

              {/* Dokumen Transparansi & Legalitas (opsional) */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                    <FileText className="h-4 w-4 text-emerald-800" />
                    Dokumen Transparansi & Legalitas
                  </span>
                  <span className="font-medium text-xs text-slate-500">
                    Opsional — boleh menyusul
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    {
                      field: 'rabDocumentUrl' as const,
                      nameField: 'rabDocumentName' as const,
                      label: 'Rencana Anggaran Biaya (RAB)',
                      inputRef: rabFileInputRef,
                    },
                    {
                      field: 'dokumenLegalitasUrl' as const,
                      nameField: 'dokumenLegalitasName' as const,
                      label: 'Dokumen Legalitas / AIW',
                      inputRef: dokumenLegalitasFileInputRef,
                    },
                  ].map((doc) => (
                    <div className="space-y-1.5" key={doc.field}>
                      <span className="block font-semibold text-xs text-slate-700">
                        {doc.label}
                      </span>
                      <input
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => handleLegalDocFileSelect(e, doc.field)}
                        ref={doc.inputRef}
                        type="file"
                      />
                      {formData[doc.field] ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-emerald-900">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                            <span className="truncate font-semibold">
                              {formData[doc.nameField] || 'Berkas terpilih'}
                            </span>
                          </span>
                          <button
                            className="shrink-0 cursor-pointer rounded-md p-1 text-rose-600 hover:bg-rose-50"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                [doc.field]: '',
                                [doc.nameField]: '',
                              }))
                            }
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        // biome-ignore lint/a11y/noStaticElementInteractions: konsisten dengan dropzone banner di atas
                        // biome-ignore lint/a11y/useKeyWithClickEvents: konsisten dengan dropzone banner di atas
                        // biome-ignore lint/nursery/noNoninteractiveElementInteractions: konsisten dengan dropzone banner di atas
                        <div
                          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-slate-300 border-dashed bg-white px-3 py-2.5 text-center text-xs text-slate-500 transition hover:border-emerald-500 hover:text-emerald-700"
                          onClick={() => doc.inputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Unggah PDF (Maks. 10MB)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Dana */}
              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-f2432"
                >
                  Target Dana (Rp) <span className="text-red-500">*</span>
                </label>
                <RupiahInput
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                  id="wakafprograms-f2432"
                  onChange={(digits) =>
                    setFormData({ ...formData, targetAmount: digits })
                  }
                  placeholder="Contoh: 500.000.000"
                  required
                  value={formData.targetAmount}
                />
              </div>

              {/* Durasi Program via Tanggal Mulai & Selesai */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 flex items-center gap-1 font-bold text-slate-800"
                    htmlFor="wakafprograms-startdate"
                  >
                    <Calendar className="h-3.5 w-3.5 text-emerald-700" />{' '}
                    Tanggal Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                    id="wakafprograms-startdate"
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setFormData((prev) => {
                        const shouldAdjustEnd =
                          prev.endDate && prev.endDate < newStart;
                        return {
                          ...prev,
                          startDate: newStart,
                          endDate: shouldAdjustEnd ? newStart : prev.endDate,
                        };
                      });
                    }}
                    onClick={(e) => {
                      try {
                        (e.currentTarget as HTMLInputElement).showPicker?.();
                      } catch {}
                    }}
                    required
                    type="date"
                    value={formData.startDate || toIsoDate(new Date())}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 flex items-center gap-1 font-bold text-slate-800"
                    htmlFor="wakafprograms-enddate"
                  >
                    <Calendar className="h-3.5 w-3.5 text-emerald-700" />{' '}
                    Tanggal Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                    id="wakafprograms-enddate"
                    min={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    onClick={(e) => {
                      try {
                        (e.currentTarget as HTMLInputElement).showPicker?.();
                      } catch {}
                    }}
                    required
                    type="date"
                    value={formData.endDate}
                  />
                </div>
                <p className="-mt-1 text-xs text-slate-500 sm:col-span-2">
                  Durasi terhitung:{' '}
                  <span className="font-bold text-emerald-800">
                    {durationDaysBetween(formData.startDate, formData.endDate)}{' '}
                    Hari
                  </span>
                </p>
              </div>

              {/* Rekening Bank: Dropdown Bank + No. Rekening + Atas Nama */}
              <div
                className={`space-y-2 rounded-xl border p-3.5 ${
                  Object.keys(bankErrors).length > 0
                    ? 'border-red-300 bg-red-50/20'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-bold text-slate-800">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-700" />{' '}
                    Rekening Bank Penyaluran{' '}
                    <span className="text-red-500">*</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    Wajib diisi lengkap untuk audit BWI
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-bankname"
                    >
                      Nama Bank <span className="text-red-500">*</span>
                    </label>
                    <SelectField
                      className="w-full"
                      error={Boolean(bankErrors.bankName)}
                      id="wakafprograms-bankname"
                      onChange={(e) => {
                        setFormData({ ...formData, bankName: e.target.value });
                        if (bankErrors.bankName) {
                          setBankErrors((prev) => ({
                            ...prev,
                            bankName: undefined,
                          }));
                        }
                      }}
                      value={formData.bankName}
                    >
                      <option value="">-- Pilih Bank --</option>
                      {BANK_OPTIONS.map((bank) => (
                        <option key={bank} value={bank}>
                          {bank}
                        </option>
                      ))}
                    </SelectField>
                    {bankErrors.bankName && (
                      <p className="mt-1 font-medium text-xs text-red-600">
                        {bankErrors.bankName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-bankaccountnumber"
                    >
                      Nomor Rekening <span className="text-red-500">*</span>
                    </label>
                    <input
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 ${
                        bankErrors.bankAccountNumber
                          ? 'border-red-400 focus:ring-red-500'
                          : 'border-slate-300 focus:ring-emerald-800'
                      }`}
                      id="wakafprograms-bankaccountnumber"
                      inputMode="numeric"
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          bankAccountNumber: e.target.value.replace(
                            NON_DIGITS_REGEX,
                            ''
                          ),
                        });
                        if (bankErrors.bankAccountNumber) {
                          setBankErrors((prev) => ({
                            ...prev,
                            bankAccountNumber: undefined,
                          }));
                        }
                      }}
                      placeholder="Contoh: 7118892234"
                      required
                      type="text"
                      value={formData.bankAccountNumber}
                    />
                    {bankErrors.bankAccountNumber && (
                      <p className="mt-1 font-medium text-xs text-red-600">
                        {bankErrors.bankAccountNumber}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-bankholder"
                    >
                      Atas Nama <span className="text-red-500">*</span>
                    </label>
                    <input
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 ${
                        bankErrors.bankAccountHolder
                          ? 'border-red-400 focus:ring-red-500'
                          : 'border-slate-300 focus:ring-emerald-800'
                      }`}
                      id="wakafprograms-bankholder"
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          bankAccountHolder: e.target.value,
                        });
                        if (bankErrors.bankAccountHolder) {
                          setBankErrors((prev) => ({
                            ...prev,
                            bankAccountHolder: undefined,
                          }));
                        }
                      }}
                      placeholder="Contoh: Yayasan RSI Surabaya"
                      required
                      type="text"
                      value={formData.bankAccountHolder}
                    />
                    {bankErrors.bankAccountHolder && (
                      <p className="mt-1 font-medium text-xs text-red-600">
                        {bankErrors.bankAccountHolder}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Wilayah bertingkat: Provinsi -> Kab/Kota -> Kecamatan -> Kelurahan */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="flex items-center gap-1 font-bold text-slate-800">
                  <MapPin className="h-3.5 w-3.5 text-emerald-700" /> Pilihan
                  Lokasi Program
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-provinsi"
                    >
                      Provinsi
                    </label>
                    <SearchableSelect
                      className="w-full"
                      id="wakafprograms-provinsi"
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      value={formData.provinceCode}
                    >
                      <option value="">-- Pilih Provinsi --</option>
                      {provinceOptions.map((p) => (
                        <option key={p.kode} value={p.kode}>
                          {p.nama}
                        </option>
                      ))}
                    </SearchableSelect>
                  </div>

                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-kabkota"
                    >
                      Kabupaten / Kota
                    </label>
                    <SearchableSelect
                      className="w-full"
                      disabled={!formData.provinceCode}
                      id="wakafprograms-kabkota"
                      onChange={(e) => handleRegencyChange(e.target.value)}
                      value={formData.regencyCode}
                    >
                      <option value="">
                        {loadingRegencies
                          ? 'Memuat Kab/Kota...'
                          : '-- Pilih Kabupaten / Kota --'}
                      </option>
                      {regencyOptions.map((r) => (
                        <option key={r.kode} value={r.kode}>
                          {r.nama}
                        </option>
                      ))}
                    </SearchableSelect>
                  </div>

                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-kecamatan"
                    >
                      Kecamatan
                    </label>
                    <SearchableSelect
                      className="w-full"
                      disabled={!formData.regencyCode}
                      id="wakafprograms-kecamatan"
                      onChange={(e) => handleDistrictChange(e.target.value)}
                      value={formData.districtCode}
                    >
                      <option value="">
                        {loadingDistricts
                          ? 'Memuat Kecamatan...'
                          : '-- Pilih Kecamatan --'}
                      </option>
                      {districtOptions.map((d) => (
                        <option key={d.kode} value={d.kode}>
                          {d.nama}
                        </option>
                      ))}
                    </SearchableSelect>
                  </div>

                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="wakafprograms-kelurahan"
                    >
                      Kelurahan
                    </label>
                    <SearchableSelect
                      className="w-full"
                      disabled={!formData.districtCode}
                      id="wakafprograms-kelurahan"
                      onChange={(e) => handleVillageChange(e.target.value)}
                      value={formData.villageCode}
                    >
                      <option value="">
                        {loadingVillages
                          ? 'Memuat Kelurahan...'
                          : '-- Pilih Kelurahan --'}
                      </option>
                      {villageOptions.map((v) => (
                        <option key={v.kode} value={v.kode}>
                          {v.nama}
                        </option>
                      ))}
                    </SearchableSelect>
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1 block font-semibold text-slate-700"
                    htmlFor="wakafprograms-f2531"
                  >
                    Detail Alamat
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-800"
                    id="wakafprograms-f2531"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        locationDetail: e.target.value,
                      })
                    }
                    placeholder="Contoh: Surabaya, Jawa Timur"
                    type="text"
                    value={formData.locationDetail}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-slate-100 border-t pt-2">
                <button
                  className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                  disabled={isLoading}
                  onClick={requestCloseProgramForm}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-900 px-4 py-2 font-bold text-white shadow-xs transition hover:bg-emerald-800 disabled:opacity-50 min-h-[38px]"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>{saveProgramLabel(isLoading, editingProgramId)}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TOLAK PENARIKAN DANA DENGAN ALASAN */}
      {rejectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-3 backdrop-blur-xs sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRejectModalOpen(false);
            }
          }}
        >
          <div className="fade-in zoom-in-95 my-auto flex max-h-[90vh] w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-slate-100 border-b p-4 pb-3 sm:p-5">
              <h3 className="flex items-center gap-2 font-bold text-base text-rose-800">
                <AlertCircle className="h-5 w-5 text-rose-600" />
                Tolak Pengajuan Penarikan Dana
              </h3>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setRejectModalOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="grow space-y-3 overflow-y-auto p-4 text-xs sm:p-5"
              onSubmit={handleRejectWithdrawalConfirm}
            >
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                Sesuai audit syariah, pengajuan penarikan dana yang ditolak{' '}
                <strong>wajib mencantumkan alasan penolakan</strong> secara
                transparan.
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-f2748"
                >
                  Alasan Penolakan *
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  id="wakafprograms-f2748"
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Contoh: Dokumen BAP progres fisik belum diverifikasi Dewan Pengawas Syariah / Kuitansi belanja belum sesuai..."
                  required
                  rows={3}
                  value={rejectReason}
                />
              </div>

              <div className="flex justify-end gap-2 border-slate-100 border-t pt-2">
                <button
                  className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setRejectModalOpen(false)}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white shadow-xs transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!rejectReason.trim()}
                  type="submit"
                >
                  <Check className="h-4 w-4" />
                  <span>Konfirmasi Penolakan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CATAT BAGI HASIL WAKAF PRODUKTIF */}
      {showYieldModal && selectedProgram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-3 backdrop-blur-xs sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowYieldModal(false);
            }
          }}
        >
          <div className="fade-in zoom-in-95 my-auto flex max-h-[90vh] w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-slate-100 border-b p-4 pb-3 sm:p-5">
              <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                <TrendingUp className="h-5 w-5 text-emerald-800" />
                Pencatatan Bagi Hasil Wakaf Produktif
              </h3>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setShowYieldModal(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="grow space-y-3 overflow-y-auto p-4 text-xs sm:p-5"
              onSubmit={handleRecordYield}
            >
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                Dana hasil usaha/investasi akan dicatat ke{' '}
                <strong>WaqfYieldEntry</strong> dan meng-increment{' '}
                <strong>totalHasilAvailable</strong> pada WaqfPrincipalLedger
                (pokok dana tetap utuh).
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-f2813"
                >
                  Nominal Surplus Hasil (Rp) *
                </label>
                <RupiahInput
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-extrabold text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                  id="wakafprograms-f2813"
                  onChange={setYieldAmount}
                  placeholder="Contoh: 7.500.000"
                  required
                  value={yieldAmount}
                />
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-slate-800"
                  htmlFor="wakafprograms-f2827"
                >
                  Sumber Pendapatan / Penjelasan Usaha *
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                  id="wakafprograms-f2827"
                  onChange={(e) => setYieldDescription(e.target.value)}
                  placeholder="Contoh: Hasil panen pisang cavendish siklus I atau deviden sewa lahan produktif..."
                  required
                  rows={2}
                  value={yieldDescription}
                />
              </div>

              <div className="flex justify-end gap-2 border-slate-100 border-t pt-2">
                <button
                  className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setShowYieldModal(false)}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-extrabold text-white shadow-xs transition hover:bg-[#144716]"
                  type="submit"
                >
                  <Check className="h-4 w-4" />
                  <span>Simpan ke Ledger Hasil</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LAPORAN SEMESTER BWI FORMAL (CETAK / SIMPAN SEBAGAI PDF) */}
      {showBwiReportModal && selectedProgram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/70 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBwiReportModal(false);
            }
          }}
        >
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .amwal-bwi-print-area, .amwal-bwi-print-area * { visibility: visible; }
              .amwal-bwi-print-area { position: absolute; inset: 0; width: 100%; }
            }
          `}</style>
          <div className="fade-in zoom-in-95 flex max-h-[92vh] w-full max-w-3xl animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150">
            <div className="flex shrink-0 items-center justify-between border-slate-100 border-b p-4">
              <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                <ShieldCheck className="h-5 w-5 text-[#1B5E20]" />
                Laporan Semester Badan Wakaf Indonesia (BWI)
              </h3>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setShowBwiReportModal(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grow overflow-y-auto bg-slate-100 p-6">
              {/* Dokumen A4 — satu-satunya bagian yang ikut tercetak */}
              <div className="amwal-bwi-print-area mx-auto max-w-[210mm] space-y-5 bg-white p-8 text-xs text-slate-800 shadow-sm">
                {/* Kop Surat */}
                <div className="space-y-1 border-slate-900 border-b-2 pb-3 text-center">
                  <h1 className="font-extrabold text-sm uppercase">
                    Platform Amwal
                  </h1>
                  <p className="text-xs">
                    Nazhir Wakaf Terdaftar — No. Registrasi Nazhir BWI:{' '}
                    <strong>BWI.3.1.0028/2024</strong>
                  </p>
                  <p className="text-xs">
                    SK Kementerian Agama RI No. Kw.13.4/5/BA.03.2/2024 tentang
                    Penetapan Nazhir Wakaf Uang
                  </p>
                  <p className="text-xs">
                    Dewan Pengawas Syariah: Dewan Pengawas Syariah Amwal
                  </p>
                  <h2 className="pt-2 font-bold text-xs uppercase">
                    Laporan Pengelolaan Wakaf Uang Semesteran
                  </h2>
                  <p className="text-xs">
                    Sesuai amanat UU No. 41 Tahun 2004 tentang Wakaf &amp;
                    Peraturan BWI No. 4 Tahun 2010
                  </p>
                  <p className="font-semibold text-xs">
                    Periode Pelaporan: {currentSemesterLabel()}
                  </p>
                </div>

                {/* Bagian I */}
                <section className="space-y-1">
                  <h3 className="font-bold text-xs uppercase">
                    Bagian I — Data Entitas &amp; Legalitas Nazhir
                  </h3>
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      <tr>
                        <td className="w-1/3 py-0.5 text-slate-500">
                          Nama Nazhir
                        </td>
                        <td className="py-0.5">
                          :{' '}
                          {selectedProgram.bankAccountHolder ||
                            'Platform Amwal'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500">
                          No. Registrasi Nazhir BWI
                        </td>
                        <td className="py-0.5">: BWI.3.1.0028/2024</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500">
                          Nama Program Wakaf
                        </td>
                        <td className="py-0.5">: {selectedProgram.name}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500">
                          Kode Program (8 Digit)
                        </td>
                        <td className="py-0.5 font-mono">
                          : {selectedProgram.kodeProgram ?? '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500">
                          Lokasi Pelaksanaan
                        </td>
                        <td className="py-0.5">
                          : {selectedProgram.city}, {selectedProgram.province}
                        </td>
                      </tr>
                      {selectedProgram.targetPenerimaManfaat && (
                        <tr>
                          <td className="py-0.5 text-slate-500">
                            Target Penerima Manfaat
                          </td>
                          <td className="py-0.5 font-medium text-slate-800">
                            : {selectedProgram.targetPenerimaManfaat}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>

                {/* Bagian II */}
                <section className="space-y-1">
                  <h3 className="font-bold text-xs uppercase">
                    Bagian II — Posisi Keuangan Penghimpunan Wakaf
                  </h3>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-slate-300 border-b">
                        <th className="py-1 text-left">Komponen</th>
                        <th className="py-1 text-right">Nominal (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-slate-200 border-b">
                        <td className="py-1">Target Penghimpunan</td>
                        <td className="py-1 text-right font-mono">
                          {selectedProgram.targetAmount.toLocaleString('id-ID')}
                        </td>
                      </tr>
                      <tr className="border-slate-200 border-b">
                        <td className="py-1">
                          Pokok Dana Terkumpul (Ledger Pokok)
                        </td>
                        <td className="py-1 text-right font-mono">
                          {selectedProgram.collectedAmount.toLocaleString(
                            'id-ID'
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold">
                          Jumlah Wakif Terdaftar
                        </td>
                        <td className="py-1 text-right font-mono">
                          {currentWakifList.length} Wakif
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Bagian III */}
                <section className="space-y-1">
                  <h3 className="font-bold text-xs uppercase">
                    Bagian III — Realisasi Penyaluran &amp; Capaian Lapangan
                  </h3>
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      <tr className="border-slate-200 border-b">
                        <td className="w-2/3 py-1">
                          Realisasi Penyaluran Termin (Disetujui)
                        </td>
                        <td className="py-1 text-right font-mono">
                          Rp{' '}
                          {currentTerminList
                            .filter(
                              (t) =>
                                t.rawStatus === 'APPROVED' ||
                                t.status.includes('Selesai')
                            )
                            .reduce((acc, t) => acc + t.nominal, 0)
                            .toLocaleString('id-ID')}
                        </td>
                      </tr>
                      <tr className="border-slate-200 border-b">
                        <td className="py-1">
                          Realisasi Belanja Nota &amp; Kuitansi (
                          {selectedProgram.receipts.length} berkas)
                        </td>
                        <td className="py-1 text-right font-mono">
                          Rp{' '}
                          {selectedProgram.receipts
                            .reduce((acc, r) => acc + r.amount, 0)
                            .toLocaleString('id-ID')}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold">
                          Capaian Fisik Lapangan
                        </td>
                        <td className="py-1 text-right font-mono">
                          {selectedProgram.progressFisik}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Bagian IV */}
                <section className="space-y-3 pt-4">
                  <h3 className="font-bold text-xs uppercase">
                    Bagian IV — Lembar Pengesahan
                  </h3>
                  <p className="text-xs">
                    Demikian laporan ini disusun dengan sebenar-benarnya untuk
                    memenuhi kewajiban pelaporan berkala kepada Badan Wakaf
                    Indonesia.
                  </p>
                  <div className="grid grid-cols-2 gap-6 pt-6 text-center text-xs">
                    <div>
                      <p>Mengetahui,</p>
                      <p>Dewan Pengawas Syariah</p>
                      <div className="mt-14 border-slate-800 border-b" />
                      <p className="mt-1 font-bold">
                        Dewan Pengawas Syariah Amwal
                      </p>
                    </div>
                    <div>
                      <p>Menyusun,</p>
                      <p>Ketua Nazhir</p>
                      <div className="mt-14 border-slate-800 border-b" />
                      <p className="mt-1 font-bold">
                        {selectedProgram.bankAccountHolder || 'Platform Amwal'}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-slate-100 border-t p-4">
              <button
                className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                onClick={() => setShowBwiReportModal(false)}
                type="button"
              >
                Tutup
              </button>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white shadow-xs transition hover:bg-[#144716]"
                onClick={() => window.print()}
                type="button"
              >
                <Download className="h-4 w-4" />
                <span>Cetak / Simpan sebagai PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SIARAN PERKEMBANGAN PROYEK KE WAKIF */}
      {showBroadcastModal && selectedProgram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBroadcastModal(false);
          }}
        >
          <div className="fade-in zoom-in-95 flex max-h-[90vh] w-full max-w-lg animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150">
            <div className="flex shrink-0 items-center justify-between border-slate-100 border-b p-4">
              <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                <Send className="h-5 w-5 text-[#1B5E20]" />
                Modal Siaran Perkembangan Proyek ke Wakif
              </h3>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setShowBroadcastModal(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grow space-y-3 overflow-y-auto p-4 text-xs">
              <div>
                <label
                  className="mb-1 block font-semibold text-slate-700"
                  htmlFor="wakafprograms-broadcast-message"
                >
                  Draf Pesan (bisa disunting)
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                  id="wakafprograms-broadcast-message"
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={9}
                  value={broadcastMessage}
                />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                Kirim via Bot WA mengirim pesan satu per satu dengan jeda
                otomatis untuk mengurangi risiko pemblokiran nomor.
              </div>

              <div>
                <span className="mb-1 block font-semibold text-slate-700">
                  Daftar Penerima ({currentWakifList.length} Wakif)
                </span>
                {currentWakifList.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Belum ada wakif terdaftar untuk program ini.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {currentWakifList.map((w) => (
                      <div
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                        key={w.id}
                      >
                        <span className="truncate">
                          <span className="font-bold text-slate-900">
                            {w.name}
                          </span>{' '}
                          <span className="font-mono text-xs text-slate-500">
                            {w.phone || 'Tanpa nomor WA'}
                          </span>
                        </span>
                        {w.phone && (
                          <a
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 font-semibold text-xs text-slate-700 transition hover:bg-slate-100"
                            href={toWaMeLink(w.phone, broadcastMessage)}
                            rel="noopener"
                            target="_blank"
                          >
                            Kirim Personal
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-slate-100 border-t p-4">
              <button
                className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                onClick={() => setShowBroadcastModal(false)}
                type="button"
              >
                Tutup
              </button>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white shadow-xs transition hover:bg-[#144716] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSendingBroadcast || currentWakifList.length === 0}
                onClick={() => handleSendBroadcastViaBot(selectedProgram.id)}
                type="button"
              >
                {isSendingBroadcast ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>Kirim via Bot WA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT KUITANSI */}
      {editingReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingReceipt(null);
          }}
        >
          <div className="fade-in zoom-in-95 flex w-full max-w-sm animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150">
            <div className="flex items-center justify-between border-slate-100 border-b p-4">
              <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                <Edit3 className="h-5 w-5 text-[#1B5E20]" />
                Edit Kuitansi
              </h3>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setEditingReceipt(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="space-y-3 p-4 text-xs"
              onSubmit={handleSaveEditReceipt}
            >
              <div>
                <label
                  className="mb-1 block font-semibold text-slate-700"
                  htmlFor="wakafprograms-editreceipt-title"
                >
                  Judul Pengeluaran
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                  id="wakafprograms-editreceipt-title"
                  onChange={(e) => setEditReceiptTitle(e.target.value)}
                  required
                  type="text"
                  value={editReceiptTitle}
                />
              </div>

              <div>
                <label
                  className="mb-1 block font-semibold text-slate-700"
                  htmlFor="wakafprograms-editreceipt-vendor"
                >
                  Nama Vendor / Toko
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                  id="wakafprograms-editreceipt-vendor"
                  onChange={(e) => setEditReceiptVendor(e.target.value)}
                  type="text"
                  value={editReceiptVendor}
                />
              </div>

              <div>
                <label
                  className="mb-1 block font-semibold text-slate-700"
                  htmlFor="wakafprograms-editreceipt-amount"
                >
                  Nominal (Rp)
                </label>
                <RupiahInput
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
                  id="wakafprograms-editreceipt-amount"
                  onChange={setEditReceiptAmount}
                  required
                  value={editReceiptAmount}
                />
              </div>

              <div className="flex justify-end gap-2 border-slate-100 border-t pt-2">
                <button
                  className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setEditingReceipt(null)}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white shadow-xs transition hover:bg-[#144716] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSavingReceiptEdit}
                  type="submit"
                >
                  {isSavingReceiptEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETAIL BUKTI KUITANSI & NOTA BELANJA (LIGHTBOX) */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/70 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewReceipt(null);
          }}
        >
          <div className="fade-in zoom-in-95 flex max-h-[90vh] w-full max-w-lg animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150">
            <div className="flex shrink-0 items-center justify-between border-slate-100 border-b p-4">
              <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
                <FileText className="h-5 w-5 text-[#1B5E20]" />
                Detail Bukti Kuitansi &amp; Nota Belanja
              </h3>
              <button
                className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setPreviewReceipt(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grow space-y-3 overflow-y-auto p-4">
              <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2">
                {isLoadingPreview ? (
                  <div className="flex h-48 w-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : previewImageUrl &&
                  previewReceipt.mimeType !== 'application/pdf' ? (
                  // biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari pola gambar lain di berkas ini; tidak ada komponen Image teroptimasi di TanStack Start
                  <img
                    alt={previewReceipt.title}
                    className="max-h-[70vh] w-full rounded-xl object-contain"
                    src={previewImageUrl}
                  />
                ) : previewImageUrl ? (
                  <a
                    className="flex items-center gap-1.5 p-6 font-bold text-emerald-800 text-xs hover:underline"
                    href={previewImageUrl}
                    rel="noopener"
                    target="_blank"
                  >
                    <FileText className="h-4 w-4" />
                    Buka Berkas PDF di Tab Baru
                  </a>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="block text-slate-500">
                    Judul Pengeluaran
                  </span>
                  <span className="block font-bold text-slate-900">
                    {previewReceipt.title}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Vendor / Toko</span>
                  <span className="block font-bold text-slate-900">
                    {previewReceipt.vendor || '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Tanggal Nota</span>
                  <span className="block font-bold text-slate-900">
                    {previewReceipt.date}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Nominal (Rp)</span>
                  <span className="block font-bold font-mono text-emerald-800">
                    Rp {previewReceipt.amount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
