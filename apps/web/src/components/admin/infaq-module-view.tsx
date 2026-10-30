'use client';

import {
  AlertTriangle,
  Download,
  FileText,
  HandCoins,
  Layers,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import {
  type MasterDataOption,
  useMasterData,
  withCurrentOption,
} from '@/components/admin/use-master-data';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { useDirtyGuard } from '@/components/ui/use-dirty-guard';
import {
  getInfaqProofUrl,
  removeInfaqProof,
  uploadInfaqProof,
} from '@/lib/amwal-api/admin';
import { orpc } from '@/lib/orpc/client';
import { formatFileSize, validateReceiptFile } from '@/lib/receipt-file';

const INFAQ_STATUS_LABELS: Record<string, string> = {
  SETTLED: 'Berhasil',
  PENDING: 'Menunggu',
  EXPIRED: 'Kedaluwarsa',
  FAILED: 'Gagal',
};

const INFAQ_STATUS_BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-800',
  EXPIRED: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-rose-100 text-rose-800',
};

const PROGRAM_STATUS_LABELS: Record<string, string> = {
  AKTIF: 'Aktif',
  SELESAI: 'Selesai',
  DRAF: 'Draf',
};

const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Ahd'];

type InfaqJenis =
  | 'INFAQ_SUBUH'
  | 'INFAQ_JUMAT'
  | 'INFAQ_UMUM'
  | 'SEDEKAH_YATIM'
  | 'SEDEKAH_OPERASIONAL';
type ProgramStatus = 'AKTIF' | 'SELESAI' | 'DRAF';

interface RealInfaqOrderRow {
  id: string;
  orderId: string;
  namaPenginfaq: string;
  teleponPenginfaq: string | null;
  nominal: string;
  jenis: string;
  doa: string | null;
  status: string;
  createdAt: string;
  programId: string | null;
  programNama: string | null;
  isManual: boolean;
  hasBukti: boolean;
  paymentMethod: string | null;
}

interface InfaqProgramRow {
  id: string;
  nama: string;
  jenis: string;
  deskripsi: string | null;
  target: string | null;
  status: string;
  createdAt: string;
  collected: string;
  orderCount: number;
}

interface ProgramFormState {
  nama: string;
  jenis: InfaqJenis;
  deskripsi: string;
  target: string;
  noTarget: boolean;
  status: ProgramStatus;
}

const EMPTY_PROGRAM_FORM: ProgramFormState = {
  nama: '',
  jenis: 'INFAQ_UMUM',
  deskripsi: '',
  target: '',
  noTarget: false,
  status: 'AKTIF',
};

interface DonationFormState {
  namaPenginfaq: string;
  teleponPenginfaq: string;
  nominal: string;
  programId: string;
  jenis: InfaqJenis;
  metode: string;
  doa: string;
}

const EMPTY_DONATION_FORM: DonationFormState = {
  namaPenginfaq: '',
  teleponPenginfaq: '',
  nominal: '',
  programId: '',
  jenis: 'INFAQ_UMUM',
  metode: '',
  doa: '',
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function programLabel(
  order: RealInfaqOrderRow,
  labels: Record<string, string>
): string {
  return order.programNama ?? labels[order.jenis] ?? order.jenis;
}

const CSV_NEEDS_QUOTING = /[",\n]/;

function csvCell(value: string | number): string {
  const text = String(value);
  return CSV_NEEDS_QUOTING.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function downloadCsv(
  rows: RealInfaqOrderRow[],
  labels: Record<string, string>
) {
  const header = [
    'ID Transaksi',
    'Waktu',
    'Nama Donatur',
    'Telepon',
    'Program / Jenis',
    'Metode',
    'Nominal',
    'Status',
    'Sumber',
  ];
  const lines = rows.map((o) =>
    [
      o.orderId,
      new Date(o.createdAt).toISOString(),
      o.namaPenginfaq,
      o.teleponPenginfaq ?? '',
      programLabel(o, labels),
      o.paymentMethod ?? '',
      Number(o.nominal),
      INFAQ_STATUS_LABELS[o.status] ?? o.status,
      o.isManual ? 'Manual' : 'Online',
    ]
      .map(csvCell)
      .join(',')
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transaksi-infaq-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function InfaqModuleView() {
  const { showToast } = useToast();
  const jenisInfaq = useMasterData('JENIS_INFAQ');
  const metodeInfaq = useMasterData('METODE_INFAQ');
  const [activeTab, setActiveTab] = useState<'overview' | 'programs'>(
    'overview'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [selectedMethodFilter, setSelectedMethodFilter] = useState('all');

  const [programs, setPrograms] = useState<InfaqProgramRow[]>([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [realOrders, setRealOrders] = useState<RealInfaqOrderRow[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Program form (create / edit)
  const [programFormMode, setProgramFormMode] = useState<
    'create' | 'edit' | null
  >(null);
  const [editingProgram, setEditingProgram] = useState<InfaqProgramRow | null>(
    null
  );
  const [programForm, setProgramForm] =
    useState<ProgramFormState>(EMPTY_PROGRAM_FORM);
  const [deletingProgram, setDeletingProgram] =
    useState<InfaqProgramRow | null>(null);

  // Donasi manual (create / edit)
  const [donationFormMode, setDonationFormMode] = useState<
    'create' | 'edit' | null
  >(null);
  const [editingDonation, setEditingDonation] =
    useState<RealInfaqOrderRow | null>(null);
  const [donationForm, setDonationForm] =
    useState<DonationFormState>(EMPTY_DONATION_FORM);
  const [deletingDonation, setDeletingDonation] =
    useState<RealInfaqOrderRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Bukti donasi (foto struk / PDF): dipilih di modal, diunggah setelah donasinya tersimpan.
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [removeExistingProof, setRemoveExistingProof] = useState(false);

  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const res = await orpc.admin.infaq.ordersList({});
      setRealOrders(res.data as RealInfaqOrderRow[]);
    } catch {
      showToast({
        title: 'Gagal memuat data infaq',
        description: 'Statistik & transaksi menampilkan data kosong.',
        type: 'error',
      });
    } finally {
      setIsLoadingOrders(false);
    }
  }, [showToast]);

  const loadPrograms = useCallback(async () => {
    setIsLoadingPrograms(true);
    try {
      const res = await orpc.admin.infaq.programsList();
      setPrograms(res.data);
    } catch {
      showToast({
        title: 'Gagal memuat program infaq',
        description: 'Katalog program belum dapat ditampilkan.',
        type: 'error',
      });
    } finally {
      setIsLoadingPrograms(false);
    }
  }, [showToast]);

  const reloadAll = useCallback(
    () => Promise.all([loadOrders(), loadPrograms()]),
    [loadOrders, loadPrograms]
  );

  useEffect(() => {
    reloadAll();
    // biome-ignore lint/correctness/useExhaustiveDependencies: fetch-once on mount
  }, []);

  const settledOrders = useMemo(
    () => realOrders.filter((o) => o.status === 'SETTLED'),
    [realOrders]
  );

  const totalCollected = useMemo(
    () => settledOrders.reduce((sum, o) => sum + Number(o.nominal), 0),
    [settledOrders]
  );

  const totalDonors = useMemo(() => {
    const keys = new Set(
      settledOrders.map((o) => o.teleponPenginfaq || o.namaPenginfaq)
    );
    return keys.size;
  }, [settledOrders]);

  const allocation = useMemo(() => {
    const programShare = settledOrders
      .filter((o) => o.programId)
      .reduce((sum, o) => sum + Number(o.nominal), 0);
    const general = totalCollected - programShare;
    const pct = (value: number) =>
      totalCollected > 0 ? (value / totalCollected) * 100 : 0;
    return {
      programShare,
      general,
      programPct: pct(programShare),
      generalPct: pct(general),
    };
  }, [settledOrders, totalCollected]);

  const infaqWeeklyTrend = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    for (const o of settledOrders) {
      const jsDay = new Date(o.createdAt).getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      buckets[idx] += Number(o.nominal);
    }
    return WEEKDAY_LABELS.map((day, i) => ({ day, amount: buckets[i] }));
  }, [settledOrders]);

  const peakDay = useMemo(
    () => infaqWeeklyTrend.reduce((a, b) => (b.amount > a.amount ? b : a)),
    [infaqWeeklyTrend]
  );

  const methodOptions = useMemo(
    () =>
      [...new Set(realOrders.map((o) => o.paymentMethod).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b))
      ) as string[],
    [realOrders]
  );

  const filteredOrders = realOrders.filter((o) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      o.namaPenginfaq.toLowerCase().includes(term) ||
      o.orderId.toLowerCase().includes(term) ||
      programLabel(o, jenisInfaq.labels).toLowerCase().includes(term);
    const matchMethod =
      selectedMethodFilter === 'all' ||
      o.paymentMethod === selectedMethodFilter;
    return matchSearch && matchMethod;
  });

  const filteredPrograms = programs.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      p.nama.toLowerCase().includes(term) || p.id.toLowerCase().includes(term);
    const matchCat =
      selectedCategoryFilter === 'all' || p.jenis === selectedCategoryFilter;
    return matchSearch && matchCat;
  });

  // ---- Program handlers ----
  const openCreateProgram = () => {
    setEditingProgram(null);
    setProgramForm({
      ...EMPTY_PROGRAM_FORM,
      jenis:
        (jenisInfaq.activeOptions[0]?.kode as InfaqJenis | undefined) ??
        EMPTY_PROGRAM_FORM.jenis,
    });
    setProgramFormMode('create');
  };

  const openEditProgram = (prog: InfaqProgramRow) => {
    setEditingProgram(prog);
    setProgramForm({
      nama: prog.nama,
      jenis: prog.jenis as InfaqJenis,
      deskripsi: prog.deskripsi ?? '',
      target: prog.target ? String(Number(prog.target)) : '',
      noTarget: prog.target === null,
      status: prog.status as ProgramStatus,
    });
    setProgramFormMode('edit');
  };

  const handleSubmitProgram = async () => {
    const target = Number(programForm.target);
    if (programForm.nama.trim().length < 2) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Mohon isi nama program infaq.',
        type: 'error',
      });
      return;
    }
    if (!(programForm.noTarget || target > 0)) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Isi target penghimpunan atau centang "Tanpa Target".',
        type: 'error',
      });
      return;
    }
    const payload = {
      nama: programForm.nama.trim(),
      jenis: programForm.jenis,
      deskripsi: programForm.deskripsi.trim(),
      target: programForm.noTarget ? null : target,
      status: programForm.status,
    };
    setIsSaving(true);
    try {
      if (programFormMode === 'edit' && editingProgram) {
        await orpc.admin.infaq.updateProgram({
          id: editingProgram.id,
          ...payload,
        });
      } else {
        await orpc.admin.infaq.createProgram(payload);
      }
      showToast({
        title:
          programFormMode === 'edit'
            ? 'Program Infaq Diperbarui'
            : 'Program Infaq Diterbitkan',
        description: `Program "${payload.nama}" berhasil disimpan.`,
        type: 'success',
      });
      setProgramFormMode(null);
      await loadPrograms();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan program',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteProgram = async () => {
    if (!deletingProgram) {
      return;
    }
    try {
      await orpc.admin.infaq.deleteProgram({ id: deletingProgram.id });
      showToast({
        title: 'Program Infaq Dihapus',
        description: `Program "${deletingProgram.nama}" dihapus dari katalog.`,
        type: 'success',
      });
      setDeletingProgram(null);
      await reloadAll();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menghapus program',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  // ---- Donation handlers ----
  const openCreateDonation = () => {
    setProofFile(null);
    setRemoveExistingProof(false);
    setEditingDonation(null);
    const firstActive = programs.find((p) => p.status === 'AKTIF');
    setDonationForm({
      ...EMPTY_DONATION_FORM,
      programId: firstActive?.id ?? '',
      jenis:
        (jenisInfaq.activeOptions[0]?.kode as InfaqJenis | undefined) ??
        EMPTY_DONATION_FORM.jenis,
      metode: metodeInfaq.activeOptions[0]?.label ?? '',
    });
    setDonationFormMode('create');
  };

  const openEditDonation = (order: RealInfaqOrderRow) => {
    setEditingDonation(order);
    setProofFile(null);
    setRemoveExistingProof(false);
    setDonationForm({
      namaPenginfaq: order.namaPenginfaq,
      teleponPenginfaq: order.teleponPenginfaq ?? '',
      nominal: String(Number(order.nominal)),
      programId: order.programId ?? '',
      jenis: order.jenis as InfaqJenis,
      metode: order.paymentMethod ?? '',
      doa: order.doa ?? '',
    });
    setDonationFormMode('edit');
  };

  const handleSubmitDonation = async () => {
    const nominal = Number(donationForm.nominal);
    if (!(donationForm.namaPenginfaq.trim() && nominal > 0)) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Mohon isi nama donatur dan nominal donasi.',
        type: 'error',
      });
      return;
    }
    if (!donationForm.metode) {
      showToast({
        title: 'Metode belum dipilih',
        description:
          'Tambahkan atau sinkronkan Metode Penerimaan Infaq di Master Data.',
        type: 'error',
      });
      return;
    }
    if (!Number.isInteger(nominal)) {
      showToast({
        title: 'Nominal tidak valid',
        description: 'Nominal donasi harus bilangan bulat rupiah.',
        type: 'error',
      });
      return;
    }
    const payload = {
      namaPenginfaq: donationForm.namaPenginfaq.trim(),
      teleponPenginfaq: donationForm.teleponPenginfaq.trim(),
      nominal,
      programId: donationForm.programId || null,
      jenis: donationForm.jenis,
      metode: donationForm.metode,
      doa: donationForm.doa.trim(),
    };
    setIsSaving(true);
    try {
      let savedId: string | undefined;
      if (donationFormMode === 'edit' && editingDonation) {
        await orpc.admin.infaq.updateOrder({
          id: editingDonation.id,
          ...payload,
        });
        savedId = editingDonation.id;
      } else {
        const created = await orpc.admin.infaq.createOrder(payload);
        savedId = created.data?.id;
      }
      showToast({
        title:
          donationFormMode === 'edit'
            ? 'Donasi Infaq Diperbarui'
            : 'Donasi Infaq Berhasil Dicatat',
        description: `Penerimaan Rp ${nominal.toLocaleString('id-ID')} dari ${payload.namaPenginfaq} tercatat di buku kas.`,
        type: 'success',
      });
      // Donasi sudah tersimpan; lampiran gagal tidak membatalkannya, hanya diberi tahu.
      if (savedId && (proofFile || removeExistingProof)) {
        try {
          if (proofFile) {
            await uploadInfaqProof({ file: proofFile, infaqOrderId: savedId });
          } else {
            await removeInfaqProof(savedId);
          }
        } catch (proofError: unknown) {
          showToast({
            title: 'Donasi tersimpan, lampiran belum',
            description: `${errorMessage(proofError, 'Lampiran gagal diproses.')} Buka Edit pada donasi ini untuk mencoba lagi.`,
            type: 'warning',
          });
        }
      }
      setDonationFormMode(null);
      await reloadAll();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan donasi',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openProof = async (order: RealInfaqOrderRow) => {
    try {
      const url = await getInfaqProofUrl(order.id);
      window.open(url, '_blank', 'noopener');
    } catch (err: unknown) {
      showToast({
        title: 'Bukti tidak bisa dibuka',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  const handleConfirmDeleteDonation = async () => {
    if (!deletingDonation) {
      return;
    }
    try {
      await orpc.admin.infaq.deleteOrder({ id: deletingDonation.id });
      showToast({
        title: 'Donasi Dihapus',
        description: `${deletingDonation.orderId} telah dihapus.`,
        type: 'success',
      });
      setDeletingDonation(null);
      await reloadAll();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menghapus donasi',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6 font-jakarta pb-12">
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            onClick={openCreateDonation}
            type="button"
          >
            <Plus className="w-3.5 h-3.5" />
            Catat Infaq Masuk
          </button>
        }
        description="Catat penerimaan infaq &amp; sedekah, kelola akad dan program, serta pantau transaksi donatur."
        icon={<HandCoins aria-hidden="true" />}
        title="Infaq &amp; Sedekah"
      />

      <AdminTabs
        label="Bagian modul infaq"
        onChange={setActiveTab}
        tabs={[
          {
            id: 'overview',
            label: 'Ringkasan & Transaksi Donatur',
            icon: <TrendingUp className="h-4 w-4" />,
            count: realOrders.length,
          },
          {
            id: 'programs',
            label: 'Akad & Program Infaq',
            icon: <Layers className="h-4 w-4" />,
            count: programs.length,
          },
        ]}
        value={activeTab}
      />

      {/* 1. OVERVIEW / RINGKASAN */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  Total Infaq Terhimpun
                </span>
                <span className="p-2 rounded-xl bg-emerald-50 text-[#1B5E20]">
                  <TrendingUp className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                {isLoadingOrders
                  ? 'Memuat…'
                  : `Rp ${totalCollected.toLocaleString('id-ID')}`}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                <span>{settledOrders.length} transaksi berhasil tercatat</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  Total Donatur / Munfiq
                </span>
                <span className="p-2 rounded-xl bg-purple-50 text-purple-800">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                {isLoadingOrders
                  ? 'Memuat…'
                  : `${totalDonors.toLocaleString('id-ID')} Munfiq`}
              </div>
              <div className="mt-2 text-xs text-emerald-700 font-semibold">
                Donatur unik (nomor HP / nama) dari transaksi berhasil
              </div>
            </div>
          </div>

          {/* Cashflow & Financial Balance Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Alokasi Dana Infaq Terhimpun
                </h3>
                <p className="text-xs text-slate-500">
                  Donasi berhasil yang dialokasikan ke program vs. dana umum
                  tanpa program.
                </p>
              </div>
            </div>

            {/* Visual Progress Ratio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Total Dana Terhimpun</span>
                <span className="font-mono">
                  Rp {totalCollected.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-[#1B5E20] h-full"
                  style={{ width: `${allocation.programPct}%` }}
                  title={`Teralokasi ke Program (${allocation.programPct.toFixed(1)}%)`}
                />
                <div
                  className="bg-teal-400 h-full"
                  style={{ width: `${allocation.generalPct}%` }}
                  title={`Dana Umum (${allocation.generalPct.toFixed(1)}%)`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#1B5E20]" />
                  <span>
                    Teralokasi ke Program:{' '}
                    <strong>
                      Rp {allocation.programShare.toLocaleString('id-ID')} (
                      {allocation.programPct.toFixed(1)}%)
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-teal-400" />
                  <span>
                    Dana Umum:{' '}
                    <strong>
                      Rp {allocation.general.toLocaleString('id-ID')} (
                      {allocation.generalPct.toFixed(1)}%)
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Weekly Infaq Trend Chart */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Grafik Pola Penerimaan Infaq Mingguan
                  </h4>
                  <p className="text-xs text-slate-500">
                    Akumulasi total infaq berhasil per hari dalam seminggu
                    (seluruh riwayat data)
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-[#1B5E20] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  Puncak: {peakDay.day} (Rp{' '}
                  {(peakDay.amount / 1_000_000).toFixed(1)} Jt)
                </span>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer height="100%" width="100%">
                  <AreaChart
                    data={infaqWeeklyTrend}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `Rp${(v / 1000000).toFixed(0)}Jt`}
                    />
                    <Tooltip
                      formatter={(val: any) =>
                        `Rp ${Number(val).toLocaleString('id-ID')}`
                      }
                    />
                    <Area
                      dataKey="amount"
                      fill="#1B5E20"
                      fillOpacity={0.18}
                      name="Infaq Harian"
                      stroke="#1B5E20"
                      type="monotone"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Transaksi Donatur (digabung dengan ringkasan) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Daftar Transaksi Infaq &amp; Sedekah Masuk
                </h3>
                <p className="text-xs text-slate-500">
                  Penerimaan dari kanal digital &amp; donasi manual kasir.
                  Transaksi online hanya dapat dilihat.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  disabled={isLoadingOrders}
                  onClick={reloadAll}
                  type="button"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`}
                  />
                  Muat Ulang
                </button>
                <button
                  className="px-3 py-1.5 bg-[#1B5E20] hover:bg-[#144716] text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-xs"
                  onClick={openCreateDonation}
                  type="button"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Input Donasi Manual
                </button>
                <button
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  disabled={filteredOrders.length === 0}
                  onClick={() => downloadCsv(filteredOrders, jenisInfaq.labels)}
                  type="button"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Table Filters */}
            <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]"
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari nama donatur, ID donasi, atau program..."
                  type="text"
                  value={searchTerm}
                />
              </div>
              <SelectField
                onChange={(e) => setSelectedMethodFilter(e.target.value)}
                value={selectedMethodFilter}
              >
                <option value="all">Semua Metode Pembayaran</option>
                {methodOptions.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </SelectField>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">ID Transaksi</th>
                    <th className="py-3 px-4">Nama Donatur</th>
                    <th className="py-3 px-4">Program Akad</th>
                    <th className="py-3 px-4">Metode Bayar</th>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Nominal</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoadingOrders && realOrders.length === 0 ? (
                    <tr>
                      <td
                        className="py-8 px-4 text-center text-slate-400"
                        colSpan={8}
                      >
                        Memuat transaksi…
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td
                        className="py-8 px-4 text-center text-slate-400"
                        colSpan={8}
                      >
                        Belum ada transaksi.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr className="hover:bg-slate-50/70" key={order.id}>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                          {order.orderId}
                          <div className="font-sans font-normal text-xs text-slate-400">
                            {order.isManual
                              ? 'Entri manual'
                              : 'Pembayaran online'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {order.namaPenginfaq}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {programLabel(order, jenisInfaq.labels)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            {order.paymentMethod ?? '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-xs">
                          {formatDateTime(order.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-900 font-mono">
                          Rp {Number(order.nominal).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${INFAQ_STATUS_BADGE[order.status] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {INFAQ_STATUS_LABELS[order.status] ?? order.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {order.isManual ? (
                            <div className="flex items-center justify-center gap-1.5">
                              {order.hasBukti && (
                                <button
                                  aria-label={`Lihat bukti ${order.orderId}`}
                                  className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-800 transition hover:bg-emerald-100"
                                  onClick={() => openProof(order)}
                                  title="Lihat bukti transaksi"
                                  type="button"
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                                onClick={() => openEditDonation(order)}
                                title="Edit donasi"
                                type="button"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-rose-200 bg-white p-2 text-rose-700 transition hover:bg-rose-50"
                                onClick={() => setDeletingDonation(order)}
                                title="Hapus donasi"
                                type="button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-center text-xs text-slate-400">
                              —
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. PROGRAM & AKAD INFAQ */}
      {activeTab === 'programs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Katalog Program Akad &amp; Penyaluran Infaq
              </h3>
              <p className="text-xs text-slate-500">
                Kelola peruntukan dana dan target capaian program. Terkumpul =
                donasi berhasil yang dialokasikan ke program.
              </p>
            </div>
            <button
              className="px-3.5 py-2 bg-[#1B5E20] hover:bg-[#144716] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              onClick={openCreateProgram}
              type="button"
            >
              <Plus className="w-3.5 h-3.5" />
              Buat Program Infaq Baru
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20] transition"
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari program infaq berdasarkan nama atau ID..."
                type="text"
                value={searchTerm}
              />
            </div>
            <SelectField
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              value={selectedCategoryFilter}
            >
              <option value="all">Semua Kategori Akad</option>
              {jenisInfaq.rows.map((row) => (
                <option key={row.id} value={row.kode ?? ''}>
                  {row.label}
                </option>
              ))}
            </SelectField>
          </div>

          {/* Programs Grid */}
          {isLoadingPrograms && programs.length === 0 && (
            <p className="py-8 text-center text-slate-400 text-xs">
              Memuat program…
            </p>
          )}
          {!isLoadingPrograms && filteredPrograms.length === 0 && (
            <p className="py-8 text-center text-slate-400 text-xs">
              Belum ada program infaq. Klik &quot;Buat Program Infaq Baru&quot;
              untuk memulai.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {filteredPrograms.map((prog) => {
              const target = Number(prog.target ?? 0);
              const collected = Number(prog.collected);
              const isNoTarget = target === 0;
              const percent = isNoTarget
                ? 100
                : Math.min(100, Math.round((collected / target) * 100));
              return (
                <div
                  className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3"
                  key={prog.id}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B5E20] font-bold">
                      {jenisInfaq.labels[prog.jenis] ?? prog.jenis}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isNoTarget && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold border border-teal-200">
                          Tanpa Target
                        </span>
                      )}
                      <span className="text-xs font-mono text-slate-400 font-bold">
                        {prog.id}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                      {prog.nama}
                    </h4>
                    {prog.deskripsi && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {prog.deskripsi}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs font-mono mt-2">
                      <span className="text-slate-500">
                        Terkumpul:{' '}
                        <strong>Rp {collected.toLocaleString('id-ID')}</strong>
                      </span>
                      <span className="text-slate-700 font-bold">
                        {isNoTarget ? (
                          <span className="text-teal-700 font-sans font-bold">
                            Terbuka / Berkelanjutan
                          </span>
                        ) : (
                          `Target: Rp ${target.toLocaleString('id-ID')}`
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isNoTarget ? 'bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600' : 'bg-[#1B5E20]'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 font-semibold">
                      <span>
                        {isNoTarget
                          ? `♾️ Program Terbuka • ${prog.orderCount} donasi`
                          : `${percent}% tercapai • ${prog.orderCount} donasi`}
                      </span>
                      <span>
                        Status:{' '}
                        {PROGRAM_STATUS_LABELS[prog.status] ?? prog.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 border-slate-200 border-t pt-2">
                    <button
                      className="flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold text-xs text-slate-700 transition hover:bg-slate-100"
                      onClick={() => openEditProgram(prog)}
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Akad
                    </button>
                    <button
                      className="flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 font-bold text-xs text-rose-700 transition hover:bg-rose-50"
                      onClick={() => setDeletingProgram(prog)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {programFormMode && (
        <ProgramFormModal
          form={programForm}
          isSaving={isSaving}
          jenisOptions={withCurrentOption(
            jenisInfaq.activeOptions,
            jenisInfaq.labels,
            programFormMode === 'edit' ? programForm.jenis : '',
            (o) => o.kode ?? ''
          )}
          mode={programFormMode}
          onChange={setProgramForm}
          onClose={() => setProgramFormMode(null)}
          onSubmit={handleSubmitProgram}
        />
      )}

      {donationFormMode && (
        <DonationFormModal
          existingProof={Boolean(
            donationFormMode === 'edit' && editingDonation?.hasBukti
          )}
          form={donationForm}
          isSaving={isSaving}
          jenisMaster={jenisInfaq}
          metodeOptions={withCurrentOption(
            metodeInfaq.activeOptions,
            metodeInfaq.labels,
            donationForm.metode,
            (o) => o.label
          )}
          mode={donationFormMode}
          onChange={setDonationForm}
          onClose={() => setDonationFormMode(null)}
          onOpenExistingProof={() =>
            editingDonation ? openProof(editingDonation) : undefined
          }
          onProofChange={setProofFile}
          onRemoveExistingProof={setRemoveExistingProof}
          onSubmit={handleSubmitDonation}
          programs={programs}
          proofFile={proofFile}
          removeExistingProof={removeExistingProof}
        />
      )}

      {deletingProgram && (
        <ConfirmDeleteModal
          description={
            <>
              Program <strong>&quot;{deletingProgram.nama}&quot;</strong> (
              {deletingProgram.id}) akan dihapus dari katalog.{' '}
              {deletingProgram.orderCount > 0 &&
                `${deletingProgram.orderCount} donasi yang teralokasi tetap tersimpan tanpa program.`}
            </>
          }
          onCancel={() => setDeletingProgram(null)}
          onConfirm={handleConfirmDeleteProgram}
          title="Hapus Akad Program?"
        />
      )}

      {deletingDonation && (
        <ConfirmDeleteModal
          description={
            <>
              Donasi <strong>{deletingDonation.orderId}</strong> dari{' '}
              <strong>{deletingDonation.namaPenginfaq}</strong> sebesar Rp{' '}
              {Number(deletingDonation.nominal).toLocaleString('id-ID')} akan
              dihapus permanen dari buku kas.
            </>
          }
          onCancel={() => setDeletingDonation(null)}
          onConfirm={handleConfirmDeleteDonation}
          title="Hapus Donasi Manual?"
        />
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 transition focus:border-[#1B5E20] focus:bg-white focus:ring-1 focus:ring-[#1B5E20]';

interface ModalShellProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  /** State form: klik latar tak menutup, Esc/tutup bertanya setelah diubah. */
  guardValue?: unknown;
}

function ModalShell({
  title,
  subtitle,
  submitLabel,
  isSaving,
  onClose,
  onSubmit,
  children,
  guardValue,
}: ModalShellProps) {
  const guarded = guardValue !== undefined;
  const { requestClose } = useDirtyGuard({ value: guardValue, onClose });
  const close = guarded ? requestClose : onClose;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150"
      onClick={(e) => {
        if (!guarded && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-slate-100 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 font-bold text-emerald-800">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
              <p className="text-slate-500 text-xs">{subtitle}</p>
            </div>
          </div>
          <button
            aria-label="Tutup"
            className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
            onClick={close}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 text-xs">{children}</div>
        <div className="flex items-center justify-end gap-2 border-slate-100 border-t pt-3">
          <button
            className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-2 font-semibold text-slate-700 text-xs hover:bg-slate-200"
            onClick={onClose}
            type="button"
          >
            Batal
          </button>
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716] disabled:opacity-50"
            disabled={isSaving}
            onClick={onSubmit}
            type="button"
          >
            {isSaving ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProgramFormModalProps {
  jenisOptions: { value: string; label: string }[];
  mode: 'create' | 'edit';
  form: ProgramFormState;
  isSaving: boolean;
  onChange: (form: ProgramFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function ProgramFormModal({
  jenisOptions,
  mode,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: ProgramFormModalProps) {
  return (
    <ModalShell
      isSaving={isSaving}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={
        mode === 'create' ? 'Simpan & Terbitkan' : 'Simpan Perubahan'
      }
      subtitle="Program penghimpunan infaq/sedekah tematik"
      title={
        mode === 'create'
          ? 'Inisiasi Program Akad Infaq Baru'
          : 'Edit Akad Program Infaq'
      }
    >
      <div>
        <label
          className="mb-1 block font-semibold text-slate-700"
          htmlFor="program-nama"
        >
          Nama Program Infaq <span className="text-red-500">*</span>
        </label>
        <input
          className={inputClass}
          id="program-nama"
          onChange={(e) => onChange({ ...form, nama: e.target.value })}
          placeholder="Contoh: Sedekah Paket Nutrisi Balita Dhuafa"
          type="text"
          value={form.nama}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="program-jenis"
          >
            Kategori Akad <span className="text-red-500">*</span>
          </label>
          <SelectField
            className="w-full"
            id="program-jenis"
            onChange={(e) =>
              onChange({ ...form, jenis: e.target.value as InfaqJenis })
            }
            value={form.jenis}
          >
            {jenisOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="program-status"
          >
            Status
          </label>
          <SelectField
            className="w-full"
            id="program-status"
            onChange={(e) =>
              onChange({ ...form, status: e.target.value as ProgramStatus })
            }
            value={form.status}
          >
            {Object.entries(PROGRAM_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <div>
        <label className="flex cursor-pointer items-center gap-2 text-slate-700">
          <input
            checked={form.noTarget}
            onChange={(e) =>
              onChange({
                ...form,
                noTarget: e.target.checked,
                target: e.target.checked ? '' : form.target,
              })
            }
            type="checkbox"
          />
          Tanpa target (program terbuka/berkelanjutan)
        </label>
      </div>
      {!form.noTarget && (
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="program-target"
          >
            Target Penghimpunan (Rp) <span className="text-red-500">*</span>
          </label>
          <RupiahInput
            className={`${inputClass} font-mono`}
            id="program-target"
            onChange={(digits) => onChange({ ...form, target: digits })}
            placeholder="Contoh: 100.000.000"
            value={form.target}
          />
        </div>
      )}
      <div>
        <label
          className="mb-1 block font-semibold text-slate-700"
          htmlFor="program-deskripsi"
        >
          Deskripsi &amp; Peruntukan Manfaat
        </label>
        <textarea
          className={inputClass}
          id="program-deskripsi"
          onChange={(e) => onChange({ ...form, deskripsi: e.target.value })}
          placeholder="Rincian penyaluran bantuan dan kelompok penerima manfaat..."
          rows={2}
          value={form.deskripsi}
        />
      </div>
    </ModalShell>
  );
}

interface DonationFormModalProps {
  jenisMaster: {
    activeOptions: MasterDataOption[];
    labels: Record<string, string>;
  };
  metodeOptions: { value: string; label: string }[];
  mode: 'create' | 'edit';
  form: DonationFormState;
  programs: InfaqProgramRow[];
  isSaving: boolean;
  /** Bukti yang sudah tersimpan pada donasi yang sedang diedit. */
  existingProof: boolean;
  proofFile: File | null;
  removeExistingProof: boolean;
  onChange: (form: DonationFormState) => void;
  onClose: () => void;
  onOpenExistingProof: () => void;
  onProofChange: (file: File | null) => void;
  onRemoveExistingProof: (remove: boolean) => void;
  onSubmit: () => void;
}

function DonationFormModal({
  jenisMaster,
  metodeOptions,
  mode,
  form,
  programs,
  isSaving,
  existingProof,
  proofFile,
  removeExistingProof,
  onChange,
  onClose,
  onOpenExistingProof,
  onProofChange,
  onRemoveExistingProof,
  onSubmit,
}: DonationFormModalProps) {
  const selectedJenis = form.programId
    ? (programs.find((p) => p.id === form.programId)?.jenis ?? form.jenis)
    : form.jenis;
  const jenisOptions = withCurrentOption(
    jenisMaster.activeOptions,
    jenisMaster.labels,
    selectedJenis,
    (o) => o.kode ?? ''
  );
  return (
    <ModalShell
      guardValue={{ form, proof: proofFile?.name ?? null, removeExistingProof }}
      isSaving={isSaving}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={mode === 'create' ? 'Catat Transaksi' : 'Simpan Perubahan'}
      subtitle="Donasi tunai langsung atau transfer yang dikonfirmasi kasir"
      title={
        mode === 'create'
          ? 'Pencatatan Donasi Infaq / Sedekah'
          : 'Edit Donasi Manual'
      }
    >
      <div>
        <label
          className="mb-1 block font-semibold text-slate-700"
          htmlFor="donasi-nama"
        >
          Nama Donatur / Pembayar <span className="text-red-500">*</span>
        </label>
        <input
          className={inputClass}
          id="donasi-nama"
          onChange={(e) => onChange({ ...form, namaPenginfaq: e.target.value })}
          placeholder="Contoh: Hamba Allah / H. Fajarudin"
          type="text"
          value={form.namaPenginfaq}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="donasi-nominal"
          >
            Nominal Donasi (Rp) <span className="text-red-500">*</span>
          </label>
          <RupiahInput
            className={`${inputClass} font-mono`}
            id="donasi-nominal"
            onChange={(digits) => onChange({ ...form, nominal: digits })}
            placeholder="Contoh: 100.000"
            value={form.nominal}
          />
        </div>
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="donasi-telepon"
          >
            No. HP (opsional)
          </label>
          <input
            className={`${inputClass} font-mono`}
            id="donasi-telepon"
            onChange={(e) =>
              onChange({ ...form, teleponPenginfaq: e.target.value })
            }
            placeholder="0812xxxxxxxx"
            type="text"
            value={form.teleponPenginfaq}
          />
        </div>
      </div>
      <div>
        <label
          className="mb-1 block font-semibold text-slate-700"
          htmlFor="donasi-metode"
        >
          Metode Penerimaan <span className="text-red-500">*</span>
        </label>
        <SelectField
          className="w-full"
          id="donasi-metode"
          onChange={(e) => onChange({ ...form, metode: e.target.value })}
          value={form.metode}
        >
          {metodeOptions.length === 0 && (
            <option value="">— Belum ada metode di Master Data —</option>
          )}
          {metodeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="donasi-program"
          >
            Alokasi Program
          </label>
          <SelectField
            className="w-full"
            id="donasi-program"
            onChange={(e) => onChange({ ...form, programId: e.target.value })}
            value={form.programId}
          >
            <option value="">— Tanpa program (dana umum) —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
                {p.status === 'AKTIF'
                  ? ''
                  : ` (${PROGRAM_STATUS_LABELS[p.status] ?? p.status})`}
              </option>
            ))}
          </SelectField>
        </div>
        <div>
          <label
            className="mb-1 block font-semibold text-slate-700"
            htmlFor="donasi-jenis"
          >
            Jenis Infaq
          </label>
          <SelectField
            className="w-full"
            disabled={Boolean(form.programId)}
            id="donasi-jenis"
            onChange={(e) =>
              onChange({ ...form, jenis: e.target.value as InfaqJenis })
            }
            title={
              form.programId ? 'Jenis mengikuti kategori program' : undefined
            }
            value={selectedJenis}
          >
            {jenisOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <div>
        <label
          className="mb-1 block font-semibold text-slate-700"
          htmlFor="donasi-doa"
        >
          Doa / Catatan
        </label>
        <input
          className={inputClass}
          id="donasi-doa"
          onChange={(e) => onChange({ ...form, doa: e.target.value })}
          type="text"
          value={form.doa}
        />
      </div>
      <ProofField
        existingProof={existingProof}
        file={proofFile}
        onChange={onProofChange}
        onOpenExisting={onOpenExistingProof}
        onRemoveExisting={onRemoveExistingProof}
        removeExisting={removeExistingProof}
      />
    </ModalShell>
  );
}

const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Bidang bukti transaksi (struk/foto/PDF) pada modal donasi manual; opsional. */
function ProofField({
  existingProof,
  file,
  onChange,
  onOpenExisting,
  onRemoveExisting,
  removeExisting,
}: {
  existingProof: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
  onOpenExisting: () => void;
  onRemoveExisting: (remove: boolean) => void;
  removeExisting: boolean;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) {
      return;
    }
    const problem = validateReceiptFile(picked);
    if (problem) {
      showToast({ ...problem, type: 'error' });
      return;
    }
    onChange(picked);
    onRemoveExisting(false);
  };

  const showExisting = existingProof && !removeExisting && !file;
  return (
    <div>
      <span className="mb-1 block font-semibold text-slate-700">
        Bukti Transaksi / Struk{' '}
        <span className="font-normal text-slate-400">(opsional)</span>
      </span>
      <input
        accept={PROOF_ACCEPT}
        className="hidden"
        onChange={pick}
        ref={inputRef}
        type="file"
      />
      {file && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
          {previewUrl ? (
            // biome-ignore lint/performance/noImgElement: pratinjau object URL lokal
            <img
              alt="Pratinjau bukti transaksi"
              className="size-16 shrink-0 rounded-lg border border-slate-200 object-cover"
              src={previewUrl}
            />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600">
              <FileText className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-800 text-sm">
              {file.name}
            </p>
            <p className="font-mono text-slate-500 text-xs">
              {formatFileSize(file.size)}
            </p>
          </div>
          <button
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-50"
            onClick={() => onChange(null)}
            type="button"
          >
            Batalkan
          </button>
        </div>
      )}
      {showExisting && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-sm">
          <Paperclip className="h-4 w-4 shrink-0 text-emerald-800" />
          <span className="min-w-0 flex-1 text-emerald-900">
            Lampiran sudah tersimpan
          </span>
          <button
            className="cursor-pointer rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-800 text-xs hover:bg-emerald-50"
            onClick={onOpenExisting}
            type="button"
          >
            Lihat
          </button>
          <button
            className="cursor-pointer rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-semibold text-rose-700 text-xs hover:bg-rose-50"
            onClick={() => onRemoveExisting(true)}
            type="button"
          >
            Hapus
          </button>
        </div>
      )}
      {existingProof && removeExisting && !file && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-900 text-xs">
          Lampiran akan dihapus saat disimpan.{' '}
          <button
            className="cursor-pointer font-semibold underline"
            onClick={() => onRemoveExisting(false)}
            type="button"
          >
            Batalkan
          </button>
        </p>
      )}
      {!file && (
        <button
          className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 font-semibold text-emerald-800 text-sm hover:bg-emerald-50"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload className="h-4 w-4" />
          {showExisting ? 'Ganti Berkas' : 'Pilih Foto / PDF Bukti'}
        </button>
      )}
      <p className="mt-1 text-slate-500 text-xs">
        JPG, PNG, WebP, atau PDF, maksimal 5 MB. Disimpan privat; hanya admin
        yang dapat membukanya.
      </p>
    </div>
  );
}

interface ConfirmDeleteModalProps {
  title: string;
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDeleteModal({
  title,
  description,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
            <p className="text-slate-500 text-xs">
              Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-slate-700 text-xs leading-relaxed">
          {description}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
            onClick={onCancel}
            type="button"
          >
            Batal
          </button>
          <button
            className="cursor-pointer rounded-lg bg-rose-600 px-4 py-1.5 font-bold text-white text-xs shadow-xs hover:bg-rose-700"
            onClick={onConfirm}
            type="button"
          >
            Ya, Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
