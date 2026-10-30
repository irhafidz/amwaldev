'use client';

import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  LoaderCircle,
  MapPin,
  Scale,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { CARD, CTA } from '@/components/payment/checkout-layout';
import { ShareButton } from '@/components/share/share-modal';
import { Button } from '@/components/ui/button';
import { getQurbanBatchDetail } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { QurbanBatch } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import {
  BatchPhoto,
  batchTitle,
  formatSembelih,
  isKolektif,
} from './qurban-shared';

const INCLUDED = [
  'Hewan sehat, cukup umur & bebas cacat',
  'Penyembelihan H+2 + dokumentasi foto & video',
  'Distribusi ke pelosok negeri',
];

export function QurbanBatchDetailView({ batchId }: { batchId: string }) {
  const resource = useResource(() => getQurbanBatchDetail(batchId), {
    enabled: Boolean(batchId),
  });

  if (resource.state.status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <LoaderCircle
          aria-hidden="true"
          className="size-8 animate-spin text-[#356152]"
        />
      </div>
    );
  }

  if (resource.state.status === 'error') {
    return (
      <div
        className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center"
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="size-8 text-rose-500" />
        <p className="font-semibold text-gray-900 text-sm">
          Paket tidak dapat dimuat
        </p>
        <p className="text-gray-500 text-xs">{resource.state.error}</p>
        <Button onClick={resource.reload} type="button" variant="outline">
          Coba lagi
        </Button>
      </div>
    );
  }

  const { batch, availableSlots } = resource.state.data;
  const soldOut = batch.status !== 'TERSEDIA' || availableSlots === 0;

  return (
    <div className="w-full pb-28 lg:pb-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-gray-500 text-sm">
        <Link
          className="inline-flex items-center gap-1 font-medium hover:text-[#356152]"
          to="/qurban"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Qurban Katalog
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="font-semibold text-gray-900 dark:text-white">
          Detail Paket
        </span>
      </nav>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          <BatchPhoto
            batch={batch}
            className="h-64 w-full rounded-2xl sm:h-96"
          />

          <div className={CARD}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge strong>
                <Users aria-hidden="true" className="size-3.5" />
                {soldOut
                  ? 'Penuh'
                  : `Tersisa ${availableSlots} ${isKolektif(batch) ? 'slot' : 'paket'}`}
              </Badge>
              {batch.wilayahPenyaluran && (
                <Badge>
                  <MapPin aria-hidden="true" className="size-3.5" />
                  {batch.wilayahPenyaluran}
                </Badge>
              )}
              <div className="ml-auto">
                <ShareButton
                  category="QURBAN"
                  title={batchTitle(batch)}
                  url={
                    typeof window === 'undefined' ? '' : window.location.href
                  }
                />
              </div>
            </div>

            <h1 className="mt-3 font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
              {batchTitle(batch)}
            </h1>
            <p className="mt-1 text-gray-500 text-sm">
              {isKolektif(batch)
                ? `Sapi patungan — 1 ekor untuk ${batch.totalSlot} shohibul qurban.`
                : 'Satu ekor atas nama satu shohibul qurban.'}
            </p>

            <SpecGrid batch={batch} />
          </div>

          <div className={CARD}>
            <h2 className="mb-3 font-bold text-base text-gray-900 dark:text-white">
              Termasuk dalam paket
            </h2>
            <ul className="space-y-2.5">
              {INCLUDED.map((item) => (
                <li
                  className="flex items-start gap-2.5 text-gray-700 text-sm dark:text-slate-300"
                  key={item}
                >
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-[#356152]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="hidden lg:col-span-4 lg:block">
          <div className={`${CARD} sticky top-6`}>
            <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
              TOTAL PEMBAYARAN
            </span>
            <p className="mt-2 font-extrabold text-3xl text-[#356152]">
              {formatRupiah(batch.hargaPerSlot)}
            </p>
            <p className="mt-1 text-gray-500 text-xs">
              {isKolektif(batch) ? 'per 1/7 bagian (1 shohibul)' : 'per ekor'}
            </p>
            <CheckoutLink
              batch={batch}
              className={`${CTA} mt-5`}
              soldOut={soldOut}
            />
            <p className="mt-3 flex items-center justify-center gap-1.5 text-gray-400 text-xs">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-[#356152]"
              />
              Pembayaran Aman &amp; Sesuai Syariah
            </p>
          </div>
        </aside>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-50 border-gray-200 border-t bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <div>
            <span className="block font-medium text-[11px] text-gray-400 uppercase">
              Total Pembayaran
            </span>
            <span className="font-extrabold text-[#356152] text-lg">
              {formatRupiah(batch.hargaPerSlot)}
            </span>
          </div>
          <CheckoutLink
            batch={batch}
            className="bg-[#356152] px-6 font-bold text-white hover:bg-[#2b4f43]"
            soldOut={soldOut}
          />
        </div>
      </div>
    </div>
  );
}

function CheckoutLink({
  batch,
  className,
  soldOut,
}: {
  batch: QurbanBatch;
  className: string;
  soldOut: boolean;
}) {
  if (soldOut) {
    return (
      <Button className={className} disabled type="button">
        Paket Penuh
      </Button>
    );
  }
  return (
    <Button asChild className={className}>
      <Link search={{ batchId: batch.id }} to="/qurban/checkout">
        Lanjut ke Pembayaran
      </Link>
    </Button>
  );
}

function Badge({
  children,
  strong,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-xs ${
        strong ? 'bg-[#356152] text-white' : 'bg-[#e2ece8] text-[#1d352d]'
      }`}
    >
      {children}
    </span>
  );
}

function SpecGrid({ batch }: { batch: QurbanBatch }) {
  const specs: [string, string, typeof Scale][] = [
    [
      'Berat',
      batch.estimasiBeratKg ? `±${Number(batch.estimasiBeratKg)} kg` : '—',
      Scale,
    ],
    ['Kelamin', batch.jenisKelamin ?? 'Jantan', Users],
    ['Grade', batch.kelasGrade ?? 'Standar', Tag],
    [
      'Estimasi Penyembelihan',
      formatSembelih(batch.tanggalPenyembelihanEstimasi),
      CalendarDays,
    ],
  ];
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {specs.map(([label, value, Icon]) => (
        <div
          className="rounded-xl bg-[#f2f6f4] p-3.5 dark:bg-slate-800"
          key={label}
        >
          <dt className="flex items-center gap-1.5 text-gray-500 text-xs">
            <Icon aria-hidden="true" className="size-3.5 text-[#356152]" />
            {label}
          </dt>
          <dd className="mt-1 font-bold text-gray-900 text-sm dark:text-white">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
