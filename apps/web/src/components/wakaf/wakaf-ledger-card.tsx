import { HandHeart, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { formatRupiah } from '@/lib/amwal-api/format';

interface WakafLedgerCardProps {
  jenisWakaf?: 'PRODUKTIF_KEKAL' | 'HABIS_PAKAI' | string;
  pokokDanaTerkumpul: number;
  totalHasilAvailable: number;
  hasilInvestasiTersalurkan: number;
}

/**
 * Financial ledger transparency block. The legacy page renders it only for
 * `PRODUKTIF_KEKAL` programmes — that fiqh rule is preserved verbatim.
 */
export function WakafLedgerCard({
  jenisWakaf,
  pokokDanaTerkumpul,
  totalHasilAvailable,
  hasilInvestasiTersalurkan,
}: WakafLedgerCardProps) {
  if (jenisWakaf !== 'PRODUKTIF_KEKAL') {
    return null;
  }

  return (
    <div className="my-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/60 p-4 shadow-xs sm:p-5">
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700">
            <TrendingUp className="size-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm leading-tight">
              Transparansi Wakaf Produktif
            </h3>
            <p className="text-[11px] text-gray-500">
              Pengelolaan pokok abadi &amp; hasil investasi
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-[10px] text-emerald-800">
          <ShieldCheck className="size-3 text-emerald-600" />
          Fiqih Abadi
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-emerald-200/90 bg-white/95 p-3 shadow-2xs">
          <div className="mb-1 flex items-center justify-between gap-1">
            <span className="font-semibold text-[10px] text-gray-500 uppercase tracking-wider">
              Pokok Dana
            </span>
            <span className="inline-flex rounded-md bg-emerald-500 px-1.5 py-0.5 font-bold text-[9px] text-white shadow-2xs">
              Kekal
            </span>
          </div>

          <p className="font-extrabold text-emerald-700 text-sm tracking-tight sm:text-base">
            {formatRupiah(pokokDanaTerkumpul)}
          </p>

          <div className="mt-1 flex items-center gap-1 rounded border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 font-bold text-[10px] text-amber-800">
            <Sparkles className="size-3 shrink-0 text-amber-600" />
            <span>Tidak pernah berkurang</span>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200/80 bg-white/95 p-3 shadow-2xs">
          <span className="mb-1 block font-semibold text-[10px] text-gray-500 uppercase tracking-wider">
            Hasil Tersedia
          </span>
          <p className="font-extrabold text-blue-600 text-sm tracking-tight sm:text-base">
            {formatRupiah(totalHasilAvailable)}
          </p>
          <p className="mt-1 text-[10px] text-gray-500">
            Siap disalurkan untuk manfaat
          </p>
        </div>

        <div className="rounded-xl border border-purple-200/80 bg-white/95 p-3 shadow-2xs">
          <span className="mb-1 block font-semibold text-[10px] text-gray-500 uppercase tracking-wider">
            Hasil Tersalurkan
          </span>
          <p className="font-extrabold text-purple-700 text-sm tracking-tight sm:text-base">
            {formatRupiah(hasilInvestasiTersalurkan)}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-700">
            <HandHeart className="size-3 shrink-0 text-purple-500" />
            <span>Diterima Mauquf Alaih</span>
          </div>
        </div>
      </div>
    </div>
  );
}
