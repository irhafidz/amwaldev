'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import {
  Award,
  Beef,
  Bell,
  Calculator,
  CheckCircle2,
  ChevronRight,
  HandCoins,
  HandHeart,
  Heart,
  LoaderCircle,
  LogIn,
  type LucideIcon,
  Newspaper,
  Search,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  loadPointsSummary,
  submitCheckIn,
} from '@/components/gamification/points-api';
import { DeviceOrdersList } from '@/components/payment/device-orders-list';
import { Button } from '@/components/ui/button';
import { GreenPatternOverlay } from '@/components/ui/green-pattern-overlay';
import { WaqfProgramCard } from '@/components/wakaf/program-card';
import {
  getActiveWaqfPrograms,
  getLatestNews,
  getMyTransactions,
  getNotifications,
} from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import { STALE_PROGRAMS_MS } from '@/lib/amwal-api/resource-cache';
import type { WaqfProgram } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { formatWibDate } from '@/lib/format-wib';
import { makeExcerpt } from '@/lib/text/excerpt';
import { cn } from '@/lib/utils';
import {
  categoryCounts,
  levelProgress,
  pickFeaturedProgram,
} from './dashboard-data';
import { GuestImpactStats } from './guest-impact-stats';

interface DashboardHomeProps {
  user?: SessionUser | null;
}

export function DashboardHome({ user = null }: DashboardHomeProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');

  const pointsSummary = useResource(loadPointsSummary, {
    enabled: Boolean(user),
  });
  const programs = useResource(getActiveWaqfPrograms, {
    key: 'waqf:programs:active',
    staleTime: STALE_PROGRAMS_MS,
  });
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await submitCheckIn();
      pointsSummary.reload();
    } catch {
      // The full check-in flow lives on /dashboard/poin-berkah
    } finally {
      setClaiming(false);
    }
  };

  const pointsData =
    pointsSummary.state.status === 'success' ? pointsSummary.state.data : null;
  // Fresh accounts (and guests) simply have no points yet.
  const saldo = pointsData ? pointsData.saldo : 0;
  const sudahCheckIn = pointsData ? pointsData.sudahCheckInHariIni : false;
  const programList =
    programs.state.status === 'success' ? programs.state.data : [];
  const featured = useMemo(
    () => pickFeaturedProgram(programList),
    [programList]
  );

  return (
    <div className="flex w-full flex-col gap-5">
      {/* 1. Header (Mobile: search+bell+avatar; Desktop: greeting + search+bell+avatar) */}
      <DashboardHeader user={user} />

      {/* 2. Mobile Poin Berkah Strip (< md) */}
      <MobilePointsStrip
        claiming={claiming}
        onClaim={handleClaim}
        saldo={saldo}
        sudahCheckIn={sudahCheckIn}
      />

      {/* 3. Hero Banner (featured program) */}
      <HeroBanner featured={featured} />

      {/* 4. Mobile 5-icon Quick Menu (< md) */}
      <MobileQuickMenu />

      {/* 5. Tamu: statistik dampak publik; donatur: kartu pribadi (desktop) */}
      {user ? null : <GuestImpactStats />}
      <div className="hidden md:block">
        {user ? (
          <MetricStatsRow
            claiming={claiming}
            onClaim={handleClaim}
            pointsLoading={
              Boolean(user) && pointsSummary.state.status !== 'success'
            }
            saldo={saldo}
            sudahCheckIn={sudahCheckIn}
            user={user}
          />
        ) : null}
      </div>

      {/* 6. Desktop Quick Filter Category Pills (>= md) */}
      <div className="hidden md:block">
        <CategoryFilterPills
          onSelectCategory={setSelectedCategory}
          programs={programList}
          selectedCategory={selectedCategory}
        />
      </div>

      {/* 7. Pernah Anda Donasikan */}
      <RecentDonationsSection user={user} />

      {/* 8. Berita Terbaru */}
      <LatestNewsSection />

      {/* 9. Program Wakaf Pilihan */}
      <FeaturedProgramsSection
        programs={programs}
        selectedCategory={selectedCategory}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Header Component                                                        */
/* -------------------------------------------------------------------------- */

function DashboardHeader({ user }: { user: SessionUser | null }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const notifications = useResource(getNotifications, {
    enabled: Boolean(user),
  });
  const hasUnread =
    notifications.state.status === 'success' &&
    notifications.state.data.some((item) => !item.isRead);

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      navigate({
        to: '/dashboard/search',
        search: { q: query },
      });
    } else {
      navigate({ to: '/dashboard/search' });
    }
  };

  const displayName = user?.name ? user.name : 'Hamba Allah';

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      {/* Greeting (Desktop Only) */}
      <div className="hidden md:block">
        <h1 className="font-bold text-gray-900 text-xl tracking-tight sm:text-2xl lg:text-3xl dark:text-white">
          Assalamualaikum, {displayName} 👋
        </h1>
        <p className="mt-0.5 text-gray-500 text-xs sm:text-sm dark:text-slate-400">
          Mari tebarkan kebaikan dan alirkan pahala jariyah hari ini.
        </p>
      </div>

      {/* Search Bar + Bell + Profile (Horizontal Row on Mobile & Desktop) */}
      <div className="flex w-full items-center gap-2.5 sm:gap-3 md:w-auto">
        {/* Search Bar */}
        <form
          className="relative flex-1 md:w-72 lg:w-80"
          onSubmit={handleSearchSubmit}
        >
          <Search
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3.5 size-4 text-gray-400"
          />
          <input
            aria-label="Cari program kebaikan"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-gray-900 text-xs shadow-2xs transition-all placeholder:text-gray-400 focus:border-[#356152] focus:outline-none focus:ring-2 focus:ring-[#356152]/20 sm:text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cari program..."
            type="text"
            value={searchQuery}
          />
        </form>

        {/* Quick Notification Action */}
        <Link
          aria-label={
            hasUnread ? 'Notifikasi (ada yang belum dibaca)' : 'Notifikasi'
          }
          className="relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-2xs transition-all hover:bg-gray-50 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          to="/notifikasi"
        >
          <Bell aria-hidden="true" className="size-5" />
          {hasUnread && (
            <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
          )}
        </Link>

        {/* Quick Profile / Login Action */}
        {user ? (
          <Link
            aria-label="Profil Pengguna"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-tr from-[#356152] to-emerald-600 font-bold text-sm text-white shadow-2xs transition-transform active:scale-95"
            to="/profil"
          >
            {user.name ? user.name.slice(0, 2).toUpperCase() : 'WA'}
          </Link>
        ) : (
          <Link
            className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#356152] px-3.5 font-semibold text-white text-xs shadow-xs transition-colors hover:bg-[#2b4f43] sm:text-sm"
            to="/masuk"
          >
            <LogIn aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Masuk</span>
          </Link>
        )}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Mobile Points Strip (Figma: Poin Berkah Strip)                          */
/* -------------------------------------------------------------------------- */

function MobilePointsStrip({
  saldo,
  sudahCheckIn,
  claiming,
  onClaim,
}: {
  saldo: number;
  sudahCheckIn: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  return (
    <div className="relative isolate flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#356152] p-3.5 text-white shadow-sm md:hidden">
      <GreenPatternOverlay size="sm" />
      <Link
        className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5"
        to="/dashboard/poin-berkah"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Sparkles aria-hidden="true" className="size-4 text-amber-300" />
        </div>
        <div className="min-w-0">
          <span className="block font-bold text-[10px] text-white/75 uppercase tracking-wider">
            POIN BERKAH ANDA
          </span>
          <div className="flex items-baseline gap-1">
            <span className="font-extrabold text-base text-white tracking-tight">
              {saldo.toLocaleString('id-ID')}
            </span>
            <span className="font-bold text-white/80 text-xs">XP</span>
            <ChevronRight
              aria-hidden="true"
              className="ml-0.5 size-3 text-white/60"
            />
          </div>
        </div>
      </Link>

      <div className="relative z-10 shrink-0">
        {sudahCheckIn ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e2ece8] px-3 py-1.5 font-bold text-[#1d352d] text-[11px]">
            <CheckCircle2
              aria-hidden="true"
              className="size-3.5 text-[#356152]"
            />
            <span>Sudah Absen Hari ini</span>
          </div>
        ) : (
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-bold text-[#1d352d] text-[11px] shadow-xs transition-all hover:bg-emerald-50 active:scale-95 disabled:opacity-60"
            disabled={claiming}
            onClick={onClaim}
            type="button"
          >
            {claiming ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin text-[#356152]"
              />
            ) : (
              <Sparkles
                aria-hidden="true"
                className="size-3.5 text-amber-500"
              />
            )}
            <span>Absen +50 XP</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Hero Banner (featured program, #356152 to #1d352d)                      */
/* -------------------------------------------------------------------------- */

interface Slide {
  title: string;
  subtitle: string;
  tag: string;
  cta: string;
  bgGradient: string;
  /** Set for the featured-program slide; otherwise `to` is used. */
  programId?: string;
  to: '/wakaf' | '/infaq' | '/qurban';
}

function buildSlides(featured: WaqfProgram | null): Slide[] {
  const lead: Slide = featured
    ? {
        title: featured.judul,
        subtitle:
          makeExcerpt(featured.deskripsi, 120) ||
          'Salurkan kebaikan melalui program wakaf bersertifikat resmi.',
        tag: 'Pilihan Pekan Ini',
        cta: 'Donasi Sekarang',
        programId: featured.id,
        to: '/wakaf',
        bgGradient: 'from-[#356152] via-[#2b4f43] to-[#1d352d]',
      }
    : {
        title: 'Infaq & Sedekah Berkah',
        subtitle:
          'Alirkan sedekah jariyah secara rutin untuk kebaikan umat dan pendidikan santri.',
        tag: 'Amal Jariyah',
        cta: 'Infaq Sekarang',
        to: '/infaq',
        bgGradient: 'from-[#356152] via-[#2b4f43] to-[#1d352d]',
      };
  return [
    lead,
    {
      title: 'Wakaf Produktif',
      subtitle:
        'Amal jariyah berkelanjutan yang terus mengalirkan manfaat bagi umat.',
      tag: 'Wakaf',
      cta: 'Lihat Program',
      to: '/wakaf',
      bgGradient: 'from-[#2b4f43] via-[#1d352d] to-[#12241e]',
    },
    {
      title: 'Persiapkan Qurban Terbaik Anda',
      subtitle:
        'Pilih paket hewan qurban dan salurkan kebaikannya hingga pelosok negeri.',
      tag: 'Qurban',
      cta: 'Pilih Hewan',
      to: '/qurban',
      bgGradient: 'from-[#356152] via-[#244338] to-[#162e26]',
    },
  ];
}

const HERO_CTA_CLASS =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 font-bold text-[#1d352d] text-xs shadow-md transition-all hover:bg-emerald-50 active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm';

function HeroBanner({ featured }: { featured: WaqfProgram | null }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = useMemo(() => buildSlides(featured), [featured]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const slide = slides[currentSlide] ?? slides[0];
  if (!slide) {
    return null;
  }

  return (
    <section
      aria-label="Promosi dan Program Unggulan"
      className="relative w-full overflow-hidden"
    >
      <div
        className={cn(
          'relative isolate min-h-[175px] w-full overflow-hidden rounded-2xl px-6 py-5 text-white transition-all duration-700 sm:min-h-[220px] sm:px-8 sm:py-6',
          `bg-gradient-to-r ${slide.bgGradient}`
        )}
      >
        <GreenPatternOverlay size="lg" />

        <div className="relative z-10 flex max-w-2xl flex-col justify-between">
          <div>
            <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 font-semibold text-[11px] uppercase tracking-wider backdrop-blur-md">
              <Sparkles
                aria-hidden="true"
                className="size-3.5 text-amber-300"
              />
              {slide.tag}
            </span>
            <h2 className="line-clamp-2 font-extrabold text-xl leading-tight tracking-tight sm:text-3xl">
              {slide.title}
            </h2>
            <p className="mt-1 line-clamp-2 max-w-xl font-normal text-white/90 text-xs sm:mt-1.5 sm:text-sm">
              {slide.subtitle}
            </p>
          </div>

          <div className="mt-4 sm:mt-5">
            {slide.programId ? (
              <Link
                className={HERO_CTA_CLASS}
                params={{ programId: slide.programId }}
                to="/wakaf/$programId"
              >
                <span>{slide.cta}</span>
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            ) : (
              <Link className={HERO_CTA_CLASS} to={slide.to}>
                <span>{slide.cta}</span>
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Carousel indicators inside card (Desktop Only) */}
        <div className="absolute right-6 bottom-6 z-20 hidden items-center gap-1.5 md:flex">
          {slides.map((item, index) => (
            <button
              aria-label={`Slide ${index + 1}`}
              className={cn(
                'h-2 cursor-pointer rounded-full transition-all',
                index === currentSlide
                  ? 'w-6 bg-white'
                  : 'w-2 bg-white/40 hover:bg-white/70'
              )}
              key={item.tag}
              onClick={() => setCurrentSlide(index)}
              type="button"
            />
          ))}
        </div>
      </div>

      {/* Carousel dots indicator underneath (Mobile Only) */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 md:hidden">
        {slides.map((item, index) => (
          <button
            aria-label={`Slide ${index + 1}`}
            className={cn(
              'h-1.5 cursor-pointer rounded-full transition-all',
              index === currentSlide
                ? 'w-5 bg-[#356152]'
                : 'w-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700'
            )}
            key={item.tag}
            onClick={() => setCurrentSlide(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Mobile 5-icon Quick Menu (Wakaf, Zakat, Infaq, Qurban, Berita)          */
/* -------------------------------------------------------------------------- */

interface QuickAction {
  name: string;
  to: '/wakaf' | '/zakat' | '/infaq' | '/qurban' | '/berita';
  icon: LucideIcon;
}

// One icon family on purpose: the old PNG menu assets carried their own
// (lime) green and stroke weight, which made the row look inconsistent.
const QUICK_ACTIONS: QuickAction[] = [
  { name: 'Wakaf', to: '/wakaf', icon: HandHeart },
  { name: 'Zakat', to: '/zakat', icon: Calculator },
  { name: 'Infaq', to: '/infaq', icon: HandCoins },
  { name: 'Qurban', to: '/qurban', icon: Beef },
  { name: 'Berita', to: '/berita', icon: Newspaper },
];

function MobileQuickMenu() {
  return (
    <section aria-label="Menu Kategori Cepat" className="my-1 md:hidden">
      <div className="grid grid-cols-5 gap-2 text-center">
        {QUICK_ACTIONS.map(({ name, to, icon: Icon }) => (
          <Link
            className="group flex min-w-0 cursor-pointer flex-col items-center"
            key={name}
            to={to}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#356152]/15 bg-[#356152]/10 transition-all group-hover:bg-[#356152]/20 group-active:scale-95">
              <Icon
                aria-hidden="true"
                className="h-6 w-6 text-[#356152]"
                strokeWidth={1.75}
              />
            </div>
            <span className="mt-1.5 w-full truncate text-center font-medium text-slate-700 text-xs dark:text-slate-200">
              {name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Metric Stats Row (3 Cards, Desktop Only)                                */
/* -------------------------------------------------------------------------- */

function MetricStatsRow({
  user,
  saldo,
  sudahCheckIn,
  claiming,
  onClaim,
  pointsLoading,
}: {
  user: SessionUser | null;
  saldo: number;
  sudahCheckIn: boolean;
  claiming: boolean;
  onClaim: () => void;
  pointsLoading: boolean;
}) {
  const transactionsResource = useResource(getMyTransactions, {
    enabled: Boolean(user),
  });

  // Calculate Total Donasi
  const totalDonasi = useMemo(() => {
    if (transactionsResource.state.status !== 'success') {
      return 0;
    }
    const items = transactionsResource.state.data;
    return items
      .filter(
        (t) => t.statusPembayaran === 'LUNAS' || t.status === 'TERVERIFIKASI'
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactionsResource.state]);

  const txCount = useMemo(() => {
    if (transactionsResource.state.status !== 'success') {
      return 0;
    }
    return transactionsResource.state.data.filter(
      (t) => t.statusPembayaran === 'LUNAS' || t.status === 'TERVERIFIKASI'
    ).length;
  }, [transactionsResource.state]);

  // Tier + progress are derived from the XP balance, not fixed numbers.
  const levelInfo = useMemo(() => levelProgress(saldo), [saldo]);

  return (
    <section aria-label="Statistik dan Pencapaian Donatur">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Card 1: XP Berkah + Absen Button */}
        <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-500 text-xs dark:text-slate-400">
                Poin Berkah Anda
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
                  {saldo.toLocaleString('id-ID')}
                </span>
                <span className="font-bold text-[#356152] text-xs">XP</span>
              </div>
            </div>

            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950/60 dark:text-emerald-300">
              <Trophy aria-hidden="true" className="size-5" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-gray-100 border-t pt-3 dark:border-slate-800">
            {sudahCheckIn ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#e2ece8] px-2.5 py-1 font-semibold text-[#1d352d] text-xs dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2
                  aria-hidden="true"
                  className="size-3.5 text-[#356152]"
                />
                <span>Sudah Absen</span>
              </div>
            ) : (
              <button
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#356152] px-3 py-1 font-semibold text-white text-xs shadow-2xs transition-all hover:bg-[#2b4f43] active:scale-95 disabled:opacity-60"
                disabled={claiming || pointsLoading}
                onClick={onClaim}
                type="button"
              >
                {claiming ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                ) : (
                  <Sparkles
                    aria-hidden="true"
                    className="size-3.5 text-amber-300"
                  />
                )}
                <span>Absen +50 XP</span>
              </button>
            )}

            <Link
              className="font-medium text-[#356152] text-xs transition-colors hover:underline dark:text-emerald-400"
              to="/dashboard/poin-berkah"
            >
              Detail Poin →
            </Link>
          </div>
        </div>

        {/* Card 2: Total Donasi */}
        <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-500 text-xs dark:text-slate-400">
                Total Donasi Tersalurkan
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
                  {formatRupiah(totalDonasi)}
                </span>
              </div>
            </div>

            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950/60 dark:text-emerald-300">
              <Wallet aria-hidden="true" className="size-5" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-gray-100 border-t pt-3 dark:border-slate-800">
            <span className="text-gray-500 text-xs dark:text-slate-400">
              {txCount} Transaksi Berhasil
            </span>

            <Link
              className="font-medium text-[#356152] text-xs transition-colors hover:underline dark:text-emerald-400"
              to="/riwayat"
            >
              Riwayat Donasi →
            </Link>
          </div>
        </div>

        {/* Card 3: Level Donatur */}
        <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-500 text-xs dark:text-slate-400">
                Tingkat Kedermawanan
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
                  {levelInfo.title}
                </span>
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-[#1d352d] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
                  Lv. {levelInfo.level}
                </span>
              </div>
            </div>

            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950/60 dark:text-emerald-300">
              <Award aria-hidden="true" className="size-5" />
            </div>
          </div>

          <div className="mt-4 border-gray-100 border-t pt-3 dark:border-slate-800">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-slate-400">
                Target {levelInfo.nextTarget.toLocaleString('id-ID')} XP
              </span>
              <span className="font-semibold text-[#356152] dark:text-emerald-400">
                {levelInfo.progress}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[#356152] transition-all duration-500"
                style={{ width: `${levelInfo.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Category Filter Pills (counts come from the active programs)            */
/* -------------------------------------------------------------------------- */

function CategoryFilterPills({
  programs,
  selectedCategory,
  onSelectCategory,
}: {
  programs: readonly WaqfProgram[];
  selectedCategory: string;
  onSelectCategory: (name: string) => void;
}) {
  const items = useMemo(
    () => [
      { name: 'Semua', count: programs.length },
      ...categoryCounts(programs),
    ],
    [programs]
  );

  // Nothing to filter by until at least one program carries a category.
  if (items.length < 2) {
    return null;
  }

  return (
    <section aria-label="Filter Kategori Cepat">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const active = selectedCategory === item.name;
          return (
            <button
              aria-pressed={active}
              className={cn(
                'flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 font-medium text-xs transition-all sm:text-sm',
                active
                  ? 'bg-[#356152] font-semibold text-white shadow-xs'
                  : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
              key={item.name}
              onClick={() => onSelectCategory(item.name)}
              type="button"
            >
              <span>{item.name}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px]',
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. Pernah Anda Donasikan                                                   */
/* -------------------------------------------------------------------------- */

const RECENT_LIMIT = 2;

function RecentDonationsSection({ user }: { user: SessionUser | null }) {
  const resource = useResource(getMyTransactions, { enabled: Boolean(user) });

  const successfulDonations = useMemo(() => {
    if (resource.state.status !== 'success') {
      return [];
    }
    return resource.state.data
      .filter(
        (t) => t.statusPembayaran === 'LUNAS' || t.status === 'TERVERIFIKASI'
      )
      .slice(0, RECENT_LIMIT);
  }, [resource.state]);

  const loading = Boolean(user) && resource.state.status === 'loading';

  return (
    <section aria-label="Program yang Pernah Anda Donasikan">
      <div className="mb-3 flex items-center justify-between sm:mb-3.5">
        <h2 className="font-bold text-base text-gray-900 tracking-tight sm:text-xl dark:text-white">
          Pernah Anda Donasikan
        </h2>
        <Link
          className="flex cursor-pointer items-center gap-1 font-semibold text-[#356152] text-xs transition-colors hover:underline sm:text-sm dark:text-emerald-400"
          to="/riwayat"
        >
          <span>Lihat Riwayat</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {loading && (
        <p className="rounded-2xl border border-gray-100 bg-white p-5 text-center text-gray-400 text-xs dark:border-slate-800 dark:bg-slate-900">
          Memuat riwayat donasi…
        </p>
      )}

      {!loading && successfulDonations.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {successfulDonations.map((item) => (
            <Link
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-xs transition-all hover:border-emerald-200 hover:shadow-md sm:p-4 dark:border-slate-800 dark:bg-slate-900"
              key={item.id}
              params={{ transactionId: item.id }}
              to="/riwayat/$transactionId"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152] dark:bg-emerald-950 dark:text-emerald-300">
                  <Heart aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="line-clamp-1 font-semibold text-gray-900 text-sm transition-colors group-hover:text-[#356152] dark:text-white dark:group-hover:text-emerald-400">
                    {item.programTitle || 'Donasi Kebaikan Amwal'}
                  </h3>
                  <p className="mt-0.5 text-gray-400 text-xs">
                    {formatWibDate(item.createdAt)}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="font-bold text-[#356152] text-sm dark:text-emerald-400">
                  {formatRupiah(Number(item.amount) || 0)}
                </span>
                <span className="mt-1 block rounded-md bg-[#e2ece8] px-2 py-0.5 text-center font-medium text-[#1d352d] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
                  Lunas
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!user && <DeviceOrdersList limit={RECENT_LIMIT + 1} />}

      {!loading && successfulDonations.length === 0 && (
        <div className="rounded-2xl border border-gray-200 border-dashed bg-white/50 p-5 text-center sm:p-6 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="font-medium text-gray-600 text-xs sm:text-sm dark:text-slate-300">
            {user
              ? 'Belum ada riwayat donasi. Mulai langkah berkah pertama Anda!'
              : 'Masuk untuk melihat riwayat donasi Anda.'}
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#356152] px-3.5 py-1.5 font-semibold text-white text-xs shadow-2xs hover:bg-[#2b4f43] sm:px-4 sm:py-2"
            to={user ? '/wakaf' : '/masuk'}
          >
            <span>{user ? 'Donasi Sekarang' : 'Masuk'}</span>
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Berita Terbaru                                                          */
/* -------------------------------------------------------------------------- */

function LatestNewsSection() {
  const { state, reload } = useResource(() => getLatestNews(5));

  return (
    <section aria-label="Berita Terbaru">
      <div className="mb-3 flex items-center justify-between sm:mb-3.5">
        <h2 className="font-bold text-base text-gray-900 tracking-tight sm:text-xl dark:text-white">
          Berita Terbaru
        </h2>
        <Link
          className="flex cursor-pointer items-center gap-1 font-semibold text-[#356152] text-xs transition-colors hover:underline sm:text-sm dark:text-emerald-400"
          to="/berita"
        >
          <span>Lihat Semua</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {state.status === 'loading' && (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
          {['n1', 'n2', 'n3'].map((key) => (
            <div
              className="h-56 w-64 shrink-0 animate-pulse rounded-2xl bg-gray-100 dark:bg-slate-800"
              key={key}
            />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-xs dark:border-rose-950 dark:bg-rose-950/30"
          role="alert"
        >
          <span>Berita tidak dapat dimuat.</span>
          <Button onClick={reload} size="sm" type="button" variant="outline">
            Coba lagi
          </Button>
        </div>
      )}

      {state.status === 'success' && state.data.length === 0 && (
        <div className="rounded-2xl border border-gray-200 border-dashed bg-white/50 p-6 text-center text-gray-500 text-xs dark:border-slate-800 dark:bg-slate-900/50">
          Belum ada berita yang diterbitkan.
        </div>
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:gap-4 md:px-0">
          {state.data.map((item) => (
            <Link
              className="group flex w-64 shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs transition-all hover:border-emerald-200 hover:shadow-md active:scale-98 md:w-72 dark:border-slate-800 dark:bg-slate-900"
              key={item.id}
              params={{ id: item.id }}
              to="/berita/$id"
            >
              <div className="relative h-32 w-full overflow-hidden bg-[#f2f6f4] dark:bg-slate-800">
                {item.thumbnailUrl ? (
                  /* biome-ignore lint/performance/noImgElement: dynamic admin-supplied cover */
                  <img
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    src={item.thumbnailUrl}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#356152]/50">
                    <Newspaper aria-hidden="true" className="size-9" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-3.5">
                <div>
                  {item.kategori && (
                    <span className="mb-1 inline-block rounded-md bg-[#e2ece8] px-2 py-0.5 font-semibold text-[#1d352d] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
                      {item.kategori}
                    </span>
                  )}
                  <h3 className="line-clamp-2 font-bold text-gray-900 text-sm leading-snug transition-colors group-hover:text-[#356152] dark:text-white dark:group-hover:text-emerald-400">
                    {item.title}
                  </h3>
                  {item.excerpt && (
                    <p className="mt-1 line-clamp-2 text-gray-500 text-xs dark:text-slate-400">
                      {item.excerpt}
                    </p>
                  )}
                </div>
                <span className="mt-2.5 text-gray-400 text-xs">
                  {formatWibDate(item.publishedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 9. Program Wakaf Pilihan                                                   */
/* -------------------------------------------------------------------------- */

function FeaturedProgramsSection({
  programs,
  selectedCategory,
}: {
  programs: ReturnType<typeof useResource<WaqfProgram[]>>;
  selectedCategory: string;
}) {
  const { state, reload } = programs;

  const filteredPrograms = useMemo(() => {
    if (state.status !== 'success') {
      return [];
    }
    if (selectedCategory === 'Semua') {
      return state.data;
    }
    return state.data.filter((p) => p.kategori?.trim() === selectedCategory);
  }, [state, selectedCategory]);

  return (
    <section aria-label="Daftar Program Wakaf Pilihan">
      <div className="mb-3 flex items-center justify-between sm:mb-3.5">
        <div>
          <h2 className="font-bold text-base text-gray-900 tracking-tight sm:text-xl dark:text-white">
            Program Wakaf Pilihan
          </h2>
          <p className="hidden text-gray-500 text-xs sm:block dark:text-slate-400">
            Salurkan kebaikan melalui program bersertifikat resmi dan
            terverifikasi BWI
          </p>
        </div>

        <Link
          className="flex cursor-pointer items-center gap-1 font-semibold text-[#356152] text-xs transition-colors hover:underline sm:text-sm dark:text-emerald-400"
          to="/wakaf"
        >
          <span>Lihat Semua Program</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {state.status === 'loading' && (
        <output
          aria-label="Memuat program wakaf"
          className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-900"
        >
          <LoaderCircle
            aria-hidden="true"
            className="mb-2 size-8 animate-spin text-[#356152]"
          />
          <p className="text-gray-400 text-xs">
            Memuat program wakaf pilihan...
          </p>
        </output>
      )}

      {state.status === 'error' && (
        <div
          className="flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center dark:border-rose-950 dark:bg-rose-950/30"
          role="alert"
        >
          <p className="font-semibold text-gray-900 text-sm dark:text-white">
            Program tidak dapat dimuat
          </p>
          <Button
            className="mt-3"
            onClick={reload}
            size="sm"
            type="button"
            variant="outline"
          >
            Coba lagi
          </Button>
        </div>
      )}

      {state.status === 'success' && filteredPrograms.length === 0 && (
        <div className="rounded-2xl border border-gray-200 border-dashed bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-gray-400 text-xs">
            Belum ada program untuk kategori ini.
          </p>
        </div>
      )}

      {state.status === 'success' && filteredPrograms.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {filteredPrograms.map((program) => (
            <WaqfProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </section>
  );
}
