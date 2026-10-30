import {
  AKAD_CATEGORIES,
  AKAD_LABELS,
  type AkadCategory,
} from '@amwal/core/analytics/akad-category';
import { largestRetentionDrop } from '@amwal/core/analytics/retention-cohort';
import { Download, Grid, Info, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import {
  AdminPageHeader,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import { useToast } from '@/components/ui/toast';
import { getAdminRetentionCohort } from '@/lib/amwal-api/admin';
import { formatRupiah } from '@/lib/amwal-api/format';
import { downloadCsv } from '@/lib/export-file';
import { useAdminQuery } from './use-admin-query';

const MONTHS = 6;
const COHORTS = 12;

type AkadFilter = 'ALL' | AkadCategory;

function heatmapClass(value: number | null): string {
  if (value === null) {
    return 'bg-slate-50 text-slate-300';
  }
  if (value >= 100) {
    return 'bg-emerald-900 text-white font-black';
  }
  if (value >= 70) {
    return 'bg-emerald-800 text-white font-bold';
  }
  if (value >= 55) {
    return 'bg-emerald-600 text-white font-semibold';
  }
  if (value >= 45) {
    return 'bg-emerald-400 text-emerald-950 font-semibold';
  }
  if (value >= 35) {
    return 'bg-emerald-200 text-emerald-900 font-medium';
  }
  if (value > 0) {
    return 'bg-emerald-100 text-emerald-800';
  }
  return 'bg-slate-100 text-slate-500';
}

export function CohortRetentionView() {
  const { showToast } = useToast();
  const [akad, setAkad] = useState<AkadFilter>('ALL');
  const query = useAdminQuery(
    () =>
      getAdminRetentionCohort({
        akad: akad === 'ALL' ? undefined : akad,
        months: MONTHS,
        cohorts: COHORTS,
      }),
    [akad]
  );
  const cohorts = query.data?.cohorts ?? [];
  const summary = query.data?.summary;
  const drop = largestRetentionDrop(cohorts);

  const handleExport = () => {
    downloadCsv(
      `cohort-ltv-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Bulan Akuisisi',
        'Jumlah Donor',
        'Rata-rata LTV (Rp)',
        ...Array.from({ length: MONTHS }, (_, k) => `M+${k} (%)`),
      ],
      cohorts.map((row) => [
        row.label,
        row.donors,
        row.avgLtv,
        ...row.retention.map((value) => value ?? ''),
      ])
    );
    showToast({
      title: 'Laporan Kohort LTV Diunduh',
      description: `File CSV berisi ${cohorts.length} kohort bulanan berhasil diunduh.`,
      type: 'success',
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            disabled={cohorts.length === 0}
            onClick={handleExport}
            type="button"
          >
            <Download className="shrink-0" size={16} />
            Export Cohort LTV Report
          </button>
        }
        description="Melacak berapa lama donatur tetap aktif berdonasi dari bulan pertama kali bergabung, berdasarkan transaksi yang sudah lunas."
        icon={<Grid aria-hidden="true" />}
        title="Peta Kesetiaan Donatur &amp; Akumulasi Donasi (Retensi)"
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="scrollbar-none flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <span className="mr-1 shrink-0 font-bold text-slate-600 text-xs">
            Filter Akad:
          </span>
          {(['ALL', ...AKAD_CATEGORIES] as AkadFilter[]).map((option) => (
            <button
              aria-pressed={akad === option}
              className={`cursor-pointer whitespace-nowrap rounded-lg border px-3 py-1.5 font-semibold text-xs transition ${
                akad === option
                  ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
              key={option}
              onClick={() => setAkad(option)}
              type="button"
            >
              {option === 'ALL' ? 'Semua Akad' : AKAD_LABELS[option]}
            </button>
          ))}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          hint={
            summary?.avgRetentionM1 == null
              ? 'Belum ada kohort yang mencapai M+1'
              : 'Rata-rata tertimbang jumlah donor'
          }
          label="Rata-Rata Retensi M+1"
          tone="text-emerald-900"
          value={
            summary?.avgRetentionM1 == null ? '—' : `${summary.avgRetentionM1}%`
          }
        />
        <StatCard
          hint="Kontribusi lifetime per donor"
          label="Average Donor LTV"
          value={summary ? formatRupiah(summary.avgLtv) : '—'}
        />
        <StatCard
          hint={
            summary?.firstLabel
              ? `${summary.firstLabel} - ${summary.lastLabel}`
              : 'Belum ada donasi lunas'
          }
          label="Total Donor Terpantau"
          value={
            summary
              ? `${summary.totalDonors.toLocaleString('id-ID')} Donor`
              : '—'
          }
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <h3 className="mb-4 flex flex-col justify-between gap-2 font-bold text-slate-900 text-sm sm:flex-row sm:items-center">
          <span>
            Matrix Retensi Bulan-ke-Bulan
            {summary?.firstLabel
              ? ` (${summary.firstLabel} - ${summary.lastLabel})`
              : ''}
          </span>
          <span className="self-start rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 text-xs sm:self-auto">
            Nilai % Menunjukkan % Donor Yang Berdonasi Kembali
          </span>
        </h3>

        <div
          aria-busy={query.loading}
          className={`overflow-x-auto transition-opacity ${query.loading ? 'opacity-60' : ''}`}
        >
          <table className="w-full min-w-[640px] border-collapse text-center text-xs">
            <thead>
              <tr className="border-slate-200 border-b bg-slate-100/80 font-bold text-slate-700">
                <th className="px-3 py-3 text-left">Bulan Akuisisi</th>
                <th className="px-2 py-3">Jumlah Donor</th>
                <th className="px-2 py-3 text-emerald-900">Rata-rata LTV</th>
                {Array.from({ length: MONTHS }, (_, k) => (
                  <th className="px-2 py-3" key={`head-m${k}`}>
                    M+{k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cohorts.length === 0 && (
                <tr>
                  <td
                    className="p-10 text-center text-slate-400"
                    colSpan={MONTHS + 3}
                  >
                    {query.loading
                      ? 'Memuat kohort…'
                      : 'Belum ada donasi lunas untuk membentuk kohort.'}
                  </td>
                </tr>
              )}
              {cohorts.map((row) => (
                <tr className="transition hover:bg-slate-50/80" key={row.month}>
                  <td className="whitespace-nowrap px-3 py-3 text-left font-extrabold text-slate-900">
                    {row.label}
                  </td>
                  <td className="px-2 py-3 font-semibold text-slate-600">
                    {row.donors.toLocaleString('id-ID')}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 font-bold text-emerald-900">
                    {formatRupiah(row.avgLtv)}
                  </td>
                  {row.retention.map((value, k) => (
                    <td className="p-1" key={`${row.month}-m${k}`}>
                      <div
                        className={`rounded-lg px-1 py-2 text-xs transition ${heatmapClass(value)}`}
                      >
                        {value === null ? '-' : `${Math.round(value)}%`}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-900">
            <Info className="shrink-0 text-emerald-800" size={16} />
            Catatan dari Data Kohort:
          </div>
          <p className="text-slate-600 leading-snug">
            {drop
              ? `Penurunan rata-rata retensi terbesar terjadi dari M+${drop.from} ke M+${drop.to} (${drop.fromPct}% menjadi ${drop.toPct}%). Pertimbangkan pengingat dampak sosial sebelum donatur memasuki bulan M+${drop.to}.`
              : 'Belum cukup data kohort untuk menyimpulkan tren penurunan retensi.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'text-slate-900',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <span className="block font-semibold text-slate-500 text-xs">
        {label}
      </span>
      <span className={`mt-1 block font-black text-2xl ${tone}`}>{value}</span>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

export default CohortRetentionView;
