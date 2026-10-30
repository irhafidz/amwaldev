'use client';

import { Link } from '@tanstack/react-router';
import {
  Award,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Flame,
  History,
  Landmark,
  LoaderCircle,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  activityLabel,
  formatPointsDelta,
  formatPointsTimestamp,
} from '@/components/gamification/format';
import {
  loadPointsHistory,
  loadPointsSummary,
  submitCheckIn,
} from '@/components/gamification/points-api';
import { Skeleton } from '@/components/ui/skeleton';
import { useResource } from '@/lib/amwal-api/use-resource';
import { cn } from '@/lib/utils';

function ActivityIcon({ activityType }: { activityType: string }) {
  if (activityType.includes('CHECK_IN') || activityType.includes('CHECKIN')) {
    return <CalendarCheck aria-hidden="true" className="size-5" />;
  }
  if (activityType.includes('QUIZ')) {
    return <Award aria-hidden="true" className="size-5" />;
  }
  return <Sparkles aria-hidden="true" className="size-5" />;
}

export function PointsBerkahView() {
  const summaryResource = useResource(loadPointsSummary);
  const historyResource = useResource(() => loadPointsHistory(50));

  const [checkingIn, setCheckingIn] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    setFeedbackMessage(null);
    try {
      const result = await submitCheckIn();
      setFeedbackMessage(
        result.awarded
          ? `Alhamdulillah! Check-in berhasil: +${result.points} XP ditambahkan.`
          : 'Hari ini Anda sudah melakukan check-in harian.'
      );
      summaryResource.reload();
      historyResource.reload();
    } catch (err) {
      setFeedbackMessage(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat check-in.'
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const summary =
    summaryResource.state.status === 'success'
      ? summaryResource.state.data
      : null;
  const history =
    historyResource.state.status === 'success'
      ? historyResource.state.data
      : null;

  const saldo = summary ? summary.saldo : 0;
  const streakHari = summary ? summary.streakHari : 0;
  const sudahCheckIn = summary ? summary.sudahCheckInHariIni : false;

  const levelInfo = useMemo(() => {
    if (saldo >= 2500) {
      return {
        levelName: 'Level 4: Muhsin Utama',
        currentLevel: 4,
        nextTarget: 5000,
        progress: 80,
      };
    }
    if (saldo >= 1000) {
      return {
        levelName: 'Level 3: Dermawan Setia',
        currentLevel: 3,
        nextTarget: 2500,
        progress: Math.min(100, Math.round(((saldo - 1000) / 1500) * 100)),
      };
    }
    if (saldo >= 300) {
      return {
        levelName: 'Level 2: Sahabat Kebaikan',
        currentLevel: 2,
        nextTarget: 1000,
        progress: Math.min(100, Math.round(((saldo - 300) / 700) * 100)),
      };
    }
    return {
      levelName: 'Level 1: Relawan Perdana',
      currentLevel: 1,
      nextTarget: 300,
      progress: Math.min(100, Math.round((saldo / 300) * 100)),
    };
  }, [saldo]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header Navigation */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-xs dark:text-slate-400">
            <Link
              className="hover:text-gray-900 dark:hover:text-white"
              to="/dashboard"
            >
              Beranda
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#356152] dark:text-emerald-400">
              Poin Berkah
            </span>
          </div>
          <h1 className="mt-1 font-bold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
            Poin &amp; Keberkahan
          </h1>
        </div>
      </div>

      {/* 1. Top Banner (Gradient #356152 to #1d352d) */}
      <section
        aria-label="Ringkasan Poin Berkah"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#356152] via-[#2b4f43] to-[#1d352d] p-6 text-white shadow-sm sm:p-8"
      >
        <div className="-top-12 -right-12 pointer-events-none absolute size-52 rounded-full bg-white/10 blur-2xl" />
        <div className="-bottom-8 -left-8 pointer-events-none absolute size-40 rounded-full bg-emerald-400/10 blur-xl" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 font-semibold text-[11px] uppercase tracking-wider backdrop-blur-md">
                <Trophy
                  aria-hidden="true"
                  className="size-3.5 text-amber-300"
                />
                Poin Berkah Amwal
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/20 px-3 py-1 font-semibold text-[11px] text-amber-300 backdrop-blur-md">
                <Flame aria-hidden="true" className="size-3.5" />
                {streakHari} Hari Rentetan
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-extrabold text-4xl tracking-tight sm:text-5xl">
                {saldo.toLocaleString('id-ID')}
              </span>
              <span className="font-bold text-emerald-300 text-lg sm:text-xl">
                XP
              </span>
            </div>

            <p className="mt-1 text-white/80 text-xs sm:text-sm">
              Tingkat Donatur:{' '}
              <span className="font-semibold text-white">
                {levelInfo.levelName}
              </span>
            </p>

            {/* Target Progress Bar */}
            <div className="mt-5 max-w-md">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-white/80">
                  Target Menuju Level Berikutnya
                </span>
                <span className="font-bold text-amber-300">
                  {saldo} / {levelInfo.nextTarget} XP ({levelInfo.progress}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/30 backdrop-blur-sm">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-all duration-700"
                  style={{ width: `${levelInfo.progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <p className="text-[11px] text-white/70">
              *Poin apresiasi non-moneter yang merefleksikan keistiqamahan amal
              jariyah
            </p>
          </div>
        </div>
      </section>

      {/* Check-in Feedback Notification */}
      {feedbackMessage && (
        <output
          aria-live="polite"
          className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-medium text-[#1d352d] text-xs sm:text-sm dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <Sparkles
            aria-hidden="true"
            className="size-4 shrink-0 text-[#356152]"
          />
          <span>{feedbackMessage}</span>
        </output>
      )}

      {/* 2. 3-Column Action Cards Grid (grid-cols-1 md:grid-cols-3) */}
      <section aria-label="Aktivitas untuk Meraih Poin Berkah">
        <h2 className="mb-4 font-bold text-gray-900 text-lg tracking-tight sm:text-xl dark:text-white">
          Aktivitas Peraih Berkah
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Card 1: Absensi Berkah Harian */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950 dark:text-emerald-300">
                  <CalendarCheck aria-hidden="true" className="size-6" />
                </div>
                <span className="rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-700 text-xs dark:bg-amber-950/50 dark:text-amber-300">
                  +50 XP / Hari
                </span>
              </div>

              <h3 className="mt-3.5 font-bold text-base text-gray-900 dark:text-white">
                Absensi Berkah Harian
              </h3>
              <p className="mt-1 text-gray-500 text-xs leading-relaxed dark:text-slate-400">
                Check-in setiap hari untuk menjaga rentetan istiqamah dan
                melipatgandakan poin pahala kebaikan Anda.
              </p>
            </div>

            <div className="mt-5 pt-3">
              {sudahCheckIn ? (
                <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#e2ece8] py-2.5 font-semibold text-[#1d352d] text-xs dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-4 text-[#356152]"
                  />
                  <span>Sudah Absen Hari Ini</span>
                </div>
              ) : (
                <button
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] py-2.5 font-semibold text-white text-xs shadow-2xs transition-all hover:bg-[#2b4f43] active:scale-95 disabled:opacity-60"
                  disabled={
                    checkingIn || summaryResource.state.status !== 'success'
                  }
                  onClick={handleCheckIn}
                  type="button"
                >
                  {checkingIn ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Sparkles
                      aria-hidden="true"
                      className="size-4 text-amber-300"
                    />
                  )}
                  <span>Ambil +50 XP Hari Ini</span>
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Kuis Edukasi Syariah */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950 dark:text-emerald-300">
                  <BookOpen aria-hidden="true" className="size-6" />
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-[#356152] text-xs dark:bg-emerald-950/50 dark:text-emerald-300">
                  +100 XP
                </span>
              </div>

              <h3 className="mt-3.5 font-bold text-base text-gray-900 dark:text-white">
                Kuis Edukasi Syariah
              </h3>
              <p className="mt-1 text-gray-500 text-xs leading-relaxed dark:text-slate-400">
                Tingkatkan pemahaman fiqih zakat, wakaf produktif, dan faraidh
                melalui artikel serta kuis interaktif.
              </p>
            </div>

            <div className="mt-5 pt-3">
              <Link
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#356152] bg-white py-2.5 font-semibold text-[#356152] text-xs transition-colors hover:bg-[#f2f6f4] active:scale-95 dark:border-emerald-500 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-slate-800"
                to="/edukasi"
              >
                <span>Mulai Belajar &amp; Kuis</span>
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>

          {/* Card 3: Wakaf Produktif */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950 dark:text-emerald-300">
                  <Landmark aria-hidden="true" className="size-6" />
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-[#356152] text-xs dark:bg-emerald-950/50 dark:text-emerald-300">
                  +200 XP
                </span>
              </div>

              <h3 className="mt-3.5 font-bold text-base text-gray-900 dark:text-white">
                Wakaf Produktif
              </h3>
              <p className="mt-1 text-gray-500 text-xs leading-relaxed dark:text-slate-400">
                Salurkan wakaf dana abadi untuk fasilitas umum umat, raih pahala
                jariyah abadi dan poin keberkahan.
              </p>
            </div>

            <div className="mt-5 pt-3">
              <Link
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#356152] py-2.5 font-semibold text-white text-xs shadow-2xs transition-colors hover:bg-[#2b4f43] active:scale-95"
                to="/wakaf"
              >
                <span>Salurkan Wakaf Sekarang</span>
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Structured History List of XP */}
      <section aria-label="Riwayat Transaksi Poin">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-gray-900 text-lg tracking-tight sm:text-xl dark:text-white">
              Riwayat Aktivitas Poin
            </h2>
            {history && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600 text-xs dark:bg-slate-800 dark:text-slate-400">
                {history.items.length} aktivitas
              </span>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {historyResource.state.status === 'loading' && (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          )}

          {history && history.items.length === 0 && (
            <div className="p-10 text-center">
              <History
                aria-hidden="true"
                className="mx-auto mb-2 size-8 text-gray-400"
              />
              <p className="font-semibold text-gray-900 text-sm dark:text-white">
                Belum ada riwayat poin
              </p>
              <p className="mt-1 text-gray-400 text-xs">
                Poin akan otomatis tercatat setiap kali Anda check-in harian
                atau berdonasi.
              </p>
            </div>
          )}

          {history && history.items.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {history.items.map((entry) => (
                <li
                  className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50/80 sm:px-6 dark:hover:bg-slate-800/50"
                  key={entry.id}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950 dark:text-emerald-300">
                      <ActivityIcon activityType={entry.activityType} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm dark:text-white">
                        {activityLabel(entry.activityType)}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {formatPointsTimestamp(entry.createdAt)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'font-bold text-sm',
                      entry.points >= 0
                        ? 'text-[#356152] dark:text-emerald-400'
                        : 'text-rose-600'
                    )}
                  >
                    {formatPointsDelta(entry.points)} XP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
