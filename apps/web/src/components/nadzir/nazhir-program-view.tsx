'use client';

import { FileCheck2, Landmark, Layers, Wallet } from 'lucide-react';
import {
  AdminPageHeader,
  AdminResource,
  DataTable,
} from '@/components/admin/admin-primitives';
import {
  TierCPreview,
  TierCStubBanner,
} from '@/components/admin/tier-c-preview';
import { PratinjauBadge } from '@/components/ui/pratinjau-badge';
import { formatRupiah } from '@/lib/amwal-api/format';
import { getNadzirPrograms } from '@/lib/amwal-api/nadzir';
import { useResource } from '@/lib/amwal-api/use-resource';

const NADZIR_STUB = '/api/nadzir/dashboard';

const TABS = [
  { id: 'manage', label: 'Kelola Program', icon: Layers },
  { id: 'withdrawal', label: 'Pencairan Dana Bertahap', icon: Wallet },
  { id: 'receipts', label: 'Bukti Kuitansi Belanja', icon: FileCheck2 },
] as const;

export function NazhirProgramView() {
  const { state, reload } = useResource(getNadzirPrograms);

  return (
    <section className="space-y-6 font-jakarta">
      <AdminPageHeader
        description="Kelola program wakaf produktif, ajukan pencairan dana bertahap, dan unggah bukti kuitansi belanja untuk audit DPS. Daftar program bersifat nyata; alur pencairan & kuitansi masih 501."
        title="Manajemen Program Wakaf"
      />

      <TierCStubBanner endpoint={NADZIR_STUB} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2 border-slate-100 border-b pb-4">
          {TABS.map((tab, idx) => {
            const Icon = tab.icon;
            return (
              <span
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-extrabold text-xs ${
                  idx === 0 ? 'bg-emerald-800 text-white' : 'text-slate-500'
                }`}
                key={tab.id}
              >
                <Icon aria-hidden="true" className="size-4" />
                {tab.label}
              </span>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <Landmark aria-hidden="true" className="size-4 text-emerald-700" />
            <h2 className="font-bold text-slate-900 text-sm">
              Program Wakaf LIVE — Data Nyata
            </h2>
          </div>
          <AdminResource
            emptyLabel="Belum ada program wakaf berstatus LIVE untuk lembaga Anda."
            isEmpty={(rows) => rows.length === 0}
            onRetry={reload}
            state={state}
          >
            {(rows) => (
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
            )}
          </AdminResource>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-bold text-slate-900 text-sm">
            Pencairan Dana Bertahap & Bukti Kuitansi
          </h2>
          <PratinjauBadge />
        </div>
        <TierCPreview
          detail="Formulir pengajuan pencairan bertahap, lampiran RAB, dan unggah kuitansi belanja terverifikasi DPS akan aktif setelah backend portal Nadzir dibangun."
          endpoint={NADZIR_STUB}
        />
      </div>
    </section>
  );
}
