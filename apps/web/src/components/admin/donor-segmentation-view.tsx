import {
  DONOR_SEGMENTS,
  type DonorSegment,
} from '@amwal/core/analytics/donor-segments';
import { normalizeIndonesianPhone } from '@amwal/core/whatsapp/phone';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  AdminPageHeader,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import { useToast } from '@/components/ui/toast';
import { type AdminRfmDonor, getAdminRfmSegments } from '@/lib/amwal-api/admin';
import { formatRupiah } from '@/lib/amwal-api/format';
import { downloadCsv } from '@/lib/export-file';
import { formatWibDate } from '@/lib/format-wib';
import { useAdminQuery, useDebouncedValue } from './use-admin-query';

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 300;

type SegmentFilter = 'ALL' | DonorSegment;

const SEGMENT_BADGE: Record<DonorSegment, string> = {
  Champion: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold',
  Loyal: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold',
  New: 'bg-green-100 text-green-800 border-green-200 font-medium',
  'At-Risk': 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
  Lapsed: 'bg-rose-100 text-rose-800 border-rose-200 font-medium',
  Situational: 'bg-cyan-100 text-cyan-800 border-cyan-200 font-medium',
};

const SEGMENT_HINT: Record<DonorSegment, string> = {
  Champion:
    'Ajak Bapak/Ibu menjadi Duta Wakaf Abadi dan undang dalam seremoni peresmian proyek fisik terdekat.',
  Loyal:
    'Tawarkan fasilitas donasi rutin via QRIS / Virtual Account agar kebaikan berkala berjalan tanpa kendala manual.',
  New: 'Kirimkan buletin progres proyek dalam 30 hari pertama pasca donasi untuk mengonversi menjadi donatur berulang.',
  'At-Risk':
    'Kirimkan sapaan silaturahmi hangat dengan infografis dampak donasi sebelumnya sebelum donatur menjadi tidak aktif.',
  Lapsed:
    'Kirimkan penawaran program donasi mikro atau infaq tematik untuk mengaktifkan kembali riwayat kebaikan.',
  Situational:
    'Kirimkan update saat momentum besar (Ramadhan, Qurban, atau program tanggap bencana).',
};

const scoreText = (d: AdminRfmDonor) =>
  `R:${d.scores.r} | F:${d.scores.f} | M:${d.scores.m} | D:${d.scores.d}`;

const recencyText = (days: number) =>
  days === 0 ? 'Hari ini' : `${days} hari lalu`;

export function DonorSegmentationView() {
  const { showToast } = useToast();
  const [segment, setSegment] = useState<SegmentFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminRfmDonor | null>(null);
  const [exporting, setExporting] = useState(false);
  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const segmentArg = segment === 'ALL' ? undefined : segment;

  const query = useAdminQuery(
    () =>
      getAdminRfmSegments({
        segment: segmentArg,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    [segmentArg, search, page]
  );
  const data = query.data;
  const lastPage = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await getAdminRfmSegments({
        segment: segmentArg,
        search: search || undefined,
        page: 1,
        limit: EXPORT_LIMIT,
      });
      downloadCsv(
        `ledger-rfmd-donatur-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'ID',
          'Nama',
          'Email',
          'Telepon',
          'Segmen',
          'Recency (hari)',
          'Frequency',
          'Monetary (Rp)',
          'Diversity',
          'Skor R',
          'Skor F',
          'Skor M',
          'Skor D',
          'Skor Komposit',
        ],
        all.items.map((d) => [
          d.donorId,
          d.name,
          d.email ?? '',
          d.phone ?? '',
          d.segment,
          d.recencyDays,
          d.frequency,
          d.monetary,
          d.diversity,
          d.scores.r,
          d.scores.f,
          d.scores.m,
          d.scores.d,
          d.scores.composite,
        ])
      );
      showToast({
        title: 'Ledger RFMD Diunduh',
        description: `CSV berisi ${all.items.length} donatur (maks. ${EXPORT_LIMIT} baris, sesuai filter aktif).`,
        type: 'success',
      });
    } catch (error) {
      showToast({
        title: 'Gagal mengekspor',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            disabled={exporting}
            onClick={handleExport}
            type="button"
          >
            {exporting ? (
              <LoaderCircle className="shrink-0 animate-spin" size={16} />
            ) : (
              <Download className="shrink-0" size={16} />
            )}
            Export RFMD Ledger
          </button>
        }
        description="Pengelompokan donatur otomatis dari transaksi lunas berdasarkan keaktifan donasi, frekuensi, nominal rupiah, dan ragam akad yang diikuti."
        icon={<Users aria-hidden="true" />}
        title="Analisis &amp; Kelompok Donatur (Segmentasi)"
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="scrollbar-none flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          {(['ALL', ...DONOR_SEGMENTS] as SegmentFilter[]).map((seg) => {
            const count =
              seg === 'ALL' ? data?.totalDonors : data?.segmentCounts[seg];
            return (
              <button
                aria-pressed={segment === seg}
                className={`cursor-pointer whitespace-nowrap rounded-xl border px-3 py-1.5 font-bold text-xs transition ${
                  segment === seg
                    ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
                key={seg}
                onClick={() => {
                  setSegment(seg);
                  setPage(1);
                }}
                type="button"
              >
                {seg === 'ALL' ? 'Semua Segmen' : seg}
                {count === undefined
                  ? ''
                  : ` (${count.toLocaleString('id-ID')})`}
              </button>
            );
          })}
        </div>
      </div>

      {query.error && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-rose-700 text-sm"
          role="alert"
        >
          <span>{query.error}</span>
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-xs hover:bg-rose-50"
            onClick={query.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Coba lagi
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-col justify-between gap-3 border-slate-200 border-b bg-slate-50/50 p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search
              className="-translate-y-1/2 absolute top-1/2 left-3 shrink-0 text-slate-400"
              size={16}
            />
            <input
              aria-label="Cari donatur"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-slate-800 text-xs transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Cari ID Donor, Nama, Email, atau No. HP..."
              type="text"
              value={searchInput}
            />
          </div>
          <span className="font-medium text-slate-500 text-xs">
            Menampilkan{' '}
            <strong className="text-slate-900">
              {data?.items.length ?? 0}
            </strong>{' '}
            dari {data?.total ?? 0} donor
          </span>
        </div>

        <div
          aria-busy={query.loading}
          className={`overflow-x-auto transition-opacity ${query.loading ? 'opacity-60' : ''}`}
        >
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-slate-200 border-b bg-slate-100/70 font-bold text-[10px] text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-3">Donor ID &amp; Nama</th>
                <th className="px-3 py-3">Segmen RFMD</th>
                <th className="px-3 py-3">Recency</th>
                <th className="px-3 py-3">Frequency</th>
                <th className="px-3 py-3">Monetary</th>
                <th className="px-3 py-3">Diversity (Akad)</th>
                <th className="px-3 py-3">Skor RFMD</th>
                <th className="px-4 py-3 text-right">Aksi Strategis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!data || data.items.length === 0) && (
                <tr>
                  <td className="p-10 text-center text-slate-400" colSpan={8}>
                    {query.loading
                      ? 'Memuat donatur…'
                      : 'Belum ada donatur dengan transaksi lunas yang cocok.'}
                  </td>
                </tr>
              )}
              {data?.items.map((d) => (
                <tr className="transition hover:bg-slate-50/80" key={d.donorId}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="font-bold text-slate-900">{d.name}</div>
                    <div className="mt-0.5 flex max-w-[16rem] items-center gap-2 font-mono text-[11px] text-slate-400">
                      <span className="truncate" title={d.donorId}>
                        {d.donorId}
                      </span>
                      {d.phone && <span>• {d.phone}</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] ${SEGMENT_BADGE[d.segment]}`}
                    >
                      {d.segment}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">
                    {recencyText(d.recencyDays)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold font-mono text-slate-900">
                    {d.frequency}x
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-900">
                    {formatRupiah(d.monetary)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    <div className="flex items-center gap-1 font-semibold text-emerald-900">
                      <Layers className="shrink-0 text-emerald-700" size={14} />
                      <span>{d.diversity} Akad</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-600">
                    {scoreText(d)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      className="ml-auto flex cursor-pointer items-center gap-1 rounded-lg bg-[#1B5E20] px-3 py-1.5 font-bold text-white text-xs shadow-2xs transition hover:bg-[#144716]"
                      onClick={() => setSelected(d)}
                      type="button"
                    >
                      <span>Aksi</span>
                      <ChevronRight className="shrink-0" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(data?.total ?? 0) > PAGE_SIZE && (
          <nav
            aria-label="Halaman donatur"
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
                onClick={() => setPage(page - 1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                aria-label="Halaman berikutnya"
                className="cursor-pointer rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= lastPage}
                onClick={() => setPage(page + 1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </span>
          </nav>
        )}
      </div>

      {selected && (
        <DonorModal donor={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DonorModal({
  donor,
  onClose,
}: {
  donor: AdminRfmDonor;
  onClose: () => void;
}) {
  const waNumber = donor.phone ? normalizeIndonesianPhone(donor.phone) : null;
  const waText = encodeURIComponent(
    `Assalamu'alaikum ${donor.name}, terima kasih atas kebaikan Anda bersama Amwal.`
  );

  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between border-slate-100 border-b pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-base text-slate-900">
                {donor.name}
              </h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${SEGMENT_BADGE[donor.segment]}`}
              >
                {donor.segment}
              </span>
            </div>
            <p className="mt-0.5 break-all font-mono text-slate-400 text-xs">
              {donor.donorId}
              {donor.email ? ` • ${donor.email}` : ''}
            </p>
          </div>
          <button
            aria-label="Tutup"
            className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            <X className="shrink-0" size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <Metric label="Recency" value={recencyText(donor.recencyDays)} />
          <Metric label="Frekuensi" value={`${donor.frequency}x Transaksi`} />
          <Metric
            label="Total Donasi"
            strong
            value={formatRupiah(donor.monetary)}
          />
          <Metric label="Ragam Akad" value={`${donor.diversity} Akad`} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600 text-xs">
          <p>
            <span className="font-semibold text-slate-800">Akad diikuti:</span>{' '}
            {donor.akads.join(', ')}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-800">Terakhir:</span>{' '}
            {donor.lastAkad} · {formatWibDate(donor.lastDonationAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-800">Skor:</span>{' '}
            {scoreText(donor)} · komposit {donor.scores.composite}/5
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-950">
            <Bot className="shrink-0 text-emerald-800" size={16} />
            <span>Rekomendasi Strategis:</span>
          </div>
          <p className="text-emerald-900 leading-relaxed">
            {SEGMENT_HINT[donor.segment]}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
            onClick={onClose}
            type="button"
          >
            Tutup
          </button>
          {waNumber ? (
            <a
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-1.5 font-bold text-white text-xs shadow-xs hover:bg-[#144716]"
              href={`https://wa.me/${waNumber}?text=${waText}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Send className="shrink-0" size={14} />
              <span>Buka WhatsApp</span>
            </a>
          ) : (
            <span className="text-slate-400 text-xs">
              Nomor WhatsApp tidak tersedia
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <span className="block text-[10px] text-slate-400">{label}</span>
      <span
        className={`font-bold ${strong ? 'font-black text-emerald-900' : 'text-slate-900'}`}
      >
        {value}
      </span>
    </div>
  );
}

export default DonorSegmentationView;
