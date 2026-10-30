import { Link } from '@tanstack/react-router';
import { ChevronRight, HeartHandshake, Users } from 'lucide-react';

interface WakafStatsGridProps {
  programId?: string;
  totalWakif?: number | null;
  targetPenerima?: string | null;
}

export function WakafStatsGrid({
  programId,
  totalWakif = 0,
  targetPenerima = '500+ Yatim & Dhuafa',
}: WakafStatsGridProps) {
  const displayWakif =
    totalWakif && totalWakif > 0
      ? `${totalWakif.toLocaleString('id-ID')} Orang`
      : 'Belum Ada';

  const wakifCardContent = (
    <>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] sm:size-11 dark:bg-emerald-950/60 dark:text-emerald-300">
        <Users className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[10px] text-gray-500 sm:text-xs dark:text-slate-400">
          Wakif / Donatur
        </span>
        <p className="truncate font-bold text-gray-900 text-xs sm:text-sm dark:text-white">
          {displayWakif}
        </p>
      </div>
      {programId && (
        <ChevronRight className="size-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );

  return (
    <div className="my-5 grid grid-cols-2 gap-3">
      {programId ? (
        <Link
          className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition-all hover:border-[#356152]/40 hover:bg-[#f2f6f4]/40 active:scale-98 sm:p-4 dark:border-slate-800 dark:bg-slate-900"
          params={{ programId }}
          to="/wakaf/$programId/donatur"
        >
          {wakifCardContent}
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs sm:p-4 dark:border-slate-800 dark:bg-slate-900">
          {wakifCardContent}
        </div>
      )}

      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs sm:p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 sm:size-11 dark:bg-amber-950/50 dark:text-amber-300">
          <HeartHandshake className="size-5" />
        </div>
        <div className="min-w-0">
          <span className="block truncate font-medium text-[10px] text-gray-500 sm:text-xs dark:text-slate-400">
            Penerima Manfaat
          </span>
          <p className="truncate font-bold text-gray-900 text-xs sm:text-sm dark:text-white">
            {targetPenerima || '500+ Yatim'}
          </p>
        </div>
      </div>
    </div>
  );
}
