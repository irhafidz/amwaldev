'use client';

import { Link } from '@tanstack/react-router';
import { Building2, CheckCircle2 } from 'lucide-react';
import {
  formatRupiah,
  progressPercent,
  toNumber,
} from '@/lib/amwal-api/format';
import type { WaqfProgram } from '@/lib/amwal-api/types';

interface ProgramCardProps {
  program: WaqfProgram;
  variant?: 'compact' | 'grid';
}

const FALLBACK_BANNER =
  '/assets/images/wakaf/wakaf-pembangunan-masjid-al-furqon.png';

function formatJuta(val: number): string {
  if (val >= 1_000_000_000) {
    return `Rp ${(val / 1_000_000_000).toFixed(1)} Miliar`;
  }
  if (val >= 1_000_000) {
    const juta = val / 1_000_000;
    return `Rp ${juta % 1 === 0 ? juta : juta.toFixed(1)}jt`;
  }
  return `Rp ${val.toLocaleString('id-ID')}`;
}

export function WaqfProgramCard({
  program,
  variant = 'compact',
}: ProgramCardProps) {
  if (variant === 'grid') {
    return <WaqfProgramGridCard program={program} />;
  }

  const percent = progressPercent(
    program.principalLedger?.pokokDanaTerkumpul,
    program.targetDana
  );
  const nadzir = program.nadzirProfile?.namaLembaga;
  const category = program.kategori ?? 'Wakaf';
  const bannerUrl =
    program.bannerUrl && program.bannerUrl.trim() !== ''
      ? program.bannerUrl
      : FALLBACK_BANNER;
  const terkumpul = toNumber(program.principalLedger?.pokokDanaTerkumpul);

  return (
    <Link
      aria-label={`Buka program ${program.judul}`}
      className="group flex cursor-pointer items-center overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs transition-all hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      params={{ programId: program.id }}
      to="/wakaf/$programId"
    >
      <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden bg-slate-100 sm:h-[139px] sm:w-[139px]">
        {/* biome-ignore lint/performance/noImgElement: banner may be an uploaded URL or a legacy asset */}
        <img
          alt={`Banner program ${program.judul}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          decoding="async"
          height={139}
          loading="lazy"
          src={bannerUrl}
          width={139}
        />
      </div>

      <div className="flex h-[120px] min-w-0 flex-1 flex-col justify-between py-2 pr-3 pl-2.5 sm:h-[139px] sm:py-2.5 sm:pr-4 sm:pl-3">
        <div>
          <span className="mb-1 inline-block rounded-[4px] bg-[#e2ece8] px-2 py-0.5 font-medium text-[#1d352d] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
            {category.split(' ')[0] || 'Wakaf'}
          </span>
          <h3 className="mb-0.5 line-clamp-2 font-medium text-[#1C2024] text-[13px] leading-[1.35] transition-colors group-hover:text-[#356152] sm:text-[14px] dark:text-white dark:group-hover:text-emerald-400">
            {program.judul}
          </h3>
          <p className="truncate text-[#6B7280] text-[10px] dark:text-slate-400">
            {nadzir || 'Badan Pengelola Wakaf'}
          </p>
        </div>

        <div className="pt-1">
          <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-[#E4E7EC] dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[#356152] transition-all duration-700"
              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[#6B7280] text-[10px] dark:text-slate-400">
            <span className="font-normal text-[#1C2024] dark:text-white">
              Terkumpul {formatJuta(terkumpul)}
            </span>
            <span className="font-normal text-[#6B7280] dark:text-slate-400">
              {program.durasiHari || 45} hari lagi
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function WaqfProgramGridCard({ program }: ProgramCardProps) {
  const percent = progressPercent(
    program.principalLedger?.pokokDanaTerkumpul,
    program.targetDana
  );
  const nadzir = program.nadzirProfile?.namaLembaga ?? 'Badan Pengelola Wakaf';
  const category = program.kategori ?? 'Wakaf';
  const bannerUrl =
    program.bannerUrl && program.bannerUrl.trim() !== ''
      ? program.bannerUrl
      : FALLBACK_BANNER;
  const terkumpul = toNumber(program.principalLedger?.pokokDanaTerkumpul);

  return (
    <Link
      aria-label={`Buka program ${program.judul}`}
      className="group hover:-translate-y-1 flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xs transition-all duration-200 hover:border-emerald-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
      params={{ programId: program.id }}
      to="/wakaf/$programId"
    >
      <div className="relative h-48 w-full overflow-hidden bg-slate-100">
        {/* biome-ignore lint/performance/noImgElement: static or dynamic image */}
        <img
          alt={`Banner program ${program.judul}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          decoding="async"
          height={192}
          loading="lazy"
          src={bannerUrl}
          width={384}
        />
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center rounded-lg bg-white/95 px-2.5 py-1 font-semibold text-[#1d352d] text-xs shadow-xs backdrop-blur-sm dark:bg-slate-900/90 dark:text-emerald-300">
            {category}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="line-clamp-2 font-bold text-base text-gray-900 leading-snug transition-colors group-hover:text-[#356152] dark:text-white dark:group-hover:text-emerald-400">
            {program.judul}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-gray-500 text-xs dark:text-slate-400">
            <Building2 className="size-3.5 shrink-0 text-[#356152] dark:text-emerald-400" />
            <span className="truncate">{nadzir}</span>
            <CheckCircle2 className="size-3.5 shrink-0 fill-emerald-500/20 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>

        <div className="mt-5 border-gray-100 border-t pt-3.5 dark:border-slate-800">
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[#356152] transition-all duration-700"
              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="block text-[11px] text-gray-400">Terkumpul</span>
              <span className="font-bold text-[#356152] dark:text-emerald-400">
                {formatRupiah(terkumpul)}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[11px] text-gray-400">
                Sisa Waktu
              </span>
              <span className="font-semibold text-gray-700 dark:text-slate-300">
                {program.durasiHari || 45} hari lagi
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
