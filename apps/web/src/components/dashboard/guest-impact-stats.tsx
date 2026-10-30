import { HandHeart, Sprout, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPublicStats } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import { useResource } from '@/lib/amwal-api/use-resource';

/**
 * Statistik dampak untuk TAMU di beranda (QA-15): angka agregat publik, bukan
 * poin pribadi yang untuk tamu selalu nol. Tidak tampil sama sekali bila
 * gagal dimuat, supaya beranda tidak menampilkan "0" yang menyesatkan.
 */
export function GuestImpactStats() {
  const { state } = useResource(getPublicStats, {
    key: 'stats:public',
    staleTime: 60_000,
  });
  if (state.status === 'error') {
    return null;
  }
  const stats = state.status === 'success' ? state.data : null;

  return (
    <section aria-label="Dampak kebaikan bersama Amwal">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
        <Stat
          icon={<HandHeart aria-hidden="true" className="size-5" />}
          label="Dana terhimpun"
          value={stats ? formatRupiah(stats.totalRaised) : null}
        />
        <Stat
          icon={<Users aria-hidden="true" className="size-5" />}
          label="Donatur berbagi kebaikan"
          value={stats ? stats.donorCount.toLocaleString('id-ID') : null}
        />
        <Stat
          icon={<Sprout aria-hidden="true" className="size-5" />}
          label="Program wakaf aktif"
          value={stats ? stats.activePrograms.toLocaleString('id-ID') : null}
        />
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs sm:flex-col sm:items-start sm:p-5 lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950/60 dark:text-emerald-300">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-500 text-xs dark:text-slate-400">
          {label}
        </p>
        {value === null ? (
          <div className="mt-1 h-7 w-28 animate-pulse rounded-md bg-gray-100 dark:bg-slate-800" />
        ) : (
          <p className="break-words font-extrabold text-gray-900 text-xl tracking-tight dark:text-white">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
