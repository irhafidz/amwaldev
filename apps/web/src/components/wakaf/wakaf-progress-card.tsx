import { Clock, TrendingUp } from 'lucide-react';
import { formatRupiah } from '@/lib/amwal-api/format';

interface WakafProgressCardProps {
  terkumpul: number;
  target: number;
  durasiHari?: number | null;
  createdAt?: string | Date;
  progressFisik?: number | null;
}

export function WakafProgressCard({
  terkumpul,
  target,
  durasiHari = 60,
  createdAt,
  progressFisik,
}: WakafProgressCardProps) {
  const percentage =
    target > 0 ? Math.min(100, Math.round((terkumpul / target) * 100)) : 0;

  let sisaHari = durasiHari || 45;
  if (createdAt && durasiHari) {
    const createdDate = new Date(createdAt);
    const endDate = new Date(
      createdDate.getTime() + durasiHari * 24 * 60 * 60 * 1000
    );
    const daysLeft = Math.ceil(
      (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    sisaHari = daysLeft > 0 ? daysLeft : 0;
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-[#F8F9FA] p-4 shadow-xs transition-all sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <span className="block font-semibold text-[10px] text-gray-500 uppercase tracking-wider sm:text-xs">
            Terkumpul
          </span>
          <span className="font-extrabold text-[#356152] text-lg tracking-tight sm:text-xl dark:text-emerald-400">
            {formatRupiah(terkumpul)}
          </span>
        </div>

        <div className="text-right">
          <span className="block font-semibold text-[10px] text-gray-500 uppercase tracking-wider sm:text-xs">
            Target
          </span>
          <span className="font-bold text-gray-900 text-sm sm:text-base dark:text-white">
            {formatRupiah(target)}
          </span>
        </div>
      </div>

      <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-[#356152] transition-all duration-1000 ease-out"
          style={{ width: `${Math.max(3, percentage)}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-medium text-gray-500 text-xs">
        <span className="font-semibold text-gray-600">
          {percentage}% Tercapai
        </span>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/90 bg-white px-3 py-1 text-gray-700 shadow-xs">
          <Clock className="size-3.5 text-gray-500" />
          <span>{sisaHari > 0 ? `${sisaHari} Hari Lagi` : 'Selesai'}</span>
        </div>
      </div>

      {typeof progressFisik === 'number' && (
        <div className="mt-3.5 border-slate-200/80 border-t pt-3">
          <div className="mb-1.5 flex items-center justify-between font-medium text-xs">
            <span className="flex items-center gap-1 font-semibold text-gray-700">
              <TrendingUp className="size-3.5 text-emerald-600" />
              Capaian Fisik Lapangan
            </span>
            <span className="font-bold text-emerald-700">{progressFisik}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-1000 ease-out"
              style={{
                width: `${Math.max(3, Math.min(100, progressFisik))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
