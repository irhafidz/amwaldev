'use client';

import {
  ExternalLink,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { formatRupiah } from '@/lib/amwal-api/format';
import type {
  WaqfProgramProgressReport,
  WaqfProgramReceipt,
} from '@/lib/amwal-api/types';

interface WakafTransparencyCardProps {
  rabDocumentUrl?: string | null;
  dokumenLegalitasUrl?: string | null;
  programTitle?: string;
  receipts?: WaqfProgramReceipt[];
  progressReports?: WaqfProgramProgressReport[];
}

function isValidDocUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  const trimmed = url.trim();
  return (
    trimmed !== '' && trimmed !== '#' && !trimmed.startsWith('javascript:')
  );
}

export function WakafTransparencyCard({
  rabDocumentUrl,
  dokumenLegalitasUrl,
  programTitle,
  receipts,
  progressReports,
}: WakafTransparencyCardProps) {
  const hasRab = isValidDocUrl(rabDocumentUrl);
  const hasLegalitas = isValidDocUrl(dokumenLegalitasUrl);

  return (
    <div className="my-6">
      <h2 className="mb-3 font-bold text-base text-gray-900 sm:text-lg">
        Transparansi & Akuntabilitas
      </h2>

      {/* Dokumen Legalitas & RAB */}
      <div className="flex flex-col gap-2.5">
        {hasRab ? (
          <a
            aria-label={`Unduh atau lihat Rencana Anggaran Biaya (RAB)${programTitle ? ` untuk ${programTitle}` : ''}`}
            className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[#F8F9FA] p-4 text-left shadow-2xs transition-all hover:bg-slate-100/90 active:scale-[0.99]"
            href={rabDocumentUrl || '#'}
            rel="noopener noreferrer"
            target="_blank"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                <FileText className="size-5" />
              </div>
              <div>
                <span className="block font-bold text-gray-900 text-xs transition-colors group-hover:text-emerald-700 sm:text-sm">
                  Rencana Anggaran Biaya (RAB)
                </span>
                <span className="block font-medium text-[11px] text-emerald-600">
                  Lihat Dokumen PDF &rarr;
                </span>
              </div>
            </div>

            <div className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-gray-400 transition-all group-hover:border-emerald-300 group-hover:text-emerald-600">
              <ExternalLink className="size-4" />
            </div>
          </a>
        ) : (
          <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <FileText className="size-5" />
              </div>
              <div>
                <span className="block font-bold text-slate-600 text-xs sm:text-sm">
                  Rencana Anggaran Biaya (RAB)
                </span>
                <span className="block text-[11px] text-slate-400 italic">
                  Dokumen belum dilampirkan
                </span>
              </div>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-[11px] text-slate-400">
              Belum tersedia
            </span>
          </div>
        )}

        {hasLegalitas ? (
          <a
            aria-label={`Unduh atau lihat Legalitas Nadzir${programTitle ? ` untuk ${programTitle}` : ''}`}
            className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[#F8F9FA] p-4 text-left shadow-2xs transition-all hover:bg-slate-100/90 active:scale-[0.99]"
            href={dokumenLegalitasUrl || '#'}
            rel="noopener noreferrer"
            target="_blank"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <span className="block font-bold text-gray-900 text-xs transition-colors group-hover:text-blue-700 sm:text-sm">
                  Legalitas Nadzir
                </span>
                <span className="block font-medium text-[11px] text-blue-600">
                  Lihat Dokumen PDF &rarr;
                </span>
              </div>
            </div>

            <div className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-gray-400 transition-all group-hover:border-blue-300 group-hover:text-blue-600">
              <ExternalLink className="size-4" />
            </div>
          </a>
        ) : (
          <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <span className="block font-bold text-slate-600 text-xs sm:text-sm">
                  Legalitas Nadzir
                </span>
                <span className="block text-[11px] text-slate-400 italic">
                  Dokumen belum dilampirkan
                </span>
              </div>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-[11px] text-slate-400">
              Belum tersedia
            </span>
          </div>
        )}
      </div>

      {/* Riwayat Kuitansi & Nota Belanja */}
      <div className="mt-5">
        <h3 className="mb-2.5 flex items-center gap-1.5 font-bold text-gray-800 text-xs uppercase tracking-wider">
          <Receipt className="size-3.5 text-emerald-600" />
          Riwayat Kuitansi & Realisasi Belanja
        </h3>
        {receipts && receipts.length > 0 ? (
          <div className="flex flex-col gap-2">
            {receipts.map((rcp) => (
              <div
                className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-[#F8F9FA] p-3 shadow-2xs"
                key={rcp.id}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="truncate font-bold text-gray-900 text-xs">
                    {rcp.title || rcp.fileName}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    {rcp.vendorName && <span>{rcp.vendorName}</span>}
                    {rcp.vendorName && <span>•</span>}
                    <span>
                      {new Date(rcp.createdAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block font-extrabold text-emerald-700 text-xs">
                    {rcp.nominal ? formatRupiah(Number(rcp.nominal)) : 'Rp 0'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {rcp.isPhotoEvidence ? 'Foto Bukti' : 'Kuitansi Sah'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-slate-400 text-xs italic">
            Belum ada riwayat kuitansi belanja yang dilampirkan.
          </p>
        )}
      </div>

      {/* Riwayat Laporan Progres */}
      {progressReports && progressReports.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 font-bold text-gray-800 text-xs uppercase tracking-wider">
            <TrendingUp className="size-3.5 text-emerald-600" />
            Riwayat Perkembangan Progres
          </h3>
          <div className="flex flex-col gap-2">
            {progressReports.map((rep) => (
              <div
                className="rounded-xl border border-slate-200/70 bg-[#F8F9FA] p-3 shadow-2xs"
                key={rep.id}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-[11px] text-gray-500">
                    {new Date(rep.createdAt).toLocaleDateString('id-ID')}
                  </span>
                  {rep.persentaseFisik && (
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-[11px] text-emerald-700">
                      Capaian: {rep.persentaseFisik}%
                    </span>
                  )}
                </div>
                {rep.deskripsi && (
                  <p className="text-gray-700 text-xs leading-relaxed">
                    {rep.deskripsi}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
