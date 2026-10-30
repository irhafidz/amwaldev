'use client';

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Heart,
  LoaderCircle,
  Search,
  User,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getWaqfDonors, getWaqfProgram } from '@/lib/amwal-api';
import { formatRupiah, toNumber } from '@/lib/amwal-api/format';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';

interface WaqfDonorsViewProps {
  programId: string;
  user: SessionUser | null;
}

export function WaqfDonorsView({ programId }: WaqfDonorsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(10);

  const programResource = useResource(() => getWaqfProgram(programId), {
    enabled: Boolean(programId),
  });
  const donorResource = useResource(() => getWaqfDonors(programId), {
    enabled: Boolean(programId),
  });

  const program =
    programResource.state.status === 'success'
      ? programResource.state.data
      : null;
  const donors =
    donorResource.state.status === 'success' ? donorResource.state.data : [];

  const filteredDonors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return donors;
    }
    return donors.filter((d) => d.donorName.toLowerCase().includes(q));
  }, [donors, searchQuery]);

  const visibleDonors = filteredDonors.slice(0, displayCount);

  const totalTerkumpul = useMemo(() => {
    return donors.reduce((acc, d) => acc + (toNumber(d.nominal) || 0), 0);
  }, [donors]);

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumbs Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="hidden items-center gap-2 text-gray-500 text-xs sm:flex dark:text-slate-400"
      >
        <Link
          className="transition-colors hover:text-[#356152]"
          to="/dashboard"
        >
          Beranda
        </Link>
        <ChevronRight className="size-3.5 text-gray-400" />
        <Link className="transition-colors hover:text-[#356152]" to="/wakaf">
          Program Wakaf
        </Link>
        <ChevronRight className="size-3.5 text-gray-400" />
        {program && (
          <>
            <Link
              className="max-w-[200px] truncate transition-colors hover:text-[#356152]"
              params={{ programId }}
              to="/wakaf/$programId"
            >
              {program.judul}
            </Link>
            <ChevronRight className="size-3.5 text-gray-400" />
          </>
        )}
        <span className="font-semibold text-gray-900 dark:text-white">
          Daftar Donatur &amp; Wakif
        </span>
      </nav>

      {/* Header Summary Card */}
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link
              aria-label="Kembali ke detail program"
              className="flex size-10 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-2xs transition-all hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              params={{ programId }}
              to="/wakaf/$programId"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <div>
              <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
                Donatur &amp; Wakif
              </h1>
              <p className="mt-0.5 line-clamp-1 text-gray-500 text-xs sm:text-sm dark:text-slate-400">
                {program?.judul || 'Program Wakaf Uang Amwal'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-[#e2ece8] bg-[#f2f6f4] px-4 py-2 text-[#1d352d] dark:border-slate-800 dark:bg-slate-800 dark:text-emerald-300">
              <Users className="size-4 text-[#356152] dark:text-emerald-400" />
              <span className="font-bold text-xs sm:text-sm">
                {donors.length.toLocaleString('id-ID')} Wakif
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-[#e2ece8] bg-[#f2f6f4] px-4 py-2 text-[#1d352d] dark:border-slate-800 dark:bg-slate-800 dark:text-emerald-300">
              <Heart className="size-4 fill-[#356152] text-[#356152] dark:fill-emerald-400 dark:text-emerald-400" />
              <span className="font-bold text-xs sm:text-sm">
                {formatRupiah(totalTerkumpul)}
              </span>
            </div>
          </div>
        </div>

        {/* Search Filter Bar */}
        <div className="mt-5 border-gray-100 border-t pt-4 dark:border-slate-800">
          <div className="relative w-full sm:max-w-md">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3.5 size-4 text-gray-400" />
            <input
              aria-label="Cari nama donatur"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-4 pl-10 font-jakarta text-gray-900 text-xs shadow-2xs transition-all placeholder:text-gray-400 hover:bg-gray-100/80 focus:border-[#356152] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356152]/20 sm:text-sm dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama wakif/donatur..."
              type="text"
              value={searchQuery}
            />
          </div>
        </div>
      </div>

      {/* Donor List Rows */}
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        {donorResource.state.status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LoaderCircle
              aria-hidden="true"
              className="mb-3 size-9 animate-spin text-[#356152]"
            />
            <p className="font-semibold text-gray-700 text-sm dark:text-slate-300">
              Memuat daftar wakif...
            </p>
          </div>
        )}

        {donorResource.state.status === 'error' && (
          <div
            className="flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center dark:border-rose-950 dark:bg-rose-950/30"
            role="alert"
          >
            <p className="font-semibold text-gray-900 text-sm dark:text-white">
              Gagal memuat daftar donatur
            </p>
            <Button
              className="mt-3"
              onClick={donorResource.reload}
              size="sm"
              type="button"
              variant="outline"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {donorResource.state.status === 'success' &&
          filteredDonors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
              <Users className="mb-3 size-12 stroke-1 text-gray-300 dark:text-slate-600" />
              <p className="font-bold text-base text-gray-800 dark:text-white">
                Belum ada wakif ditemukan
              </p>
              <p className="mt-1 text-gray-400 text-xs">
                {searchQuery
                  ? 'Tidak ada donatur dengan nama tersebut'
                  : 'Jadilah orang pertama yang berwakaf pada program ini'}
              </p>
              <Button asChild className="mt-4 bg-[#356152] hover:bg-[#2b4f43]">
                <Link params={{ programId }} to="/wakaf/$programId/donate">
                  Wakaf Sekarang
                </Link>
              </Button>
            </div>
          )}

        {donorResource.state.status === 'success' &&
          filteredDonors.length > 0 && (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {visibleDonors.map((donor, idx) => {
                const isHambaAllah =
                  donor.donorName.toLowerCase().includes('hamba allah') ||
                  !donor.donorName;
                const initial = isHambaAllah
                  ? 'HA'
                  : donor.donorName.slice(0, 2).toUpperCase();

                return (
                  <div
                    className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    key={donor.id || `donor-${idx}`}
                  >
                    <div className="flex items-start gap-3.5">
                      {/* Avatar */}
                      <div
                        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-bold text-sm text-white shadow-xs ${
                          isHambaAllah
                            ? 'bg-slate-400 dark:bg-slate-700'
                            : 'bg-gradient-to-tr from-[#356152] to-emerald-600'
                        }`}
                      >
                        {isHambaAllah ? (
                          <User className="size-5 text-white/90" />
                        ) : (
                          initial
                        )}
                      </div>

                      {/* Donor Details */}
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-bold text-gray-900 text-sm sm:text-base dark:text-white">
                            {donor.donorName}
                          </h3>
                          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>

                        <p className="mt-0.5 text-gray-500 text-xs italic dark:text-slate-400">
                          {donor.doaMessage ||
                            'Semoga menjadi amal jariyah yang pahalanya terus mengalir.'}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="size-3" />
                            <span>
                              {donor.createdAt
                                ? new Date(donor.createdAt).toLocaleDateString(
                                    'id-ID',
                                    {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    }
                                  )
                                : 'Baru saja'}
                            </span>
                          </span>

                          {donor.metodePembayaran && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                              <CreditCard className="size-2.5" />
                              <span>{donor.metodePembayaran}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Nominal Badge */}
                    <div className="text-right">
                      <span className="font-extrabold text-[#356152] text-sm sm:text-base dark:text-emerald-400">
                        {formatRupiah(toNumber(donor.nominal) || 0)}
                      </span>
                      <span className="mt-1 block rounded-md bg-[#e2ece8] px-2 py-0.5 text-center font-semibold text-[#1d352d] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
                        Terverifikasi
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        {/* Load More Button */}
        {filteredDonors.length > displayCount && (
          <div className="mt-6 border-gray-100 border-t pt-4 text-center dark:border-slate-800">
            <Button
              className="border-[#356152] text-[#356152] hover:bg-[#f2f6f4]"
              onClick={() => setDisplayCount((prev) => prev + 15)}
              type="button"
              variant="outline"
            >
              Muat Lebih Banyak ({filteredDonors.length - displayCount} tersisa)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
