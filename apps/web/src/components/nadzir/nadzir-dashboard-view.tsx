'use client';

import { Coins, Layers, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AdminPageHeader,
  AdminResource,
  DataTable,
} from '@/components/admin/admin-primitives';
import { formatRupiah } from '@/lib/amwal-api/format';
import {
  getNadzirPrograms,
  type NadzirProgramRow,
} from '@/lib/amwal-api/nadzir';
import { useResource } from '@/lib/amwal-api/use-resource';

function sumNumeric(
  rows: NadzirProgramRow[],
  key: keyof NadzirProgramRow
): string {
  const total = rows.reduce((acc, row) => {
    const raw = row[key];
    if (typeof raw !== 'string') {
      return acc;
    }
    return acc + Math.round(Number.parseFloat(raw) * 100);
  }, 0);
  return (total / 100).toFixed(2);
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          {icon}
        </span>
        <span className="font-bold text-[11px] text-slate-600 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-2 font-black text-2xl text-slate-900 tracking-tight">
        {value}
      </p>
    </div>
  );
}

function DashboardBody({ rows }: { rows: NadzirProgramRow[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<Layers className="size-4" />}
          label="Program Wakaf LIVE"
          value={rows.length.toLocaleString('id-ID')}
        />
        <KpiCard
          icon={<Coins className="size-4" />}
          label="Total Pokok Terkumpul"
          value={formatRupiah(sumNumeric(rows, 'pokokDanaTerkumpul'))}
        />
        <KpiCard
          icon={<TrendingUp className="size-4" />}
          label="Total Hasil Tersedia"
          value={formatRupiah(sumNumeric(rows, 'totalHasilAvailable'))}
        />
      </div>

      <DataTable
        head={[
          'Program',
          'Lembaga',
          'Jenis',
          'Target Dana',
          'Pokok Terkumpul',
          'Hasil Tersedia',
        ]}
      >
        {rows.map((row) => (
          <tr className="hover:bg-slate-50/60" key={row.id}>
            <td className="px-4 py-3 font-semibold text-slate-900">
              {row.judul}
            </td>
            <td className="px-4 py-3 text-slate-600">
              {row.namaLembaga ?? '—'}
            </td>
            <td className="px-4 py-3 text-slate-600">
              {row.jenisWakaf === 'PRODUKTIF_KEKAL'
                ? 'Produktif Kekal'
                : 'Habis Pakai'}
            </td>
            <td className="px-4 py-3 text-slate-700 tabular-nums">
              {formatRupiah(row.targetDana)}
            </td>
            <td className="px-4 py-3 text-slate-700 tabular-nums">
              {formatRupiah(row.pokokDanaTerkumpul)}
            </td>
            <td className="px-4 py-3 text-emerald-700 tabular-nums">
              {formatRupiah(row.totalHasilAvailable)}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

export function NadzirDashboardView() {
  const { state, reload } = useResource(getNadzirPrograms);

  return (
    <section className="space-y-6 font-jakarta">
      <AdminPageHeader
        description="Portofolio program wakaf LIVE beserta ringkasan ledger pokok & hasil investasi. Angka dihitung langsung dari basis data."
        title="Dashboard Nadzir"
      />

      <AdminResource
        emptyLabel="Belum ada program wakaf berstatus LIVE untuk lembaga Anda."
        isEmpty={(rows) => rows.length === 0}
        onRetry={reload}
        state={state}
      >
        {(rows) => <DashboardBody rows={rows} />}
      </AdminResource>
    </section>
  );
}
