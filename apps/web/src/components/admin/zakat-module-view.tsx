'use client';

import {
  GOLD_NISAB_GRAM,
  ZAKAT_RATE_DENOMINATOR,
  ZAKAT_RATE_NUMERATOR,
} from '@amwal/core/zakat/calculator';
import {
  AlertTriangle,
  Award,
  Coins,
  HandCoins,
  HandHeart,
  LoaderCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  useMasterData,
  withCurrentOption,
} from '@/components/admin/use-master-data';
import { ZakatDistributionPanel } from '@/components/admin/zakat-distribution-panel';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { orpc } from '@/lib/orpc/client';
import type { ZakatTransaction } from '@/types/ziswaf';

/** Kode jenis zakat → label, dari Master Data (lihat `useMasterData`). */
type JenisLabels = Record<string, string>;

const ZAKAT_PAYMENT_LABELS: Record<string, string> = {
  TUNAI: 'Tunai',
  TRANSFER: 'Transfer Bank',
  BERAS: 'Beras',
};

const ZAKAT_STATUS_LABELS: Record<string, string> = {
  TERVERIFIKASI: 'Terverifikasi',
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  DITOLAK: 'Ditolak',
};

const ZAKAT_STATUS_BADGE: Record<string, string> = {
  TERVERIFIKASI: 'bg-emerald-100 text-emerald-800',
  MENUNGGU_VERIFIKASI: 'bg-amber-100 text-amber-800',
  DITOLAK: 'bg-rose-100 text-rose-800',
};

/** Konstanta fiqih yang sama dengan kalkulator zakat di `@amwal/core`. */
const NISAB_GRAM = Number(GOLD_NISAB_GRAM);
const ZAKAT_MAAL_PERCENT =
  (Number(ZAKAT_RATE_NUMERATOR) / Number(ZAKAT_RATE_DENOMINATOR)) * 100;

const GOLD_SOURCE_LABELS: Record<string, string> = {
  LIVE_API: 'Sinkron harga pasar',
  MANUAL_FALLBACK: 'Diset manual admin',
};

type ZakatType =
  | 'FITRAH'
  | 'MAAL_PENGHASILAN'
  | 'FIDYAH'
  | 'KAFARAT'
  | 'EMAS'
  | 'PERUSAHAAN'
  | 'PERTANIAN';
type ZakatMethod = 'TUNAI' | 'TRANSFER' | 'BERAS';
type ZakatStatus = 'MENUNGGU_VERIFIKASI' | 'TERVERIFIKASI' | 'DITOLAK';

interface RealZakatOrderRow {
  id: string;
  nomorKwitansi: string;
  namaMuzakki: string;
  noTelepon: string | null;
  alamat: string | null;
  isAnonymous: boolean;
  jenisZakat: ZakatType;
  metodePembayaran: ZakatMethod;
  nominal: string | null;
  beratBerasKg: string | null;
  jumlahJiwa: number | null;
  status: ZakatStatus;
  notes: string | null;
  transactionId: string | null;
  createdAt: string;
}

interface FitrahConfigRow {
  id: string;
  jenisBeras: string;
  konversiHargaPerJiwa: string;
  referensiSk: string | null;
  tahunBerlaku: string | null;
  isActive: boolean;
  updatedAt: string;
}

interface GoldPriceRow {
  pricePerGram: string;
  source: string;
  fetchedAt: string;
}

interface ZakatFormState {
  namaMuzakki: string;
  noTelepon: string;
  alamat: string;
  isAnonymous: boolean;
  jenisZakat: ZakatType;
  metodePembayaran: ZakatMethod;
  nominal: string;
  beratBerasKg: string;
  jumlahJiwa: string;
  status: ZakatStatus;
  notes: string;
}

const EMPTY_ZAKAT_FORM: ZakatFormState = {
  namaMuzakki: '',
  noTelepon: '',
  alamat: '',
  isAnonymous: false,
  jenisZakat: 'MAAL_PENGHASILAN',
  metodePembayaran: 'TUNAI',
  nominal: '',
  beratBerasKg: '',
  jumlahJiwa: '',
  status: 'TERVERIFIKASI',
  notes: '',
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

function buildCalculationText(
  row: RealZakatOrderRow,
  labels: JenisLabels
): string {
  const paymentLabel =
    ZAKAT_PAYMENT_LABELS[row.metodePembayaran] ?? row.metodePembayaran;
  if (row.jenisZakat === 'FITRAH') {
    const jiwa = row.jumlahJiwa ?? 1;
    if (row.metodePembayaran === 'BERAS' && row.beratBerasKg) {
      return `${jiwa} Jiwa x ${row.beratBerasKg} kg Beras`;
    }
    return `${jiwa} Jiwa x ${labels.FITRAH ?? 'FITRAH'} (${paymentLabel})`;
  }
  const base = `${labels[row.jenisZakat] ?? row.jenisZakat} via ${paymentLabel}`;
  return row.notes ? `${base} — ${row.notes}` : base;
}

function mapOrderToTransaction(
  row: RealZakatOrderRow,
  labels: JenisLabels
): ZakatTransaction {
  return {
    id: row.id,
    muzakkiName: row.isAnonymous ? 'Hamba Allah' : row.namaMuzakki,
    phone: row.noTelepon ?? '—',
    type: labels[row.jenisZakat] ?? row.jenisZakat,
    calculation: buildCalculationText(row, labels),
    amount: Number(row.nominal ?? 0),
    souls: row.jumlahJiwa ?? 1,
    date: formatDateTime(row.createdAt),
    status: ZAKAT_STATUS_LABELS[row.status] ?? row.status,
    bszNumber: row.nomorKwitansi,
  };
}

function formFromOrder(row: RealZakatOrderRow): ZakatFormState {
  return {
    namaMuzakki: row.namaMuzakki,
    noTelepon: row.noTelepon ?? '',
    alamat: row.alamat ?? '',
    isAnonymous: row.isAnonymous,
    jenisZakat: row.jenisZakat,
    metodePembayaran: row.metodePembayaran,
    nominal: row.nominal ? String(Number(row.nominal)) : '',
    beratBerasKg: row.beratBerasKg ? String(Number(row.beratBerasKg)) : '',
    jumlahJiwa: row.jumlahJiwa ? String(row.jumlahJiwa) : '',
    status: row.status,
    notes: row.notes ?? '',
  };
}

const optionalNumber = (value: string) =>
  value.trim() === '' ? undefined : Number(value);

export function ZakatModuleView() {
  const { showToast } = useToast();
  const jenisZakat = useMasterData('JENIS_ZAKAT');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'distribution' | 'parameters'
  >('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');

  const [realOrders, setRealOrders] = useState<RealZakatOrderRow[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  // Mustahik unik yang benar-benar menerima penyaluran zakat (bukan sekadar terdaftar).
  const [mustahikCount, setMustahikCount] = useState<number | null>(null);

  // Parameter nisab & fitrah (dibaca dari DB, dipakai kalkulator publik)
  const [goldPrice, setGoldPrice] = useState<GoldPriceRow | null>(null);
  const [goldPriceInput, setGoldPriceInput] = useState('');
  const [isSyncingGold, setIsSyncingGold] = useState(false);
  const [isSavingGold, setIsSavingGold] = useState(false);
  const [fitrahConfigs, setFitrahConfigs] = useState<FitrahConfigRow[]>([]);
  const [fitrahForm, setFitrahForm] = useState({
    jenisBeras: '',
    konversiHargaPerJiwa: '',
    referensiSk: '',
    tahunBerlaku: '',
  });
  const [isSavingFitrah, setIsSavingFitrah] = useState(false);

  // Modal States
  const [bszOrder, setBszOrder] = useState<RealZakatOrderRow | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingOrder, setEditingOrder] = useState<RealZakatOrderRow | null>(
    null
  );
  const [zakatForm, setZakatForm] = useState<ZakatFormState>(EMPTY_ZAKAT_FORM);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<RealZakatOrderRow | null>(
    null
  );

  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const res = await orpc.admin.zakat.ordersList({});
      setRealOrders(res.data as RealZakatOrderRow[]);
    } catch {
      showToast({
        title: 'Gagal memuat data zakat',
        description: 'Statistik & transaksi menampilkan data kosong.',
        type: 'error',
      });
    } finally {
      setIsLoadingOrders(false);
    }
  }, [showToast]);

  const applyGoldPrice = (row: GoldPriceRow | null) => {
    setGoldPrice(row);
    setGoldPriceInput(row ? String(Number(row.pricePerGram)) : '');
  };

  const loadParameters = useCallback(async () => {
    try {
      const [gold, fitrah] = await Promise.all([
        orpc.admin.zakat.goldPriceLatest(),
        orpc.admin.zakat.fitrahConfigList(),
      ]);
      applyGoldPrice(gold.data);
      setFitrahConfigs(fitrah.data);
      const active = fitrah.data.find((c) => c.isActive);
      if (active) {
        setFitrahForm({
          jenisBeras: active.jenisBeras,
          konversiHargaPerJiwa: String(Number(active.konversiHargaPerJiwa)),
          referensiSk: active.referensiSk ?? '',
          tahunBerlaku: active.tahunBerlaku ?? '',
        });
      }
    } catch {
      showToast({
        title: 'Gagal memuat parameter zakat',
        description: 'Harga emas & tarif fitrah belum dapat ditampilkan.',
        type: 'error',
      });
    }
  }, [showToast]);

  const loadMustahikCount = useCallback(() => {
    orpc.admin.zakat
      .distributionsList()
      .then((res) =>
        setMustahikCount(
          new Set(
            res.data
              .filter((d) => d.status === 'TERSALURKAN')
              .map((d) => d.mustahiqId)
          ).size
        )
      )
      .catch(() => setMustahikCount(0));
  }, []);

  useEffect(() => {
    loadOrders();
    loadParameters();
    loadMustahikCount();
    // biome-ignore lint/correctness/useExhaustiveDependencies: fetch-once on mount
  }, []);

  const ordersById = useMemo(
    () => new Map(realOrders.map((o) => [o.id, o])),
    [realOrders]
  );

  const verifiedOrders = useMemo(
    () => realOrders.filter((o) => o.status === 'TERVERIFIKASI'),
    [realOrders]
  );

  const totalFitrah = useMemo(
    () =>
      verifiedOrders
        .filter((o) => o.jenisZakat === 'FITRAH')
        .reduce((sum, o) => sum + Number(o.nominal ?? 0), 0),
    [verifiedOrders]
  );

  const totalMaal = useMemo(
    () =>
      verifiedOrders
        .filter((o) => o.jenisZakat !== 'FITRAH')
        .reduce((sum, o) => sum + Number(o.nominal ?? 0), 0),
    [verifiedOrders]
  );

  const totalZakatCollected = totalFitrah + totalMaal;

  const zakatTrendData = useMemo(() => {
    const buckets = new Map<string, { fitrah: number; maal: number }>();
    for (const o of verifiedOrders) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? { fitrah: 0, maal: 0 };
      const nominal = Number(o.nominal ?? 0);
      if (o.jenisZakat === 'FITRAH') {
        bucket.fitrah += nominal;
      } else {
        bucket.maal += nominal;
      }
      buckets.set(key, bucket);
    }
    const sortedKeys = [...buckets.keys()].sort();
    const recentKeys = sortedKeys.slice(-6);
    return recentKeys.map((key) => {
      const [year, month] = key.split('-');
      const label = new Date(
        Number(year),
        Number(month) - 1,
        1
      ).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      const bucket = buckets.get(key);
      return {
        month: label,
        fitrah: bucket?.fitrah ?? 0,
        maal: bucket?.maal ?? 0,
      };
    });
  }, [verifiedOrders]);

  const allTransactions = useMemo(
    () =>
      realOrders.map((row) => mapOrderToTransaction(row, jenisZakat.labels)),
    [realOrders, jenisZakat.labels]
  );

  const goldPricePerGram = Number(goldPriceInput) || 0;
  const nisabYearly = goldPricePerGram * NISAB_GRAM;
  const nisabMonthly = Math.round(nisabYearly / 12);

  const filteredTransactions = allTransactions.filter((tx) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      tx.muzakkiName.toLowerCase().includes(term) ||
      tx.bszNumber.toLowerCase().includes(term) ||
      tx.id.toLowerCase().includes(term);
    const matchType =
      selectedTypeFilter === 'all' ||
      ordersById.get(tx.id)?.jenisZakat === selectedTypeFilter;
    return matchSearch && matchType;
  });

  const openCreateForm = () => {
    setEditingOrder(null);
    const firstActive = jenisZakat.activeOptions[0]?.kode as
      | ZakatType
      | undefined;
    setZakatForm({
      ...EMPTY_ZAKAT_FORM,
      jenisZakat: firstActive ?? EMPTY_ZAKAT_FORM.jenisZakat,
    });
    setFormMode('create');
  };

  const openEditForm = (row: RealZakatOrderRow) => {
    setEditingOrder(row);
    setZakatForm(formFromOrder(row));
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingOrder(null);
  };

  const handleSubmitZakatForm = async () => {
    const isBeras = zakatForm.metodePembayaran === 'BERAS';
    const isGateway = Boolean(editingOrder?.transactionId);
    if (!(isGateway || zakatForm.isAnonymous || zakatForm.namaMuzakki.trim())) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Mohon isi nama muzakki.',
        type: 'error',
      });
      return;
    }
    if (
      !isGateway &&
      (isBeras ? !zakatForm.beratBerasKg : !zakatForm.nominal)
    ) {
      showToast({
        title: 'Form Belum Lengkap',
        description: isBeras
          ? 'Mohon isi berat beras (kg).'
          : 'Mohon isi nominal zakat.',
        type: 'error',
      });
      return;
    }

    const fields = {
      namaMuzakki: zakatForm.isAnonymous
        ? 'Hamba Allah'
        : zakatForm.namaMuzakki.trim(),
      noTelepon: zakatForm.noTelepon.trim(),
      alamat: zakatForm.alamat.trim(),
      isAnonymous: zakatForm.isAnonymous,
      jenisZakat: zakatForm.jenisZakat,
      metodePembayaran: zakatForm.metodePembayaran,
      nominal: isBeras ? undefined : optionalNumber(zakatForm.nominal),
      beratBerasKg: isBeras
        ? optionalNumber(zakatForm.beratBerasKg)
        : undefined,
      jumlahJiwa: optionalNumber(zakatForm.jumlahJiwa),
      notes: zakatForm.notes.trim(),
    };

    setIsSavingOrder(true);
    try {
      if (formMode === 'edit' && editingOrder) {
        await orpc.admin.zakat.updateOrder(
          isGateway
            ? {
                id: editingOrder.id,
                status: zakatForm.status,
                notes: fields.notes,
              }
            : { id: editingOrder.id, ...fields, status: zakatForm.status }
        );
        showToast({
          title: 'Transaksi Zakat Diperbarui',
          description: `${editingOrder.nomorKwitansi} berhasil disimpan.`,
          type: 'success',
        });
      } else {
        const res = await orpc.admin.zakat.createOrder(fields);
        showToast({
          title: 'Zakat Berhasil Dicatat',
          description: `BSZ ${res.data?.nomorKwitansi ?? ''} telah diterbitkan untuk ${fields.namaMuzakki}.`,
          type: 'success',
        });
      }
      closeForm();
      await loadOrders();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan transaksi zakat',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingOrder) {
      return;
    }
    try {
      await orpc.admin.zakat.deleteOrder({ id: deletingOrder.id });
      showToast({
        title: 'Transaksi Zakat Dihapus',
        description: `${deletingOrder.nomorKwitansi} telah dihapus.`,
        type: 'success',
      });
      setDeletingOrder(null);
      await loadOrders();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menghapus transaksi',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  const handleSyncGoldPrice = async () => {
    setIsSyncingGold(true);
    try {
      const res = await orpc.admin.zakat.syncGoldPrice();
      applyGoldPrice(res.data ?? null);
      const price = Number(res.data?.pricePerGram ?? 0);
      showToast({
        title: 'Harga Emas Tersinkronisasi',
        description: `Harga acuan emas diperbarui ke Rp ${price.toLocaleString('id-ID')}/gram. Nisab tahunan: Rp ${(price * NISAB_GRAM).toLocaleString('id-ID')}.`,
        type: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Sinkron harga emas gagal',
        description: errorMessage(err, 'Layanan harga emas tidak tersedia.'),
        type: 'error',
      });
    } finally {
      setIsSyncingGold(false);
    }
  };

  const handleSaveGoldPrice = async () => {
    if (goldPricePerGram <= 0) {
      showToast({
        title: 'Harga emas tidak valid',
        description: 'Masukkan harga emas per gram lebih dari 0.',
        type: 'error',
      });
      return;
    }
    setIsSavingGold(true);
    try {
      const res = await orpc.admin.zakat.setGoldPrice({
        pricePerGram: goldPricePerGram,
      });
      applyGoldPrice(res.data ?? null);
      showToast({
        title: 'Acuan Nisab Emas Diperbarui',
        description: `Harga acuan Rp ${goldPricePerGram.toLocaleString('id-ID')}/g. Nisab tahunan: Rp ${nisabYearly.toLocaleString('id-ID')}.`,
        type: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan harga emas',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSavingGold(false);
    }
  };

  const handleSaveFitrah = async () => {
    const konversi = Number(fitrahForm.konversiHargaPerJiwa);
    if (fitrahForm.jenisBeras.trim().length < 2 || !(konversi > 0)) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Isi jenis beras dan konversi harga per jiwa (> 0).',
        type: 'error',
      });
      return;
    }
    setIsSavingFitrah(true);
    try {
      await orpc.admin.zakat.saveFitrahConfig({
        jenisBeras: fitrahForm.jenisBeras.trim(),
        konversiHargaPerJiwa: konversi,
        referensiSk: fitrahForm.referensiSk.trim(),
        tahunBerlaku: fitrahForm.tahunBerlaku.trim(),
      });
      showToast({
        title: 'Tarif Zakat Fitrah Tersimpan',
        description: `${fitrahForm.jenisBeras.trim()}: Rp ${konversi.toLocaleString('id-ID')}/jiwa aktif untuk kalkulator.`,
        type: 'success',
      });
      await loadParameters();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan tarif fitrah',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSavingFitrah(false);
    }
  };

  const activeFitrahConfigs = fitrahConfigs.filter((c) => c.isActive);

  return (
    <div className="space-y-6 font-jakarta pb-12">
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            onClick={openCreateForm}
            type="button"
          >
            <Award className="w-3.5 h-3.5" />
            Catat Zakat &amp; Terbitkan BSZ
          </button>
        }
        compact
        description="Pencatatan zakat dan penerbitan Bukti Setor Zakat (BSZ), serta parameter nisab dan fitrah."
        icon={<HandHeart aria-hidden="true" />}
        title="Zakat &amp; 8 Asnaf"
      />

      <AdminTabs
        label="Bagian modul zakat"
        onChange={setActiveTab}
        tabs={[
          {
            id: 'overview',
            label: 'Ringkasan & Transaksi Muzakki',
            icon: <TrendingUp className="h-4 w-4" />,
            count: allTransactions.length,
          },
          {
            id: 'distribution',
            label: 'Penyaluran 8 Asnaf',
            icon: <HandCoins className="h-4 w-4" />,
          },
          {
            id: 'parameters',
            label: 'Parameter Nisab & Fitrah',
            icon: <Scale className="h-4 w-4" />,
          },
        ]}
        value={activeTab}
      />

      <details className="group rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-emerald-900 text-sm leading-relaxed">
        <summary className="cursor-pointer select-none font-semibold">
          <strong>Menu ini untuk pencatatan, bukan campaign.</strong>{' '}
          <span className="font-normal text-emerald-800">
            (klik untuk selengkapnya)
          </span>
        </summary>
        <p className="mt-2">
          Zakat dikelola sebagai kas amil terpusat untuk 8 asnaf: di sini Anda
          mencatat setoran muzakki (<em>Catat Zakat &amp; Terbitkan BSZ</em>),
          memantau transaksi, mencatat penyaluran ke 8 asnaf (tab{' '}
          <em>Penyaluran 8 Asnaf</em>), dan mengatur parameter nisab &amp;
          fitrah. Tidak ada program/campaign zakat yang dibuka seperti pada
          Wakaf.
        </p>
      </details>

      {/* 1. OVERVIEW ZAKAT */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  Penghimpunan Zakat
                </span>
                <span className="p-2 rounded-xl bg-emerald-50 text-[#1B5E20]">
                  <Coins className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                {isLoadingOrders
                  ? 'Memuat…'
                  : `Rp ${totalZakatCollected.toLocaleString('id-ID')}`}
              </div>
              <div className="mt-2 text-xs text-slate-500 font-semibold">
                Fitrah:{' '}
                <strong className="text-teal-700 font-mono">
                  Rp {totalFitrah.toLocaleString('id-ID')}
                </strong>{' '}
                • Maal:{' '}
                <strong className="text-emerald-800 font-mono">
                  Rp {totalMaal.toLocaleString('id-ID')}
                </strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  Total Mustahik Terlayani
                </span>
                <span className="p-2 rounded-xl bg-purple-50 text-purple-800">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                {mustahikCount === null
                  ? 'Memuat…'
                  : `${mustahikCount.toLocaleString('id-ID')} Mustahik`}
              </div>
              <div className="mt-2 text-xs text-purple-800 font-semibold">
                Penerima unik dari penyaluran zakat yang tersalurkan
              </div>
            </div>
          </div>

          {/* Transaksi Muzakki & BSZ (digabung dengan ringkasan) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-56">
                <h3 className="text-sm font-bold text-slate-900">
                  Daftar Transaksi Zakat &amp; Bukti Setor Zakat (BSZ)
                </h3>
                <p className="text-xs text-slate-500">
                  Standar Sah Pengurang Pajak Penghasilan (PPh) Sesuai UU No.
                  23/2011
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]"
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari nama muzakki, nomor BSZ, atau ID transaksi..."
                  type="text"
                  value={searchTerm}
                />
              </div>
              <SelectField
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                value={selectedTypeFilter}
              >
                <option value="all">Semua Kategori Zakat</option>
                {jenisZakat.rows.map((row) => (
                  <option key={row.id} value={row.kode ?? ''}>
                    {row.label}
                  </option>
                ))}
              </SelectField>
              <button
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                disabled={isLoadingOrders}
                onClick={loadOrders}
                type="button"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`}
                />
                Muat Ulang
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">No. BSZ &amp; ID</th>
                    <th className="py-3 px-4">Nama Muzakki</th>
                    <th className="py-3 px-4">Kategori Zakat</th>
                    <th className="py-3 px-4">Rincian Perhitungan</th>
                    <th className="py-3 px-4">Nominal Zakat</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoadingOrders && realOrders.length === 0 ? (
                    <tr>
                      <td
                        className="py-8 px-4 text-center text-slate-400"
                        colSpan={7}
                      >
                        Memuat transaksi…
                      </td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td
                        className="py-8 px-4 text-center text-slate-400"
                        colSpan={7}
                      >
                        Belum ada transaksi.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const row = ordersById.get(tx.id);
                      return (
                        <tr className="hover:bg-slate-50/70" key={tx.id}>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 font-mono text-xs">
                              {tx.bszNumber}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              {tx.id} • {tx.date}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {tx.muzakkiName}
                            <div className="text-xs font-normal text-slate-400">
                              {row?.transactionId
                                ? 'Pembayaran online'
                                : 'Entri manual'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs text-xs">
                            {tx.calculation}
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-900 font-mono">
                            {row?.metodePembayaran === 'BERAS' && !row.nominal
                              ? `${row.beratBerasKg} kg`
                              : `Rp ${tx.amount.toLocaleString('id-ID')}`}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold ${ZAKAT_STATUS_BADGE[row?.status ?? ''] ?? 'bg-slate-100 text-slate-700'}`}
                            >
                              {tx.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                className="px-2.5 py-1 min-h-[38px] bg-emerald-50 hover:bg-emerald-100 text-[#1B5E20] border border-emerald-300 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition shadow-2xs"
                                onClick={() => setBszOrder(row ?? null)}
                                type="button"
                              >
                                <Award className="w-3 h-3 text-emerald-700" />
                                BSZ
                              </button>
                              {row && (
                                <button
                                  className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer transition"
                                  onClick={() => openEditForm(row)}
                                  title="Edit transaksi"
                                  type="button"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {row && !row.transactionId && (
                                <button
                                  className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer transition"
                                  onClick={() => setDeletingOrder(row)}
                                  title="Hapus transaksi"
                                  type="button"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Zakat Trend Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Grafik Tren Pembayaran Zakat (Fitrah vs Maal)
                </h3>
                <p className="text-xs text-slate-500">
                  Total zakat terverifikasi per bulan, 6 bulan data terbaru
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <span className="w-3 h-3 rounded-full bg-[#1B5E20]" />
                  Zakat Maal
                </span>
                <span className="flex items-center gap-1.5 text-teal-800">
                  <span className="w-3 h-3 rounded-full bg-teal-400" />
                  Zakat Fitrah
                </span>
              </div>
            </div>

            <div className="h-52 w-full">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart
                  data={zakatTrendData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `Rp${(v / 1000000).toFixed(0)}Jt`}
                  />
                  <Tooltip
                    formatter={(value: any) =>
                      `Rp ${Number(value).toLocaleString('id-ID')}`
                    }
                  />
                  <Area
                    dataKey="maal"
                    fill="#1B5E20"
                    fillOpacity={0.2}
                    name="Zakat Maal"
                    stroke="#1B5E20"
                    type="monotone"
                  />
                  <Area
                    dataKey="fitrah"
                    fill="#00897B"
                    fillOpacity={0.25}
                    name="Zakat Fitrah"
                    stroke="#00897B"
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 2b. PENYALURAN 8 ASNAF */}
      {activeTab === 'distribution' && (
        <ZakatDistributionPanel onChanged={loadMustahikCount} />
      )}

      {/* 3. PARAMETER & NISAB BAZNAS */}
      {activeTab === 'parameters' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fitrah */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#1B5E20]" />
                Pengaturan Zakat Fitrah (Tahun Berjalan)
              </h3>
              {activeFitrahConfigs[0]?.referensiSk && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {activeFitrahConfigs[0].referensiSk}
                </span>
              )}
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block font-semibold text-slate-700 mb-1"
                    htmlFor="fitrah-jenis-beras"
                  >
                    Jenis Beras *
                  </label>
                  <input
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                    id="fitrah-jenis-beras"
                    onChange={(e) =>
                      setFitrahForm({
                        ...fitrahForm,
                        jenisBeras: e.target.value,
                      })
                    }
                    placeholder="Contoh: Beras Premium"
                    type="text"
                    value={fitrahForm.jenisBeras}
                  />
                </div>
                <div>
                  <label
                    className="block font-semibold text-slate-700 mb-1"
                    htmlFor="fitrah-konversi"
                  >
                    Konversi Nilai Uang per Jiwa (Rp) *
                  </label>
                  <RupiahInput
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-emerald-950 font-mono"
                    id="fitrah-konversi"
                    onChange={(digits) =>
                      setFitrahForm({
                        ...fitrahForm,
                        konversiHargaPerJiwa: digits,
                      })
                    }
                    placeholder="45.000"
                    value={fitrahForm.konversiHargaPerJiwa}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block font-semibold text-slate-700 mb-1"
                    htmlFor="fitrah-sk"
                  >
                    Referensi SK
                  </label>
                  <input
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                    id="fitrah-sk"
                    onChange={(e) =>
                      setFitrahForm({
                        ...fitrahForm,
                        referensiSk: e.target.value,
                      })
                    }
                    placeholder="SK BAZNAS No. ..."
                    type="text"
                    value={fitrahForm.referensiSk}
                  />
                </div>
                <div>
                  <label
                    className="block font-semibold text-slate-700 mb-1"
                    htmlFor="fitrah-tahun"
                  >
                    Tahun Berlaku
                  </label>
                  <input
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                    id="fitrah-tahun"
                    onChange={(e) =>
                      setFitrahForm({
                        ...fitrahForm,
                        tahunBerlaku: e.target.value,
                      })
                    }
                    placeholder="1447 H"
                    type="text"
                    value={fitrahForm.tahunBerlaku}
                  />
                </div>
              </div>
              <span className="block text-xs text-slate-400">
                Menyimpan jenis beras yang sama akan menonaktifkan tarif lamanya
                (tetap tersimpan sebagai histori).
              </span>
              {activeFitrahConfigs.length > 0 && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {activeFitrahConfigs.map((c) => (
                    <div
                      className="flex items-center justify-between px-3 py-2 text-xs"
                      key={c.id}
                    >
                      <span className="font-semibold text-slate-700">
                        {c.jenisBeras}
                        {c.tahunBerlaku ? ` • ${c.tahunBerlaku}` : ''}
                      </span>
                      <span className="font-mono font-bold text-emerald-900">
                        Rp{' '}
                        {Number(c.konversiHargaPerJiwa).toLocaleString('id-ID')}
                        /jiwa
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs hover:bg-[#144716] disabled:opacity-50"
              disabled={isSavingFitrah}
              onClick={handleSaveFitrah}
              type="button"
            >
              {isSavingFitrah ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                'Simpan Tarif Zakat Fitrah'
              )}
            </button>
          </div>

          {/* Maal */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between border-slate-100 border-b pb-3">
              <h3 className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                <Coins className="h-4 w-4 text-[#1B5E20]" />
                Pengaturan Zakat Maal (Nisab &amp; Acuan Emas)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-bold text-xs text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                  disabled={isSyncingGold}
                  onClick={handleSyncGoldPrice}
                  title="Tarik harga emas terbaru dari pasar"
                  type="button"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isSyncingGold ? 'animate-spin text-amber-700' : ''}`}
                  />
                  {isSyncingGold ? 'Menyinkronkan...' : 'Sinkron Harga Emas'}
                </button>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-xs text-amber-900">
                  {NISAB_GRAM} Gram Emas
                </span>
              </div>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    className="font-semibold text-slate-700"
                    htmlFor="gold-price"
                  >
                    Harga Acuan Emas Murni (per gram)
                  </label>
                  <span className="font-mono text-xs text-slate-400">
                    {goldPrice
                      ? `${formatDateTime(goldPrice.fetchedAt)} • ${GOLD_SOURCE_LABELS[goldPrice.source] ?? goldPrice.source}`
                      : 'Belum ada data harga'}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute top-2 left-3 font-bold font-mono text-slate-400 text-xs">
                    Rp
                  </span>
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pr-3 pl-9 font-bold font-mono text-emerald-950 focus:border-[#1B5E20] focus:bg-white"
                    id="gold-price"
                    onChange={(e) => setGoldPriceInput(e.target.value)}
                    type="number"
                    value={goldPriceInput}
                  />
                </div>
              </div>
              <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-mono text-xs">
                <div className="flex justify-between text-emerald-950">
                  <span>Nisab Tahunan ({NISAB_GRAM}g Emas):</span>
                  <strong>Rp {nisabYearly.toLocaleString('id-ID')}</strong>
                </div>
                <div className="flex justify-between text-emerald-950">
                  <span>Nisab Bulanan (Profesi):</span>
                  <strong>
                    Rp {nisabMonthly.toLocaleString('id-ID')} / bulan
                  </strong>
                </div>
                <div className="flex justify-between text-emerald-950">
                  <span>Tarif Kewajiban Zakat:</span>
                  <strong>{ZAKAT_MAAL_PERCENT}%</strong>
                </div>
              </div>
              <span className="block text-xs text-slate-400">
                Harga yang disimpan manual dipakai kalkulator zakat publik
                sampai admin menekan &quot;Sinkron Harga Emas&quot; lagi.
              </span>
            </div>
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs hover:bg-[#144716] disabled:opacity-50"
              disabled={isSavingGold}
              onClick={handleSaveGoldPrice}
              type="button"
            >
              {isSavingGold ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                'Simpan Acuan Nisab Emas'
              )}
            </button>
          </div>
        </div>
      )}

      {formMode && (
        <ZakatOrderFormModal
          form={zakatForm}
          isGateway={Boolean(editingOrder?.transactionId)}
          isSaving={isSavingOrder}
          jenisOptions={withCurrentOption(
            jenisZakat.activeOptions,
            jenisZakat.labels,
            formMode === 'edit' ? zakatForm.jenisZakat : '',
            (o) => o.kode ?? ''
          )}
          mode={formMode}
          onChange={setZakatForm}
          onClose={closeForm}
          onSubmit={handleSubmitZakatForm}
        />
      )}

      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Hapus Transaksi Zakat?
                </h3>
                <p className="text-slate-500 text-xs">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-slate-700 text-xs leading-relaxed">
              Transaksi <strong>{deletingOrder.nomorKwitansi}</strong> atas nama{' '}
              <strong>{deletingOrder.namaMuzakki}</strong> akan dihapus permanen
              beserta BSZ-nya.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
                onClick={() => setDeletingOrder(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="cursor-pointer rounded-lg bg-rose-600 px-4 py-1.5 font-bold text-white text-xs shadow-xs hover:bg-rose-700"
                onClick={handleConfirmDelete}
                type="button"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {bszOrder && (
        <BszModal
          labels={jenisZakat.labels}
          onClose={() => setBszOrder(null)}
          order={bszOrder}
        />
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 transition focus:border-[#1B5E20] focus:bg-white focus:ring-1 focus:ring-[#1B5E20] disabled:cursor-not-allowed disabled:opacity-60';

interface ZakatOrderFormModalProps {
  /** Jenis aktif dari Master Data (+ jenis lama bila sudah nonaktif). */
  jenisOptions: { value: string; label: string }[];
  mode: 'create' | 'edit';
  form: ZakatFormState;
  /** Order payment gateway: hanya status & catatan yang boleh diubah. */
  isGateway: boolean;
  isSaving: boolean;
  onChange: (form: ZakatFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function ZakatOrderFormModal({
  jenisOptions,
  mode,
  form,
  isGateway,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: ZakatOrderFormModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const set = <K extends keyof ZakatFormState>(
    key: K,
    value: ZakatFormState[K]
  ) => onChange({ ...form, [key]: value });
  const isBeras = form.metodePembayaran === 'BERAS';

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-slate-100 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 font-bold text-emerald-800">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {mode === 'create'
                  ? 'Pencatatan Setoran Zakat & BSZ'
                  : 'Edit Transaksi Zakat'}
              </h3>
              <p className="text-slate-500 text-xs">
                {isGateway
                  ? 'Pembayaran online: hanya status & catatan yang dapat diubah'
                  : 'Penerbitan Bukti Setor Zakat (BSZ)'}
              </p>
            </div>
          </div>
          <button
            className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700"
                htmlFor="zakat-nama"
              >
                Nama Muzakki <span className="text-red-500">*</span>
              </label>
              <input
                className={inputClass}
                disabled={isGateway || form.isAnonymous}
                id="zakat-nama"
                onChange={(e) => set('namaMuzakki', e.target.value)}
                placeholder="Contoh: H. Ahmad Subardjo"
                type="text"
                value={form.isAnonymous ? 'Hamba Allah' : form.namaMuzakki}
              />
              <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  checked={form.isAnonymous}
                  disabled={isGateway}
                  onChange={(e) => set('isAnonymous', e.target.checked)}
                  type="checkbox"
                />
                Sembunyikan nama (Hamba Allah)
              </label>
            </div>
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700"
                htmlFor="zakat-telepon"
              >
                No. HP / WhatsApp
              </label>
              <input
                className={`${inputClass} font-mono`}
                disabled={isGateway}
                id="zakat-telepon"
                onChange={(e) => set('noTelepon', e.target.value)}
                placeholder="0812xxxxxxxx"
                type="text"
                value={form.noTelepon}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700"
                htmlFor="zakat-jenis"
              >
                Jenis Zakat <span className="text-red-500">*</span>
              </label>
              <SelectField
                className="w-full"
                disabled={isGateway}
                id="zakat-jenis"
                onChange={(e) => set('jenisZakat', e.target.value as ZakatType)}
                value={form.jenisZakat}
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
                htmlFor="zakat-metode"
              >
                Metode Penerimaan <span className="text-red-500">*</span>
              </label>
              <SelectField
                className="w-full"
                disabled={isGateway}
                id="zakat-metode"
                onChange={(e) =>
                  set('metodePembayaran', e.target.value as ZakatMethod)
                }
                value={form.metodePembayaran}
              >
                {Object.entries(ZAKAT_PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700"
                htmlFor="zakat-jumlah"
              >
                {isBeras ? (
                  <>
                    Berat Beras (kg) <span className="text-red-500">*</span>
                  </>
                ) : (
                  <>
                    Nominal Zakat (Rp) <span className="text-red-500">*</span>
                  </>
                )}
              </label>
              <input
                className={`${inputClass} font-mono`}
                disabled={isGateway}
                id="zakat-jumlah"
                onChange={(e) =>
                  set(isBeras ? 'beratBerasKg' : 'nominal', e.target.value)
                }
                placeholder={isBeras ? '2.5' : '1500000'}
                step={isBeras ? '0.1' : '1'}
                type="number"
                value={isBeras ? form.beratBerasKg : form.nominal}
              />
            </div>
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700"
                htmlFor="zakat-jiwa"
              >
                Jumlah Jiwa {form.jenisZakat === 'FITRAH' ? '' : '(opsional)'}
              </label>
              <input
                className={`${inputClass} font-mono`}
                disabled={isGateway}
                id="zakat-jiwa"
                min="1"
                onChange={(e) => set('jumlahJiwa', e.target.value)}
                placeholder="1"
                type="number"
                value={form.jumlahJiwa}
              />
            </div>
          </div>

          {mode === 'edit' && (
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700"
                htmlFor="zakat-status"
              >
                Status Verifikasi
              </label>
              <SelectField
                className="w-full"
                id="zakat-status"
                onChange={(e) => set('status', e.target.value as ZakatStatus)}
                value={form.status}
              >
                {Object.entries(ZAKAT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </div>
          )}

          <div>
            <label
              className="mb-1 block font-semibold text-slate-700"
              htmlFor="zakat-catatan"
            >
              Keterangan / Dasar Hitung
            </label>
            <input
              className={inputClass}
              id="zakat-catatan"
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Gaji bruto x 2.5%, NPWP muzakki, dll."
              type="text"
              value={form.notes}
            />
          </div>
        </div>

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
            ) : mode === 'create' ? (
              'Simpan & Terbitkan BSZ'
            ) : (
              'Simpan Perubahan'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function bszRows(
  order: RealZakatOrderRow,
  labels: JenisLabels
): [string, string][] {
  const amount =
    order.metodePembayaran === 'BERAS' && !order.nominal
      ? `${Number(order.beratBerasKg ?? 0).toLocaleString('id-ID')} kg beras`
      : `Rp ${Number(order.nominal ?? 0).toLocaleString('id-ID')}`;
  return [
    ['Nomor BSZ', order.nomorKwitansi],
    ['Tanggal', formatDateTime(order.createdAt)],
    ['Nama Muzakki', order.isAnonymous ? 'Hamba Allah' : order.namaMuzakki],
    ['No. Telepon', order.noTelepon ?? '—'],
    ['Jenis Zakat', labels[order.jenisZakat] ?? order.jenisZakat],
    [
      'Metode',
      ZAKAT_PAYMENT_LABELS[order.metodePembayaran] ?? order.metodePembayaran,
    ],
    ['Rincian', buildCalculationText(order, labels)],
    ['Status', ZAKAT_STATUS_LABELS[order.status] ?? order.status],
    ['Jumlah Zakat', amount],
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Cetak hanya kartu BSZ di jendela terpisah, bukan seluruh halaman admin. */
function printBsz(order: RealZakatOrderRow, labels: JenisLabels) {
  const win = window.open('', '_blank', 'width=720,height=800');
  if (!win) {
    return;
  }
  const rows = bszRows(order, labels)
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )
    .join('');
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${escapeHtml(order.nomorKwitansi)}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}
h1{font-size:18px;color:#1B5E20;margin:0 0 16px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px;border-bottom:1px dashed #cbd5e1;text-align:left}
th{color:#64748b;font-weight:500;width:35%}</style></head>
<body><h1>Bukti Setor Zakat (BSZ)</h1><table>${rows}</table></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

interface BszModalProps {
  order: RealZakatOrderRow;
  labels: JenisLabels;
  onClose: () => void;
}

function BszModal({ order, labels, onClose }: BszModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const rows = bszRows(order, labels);
  return (
    <div
      className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-slate-100 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 font-bold text-emerald-800">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Bukti Setor Zakat (BSZ)
              </h3>
              <p className="font-mono text-slate-500 text-xs">
                {order.nomorKwitansi}
              </p>
            </div>
          </div>
          <button
            className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2.5 rounded-xl border-2 border-emerald-700/30 bg-gradient-to-b from-amber-50/40 via-white to-emerald-50/30 p-5 text-xs">
          {rows.map(([label, value]) => (
            <div
              className="flex justify-between gap-4 border-slate-200 border-b border-dashed py-1"
              key={label}
            >
              <span className="shrink-0 text-slate-500">{label}:</span>
              <span className="text-right font-semibold text-slate-900">
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-3 py-1.5 font-bold text-white text-xs hover:bg-[#144716]"
            onClick={() => printBsz(order, labels)}
            type="button"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak / Simpan PDF
          </button>
          <button
            className="cursor-pointer rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-800 text-xs hover:bg-slate-300"
            onClick={onClose}
            type="button"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
