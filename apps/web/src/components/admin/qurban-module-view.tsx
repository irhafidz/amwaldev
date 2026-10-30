import { DEFAULT_AKAD_WAKALAH_QURBAN } from '@amwal/core/contracts/admin-qurban';
import { formatIndonesianPhone } from '@amwal/core/whatsapp/phone';
import {
  Award,
  Beef,
  Building,
  Camera,
  CheckCircle2,
  Download,
  FileImage,
  Layers,
  MapPin,
  PackageCheck,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BUTTON_PRIMARY,
  HERO_BUTTON_SECONDARY,
} from '@/components/admin/admin-primitives';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { orpc } from '@/lib/orpc/client';
import { describeRpcError } from '@/lib/orpc/error-message';
import { slotCountFor, validateBatchForm } from '@/lib/qurban-batch-form';
import { QurbanDistributionManager } from './qurban-distribution-manager';
import {
  BATCH_STATUS_LABELS,
  BatchFormModal,
  type BatchFormState,
  batchCategory,
  batchFormFrom,
  batchLabel,
  CertificateModal,
  ConfirmDeleteModal,
  DocumentationModal,
  type DokumentasiMedia,
  EMPTY_BATCH_FORM,
  EMPTY_SHOHIBUL_FORM,
  firstFoto,
  formatDateTime,
  isPatungan,
  OPSI_PESAN_LABELS,
  PAYMENT_STATUS_BADGE,
  PAYMENT_STATUS_LABELS,
  type QurbanBatch,
  type QurbanOrder,
  rupiah,
  ShohibulFormModal,
  type ShohibulFormState,
  shohibulFormFrom,
  shohibulName,
} from './qurban-modals';
import {
  QurbanStockWorkbench,
  type SlotRegistrationTarget,
} from './qurban-stock-workbench';

type Tab =
  | 'overview'
  | 'catalog'
  | 'grouping'
  | 'transactions'
  | 'wakalah'
  | 'distribution_options';

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: 'overview', label: 'Ringkasan Qurban', icon: TrendingUp },
  { id: 'catalog', label: 'Katalog & Stok Hewan', icon: PackageCheck },
  { id: 'grouping', label: 'Patungan Sapi 1/7', icon: Layers },
  { id: 'transactions', label: 'Shohibul Qurban', icon: Users },
  { id: 'wakalah', label: 'Log Akad Wakalah', icon: Award },
  { id: 'distribution_options', label: 'Distribusi & RPH', icon: Building },
];

// Galat validasi server disebut per kolom (bukan "Input validation failed").
function errorMessage(err: unknown, fallback: string): string {
  return describeRpcError(err, fallback);
}

/** Urutan kelompok katalog: kambing lebih dulu (stok kecil, cepat habis). */
const CATALOG_GROUPS = [
  { jenis: 'KAMBING', label: 'Kambing / Domba' },
  { jenis: 'SAPI', label: 'Sapi' },
] as const;

function optionalNumber(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}

function groupStatus(batch: QurbanBatch): { label: string; badge: string } {
  const sisa = batch.slotTotal - batch.slotTerpakai;
  if (batch.status === 'SELESAI') {
    return {
      label: 'Selesai',
      badge: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  if (sisa <= 0) {
    return {
      label: 'Lengkap (Siap Potong)',
      badge: 'bg-emerald-100 text-[#1B5E20] border-emerald-300',
    };
  }
  return {
    label: `Tersisa ${sisa} Slot`,
    badge:
      sisa <= 2
        ? 'bg-amber-100 text-amber-900 border-amber-300'
        : 'bg-blue-100 text-blue-900 border-blue-300',
  };
}

const CSV_NEEDS_QUOTING = /[",\n]/;

function csvCell(value: string | number): string {
  const text = String(value);
  return CSV_NEEDS_QUOTING.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function downloadOrdersCsv(orders: QurbanOrder[]) {
  const header = [
    'ID Pesanan',
    'Pemesan',
    'Nama Shohibul',
    'WhatsApp',
    'Hewan',
    'Slot',
    'Opsi Distribusi',
    'Status Bayar',
    'Total Harga',
    'Dibayar',
    'Akad Wakalah',
  ];
  const lines = orders.map((o) =>
    [
      o.id,
      o.namaPengqurban,
      shohibulName(o),
      o.teleponPengqurban ?? '',
      `${o.jenisHewan}${o.namaBatch ? ` - ${o.namaBatch}` : ''}`,
      o.nomorSlot.join(' '),
      OPSI_PESAN_LABELS[o.opsiPesan] ?? o.opsiPesan,
      PAYMENT_STATUS_LABELS[o.statusPembayaran] ?? o.statusPembayaran,
      Number(o.totalHarga),
      Number(o.nominalDibayar),
      o.akadWakalahAcceptedAt ?? '',
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
  link.download = `manifes-shohibul-qurban-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function QurbanModuleView() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnimalFilter, setSelectedAnimalFilter] = useState('all');

  const [batches, setBatches] = useState<QurbanBatch[]>([]);
  const [orders, setOrders] = useState<QurbanOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [akadText, setAkadText] = useState<string>(DEFAULT_AKAD_WAKALAH_QURBAN);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Modals
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [batchFormMode, setBatchFormMode] = useState<'create' | 'edit' | null>(
    null
  );
  const [editingBatch, setEditingBatch] = useState<QurbanBatch | null>(null);
  const [batchForm, setBatchForm] = useState<BatchFormState>(EMPTY_BATCH_FORM);
  const [deletingBatch, setDeletingBatch] = useState<QurbanBatch | null>(null);
  const [shohibulFormMode, setShohibulFormMode] = useState<
    'create' | 'edit' | null
  >(null);
  const [editingOrder, setEditingOrder] = useState<QurbanOrder | null>(null);
  const [lockedTarget, setLockedTarget] = useState<{
    batchId: string;
    nomorSlot?: number;
  } | null>(null);
  const [shohibulForm, setShohibulForm] =
    useState<ShohibulFormState>(EMPTY_SHOHIBUL_FORM);
  const [deletingOrder, setDeletingOrder] = useState<QurbanOrder | null>(null);
  const [docBatch, setDocBatch] = useState<QurbanBatch | null>(null);
  const [certOrder, setCertOrder] = useState<QurbanOrder | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const [batchRes, orderRes] = await Promise.all([
        orpc.admin.qurban.batchesList(),
        orpc.admin.qurban.ordersList(),
      ]);
      setBatches(batchRes.data);
      setOrders(orderRes.data);
    } catch {
      showToast({
        title: 'Gagal memuat data qurban',
        description: 'Data hewan & shohibul belum dapat ditampilkan.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch-once on mount
  useEffect(() => {
    reload();
    orpc.akad
      .active({ module: 'QURBAN' })
      .then((akad) => {
        if (akad?.body) {
          setAkadText(akad.body);
        }
      })
      .catch(() => undefined);
  }, []);

  // ---- Derived data -------------------------------------------------------
  const patunganBatches = useMemo(() => batches.filter(isPatungan), [batches]);
  const availableBatches = useMemo(
    () =>
      batches.filter(
        (b) => b.status === 'TERSEDIA' && b.slotTerpakai < b.slotTotal
      ),
    [batches]
  );
  const ordersByBatch = useMemo(() => {
    const map = new Map<string, QurbanOrder[]>();
    for (const order of orders) {
      if (order.hewanBatchId) {
        map.set(order.hewanBatchId, [
          ...(map.get(order.hewanBatchId) ?? []),
          order,
        ]);
      }
    }
    return map;
  }, [orders]);

  const stats = useMemo(() => {
    let kambing = 0;
    let sapiUtuh = 0;
    let slotPatungan = 0;
    for (const b of batches) {
      if (b.jenisHewan === 'KAMBING') {
        kambing += b.slotTerpakai;
      } else if (b.totalSlot > 1) {
        slotPatungan += b.slotTerpakai;
      } else {
        sapiUtuh += b.slotTerpakai;
      }
    }
    const dibayar = orders.reduce(
      (sum, o) => sum + Number(o.nominalDibayar),
      0
    );
    const nilaiPesanan = orders.reduce(
      (sum, o) => sum + Number(o.totalHarga),
      0
    );
    const fullGroups = patunganBatches.filter(
      (b) => b.slotTerpakai >= b.slotTotal
    ).length;
    const targetPenerima = batches.reduce(
      (sum, b) => sum + (b.targetPenerimaManfaat ?? 0),
      0
    );
    return {
      kambing,
      sapiUtuh,
      slotPatungan,
      terjual: kambing + sapiUtuh + slotPatungan,
      dibayar,
      nilaiPesanan,
      fullGroups,
      targetPenerima,
    };
  }, [batches, orders, patunganBatches]);

  const filteredOrders = orders.filter((o) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      o.namaPengqurban.toLowerCase().includes(term) ||
      shohibulName(o).toLowerCase().includes(term) ||
      o.id.toLowerCase().includes(term);
    const matchAnimal =
      selectedAnimalFilter === 'all' || o.jenisHewan === selectedAnimalFilter;
    return matchSearch && matchAnimal;
  });

  const ordersWithPhone = orders.filter((o) => o.teleponPengqurban);

  // ---- Batch handlers -----------------------------------------------------
  const openCreateBatch = (preset?: Partial<BatchFormState>) => {
    setEditingBatch(null);
    setBatchForm({ ...EMPTY_BATCH_FORM, ...preset });
    setBatchFormMode('create');
  };

  const openEditBatch = (batch: QurbanBatch) => {
    setEditingBatch(batch);
    setBatchForm(batchFormFrom(batch));
    setBatchFormMode('edit');
  };

  const handleSubmitBatch = async () => {
    const invalid = validateBatchForm(batchForm);
    if (invalid) {
      showToast({
        title: 'Form Belum Lengkap',
        description: invalid,
        type: 'error',
      });
      return;
    }
    const harga = Number(batchForm.hargaPerSlot);
    const shared = {
      hargaPerSlot: harga,
      namaBatch: batchForm.namaBatch.trim(),
      ras: batchForm.ras.trim(),
      kelasGrade: batchForm.kelasGrade.trim(),
      estimasiBeratKg: optionalNumber(batchForm.estimasiBeratKg),
      wilayahPenyaluran: batchForm.wilayahPenyaluran.trim(),
      targetPenerimaManfaat: optionalNumber(batchForm.targetPenerimaManfaat),
      lokasiRph: batchForm.lokasiRph.trim(),
      timJuleha: batchForm.timJuleha.trim(),
    };
    setIsSaving(true);
    try {
      if (batchFormMode === 'edit' && editingBatch) {
        await orpc.admin.qurban.updateBatch({
          id: editingBatch.id,
          ...shared,
          hargaPerSlot:
            editingBatch.slotTerpakai > 0 ? undefined : shared.hargaPerSlot,
          fotoUrl: batchForm.fotoUrl.trim(),
          tanggalPenyembelihanEstimasi:
            batchForm.tanggalPenyembelihanEstimasi || '',
          status: batchForm.status,
        });
      } else {
        await orpc.admin.qurban.createBatch({
          jenisHewan: batchForm.jenisHewan,
          totalSlot: slotCountFor(batchForm),
          ...shared,
          namaBatch: shared.namaBatch || undefined,
          ras: shared.ras || undefined,
          kelasGrade: shared.kelasGrade || undefined,
          wilayahPenyaluran: shared.wilayahPenyaluran || undefined,
          lokasiRph: shared.lokasiRph || undefined,
          timJuleha: shared.timJuleha || undefined,
          fotoUrl: batchForm.fotoUrl.trim() || undefined,
          tanggalPenyembelihanEstimasi:
            batchForm.tanggalPenyembelihanEstimasi || undefined,
        });
      }
      showToast({
        title:
          batchFormMode === 'edit'
            ? 'Data Hewan Diperbarui'
            : 'Hewan Ditambahkan',
        description: `${shared.namaBatch || batchForm.jenisHewan} tersimpan di database.`,
        type: 'success',
      });
      setBatchFormMode(null);
      await reload();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan hewan',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!deletingBatch) {
      return;
    }
    try {
      await orpc.admin.qurban.deleteBatch({ id: deletingBatch.id });
      showToast({
        title: 'Hewan Dihapus',
        description: `${batchLabel(deletingBatch)} dihapus dari katalog.`,
        type: 'success',
      });
      setDeletingBatch(null);
      await reload();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menghapus hewan',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  // ---- Shohibul handlers --------------------------------------------------
  const openRegister = (target?: { batchId: string; nomorSlot?: number }) => {
    setEditingOrder(null);
    setLockedTarget(target ?? null);
    setShohibulForm({
      ...EMPTY_SHOHIBUL_FORM,
      hewanBatchId: target?.batchId ?? availableBatches[0]?.id ?? '',
    });
    setShohibulFormMode('create');
  };

  const handleRegisterFromSlot = (target: SlotRegistrationTarget) => {
    setIsWorkbenchOpen(false);
    openRegister({ batchId: target.batchId, nomorSlot: target.nomorSlot });
  };

  const openEditOrder = (order: QurbanOrder) => {
    setEditingOrder(order);
    setLockedTarget(null);
    setShohibulForm(shohibulFormFrom(order));
    setShohibulFormMode('edit');
  };

  const handleSubmitShohibul = async () => {
    const f = shohibulForm;
    if (
      f.namaPengqurban.trim().length < 2 ||
      f.namaShohibul.trim().length < 2
    ) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Lengkapi nama pemesan dan lafazh nama shohibul.',
        type: 'error',
      });
      return;
    }
    const identity = {
      namaPengqurban: f.namaPengqurban.trim(),
      namaShohibul: f.namaShohibul.trim(),
      teleponPengqurban: f.teleponPengqurban.trim(),
      alamatPengqurban: f.alamatPengqurban.trim(),
      opsiPesan: f.opsiPesan,
    };
    setIsSaving(true);
    try {
      if (shohibulFormMode === 'edit' && editingOrder) {
        await orpc.admin.qurban.updateOrder({
          id: editingOrder.id,
          ...identity,
          ...(editingOrder.transactionId
            ? {}
            : {
                statusPembayaran: f.statusPembayaran,
                nominalDibayar: Number(f.nominalDibayar) || 0,
              }),
        });
      } else {
        const batchId = lockedTarget?.batchId ?? f.hewanBatchId;
        if (!batchId) {
          showToast({
            title: 'Hewan belum dipilih',
            description: 'Pilih hewan / slot untuk shohibul ini.',
            type: 'error',
          });
          setIsSaving(false);
          return;
        }
        await orpc.admin.qurban.createOrder({
          hewanBatchId: batchId,
          nomorSlot: lockedTarget?.nomorSlot,
          ...identity,
          teleponPengqurban: identity.teleponPengqurban || undefined,
          alamatPengqurban: identity.alamatPengqurban || undefined,
          metodePembayaran: f.metodePembayaran,
          statusPembayaran: f.statusPembayaran,
          nominalDibayar: optionalNumber(f.nominalDibayar),
          akadWakalahText: akadText,
        });
      }
      showToast({
        title:
          shohibulFormMode === 'edit'
            ? 'Data Shohibul Diperbarui'
            : 'Shohibul Berhasil Didaftarkan',
        description: `Akad wakalah atas nama ${identity.namaShohibul} tersimpan.`,
        type: 'success',
      });
      setShohibulFormMode(null);
      await reload();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan shohibul',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!deletingOrder) {
      return;
    }
    try {
      await orpc.admin.qurban.deleteOrder({ id: deletingOrder.id });
      showToast({
        title: 'Pendaftaran Dibatalkan',
        description: `Slot milik ${shohibulName(deletingOrder)} kembali tersedia.`,
        type: 'success',
      });
      setDeletingOrder(null);
      await reload();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menghapus pendaftaran',
        description: errorMessage(err, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  // ---- Reports ------------------------------------------------------------
  const sendReports = async (orderIds: string[]) => {
    if (orderIds.length === 0) {
      showToast({
        title: 'Tidak ada tujuan',
        description: 'Tidak ada shohibul dengan nomor WhatsApp.',
        type: 'error',
      });
      return;
    }
    setIsSending(true);
    try {
      const res = await orpc.admin.qurban.sendReport({ orderIds });
      showToast({
        title: res.failed > 0 ? 'Sebagian laporan gagal' : 'Laporan Terkirim',
        description: `${res.sent} terkirim, ${res.failed} gagal, ${res.skipped} dilewati (tanpa nomor WhatsApp).`,
        type: res.failed > 0 ? 'error' : 'success',
      });
      await reload();
    } catch (err: unknown) {
      showToast({
        title: 'Gagal mengirim laporan',
        description: errorMessage(err, 'Layanan WhatsApp tidak tersedia.'),
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDocumentation = async (
    data: { videoUrl: string; media: DokumentasiMedia[] },
    sendAfterSave: boolean
  ) => {
    if (!docBatch) {
      return;
    }
    setIsSaving(true);
    try {
      await orpc.admin.qurban.saveDocumentation({
        id: docBatch.id,
        dokumentasiVideoUrl: data.videoUrl.trim(),
        dokumentasiMedia: data.media,
      });
      const batchOrders = ordersByBatch.get(docBatch.id) ?? [];
      setDocBatch(null);
      if (sendAfterSave) {
        // Reload first so the report carries the video link just saved.
        await reload();
        await sendReports(
          batchOrders.filter((o) => o.teleponPengqurban).map((o) => o.id)
        );
      } else {
        showToast({
          title: 'Dokumentasi Tersimpan',
          description: `Tautan dokumentasi ${batchLabel(docBatch)} disimpan.`,
          type: 'success',
        });
        await reload();
      }
    } catch (err: unknown) {
      showToast({
        title: 'Gagal menyimpan dokumentasi',
        description: errorMessage(err, 'Periksa kembali format tautan.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const lockedBatch = lockedTarget
    ? (batches.find((b) => b.id === lockedTarget.batchId) ?? null)
    : null;

  return (
    <div className="space-y-6 font-jakarta pb-12">
      <AdminPageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={HERO_BUTTON_PRIMARY}
              onClick={() => openCreateBatch()}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Tambah Paket Hewan
            </button>
            <button
              className={HERO_BUTTON_SECONDARY}
              disabled={isLoading}
              onClick={reload}
              type="button"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              />
              Muat Ulang
            </button>
          </div>
        }
        description="Kelola stok hewan, patungan 1/7, transaksi pengqurban, dan pelaksanaan di RPH."
        icon={<Beef aria-hidden="true" />}
        title="Pengelolaan Qurban"
      />

      <AdminTabs
        label="Bagian modul qurban"
        onChange={setActiveTab}
        tabs={TABS.map((tab) => {
          const Icon = tab.icon;
          let count: string | undefined;
          if (tab.id === 'grouping') {
            count = `${patunganBatches.length} Grup`;
          } else if (tab.id === 'transactions') {
            count = String(orders.length);
          }
          return {
            id: tab.id,
            label: tab.label,
            icon: <Icon className="h-4 w-4" />,
            count,
          };
        })}
        value={activeTab}
      />

      {/* 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<PackageCheck className="w-4 h-4" />}
              iconClass="bg-emerald-50 text-[#1B5E20]"
              subtitle={`${stats.kambing} Kambing • ${stats.sapiUtuh} Sapi • ${stats.slotPatungan} Slot 1/7`}
              title="Total Hewan / Slot Terjual"
              value={isLoading ? 'Memuat…' : `${stats.terjual} Ekor / Slot`}
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              iconClass="bg-blue-50 text-blue-800"
              subtitle={`Nilai pesanan ${rupiah(stats.nilaiPesanan)}`}
              title="Total Dana Qurban Diterima"
              value={isLoading ? 'Memuat…' : rupiah(stats.dibayar)}
            />
            <KpiCard
              icon={<Layers className="w-4 h-4" />}
              iconClass="bg-amber-50 text-amber-800"
              subtitle={`${stats.fullGroups} Siap Potong • ${patunganBatches.length - stats.fullGroups} Dalam Proses`}
              title="Kelompok Patungan Sapi"
              value={`${patunganBatches.length} Kelompok`}
            />
            <KpiCard
              icon={<Users className="w-4 h-4" />}
              iconClass="bg-purple-50 text-purple-800"
              subtitle="Jumlah target dari seluruh hewan"
              title="Target Penerima Manfaat"
              value={`${stats.targetPenerima.toLocaleString('id-ID')} Penerima`}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-[#1B5E20]" />
                  Status Cepat Kelompok Patungan Sapi
                </h3>
                <p className="text-xs text-slate-500">
                  Okupansi slot tiap sapi kolektif dari database
                </p>
              </div>
              <button
                className="text-xs font-bold text-[#1B5E20] hover:underline cursor-pointer"
                onClick={() => setActiveTab('grouping')}
                type="button"
              >
                Lihat Semua Grup →
              </button>
            </div>
            {patunganBatches.length === 0 ? (
              <p className="py-6 text-center text-slate-400 text-xs">
                Belum ada sapi patungan.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {patunganBatches.slice(0, 6).map((b) => {
                  const status = groupStatus(b);
                  return (
                    <div
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-2"
                      key={b.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {batchLabel(b)}
                        </span>
                        <span
                          className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-bold border ${status.badge}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 font-mono">
                        {b.slotTerpakai}/{b.slotTotal} Shohibul Terdaftar
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        RPH: {b.lokasiRph ?? '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. KATALOG & STOK */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {batches.length} hewan terdaftar di database
            </p>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                onClick={() => setIsWorkbenchOpen(true)}
                type="button"
              >
                Workbench Slot
              </button>
              <button
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#1B5E20] px-5 py-3 font-extrabold text-sm text-white shadow-md ring-2 ring-[#1B5E20]/20 transition hover:bg-[#144716] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B5E20]"
                onClick={() => openCreateBatch()}
                type="button"
              >
                <Plus className="h-5 w-5" />
                Tambah Paket Hewan
              </button>
            </div>
          </div>
          {batches.length === 0 && !isLoading && (
            <p className="py-10 text-center text-slate-400 text-xs">
              Belum ada hewan qurban. Klik &quot;Tambah Paket Hewan&quot;.
            </p>
          )}
          {CATALOG_GROUPS.map((group) => {
            const items = batches.filter((b) => b.jenisHewan === group.jenis);
            if (items.length === 0) {
              return null;
            }
            const slotSisa = items.reduce(
              (sum, b) => sum + (b.slotTotal - b.slotTerpakai),
              0
            );
            return (
              <section
                aria-label={group.label}
                className="space-y-3"
                key={group.jenis}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-slate-200 border-b pb-2">
                  <h3 className="font-bold text-base text-slate-900">
                    {group.label}
                  </h3>
                  <p className="text-slate-500 text-sm">
                    {items.length} ekor · {slotSisa} slot tersedia
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {items.map((b) => {
                    const foto = firstFoto(b.galeriFotoUrls);
                    const sisa = b.slotTotal - b.slotTerpakai;
                    return (
                      <div
                        className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs flex flex-col justify-between"
                        key={b.id}
                      >
                        <div>
                          <div className="h-40 w-full relative bg-slate-100 flex items-center justify-center">
                            {foto ? (
                              <img
                                alt={batchLabel(b)}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                src={foto}
                              />
                            ) : (
                              <PackageCheck className="h-10 w-10 text-slate-300" />
                            )}
                            <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900/80 text-white">
                              {batchCategory(b)}
                            </div>
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold bg-white/90 text-slate-700">
                              {BATCH_STATUS_LABELS[b.status] ?? b.status}
                            </div>
                          </div>
                          <div className="p-5 space-y-3">
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">
                              {batchLabel(b)}
                            </h4>
                            <div className="text-xs text-slate-600 space-y-1">
                              <div>
                                Ras: <strong>{b.ras ?? '—'}</strong>
                                {b.kelasGrade ? ` • ${b.kelasGrade}` : ''}
                              </div>
                              <div>
                                Estimasi Bobot:{' '}
                                <strong>
                                  {b.estimasiBeratKg
                                    ? `${Number(b.estimasiBeratKg)} kg`
                                    : '—'}
                                </strong>
                              </div>
                              <div>
                                Wilayah Distribusi:{' '}
                                <span className="text-slate-700">
                                  {b.wilayahPenyaluran ?? '—'}
                                </span>
                              </div>
                            </div>
                            <div className="pt-3 border-t text-xs">
                              <span className="text-slate-400 text-xs block">
                                Harga Per Ekor / Slot
                              </span>
                              <div className="text-lg font-extrabold text-emerald-900 font-mono">
                                {rupiah(b.hargaPerSlot)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 pt-3 flex items-center justify-between gap-2 text-xs border-t border-slate-100">
                          <span className="text-xs text-slate-500">
                            <strong>{sisa} tersisa</strong> ({b.slotTerpakai}{' '}
                            terjual)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                              onClick={() => openEditBatch(b)}
                              title="Edit hewan"
                              type="button"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {b.slotTerpakai === 0 && (
                              <button
                                className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-rose-200 bg-white p-2 text-rose-700 transition hover:bg-rose-50"
                                onClick={() => setDeletingBatch(b)}
                                title="Hapus hewan"
                                type="button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {sisa > 0 && b.status === 'TERSEDIA' && (
                              <button
                                className="flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 font-bold text-xs text-[#1B5E20] transition hover:bg-emerald-100"
                                onClick={() => openRegister({ batchId: b.id })}
                                type="button"
                              >
                                Daftarkan
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 3. PATUNGAN SAPI 1/7 */}
      {activeTab === 'grouping' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Monitoring Sapi Kolektif 1/7</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-extrabold">
                  {stats.fullGroups} / {patunganBatches.length} Kuota Penuh
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Slot dan nama shohibul langsung dari database
              </p>
            </div>
            <button
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
              onClick={() =>
                openCreateBatch({ jenisHewan: 'SAPI', totalSlot: '7' })
              }
              type="button"
            >
              <Plus className="w-3.5 h-3.5" />
              Buka Sapi Baru
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Laporan */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FileImage className="w-3.5 h-3.5 text-[#1B5E20]" />
                    Laporan Dokumentasi Sembelih
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tautan video &amp; foto dokumentasi per hewan
                  </p>
                </div>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {batches.map((b) => (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl"
                    key={`laporan-${b.id}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {batchLabel(b)}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {b.slotTerpakai}/{b.slotTotal} slot •{' '}
                        {b.dokumentasiVideoUrl
                          ? 'Video tersedia'
                          : 'Belum ada video'}
                      </div>
                    </div>
                    <button
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition shrink-0"
                      onClick={() => setDocBatch(b)}
                      type="button"
                    >
                      <Camera className="w-3 h-3 text-emerald-700" />
                      Kelola Dokumentasi
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* WA Blast */}
            <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-emerald-200 pb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-[#1B5E20]" />
                    WA Blast Laporan Qurban
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dikirim lewat layanan WhatsApp Amwal
                  </p>
                </div>
                <span className="text-xs font-mono bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full shrink-0">
                  {ordersWithPhone.length} Nomor
                </span>
              </div>
              <button
                className="w-full px-3.5 py-2 bg-[#1B5E20] hover:bg-[#144716] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition disabled:opacity-50"
                disabled={ordersWithPhone.length === 0 || isSending}
                onClick={() => sendReports(ordersWithPhone.map((o) => o.id))}
                type="button"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isSending
                  ? 'Mengirim…'
                  : `Blast Semua Shohibul (${ordersWithPhone.length})`}
              </button>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {orders.map((o) => (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl"
                    key={`blast-${o.id}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {o.namaPengqurban}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {o.laporanTerkirimAt
                          ? `Terkirim ${formatDateTime(o.laporanTerkirimAt)}`
                          : o.teleponPengqurban
                            ? 'Belum dikirim'
                            : 'Tanpa nomor WhatsApp'}
                      </div>
                    </div>
                    <button
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E20] border border-emerald-300 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition shrink-0 disabled:opacity-40"
                      disabled={!o.teleponPengqurban || isSending}
                      onClick={() => sendReports([o.id])}
                      type="button"
                    >
                      <Send className="w-3 h-3" />
                      Kirim
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {patunganBatches.map((b, idx) => {
              const status = groupStatus(b);
              const isFull = b.slotTerpakai >= b.slotTotal;
              return (
                <div
                  className="p-5 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-4 shadow-2xs hover:border-emerald-300 transition"
                  key={b.id}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl font-bold flex items-center justify-center text-xs shadow-2xs ${isFull ? 'bg-[#1B5E20] text-white' : 'bg-amber-500 text-slate-950'}`}
                      >
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">
                            {batchLabel(b)}
                          </h4>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-extrabold border ${status.badge}`}
                          >
                            {status.label} ({b.slotTerpakai}/{b.slotTotal})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {b.lokasiRph ?? 'RPH belum diisi'}
                          </span>
                          <span>•</span>
                          <span>
                            Juleha:{' '}
                            <strong className="text-slate-800">
                              {b.timJuleha ?? '—'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                      onClick={() => openEditBatch(b)}
                      type="button"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  </div>

                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${isFull ? 'bg-[#1B5E20]' : 'bg-amber-500'}`}
                      style={{
                        width: `${(b.slotTerpakai / b.slotTotal) * 100}%`,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
                    {b.slots.map((slot) =>
                      slot.qurbanOrderId ? (
                        <div
                          className="p-3 bg-white rounded-xl border border-emerald-200/90 flex flex-col justify-between gap-1.5 shadow-2xs"
                          key={slot.id}
                        >
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#1B5E20] font-black text-xs flex items-center justify-center">
                              {slot.nomorSlot}
                            </span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div
                            className="font-bold text-slate-800 text-xs truncate"
                            title={
                              slot.namaShohibul ?? slot.namaPengqurban ?? ''
                            }
                          >
                            {slot.namaShohibul ?? slot.namaPengqurban}
                          </div>
                          <span
                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded text-center ${PAYMENT_STATUS_BADGE[slot.statusPembayaran ?? ''] ?? 'bg-slate-100 text-slate-600'}`}
                          >
                            {PAYMENT_STATUS_LABELS[
                              slot.statusPembayaran ?? ''
                            ] ?? slot.status}
                          </span>
                        </div>
                      ) : (
                        <button
                          className="p-3 bg-slate-100/70 hover:bg-emerald-50/60 rounded-xl border border-dashed border-slate-300 hover:border-emerald-400 text-slate-400 hover:text-emerald-800 flex flex-col items-center justify-center gap-1 text-xs transition cursor-pointer group min-h-[75px] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            slot.status !== 'TERSEDIA' ||
                            b.status !== 'TERSEDIA'
                          }
                          key={slot.id}
                          onClick={() =>
                            openRegister({
                              batchId: b.id,
                              nomorSlot: slot.nomorSlot,
                            })
                          }
                          type="button"
                        >
                          <span className="w-5 h-5 rounded-full bg-slate-200 group-hover:bg-emerald-200 group-hover:text-emerald-900 font-bold text-xs flex items-center justify-center text-slate-600">
                            {slot.nomorSlot}
                          </span>
                          <span className="text-xs font-semibold text-center">
                            Slot Kosong
                          </span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {patunganBatches.length === 0 && (
              <p className="py-8 text-center text-slate-400 text-xs">
                Belum ada sapi patungan. Klik &quot;Buka Sapi Baru&quot;.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 4. SHOHIBUL */}
      {activeTab === 'transactions' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Data Pemesan &amp; Nama Shohibul Qurban
              </h3>
              <p className="text-xs text-slate-500">
                Pesanan online bersifat read-only untuk pembayaran; entri admin
                dapat diubah atau dibatalkan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3.5 py-2 bg-[#1B5E20] hover:bg-[#144716] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                onClick={() => openRegister()}
                type="button"
              >
                <Plus className="w-3.5 h-3.5" />
                Daftarkan Shohibul
              </button>
              <button
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                disabled={filteredOrders.length === 0}
                onClick={() => downloadOrdersCsv(filteredOrders)}
                type="button"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]"
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari pemesan, nama shohibul, ID pesanan..."
                type="text"
                value={searchTerm}
              />
            </div>
            <SelectField
              onChange={(e) => setSelectedAnimalFilter(e.target.value)}
              value={selectedAnimalFilter}
            >
              <option value="all">Semua Jenis Hewan</option>
              <option value="SAPI">Sapi (Utuh / Patungan)</option>
              <option value="KAMBING">Kambing / Domba</option>
            </SelectField>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">ID Pesanan</th>
                  <th className="py-3 px-4">Pemesan</th>
                  <th className="py-3 px-4">WhatsApp</th>
                  <th className="py-3 px-4">Hewan / Slot</th>
                  <th className="py-3 px-4">Nama Shohibul</th>
                  <th className="py-3 px-4">Distribusi</th>
                  <th className="py-3 px-4">Pembayaran</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 px-4 text-center text-slate-400"
                      colSpan={8}
                    >
                      {isLoading ? 'Memuat…' : 'Belum ada shohibul.'}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr className="hover:bg-slate-50/70" key={o.id}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                        {o.id}
                        <div className="font-sans font-normal text-xs text-slate-400">
                          {o.transactionId
                            ? 'Pembayaran online'
                            : 'Entri admin'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {o.namaPengqurban}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {o.teleponPengqurban
                          ? formatIndonesianPhone(o.teleponPengqurban)
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {o.namaBatch ?? o.jenisHewan}
                        {o.nomorSlot.length > 0 && (
                          <span className="text-slate-400">
                            {' '}
                            • slot {o.nomorSlot.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-900">
                        {shohibulName(o)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {OPSI_PESAN_LABELS[o.opsiPesan] ?? o.opsiPesan}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${PAYMENT_STATUS_BADGE[o.statusPembayaran] ?? ''}`}
                        >
                          {PAYMENT_STATUS_LABELS[o.statusPembayaran] ??
                            o.statusPembayaran}
                        </span>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">
                          {rupiah(o.nominalDibayar)} / {rupiah(o.totalHarga)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-bold text-[#1B5E20] text-xs shadow-2xs transition hover:bg-emerald-100"
                            onClick={() => setCertOrder(o)}
                            title="Sertifikat qurban"
                            type="button"
                          >
                            <Award className="h-3.5 w-3.5" />
                          </button>
                          {o.dokumentasiVideoUrl && (
                            <a
                              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                              href={o.dokumentasiVideoUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                              title="Video penyembelihan"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                            disabled={!o.teleponPengqurban || isSending}
                            onClick={() => sendReports([o.id])}
                            title="Kirim laporan WhatsApp"
                            type="button"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => openEditOrder(o)}
                            title="Edit"
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!o.transactionId && (
                            <button
                              className="flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-lg border border-rose-200 bg-white p-2 text-rose-700 transition hover:bg-rose-50"
                              onClick={() => setDeletingOrder(o)}
                              title="Batalkan pendaftaran"
                              type="button"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. LOG AKAD WAKALAH */}
      {activeTab === 'wakalah' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Log Niat &amp; Akad Wakalah Qurban
              </h3>
              <p className="text-xs text-slate-500">
                Redaksi akad dan waktu persetujuan yang tersimpan per pesanan
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
              Total Akad: {orders.filter((o) => o.akadWakalahAcceptedAt).length}
            </span>
          </div>
          <div className="space-y-3">
            {orders.length === 0 && (
              <p className="py-6 text-center text-slate-400 text-xs">
                Belum ada akad tercatat.
              </p>
            )}
            {orders.map((o) => (
              <div
                className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs"
                key={o.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    {o.namaPengqurban} ({o.id})
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {formatDateTime(o.akadWakalahAcceptedAt)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 italic text-emerald-950 font-serif">
                  &quot;{o.akadWakalahText ?? 'Redaksi akad tidak tersimpan'}
                  &quot;
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. DISTRIBUSI & RPH */}
      {activeTab === 'distribution_options' && <QurbanDistributionManager />}

      {batchFormMode && (
        <BatchFormModal
          form={batchForm}
          hasTakenSlots={(editingBatch?.slotTerpakai ?? 0) > 0}
          isSaving={isSaving}
          mode={batchFormMode}
          onChange={setBatchForm}
          onClose={() => setBatchFormMode(null)}
          onSubmit={handleSubmitBatch}
        />
      )}

      {shohibulFormMode && (
        <ShohibulFormModal
          akadText={akadText}
          batches={availableBatches}
          form={shohibulForm}
          isGateway={Boolean(editingOrder?.transactionId)}
          isSaving={isSaving}
          lockedBatch={lockedBatch}
          mode={shohibulFormMode}
          onChange={setShohibulForm}
          onClose={() => setShohibulFormMode(null)}
          onSubmit={handleSubmitShohibul}
        />
      )}

      {docBatch && (
        <DocumentationModal
          batch={docBatch}
          isSaving={isSaving || isSending}
          onClose={() => setDocBatch(null)}
          onSave={handleSaveDocumentation}
          orders={ordersByBatch.get(docBatch.id) ?? []}
        />
      )}

      {certOrder && (
        <CertificateModal
          onClose={() => setCertOrder(null)}
          order={certOrder}
        />
      )}

      {deletingBatch && (
        <ConfirmDeleteModal
          description={
            <>
              <strong>{batchLabel(deletingBatch)}</strong> beserta{' '}
              {deletingBatch.slotTotal} slot kosongnya akan dihapus dari
              katalog.
            </>
          }
          onCancel={() => setDeletingBatch(null)}
          onConfirm={handleDeleteBatch}
          title="Hapus Hewan?"
        />
      )}

      {deletingOrder && (
        <ConfirmDeleteModal
          description={
            <>
              Pendaftaran <strong>{shohibulName(deletingOrder)}</strong> (
              {deletingOrder.id}) dibatalkan dan slotnya kembali tersedia.
            </>
          }
          onCancel={() => setDeletingOrder(null)}
          onConfirm={handleDeleteOrder}
          title="Batalkan Pendaftaran?"
        />
      )}

      <QurbanStockWorkbench
        isOpen={isWorkbenchOpen}
        onClose={() => setIsWorkbenchOpen(false)}
        onRegisterShohibul={handleRegisterFromSlot}
      />
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  iconClass,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500">{title}</span>
        <span className={`p-2 rounded-xl ${iconClass}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
        {value}
      </div>
      <div className="mt-2 text-xs text-slate-500 font-semibold">
        {subtitle}
      </div>
    </div>
  );
}
