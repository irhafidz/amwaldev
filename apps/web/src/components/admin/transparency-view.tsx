import {
  AKAD_CATEGORIES,
  AKAD_LABELS,
  type AkadCategory,
} from '@amwal/core/analytics/akad-category';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import {
  type AdminLedgerRow,
  type AdminRealizationRow,
  getAdminLedger,
  getAdminRealizationLog,
} from '@/lib/amwal-api/admin';
import { formatRupiah } from '@/lib/amwal-api/format';
import { formatWibDateTime } from '@/lib/format-wib';
import { paymentMethodLabel } from './admin-format';
import { buildTransparencyPdf } from './transparency-pdf';
import { useAdminQuery, useDebouncedValue } from './use-admin-query';

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 300;

type Tab = 'transactions' | 'audit';

const VERIFICATION_BADGE: Record<string, { label: string; className: string }> =
  {
    VERIFIED: {
      label: 'TERVERIFIKASI',
      className: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    },
    PENDING: {
      label: 'MENUNGGU',
      className: 'border-amber-300 bg-amber-100 text-amber-900',
    },
    REJECTED: {
      label: 'DITOLAK',
      className: 'border-rose-300 bg-rose-100 text-rose-900',
    },
  };

export function TransparencyView() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [searchInput, setSearchInput] = useState('');
  const [filterAkad, setFilterAkad] = useState<'SEMUA' | AkadCategory>('SEMUA');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const akad = filterAkad === 'SEMUA' ? undefined : filterAkad;

  // Only the visible tab applies the search box; the other keeps its own page.
  const ledgerSearch = activeTab === 'transactions' ? search : '';
  const logSearch = activeTab === 'audit' ? search : '';
  const ledger = useAdminQuery(
    () =>
      getAdminLedger({
        akad,
        search: ledgerSearch || undefined,
        page: ledgerPage,
        limit: PAGE_SIZE,
      }),
    [akad, ledgerSearch, ledgerPage]
  );
  const log = useAdminQuery(
    () =>
      getAdminRealizationLog({
        search: logSearch || undefined,
        page: logPage,
        limit: PAGE_SIZE,
      }),
    [logSearch, logPage]
  );

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const [ledgerAll, logAll] = await Promise.all([
        getAdminLedger({
          akad,
          search: ledgerSearch || undefined,
          page: 1,
          limit: EXPORT_LIMIT,
        }),
        getAdminRealizationLog({
          search: logSearch || undefined,
          page: 1,
          limit: EXPORT_LIMIT,
        }),
      ]);
      buildTransparencyPdf(ledgerAll.items, logAll.items).save(
        `laporan-transparansi-${new Date().toISOString().slice(0, 10)}.pdf`
      );
      showToast({
        title: 'Laporan Transparansi Siap Diunduh',
        description: `PDF berisi ${ledgerAll.items.length} transaksi & ${logAll.items.length} log realisasi (maks. ${EXPORT_LIMIT} baris per bagian, sesuai filter aktif).`,
        type: 'success',
      });
    } catch (error) {
      showToast({
        title: 'Gagal membuat laporan',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  const summary = ledger.data?.summary;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            disabled={exporting}
            onClick={handleExportPdf}
            type="button"
          >
            {exporting ? (
              <LoaderCircle className="shrink-0 animate-spin" size={16} />
            ) : (
              <Download className="shrink-0" size={16} />
            )}
            Cetak Laporan Transparansi (PDF)
          </button>
        }
        description="Catatan transaksi donatur yang sudah lunas dengan jenis akad, serta log realisasi dana dan bukti kuitansi program."
        icon={<FileSpreadsheet aria-hidden="true" />}
        title="Transparansi Transaksi &amp; Buku Besar Audit Akuntabilitas"
      />

      <AdminTabs
        label="Bagian transparansi"
        onChange={setActiveTab}
        tabs={[
          {
            id: 'transactions',
            label: `Tabel Transparansi Transaksi (${ledger.data?.summary.totalCount ?? '…'})`,
            icon: <CreditCard className="shrink-0" size={16} />,
          },
          {
            id: 'audit',
            label: `Log Realisasi Dana (${log.data?.total ?? '…'})`,
            icon: <ShieldCheck className="shrink-0" size={16} />,
          },
        ]}
        value={activeTab}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          hint="Tercatat di ledger digital"
          icon={<Receipt className="shrink-0 text-emerald-800" size={20} />}
          label="Total Transaksi Terverifikasi"
          value={summary ? summary.totalCount.toLocaleString('id-ID') : '—'}
        />
        <SummaryCard
          hint="Total seluruh akad yang lunas"
          icon={<TrendingUp className="shrink-0 text-emerald-800" size={20} />}
          label="Volume Terverifikasi"
          value={summary ? formatRupiah(summary.totalVolume) : '—'}
        />
        <SummaryCard
          hint="Donatur dengan identitas tercatat"
          icon={<Users className="shrink-0 text-emerald-800" size={20} />}
          label="Donatur Unik"
          value={summary ? summary.uniqueDonors.toLocaleString('id-ID') : '—'}
        />
      </div>

      <AllocationSnapshot allocations={ledger.data?.allocations ?? null} />

      {(ledger.error || log.error) && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-rose-700 text-sm"
          role="alert"
        >
          <span>{ledger.error ?? log.error}</span>
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-xs hover:bg-rose-50"
            onClick={() => {
              ledger.reload();
              log.reload();
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Coba lagi
          </button>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="flex flex-col justify-between gap-3 border-slate-200 border-b bg-slate-50/50 p-4 md:flex-row md:items-center">
            <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center md:w-auto">
              <SearchBox
                onChange={(value) => {
                  setSearchInput(value);
                  setLedgerPage(1);
                }}
                placeholder="Cari nama donatur atau ID transaksi..."
                value={searchInput}
              />
              <div className="flex items-center gap-2">
                <Filter className="shrink-0 text-slate-400" size={14} />
                <SelectField
                  aria-label="Filter jenis akad"
                  onChange={(e) => {
                    setFilterAkad(e.target.value as 'SEMUA' | AkadCategory);
                    setLedgerPage(1);
                  }}
                  value={filterAkad}
                >
                  <option value="SEMUA">Semua Jenis Akad</option>
                  {AKAD_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {AKAD_LABELS[category]}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>
            <span className="shrink-0 font-medium text-slate-500 text-xs">
              Menampilkan{' '}
              <strong className="text-slate-900">
                {ledger.data?.items.length ?? 0}
              </strong>{' '}
              dari {ledger.data?.total ?? 0} transaksi terverifikasi
            </span>
          </div>

          <LedgerTable
            loading={ledger.loading}
            rows={ledger.data?.items ?? null}
          />
          <Pager
            onPage={setLedgerPage}
            page={ledgerPage}
            pageSize={PAGE_SIZE}
            total={ledger.data?.total ?? 0}
          />
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="flex flex-col justify-between gap-3 border-slate-200 border-b bg-slate-50/50 p-4 sm:flex-row sm:items-center">
            <SearchBox
              onChange={(value) => {
                setSearchInput(value);
                setLogPage(1);
              }}
              placeholder="Cari ID log, program, atau aktivitas..."
              value={searchInput}
            />
            <span className="font-medium text-slate-500 text-xs">
              Menampilkan{' '}
              <strong className="text-slate-900">
                {log.data?.items.length ?? 0}
              </strong>{' '}
              dari {log.data?.total ?? 0} log · total pencairan{' '}
              <strong className="text-slate-900">
                {formatRupiah(log.data?.totalNominal ?? 0)}
              </strong>
            </span>
          </div>

          <RealizationTable
            loading={log.loading}
            rows={log.data?.items ?? null}
          />
          <Pager
            onPage={setLogPage}
            page={logPage}
            pageSize={PAGE_SIZE}
            total={log.data?.total ?? 0}
          />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-2 flex items-center justify-between text-slate-500">
        <span className="font-semibold text-xs uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <div className="break-words font-black text-2xl text-slate-900">
        {value}
      </div>
      <span className="mt-1 block font-semibold text-[11px] text-emerald-800">
        {hint}
      </span>
    </div>
  );
}

function AllocationSnapshot({
  allocations,
}: {
  allocations:
    | {
        kind: 'program' | 'akad';
        label: string;
        total: number;
        txCount: number;
        donors: number;
        share: number;
      }[]
    | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <h3 className="mb-3 font-bold text-slate-700 text-xs uppercase tracking-wider">
        Snapshot Alokasi Program (dana terverifikasi)
      </h3>
      {allocations === null && (
        <p className="text-slate-400 text-xs">Memuat alokasi…</p>
      )}
      {allocations?.length === 0 && (
        <p className="text-slate-400 text-xs">
          Belum ada transaksi terverifikasi.
        </p>
      )}
      {allocations && allocations.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {allocations.map((item) => (
            <li
              className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs"
              key={`${item.kind}-${item.label}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-slate-800">{item.label}</span>
                <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-[10px] text-emerald-800">
                  {item.share}%
                </span>
              </div>
              <span className="mt-1 block font-black text-lg text-slate-900">
                {formatRupiah(item.total)}
              </span>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-700"
                  style={{ width: `${Math.min(100, item.share)}%` }}
                />
              </div>
              <span className="mt-1.5 block text-[11px] text-slate-500">
                {item.txCount} transaksi · {item.donors} donatur
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:w-80">
      <Search
        className="-translate-y-1/2 absolute top-1/2 left-3 shrink-0 text-slate-400"
        size={16}
      />
      <input
        aria-label={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </div>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return null;
  }
  return (
    <nav
      aria-label="Halaman"
      className="flex items-center justify-between border-slate-200 border-t bg-slate-50/50 px-4 py-3 text-slate-500 text-xs"
    >
      <span>
        Halaman {page} dari {lastPage}
      </span>
      <span className="flex items-center gap-2">
        <button
          aria-label="Halaman sebelumnya"
          className="cursor-pointer rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <button
          aria-label="Halaman berikutnya"
          className="cursor-pointer rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </span>
    </nav>
  );
}

function EmptyRow({
  colSpan,
  loading,
  empty,
}: {
  colSpan: number;
  loading: boolean;
  empty: string;
}) {
  return (
    <tr>
      <td className="p-10 text-center text-slate-400" colSpan={colSpan}>
        {loading ? 'Memuat data…' : empty}
      </td>
    </tr>
  );
}

function LedgerTable({
  rows,
  loading,
}: {
  rows: AdminLedgerRow[] | null;
  loading: boolean;
}) {
  return (
    <div
      aria-busy={loading}
      className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}
    >
      <table className="w-full min-w-[750px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-slate-200 border-b bg-slate-100/70 font-bold text-[10px] text-slate-600 uppercase tracking-wider">
            <th className="px-4 py-3">Nama Donatur &amp; ID</th>
            <th className="px-3 py-3">Nominal Donasi</th>
            <th className="border-emerald-200/60 border-x bg-emerald-50/60 px-3 py-3 font-extrabold text-emerald-900">
              Jenis Akad
            </th>
            <th className="px-3 py-3">Waktu (Timestamp)</th>
            <th className="px-3 py-3">Program Tujuan</th>
            <th className="px-3 py-3">Metode Pembayaran</th>
            <th className="px-4 py-3 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(rows === null || rows.length === 0) && (
            <EmptyRow
              colSpan={7}
              empty="Tidak ada transaksi terverifikasi yang cocok."
              loading={loading}
            />
          )}
          {rows?.map((tx) => (
            <tr className="transition hover:bg-slate-50/80" key={tx.id}>
              <td className="whitespace-nowrap px-4 py-3.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  {tx.isAnonymous ? (
                    <ShieldCheck
                      className="shrink-0 text-emerald-800"
                      size={14}
                    />
                  ) : (
                    <User className="shrink-0 text-slate-400" size={14} />
                  )}
                  <span>{tx.donorName}</span>
                  {tx.isAnonymous && (
                    <span className="rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 font-bold text-[9px] text-amber-800">
                      Anonim
                    </span>
                  )}
                </div>
                <div className="pl-5 font-mono text-[10px] text-slate-400">
                  {tx.id}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3.5 font-extrabold text-slate-900">
                {formatRupiah(tx.amount)}
              </td>
              <td className="whitespace-nowrap border-emerald-100 border-x bg-emerald-50/30 px-3 py-3.5">
                <span className="inline-block rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 font-bold text-[11px] text-emerald-900">
                  {AKAD_LABELS[tx.akad]}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3.5 text-[11px] text-slate-500">
                {formatWibDateTime(tx.createdAt)}
              </td>
              <td className="px-3 py-3.5">
                <div
                  className="max-w-xs truncate font-medium text-slate-800"
                  title={tx.program}
                >
                  {tx.program}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-600">
                {paymentMethodLabel(tx.paymentMethod)}
              </td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 font-black text-[10px] text-emerald-900">
                  <CheckCircle2
                    className="shrink-0 text-emerald-700"
                    size={12}
                  />{' '}
                  LUNAS
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RealizationTable({
  rows,
  loading,
}: {
  rows: AdminRealizationRow[] | null;
  loading: boolean;
}) {
  return (
    <div
      aria-busy={loading}
      className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}
    >
      <table className="w-full min-w-[700px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-slate-200 border-b bg-slate-100/70 font-bold text-[10px] text-slate-600 uppercase tracking-wider">
            <th className="px-4 py-3">Log ID &amp; Waktu</th>
            <th className="px-3 py-3">Program Waqf</th>
            <th className="px-3 py-3">Aktivitas</th>
            <th className="px-3 py-3">Progres Fisik</th>
            <th className="px-3 py-3">Pencairan Dana</th>
            <th className="px-3 py-3">Bukti &amp; Pengunggah</th>
            <th className="px-4 py-3 text-right">Status Program</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(rows === null || rows.length === 0) && (
            <EmptyRow
              colSpan={7}
              empty="Belum ada kuitansi atau bukti realisasi dana."
              loading={loading}
            />
          )}
          {rows?.map((row) => {
            const badge = VERIFICATION_BADGE[row.verification] ?? {
              label: row.verification,
              className: 'border-slate-300 bg-slate-100 text-slate-700',
            };
            return (
              <tr className="transition hover:bg-slate-50/80" key={row.id}>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <div className="font-bold font-mono text-slate-900">
                    {row.id}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {formatWibDateTime(row.createdAt)}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="max-w-xs font-bold text-slate-800">
                    {row.programTitle}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="max-w-xs text-slate-700">{row.activity}</div>
                  {row.vendorName && (
                    <div className="text-[10px] text-slate-400">
                      Vendor: {row.vendorName}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 font-bold text-emerald-900">
                  {row.progress === null ? '—' : `${row.progress}% Fisik`}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 font-extrabold text-slate-900">
                  {row.nominal === null ? '—' : formatRupiah(row.nominal)}
                </td>
                <td className="px-3 py-3.5">
                  <div className="max-w-[14rem] truncate font-mono text-[10px] text-slate-500">
                    {row.fileName}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {row.uploaderName ?? '—'}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-black text-[10px] ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TransparencyView;
