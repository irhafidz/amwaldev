import {
  isCodedMasterDataType,
  type MasterDataType,
} from '@amwal/core/contracts/admin-master-data';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Coins,
  CreditCard,
  Database,
  HandHeart,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  DataTable,
  HERO_BUTTON_PRIMARY,
  HERO_BUTTON_SECONDARY,
  useAdminToast,
} from '@/components/admin/admin-primitives';
import { MASTER_DATA_KEY } from '@/components/admin/use-master-data';
import { confirmAction } from '@/components/ui/confirm-action';
import { SelectField } from '@/components/ui/select-field';
import { invalidateResources } from '@/lib/amwal-api/resource-cache';
import { orpc } from '@/lib/orpc/client';

interface MasterDataRow {
  id: string;
  /** Kode DB untuk jenis zakat/infaq; `null` untuk picklist bebas. */
  kode: string | null;
  /** Hanya untuk Akad Waqaf: jenis wakaf program yang memakai akad ini. */
  jenisWakaf: JenisWakaf | null;
  label: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

const TABS: {
  type: MasterDataType;
  label: string;
  icon: typeof Tag;
  usedIn: string;
}[] = [
  {
    type: 'AKAD_WAQAF',
    label: 'Akad Waqaf',
    icon: Database,
    usedIn: 'form Buat Program Wakaf',
  },
  {
    type: 'KATEGORI_WAQAF',
    label: 'Kategori Waqaf',
    icon: Tag,
    usedIn: 'form Buat Program Wakaf',
  },
  {
    type: 'JENIS_ZAKAT',
    label: 'Jenis Zakat',
    icon: Coins,
    usedIn: 'form & filter Zakat admin dan Zakat Offline petugas',
  },
  {
    type: 'JENIS_INFAQ',
    label: 'Jenis Infaq',
    icon: HandHeart,
    usedIn: 'form Program Infaq & Donasi Manual',
  },
  {
    type: 'METODE_INFAQ',
    label: 'Metode Penerimaan Infaq',
    icon: CreditCard,
    usedIn: 'form Donasi Infaq Manual',
  },
];

type JenisWakaf = 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL';

const JENIS_WAKAF_LABELS: Record<JenisWakaf, string> = {
  HABIS_PAKAI: 'Habis Pakai (Proyek Fisik)',
  PRODUKTIF_KEKAL: 'Produktif Kekal (Wakaf Uang)',
};

/** Tipe yang punya sumber sinkronisasi di server. */
const SYNCABLE_TYPES: MasterDataType[] = [
  'AKAD_WAQAF',
  'KATEGORI_WAQAF',
  'JENIS_ZAKAT',
  'JENIS_INFAQ',
  'METODE_INFAQ',
];

export function MasterDataManagementView() {
  const toast = useAdminToast();
  const [activeType, setActiveType] = useState<MasterDataType>('AKAD_WAQAF');

  const [rows, setRows] = useState<MasterDataRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const activeTab = TABS.find((t) => t.type === activeType);
  const isCoded = isCodedMasterDataType(activeType);
  const isAkad = activeType === 'AKAD_WAQAF';

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formLabel, setFormLabel] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formJenisWakaf, setFormJenisWakaf] =
    useState<JenisWakaf>('HABIS_PAKAI');

  const [editingRow, setEditingRow] = useState<MasterDataRow | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editSortOrder, setEditSortOrder] = useState('0');
  const [editJenisWakaf, setEditJenisWakaf] = useState<JenisWakaf | ''>('');

  const fetchData = (type: MasterDataType) => {
    setIsLoading(true);
    orpc.admin.masterData
      .list({ type })
      .then((res) => setRows(res.data as MasterDataRow[]))
      .catch(() => toast.err('Gagal memuat master data'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData(activeType);
    // biome-ignore lint/correctness/useExhaustiveDependencies: refetch is keyed off the tab, not the closure below
  }, [activeType]);

  const resetForm = () => {
    setFormLabel('');
    setFormDescription('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await orpc.admin.masterData.create({
        type: activeType,
        label: formLabel.trim(),
        description: formDescription.trim() || undefined,
        sortOrder: rows.length,
        jenisWakaf: isAkad ? formJenisWakaf : undefined,
      });
      toast.ok('Data berhasil ditambahkan');
      setIsFormOpen(false);
      resetForm();
      invalidateResources(MASTER_DATA_KEY);
      fetchData(activeType);
    } catch {
      toast.err('Gagal menambahkan data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (row: MasterDataRow) => {
    setEditingRow(row);
    setEditLabel(row.label);
    setEditDescription(row.description ?? '');
    setEditIsActive(row.isActive);
    setEditSortOrder(String(row.sortOrder));
    setEditJenisWakaf(row.jenisWakaf ?? '');
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await orpc.admin.masterData.sync({ type: activeType });
      toast.ok(
        res.added > 0
          ? `${res.added} data baru ditambahkan dari sinkronisasi`
          : 'Master data sudah sinkron'
      );
      invalidateResources(MASTER_DATA_KEY);
      fetchData(activeType);
    } catch {
      toast.err('Gagal menyinkronkan master data');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) {
      return;
    }
    setIsSubmitting(true);
    try {
      await orpc.admin.masterData.update({
        type: activeType,
        id: editingRow.id,
        label: editLabel.trim(),
        description: editDescription.trim() || undefined,
        isActive: editIsActive,
        sortOrder: Number.parseInt(editSortOrder, 10) || 0,
        jenisWakaf: isAkad && editJenisWakaf ? editJenisWakaf : undefined,
      });
      toast.ok('Data berhasil diperbarui');
      setEditingRow(null);
      invalidateResources(MASTER_DATA_KEY);
      fetchData(activeType);
    } catch {
      toast.err('Gagal memperbarui data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: MasterDataRow) => {
    const confirmed = await confirmAction({
      title: 'Hapus Data Master?',
      description: `"${row.label}" akan dihapus dari daftar.`,
    });
    if (!confirmed) {
      return;
    }
    try {
      await orpc.admin.masterData.delete({ type: activeType, id: row.id });
      toast.ok('Data berhasil dihapus');
      invalidateResources(MASTER_DATA_KEY);
      fetchData(activeType);
    } catch {
      toast.err('Gagal menghapus data');
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <div className="flex items-center gap-2">
            {SYNCABLE_TYPES.includes(activeType) && (
              <button
                className={HERO_BUTTON_SECONDARY}
                disabled={isSyncing}
                onClick={handleSync}
                title="Tambahkan data bawaan & data yang sudah dipakai transaksi/program yang belum ada di master"
                type="button"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
                />
                Sinkronkan
              </button>
            )}
            {!isCoded && (
              <button
                className={HERO_BUTTON_PRIMARY}
                onClick={() => setIsFormOpen((prev) => !prev)}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Tambah Data
              </button>
            )}
          </div>
        }
        description="Kelola picklist yang dipakai form Wakaf, Zakat, dan Infaq. Data nonaktif tidak muncul di dropdown."
        title="Master Data"
      />

      <AdminTabs
        label="Jenis master data"
        onChange={(type) => {
          setActiveType(type);
          setIsFormOpen(false);
        }}
        tabs={TABS.map((tab) => {
          const Icon = tab.icon;
          return {
            id: tab.type,
            label: tab.label,
            icon: <Icon className="h-4 w-4" />,
          };
        })}
        value={activeType}
      />

      <p className="text-slate-500 text-xs">
        Dipakai di {activeTab?.usedIn}.
        {isCoded &&
          ' Jenis terikat ke kode di basis data: ubah label, urutan, atau status aktifnya; jenis tidak dapat ditambah manual atau dihapus.'}
      </p>

      {isFormOpen && !isCoded && (
        <form
          className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-xs"
          onSubmit={handleCreate}
        >
          <h3 className="border-slate-200 border-b pb-2 font-semibold text-slate-800">
            {activeTab?.label} Baru
          </h3>
          <div>
            <label
              className="mb-1 block font-semibold text-slate-700 text-xs"
              htmlFor="master-data-label"
            >
              Label *
            </label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              id="master-data-label"
              onChange={(e) => setFormLabel(e.target.value)}
              required
              type="text"
              value={formLabel}
            />
          </div>
          <div>
            <label
              className="mb-1 block font-semibold text-slate-700 text-xs"
              htmlFor="master-data-description"
            >
              Deskripsi
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              id="master-data-description"
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              value={formDescription}
            />
          </div>
          {isAkad && (
            <JenisWakafSelect
              id="master-data-jenis-wakaf"
              onChange={(value) => value && setFormJenisWakaf(value)}
              value={formJenisWakaf}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="cursor-pointer rounded-xl px-4 py-2 font-semibold text-slate-600 text-sm transition hover:bg-slate-200"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              type="button"
            >
              Batal
            </button>
            <button
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-sm text-white transition hover:bg-emerald-700 disabled:opacity-50"
              disabled={isSubmitting || !formLabel.trim()}
              type="submit"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      )}

      <DataTable
        head={[
          ...(isCoded ? ['Kode'] : []),
          'Label',
          ...(isAkad ? ['Jenis Wakaf'] : []),
          'Deskripsi',
          'Urutan',
          'Status',
          'Aksi',
        ]}
      >
        {isLoading ? (
          <tr>
            <td
              className="px-4 py-12 text-center text-slate-400"
              colSpan={isCoded || isAkad ? 6 : 5}
            >
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              Memuat data…
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td
              className="px-4 py-12 text-center text-slate-400"
              colSpan={isCoded || isAkad ? 6 : 5}
            >
              {SYNCABLE_TYPES.includes(activeType)
                ? 'Belum ada data. Klik Sinkronkan untuk mengisi data awal.'
                : 'Belum ada data. Tambahkan data pertama.'}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr className="transition hover:bg-slate-50" key={row.id}>
              {isCoded && (
                <td className="px-4 py-3 font-mono text-slate-500 text-xs">
                  {row.kode}
                </td>
              )}
              <td className="px-4 py-3 font-semibold text-slate-800">
                {row.label}
              </td>
              {isAkad && (
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {row.jenisWakaf ? (
                    JENIS_WAKAF_LABELS[row.jenisWakaf]
                  ) : (
                    <span className="font-semibold text-amber-700">
                      Belum dipetakan — tidak tampil di form
                    </span>
                  )}
                </td>
              )}
              <td className="max-w-sm px-4 py-3 text-slate-500">
                {row.description || '—'}
              </td>
              <td className="px-4 py-3 font-mono text-slate-500">
                {row.sortOrder}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 font-bold text-xs uppercase tracking-wide ${
                    row.isActive
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  {row.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
                    onClick={() => openEdit(row)}
                    title="Edit"
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!isCoded && (
                    <button
                      className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => handleDelete(row)}
                      title="Hapus"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))
        )}
      </DataTable>

      {editingRow && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
          <form
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onSubmit={handleUpdate}
          >
            <div className="flex items-center justify-between border-slate-100 border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Edit Data{editingRow.kode ? ` • ${editingRow.kode}` : ''}
              </h3>
              <button
                className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
                onClick={() => setEditingRow(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="edit-master-data-label"
              >
                Label
              </label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                id="edit-master-data-label"
                onChange={(e) => setEditLabel(e.target.value)}
                required
                type="text"
                value={editLabel}
              />
            </div>

            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="edit-master-data-description"
              >
                Deskripsi
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                id="edit-master-data-description"
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                value={editDescription}
              />
            </div>

            {isAkad && (
              <JenisWakafSelect
                id="edit-master-data-jenis-wakaf"
                onChange={setEditJenisWakaf}
                value={editJenisWakaf}
              />
            )}

            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="edit-master-data-sort"
              >
                Urutan di dropdown
              </label>
              <input
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                id="edit-master-data-sort"
                onChange={(e) => setEditSortOrder(e.target.value)}
                type="number"
                value={editSortOrder}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-slate-700 text-xs">
              <input
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                type="checkbox"
              />
              Aktif (tampil di {activeTab?.usedIn})
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
                onClick={() => setEditingRow(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-1.5 font-bold text-white text-xs shadow-xs hover:bg-[#144716] disabled:opacity-50"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      <section
        aria-labelledby="master-edu-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h2
          className="font-semibold text-slate-800 text-sm"
          id="master-edu-heading"
        >
          Master data di modul lain
        </h2>
        <p className="mt-1 text-slate-500 text-xs">
          Kategori Edukasi dikelola di modul Edukasi (dipakai artikel dan
          video). Pintasan ini membuka pengelolanya langsung.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ['artikel', 'Kategori Artikel Edukasi'],
              ['video', 'Kategori Video Edukasi'],
            ] as const
          ).map(([kategori, label]) => (
            <Link
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-800 text-sm transition hover:border-emerald-300 hover:bg-emerald-50"
              key={kategori}
              search={{ kategori }}
              to="/admin/edukasi"
            >
              <span className="flex items-center gap-2">
                <Tag aria-hidden="true" className="size-4 text-emerald-700" />
                {label}
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 text-slate-400"
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function JenisWakafSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: JenisWakaf | '';
  onChange: (value: JenisWakaf | '') => void;
}) {
  return (
    <div>
      <label
        className="mb-1 block font-semibold text-slate-700 text-xs"
        htmlFor={id}
      >
        Jenis Wakaf Program *
      </label>
      <SelectField
        className="w-full"
        id={id}
        onChange={(e) => onChange(e.target.value as JenisWakaf | '')}
        required
        value={value}
      >
        <option disabled value="">
          -- Pilih Jenis Wakaf --
        </option>
        {(Object.keys(JENIS_WAKAF_LABELS) as JenisWakaf[]).map((code) => (
          <option key={code} value={code}>
            {JENIS_WAKAF_LABELS[code]}
          </option>
        ))}
      </SelectField>
      <p className="mt-1 text-xs text-slate-400">
        Menentukan jenis wakaf program yang dibuat dengan akad ini.
      </p>
    </div>
  );
}

export default MasterDataManagementView;
