'use client';

import {
  AlertTriangle,
  Camera,
  HeartHandshake,
  Info,
  LoaderCircle,
  SearchX,
  ShieldCheck,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GreenPatternOverlay } from '@/components/ui/green-pattern-overlay';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { getQurbanBatches } from '@/lib/amwal-api';
import type { QurbanBatch } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import { QurbanBatchCard } from './qurban-batch-card';
import { isKolektif, remainingSlots } from './qurban-shared';

type Tab = 'KAMBING' | 'SAPI';
type Mode = 'KOLEKTIF' | 'INDIVIDU';

const STEPS = [
  'Pilih paket & isi nama shohibul',
  'Bayar patungan via QRIS/VA',
  'Terima dokumentasi sembelih H+2',
];

const VALUE_PROPS = [
  {
    icon: HeartHandshake,
    title: '100% Tersalurkan',
    text: 'Seluruh daging sampai ke penerima manfaat di pelosok negeri.',
  },
  {
    icon: Camera,
    title: 'Dokumentasi Foto & Video',
    text: 'Laporan penyembelihan dikirim langsung ke WhatsApp Anda.',
  },
  {
    icon: ShieldCheck,
    title: 'Sesuai Syariah',
    text: 'Hewan sehat, cukup umur, disembelih sesuai tuntunan.',
  },
];

function matches(batch: QurbanBatch, tab: Tab, mode: Mode): boolean {
  if (batch.jenisHewan !== tab) {
    return false;
  }
  if (tab === 'KAMBING') {
    return true;
  }
  return mode === 'KOLEKTIF' ? isKolektif(batch) : !isKolektif(batch);
}

export function QurbanCatalog() {
  const [tab, setTab] = useState<Tab>('KAMBING');
  const [mode, setMode] = useState<Mode>('KOLEKTIF');
  const resource = useResource(() => getQurbanBatches());
  const allBatches =
    resource.state.status === 'success' ? resource.state.data : [];
  const batches = allBatches.filter((batch) => matches(batch, tab, mode));

  // Hitungan hanya paket yang masih bisa dipesan: angka di tab tidak boleh
  // menjanjikan pilihan yang sebenarnya sudah penuh.
  const open = allBatches.filter((b) => remainingSlots(b) > 0);
  const totalKambing = open.filter((b) => b.jenisHewan === 'KAMBING').length;
  const totalSapi = open.filter((b) => b.jenisHewan === 'SAPI').length;
  const totalSapiKolektif = open.filter(
    (b) => b.jenisHewan === 'SAPI' && isKolektif(b)
  ).length;
  const totalSapiIndividu = open.filter(
    (b) => b.jenisHewan === 'SAPI' && !isKolektif(b)
  ).length;

  return (
    <div className="flex w-full flex-col gap-5 pb-10">
      <Hero />

      <SegmentedTabs
        label="Kategori hewan qurban"
        onChange={setTab}
        tabs={[
          {
            id: 'KAMBING',
            label:
              resource.state.status === 'success'
                ? `Qurban Kambing (${totalKambing})`
                : 'Qurban Kambing',
          },
          {
            id: 'SAPI',
            label:
              resource.state.status === 'success'
                ? `Qurban Sapi (${totalSapi})`
                : 'Qurban Sapi',
          },
        ]}
        value={tab}
      />

      {tab === 'SAPI' && (
        <SapiIntro
          counts={{ kolektif: totalSapiKolektif, individu: totalSapiIndividu }}
          isLoaded={resource.state.status === 'success'}
          mode={mode}
          onModeChange={setMode}
        />
      )}

      <section aria-label="Daftar paket qurban">
        {resource.state.status === 'loading' && (
          <Message icon={<LoaderCircle className="animate-spin" />}>
            Memuat paket qurban...
          </Message>
        )}

        {resource.state.status === 'error' && (
          <div
            className="flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center"
            role="alert"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mb-2 size-7 text-rose-500"
            />
            <p className="font-semibold text-gray-900 text-sm">
              Paket qurban tidak dapat dimuat
            </p>
            <p className="mt-1 text-gray-500 text-xs">{resource.state.error}</p>
            <Button
              className="mt-3"
              onClick={resource.reload}
              size="sm"
              type="button"
              variant="outline"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {resource.state.status === 'success' &&
          batches.length === 0 &&
          (tab === 'SAPI' && mode === 'INDIVIDU' ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <SearchX aria-hidden="true" className="size-7" />
              </div>
              <h3 className="mt-4 font-bold text-base text-gray-900 dark:text-white">
                Paket Sapi Utuh (1 Ekor) Belum Tersedia
              </h3>
              <p className="mt-1.5 max-w-md text-gray-500 text-xs leading-relaxed sm:text-sm dark:text-slate-400">
                Saat ini paket sapi utuh (1 ekor penuh) sedang dalam proses
                persiapan pengadaan atau kuota periode ini sudah terpenuhi. Anda
                dapat berqurban sapi secara patungan (1/7) atau memilih paket
                kambing.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button
                  className="bg-[#356152] font-semibold text-white hover:bg-[#2b4f43]"
                  onClick={() => setMode('KOLEKTIF')}
                  type="button"
                >
                  Pilih Sapi Patungan (1/7)
                </Button>
                <Button
                  onClick={() => setTab('KAMBING')}
                  type="button"
                  variant="outline"
                >
                  Lihat Qurban Kambing
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-400 dark:bg-slate-800 dark:text-slate-500">
                <SearchX aria-hidden="true" className="size-7" />
              </div>
              <h3 className="mt-4 font-bold text-base text-gray-900 dark:text-white">
                Belum Ada Paket Tersedia
              </h3>
              <p className="mt-1 max-w-sm text-gray-500 text-xs sm:text-sm dark:text-slate-400">
                Paket qurban pada kategori ini sedang disiapkan oleh panitia.
                Silakan periksa kembali berkala.
              </p>
            </div>
          ))}

        {batches.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((batch) => (
              <QurbanBatchCard batch={batch} key={batch.id} />
            ))}
          </div>
        )}
      </section>

      <ValueProps />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d352d] to-[#2b4f43] p-6 text-white sm:p-8">
      <GreenPatternOverlay size="lg" />
      <span className="inline-flex rounded-full bg-white/15 px-3 py-1 font-bold text-[11px] uppercase tracking-wider">
        IDUL ADHA 1447 H
      </span>
      <h1 className="mt-3 max-w-xl font-extrabold text-2xl leading-tight tracking-tight sm:text-3xl">
        Tebarkan Qurban Hingga Pelosok Negeri
      </h1>
      <p className="mt-2 max-w-lg text-sm text-white/80">
        Penyaluran merata, hewan sehat & dokumentasi lengkap.
      </p>
    </section>
  );
}

function SapiIntro({
  mode,
  onModeChange,
  counts,
  isLoaded,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  counts: { kolektif: number; individu: number };
  isLoaded: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SegmentedTabs
        label="Jenis qurban sapi"
        onChange={onModeChange}
        tabs={[
          {
            id: 'KOLEKTIF',
            label: isLoaded
              ? `Kolektif (Patungan 1/7) (${counts.kolektif})`
              : 'Kolektif (Patungan 1/7)',
          },
          {
            id: 'INDIVIDU',
            label: isLoaded
              ? `Individu (1 Ekor Utuh) (${counts.individu})`
              : 'Individu (1 Ekor Utuh)',
          },
        ]}
        value={mode}
      />

      <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <p className="font-semibold text-[#1d352d] text-xs uppercase tracking-wide dark:text-emerald-300">
          Alur Pelaksanaan Qurban di Amwal:
        </p>
        <ol className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              className="flex items-start gap-2 text-gray-700 text-xs sm:text-sm dark:text-slate-300"
              key={step}
            >
              <span
                aria-hidden="true"
                className="font-bold text-[#356152] text-xs dark:text-emerald-400"
              >
                {index + 1}.
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-amber-900 text-sm">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Menurut syariat, satu ekor sapi sah diqurbankan untuk maksimal{' '}
          <strong>7 orang</strong>. Setiap 1/7 bagian atas nama satu shohibul
          qurban.
        </p>
      </div>
    </div>
  );
}

function ValueProps() {
  return (
    <section
      aria-label="Keunggulan Qurban Amwal"
      className="grid grid-cols-1 gap-5 sm:grid-cols-3"
    >
      {VALUE_PROPS.map(({ icon: Icon, title, text }) => (
        <div
          className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          key={title}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2ece8] text-[#356152]">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h3 className="font-bold text-gray-900 text-sm dark:text-white">
              {title}
            </h3>
            <p className="mt-0.5 text-gray-500 text-xs">{text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function Message({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center text-gray-500 text-sm [&_svg]:size-8 [&_svg]:text-[#356152]">
      {icon}
      <p>{children}</p>
    </div>
  );
}
