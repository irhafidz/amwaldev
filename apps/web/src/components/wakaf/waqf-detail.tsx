'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getWaqfDonors, getWaqfProgram } from '@/lib/amwal-api';
import {
  formatRupiah,
  progressPercent,
  toNumber,
} from '@/lib/amwal-api/format';
import type { WaqfProgram } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { DescriptionToggle } from './description-toggle';
import { WakafBottomCta } from './wakaf-bottom-cta';
import { WakafHeader } from './wakaf-header';
import { WakafLedgerCard } from './wakaf-ledger-card';
import { WakafNazhirCard } from './wakaf-nazhir-card';
import { WakafProgressCard } from './wakaf-progress-card';
import { WakafShareButton } from './wakaf-share-button';
import { WakafStatsGrid } from './wakaf-stats-grid';
import { WakafTransparencyCard } from './wakaf-transparency-card';

const DEFAULT_DESCRIPTION =
  'Program wakaf ini diinisiasi untuk memberikan manfaat berkelanjutan dan bernilai jariyah yang tidak pernah terputus bagi umat.';

const QUICK_NOMINALS = [50_000, 100_000, 250_000, 500_000, 1_000_000];

interface WaqfDetailProps {
  programId: string;
  user: SessionUser | null;
}

export function WaqfDetail({ programId, user }: WaqfDetailProps) {
  const programResource = useResource(() => getWaqfProgram(programId), {
    enabled: Boolean(programId),
  });

  if (programResource.state.status === 'loading') {
    return (
      <output
        aria-label="Memuat detail program"
        className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center"
      >
        <LoaderCircle
          aria-hidden="true"
          className="mb-3 size-10 animate-spin text-[#356152]"
        />
        <p className="font-semibold text-gray-700 text-sm dark:text-slate-300">
          Memuat data program wakaf...
        </p>
        <p className="mt-1 text-gray-400 text-xs">
          Mengambil data ledger &amp; transparansi resmi BWI
        </p>
      </output>
    );
  }

  if (programResource.state.status === 'error') {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center p-5"
        role="alert"
      >
        <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-rose-200 bg-rose-50 px-6 py-12 text-center dark:border-rose-950 dark:bg-rose-950/30">
          <AlertTriangle
            aria-hidden="true"
            className="mb-2.5 size-10 text-rose-500"
          />
          <p className="font-bold text-base text-gray-900 dark:text-white">
            Program tidak dapat dimuat
          </p>
          <p className="mt-1.5 text-gray-600 text-xs dark:text-slate-400">
            {programResource.state.error}
          </p>
          <Button
            className="mt-5"
            onClick={programResource.reload}
            type="button"
            variant="outline"
          >
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  return <ProgramBody program={programResource.state.data} user={user} />;
}

function calculateSisaHari(
  createdAt?: string,
  durasiHari?: number | null
): number {
  if (!(createdAt && durasiHari)) {
    return durasiHari || 45;
  }
  const createdDate = new Date(createdAt);
  const endDate = new Date(
    createdDate.getTime() + durasiHari * 24 * 60 * 60 * 1000
  );
  const daysLeft = Math.ceil(
    (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return daysLeft > 0 ? daysLeft : 0;
}

function ProgramBody({
  program,
  user,
}: {
  program: WaqfProgram;
  user: SessionUser | null;
}) {
  const navigate = useNavigate();
  const donorResource = useResource(() => getWaqfDonors(program.id));
  const [selectedNominal, setSelectedNominal] = useState<number>(100_000);

  const pokokDanaTerkumpul = toNumber(
    program.principalLedger?.pokokDanaTerkumpul
  );
  const totalHasilAvailable = toNumber(
    program.principalLedger?.totalHasilAvailable
  );
  const hasilInvestasiTersalurkan = toNumber(
    program.principalLedger?.hasilInvestasiTersalurkan
  );
  const targetDana = toNumber(program.targetDana);
  const percent = progressPercent(
    program.principalLedger?.pokokDanaTerkumpul,
    program.targetDana
  );

  const totalWakif =
    donorResource.state.status === 'success'
      ? donorResource.state.data.length
      : 0;

  const locationParts = [
    program.kecamatan,
    program.kabupatenKota,
    program.provinsi,
  ].filter(Boolean);
  const locationHierarchy = locationParts.join(', ');

  const progressFisik = program.latestProgressFisik
    ? Math.round(Number(program.latestProgressFisik))
    : undefined;

  const sisaHari = calculateSisaHari(program.createdAt, program.durasiHari);

  const handleDonateNow = (nominalToUse = selectedNominal) => {
    navigate({
      to: '/wakaf/$programId/donate',
      params: { programId: program.id },
      search: { nominal: nominalToUse },
    });
  };

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Desktop Breadcrumbs (>= md) */}
      <nav
        aria-label="Breadcrumb"
        className="hidden items-center gap-2 text-gray-500 text-xs md:flex dark:text-slate-400"
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
        <span className="truncate font-semibold text-gray-900 dark:text-white">
          {program.judul}
        </span>
      </nav>

      {/* Main 2-Column Split Layout for Desktop / Single Column for Mobile */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* ================================================================= */}
        {/* LEFT COLUMN (approx 65% width / lg:col-span-8)                    */}
        {/* ================================================================= */}
        <div className="flex flex-col lg:col-span-8">
          {/* Mobile Header Hero (< md) */}
          <div className="-mx-4 -mt-4 mb-4 md:hidden">
            <WakafHeader bannerUrl={program.bannerUrl} judul={program.judul} />
          </div>

          {/* Desktop High-res Hero Image (>= md) */}
          <div className="relative mb-6 hidden h-[380px] w-full overflow-hidden rounded-3xl bg-slate-900 shadow-md md:block">
            {/* biome-ignore lint/performance/noImgElement: banner image */}
            <img
              alt={program.judul}
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
              decoding="async"
              loading="lazy"
              src={
                program.bannerUrl ||
                '/assets/images/wakaf/wakaf-pembangunan-masjid-al-furqon.png'
              }
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
            <div className="absolute top-4 right-4 z-20">
              <WakafShareButton judul={program.judul} variant="button" />
            </div>
            <div className="absolute bottom-4 left-4 z-20">
              <span className="inline-flex items-center rounded-lg bg-white/95 px-3 py-1 font-bold text-[#1d352d] text-xs shadow-xs backdrop-blur-sm dark:bg-slate-900/90 dark:text-emerald-300">
                {program.kategori || 'Wakaf Produktif'}
              </span>
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 md:hidden">
              <span className="inline-flex items-center rounded-full bg-[#e2ece8] px-3 py-1 font-bold text-[#1d352d] text-xs dark:bg-emerald-950 dark:text-emerald-300">
                {program.kategori || 'Wakaf'}
              </span>
            </div>

            <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl lg:text-4xl dark:text-white">
              {program.judul}
            </h1>

            {locationHierarchy && (
              <div className="mt-2 flex items-center gap-1.5 font-medium text-gray-500 text-xs sm:text-sm dark:text-slate-400">
                <MapPin className="size-4 shrink-0 text-[#356152] dark:text-emerald-400" />
                <span>{locationHierarchy}</span>
              </div>
            )}
          </div>

          {/* Metric Summary Pills: Clickable link to Donors view */}
          <WakafStatsGrid
            programId={program.id}
            targetPenerima={
              program.kategori?.includes('Pendidikan')
                ? '500+ Santri & Yatim'
                : 'Masyarakat Umum'
            }
            totalWakif={totalWakif}
          />

          {/* Mobile-only Progress Card (< md) */}
          <div className="mb-4 md:hidden">
            <WakafProgressCard
              createdAt={program.createdAt}
              durasiHari={program.durasiHari}
              progressFisik={progressFisik}
              target={targetDana}
              terkumpul={pokokDanaTerkumpul}
            />
          </div>

          {/* Ledger & Capaian Fisik Info Card */}
          <WakafLedgerCard
            hasilInvestasiTersalurkan={hasilInvestasiTersalurkan}
            jenisWakaf={program.jenisWakaf}
            pokokDanaTerkumpul={pokokDanaTerkumpul}
            totalHasilAvailable={totalHasilAvailable}
          />

          {/* Rich Narrative Description */}
          <div className="my-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-bold text-gray-900 text-lg sm:text-xl dark:text-white">
              Keterangan &amp; Rencana Program
            </h2>
            <DescriptionToggle
              text={program.deskripsi || DEFAULT_DESCRIPTION}
            />
          </div>

          {/* Nazhir Management Profile */}
          <div className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <WakafNazhirCard
              location={locationHierarchy}
              nazhir={program.nadzirProfile}
            />
          </div>

          {/* Transparansi, RAB & Legalitas Accordions */}
          <div className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <WakafTransparencyCard
              dokumenLegalitasUrl={program.dokumenLegalitasUrl}
              programTitle={program.judul}
              progressReports={program.progressReports}
              rabDocumentUrl={program.rabDocumentUrl}
              receipts={program.receipts}
            />
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN (approx 35% width / lg:col-span-4 - Sticky Card)     */}
        {/* ================================================================= */}
        <DesktopDonateSidebar
          onDonate={handleDonateNow}
          onSelectNominal={setSelectedNominal}
          percent={percent}
          pokokDanaTerkumpul={pokokDanaTerkumpul}
          program={program}
          selectedNominal={selectedNominal}
          sisaHari={sisaHari}
          targetDana={targetDana}
        />
      </div>

      {/* Mobile-only Bottom CTA Bar (< md) */}
      <div className="md:hidden">
        <WakafBottomCta
          isCompleted={program.status === 'SELESAI'}
          isLoggedIn={Boolean(user)}
          nominal={selectedNominal}
          programId={program.id}
        />
      </div>
    </div>
  );
}

function DesktopDonateSidebar({
  program,
  pokokDanaTerkumpul,
  targetDana,
  percent,
  sisaHari,
  selectedNominal,
  onSelectNominal,
  onDonate,
}: {
  program: WaqfProgram;
  pokokDanaTerkumpul: number;
  targetDana: number;
  percent: number;
  sisaHari: number;
  selectedNominal: number;
  onSelectNominal: (nom: number) => void;
  onDonate: (nominal?: number) => void;
}) {
  return (
    <aside className="hidden lg:col-span-4 lg:block">
      <div className="sticky top-6 flex flex-col gap-4">
        {/* Main Donation Action Card */}
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
              TERKUMPUL
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-extrabold text-3xl text-[#356152] tracking-tight dark:text-emerald-400">
                {formatRupiah(pokokDanaTerkumpul)}
              </span>
            </div>
            <p className="mt-1 text-gray-500 text-xs dark:text-slate-400">
              dari target{' '}
              <strong className="text-gray-800 dark:text-slate-200">
                {formatRupiah(targetDana)}
              </strong>
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[#356152] transition-all duration-1000 ease-out"
              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>

          <div className="mb-6 flex items-center justify-between text-gray-500 text-xs dark:text-slate-400">
            <span className="font-semibold text-gray-700 dark:text-slate-200">
              {percent}% tercapai
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5 text-gray-400" />
              <span>{sisaHari > 0 ? `${sisaHari} hari lagi` : 'Selesai'}</span>
            </span>
          </div>

          {/* Quick Nominal Select Grid */}
          <div className="mb-6 border-gray-100 border-t pt-5 dark:border-slate-800">
            <p className="mb-3 font-semibold text-gray-700 text-xs dark:text-slate-300">
              Pilih Nominal Wakaf
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_NOMINALS.map((nom) => {
                const isSelected = selectedNominal === nom;
                return (
                  <button
                    className={`cursor-pointer rounded-xl py-2.5 font-bold text-xs transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-[#356152] text-white shadow-xs'
                        : 'border border-gray-200 bg-white text-gray-700 hover:border-[#356152]/40 hover:bg-[#f2f6f4] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                    key={nom}
                    onClick={() => onSelectNominal(nom)}
                    type="button"
                  >
                    {formatRupiah(nom)}
                  </button>
                );
              })}
              <button
                className={`cursor-pointer rounded-xl py-2.5 font-bold text-xs transition-all active:scale-95 ${
                  QUICK_NOMINALS.includes(selectedNominal)
                    ? 'border border-gray-200 bg-white text-gray-700 hover:border-[#356152]/40 hover:bg-[#f2f6f4] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-[#356152] text-white shadow-xs'
                }`}
                onClick={() => onDonate(0)}
                type="button"
              >
                Lainnya
              </button>
            </div>
          </div>

          {/* Primary Action Button */}
          <Button
            className="h-12 w-full bg-[#356152] font-bold text-base text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.99]"
            disabled={program.status === 'SELESAI'}
            onClick={() => onDonate(selectedNominal)}
            size="lg"
            type="button"
          >
            <Heart className="size-4 shrink-0 fill-white" />
            <span>
              {program.status === 'SELESAI'
                ? 'Target Terpenuhi'
                : 'Wakaf Sekarang'}
            </span>
          </Button>

          {/* Social Share Buttons */}
          <div className="mt-5 border-gray-100 border-t pt-4 text-center dark:border-slate-800">
            <p className="mb-2 text-[11px] text-gray-400">
              Ajak teman &amp; keluarga mengalirkan amal jariyah:
            </p>
            <WakafShareButton
              className="w-full justify-center"
              judul={program.judul}
              variant="button"
            />
          </div>
        </div>

        {/* CS Assistance WhatsApp Card */}
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2ece8] bg-[#f2f6f4] p-4 text-[#1d352d] dark:border-[#2b4f43]/40 dark:bg-[#1d352d]/40 dark:text-emerald-200">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#356152] shadow-2xs dark:bg-slate-800 dark:text-emerald-400">
            <MessageCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs">Butuh bantuan berwakaf?</p>
            <p className="text-[11px] text-gray-600 dark:text-slate-300">
              Konsultasikan akad &amp; niat wakaf Anda dengan tim kami.
            </p>
          </div>
          <a
            className="shrink-0 rounded-lg bg-[#356152] px-3 py-1.5 font-bold text-white text-xs shadow-2xs hover:bg-[#2b4f43]"
            href={`https://wa.me/6281234567890?text=Assalamualaikum%20Amwal,%20saya%20ingin%20berkonsultasi%20mengenai%20program%20wakaf%20${encodeURIComponent(program.judul)}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            Chat CS
          </a>
        </div>
      </div>
    </aside>
  );
}
