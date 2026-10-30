'use client';

import { Link } from '@tanstack/react-router';
import { CalendarDays, Scale, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { QurbanBatch } from '@/lib/amwal-api/types';
import {
  BatchPhoto,
  batchTitle,
  formatSembelih,
  isKolektif,
  remainingSlots,
} from './qurban-shared';

export function QurbanBatchCard({ batch }: { batch: QurbanBatch }) {
  const remaining = remainingSlots(batch);
  const kolektif = isKolektif(batch);
  const soldOut = batch.status !== 'TERSEDIA' || remaining === 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <BatchPhoto batch={batch} className="h-44 w-full" />
        <div className="absolute top-3 left-3 flex gap-2">
          <span
            className={`rounded-full px-3 py-1 font-bold text-[11px] ${
              soldOut ? 'bg-rose-100 text-rose-700' : 'bg-white text-[#356152]'
            }`}
          >
            {soldOut
              ? 'Penuh'
              : `Tersisa ${remaining} ${kolektif ? 'Slot' : 'Paket'}`}
          </span>
          {batch.kelasGrade && (
            <span className="rounded-full bg-[#356152] px-3 py-1 font-bold text-[11px] text-white">
              {batch.kelasGrade}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="font-bold text-base text-gray-900 dark:text-white">
          {batchTitle(batch)}
        </h2>
        {batch.wilayahPenyaluran && (
          <p className="mt-0.5 text-gray-500 text-xs">
            {batch.wilayahPenyaluran}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2.5 text-gray-600 text-xs dark:text-slate-300">
          <Spec icon={Scale}>
            {batch.estimasiBeratKg
              ? `±${Number(batch.estimasiBeratKg)} kg`
              : 'Berat bervariasi'}
          </Spec>
          <Spec icon={Users}>{batch.jenisKelamin ?? 'Jantan'}</Spec>
          <Spec icon={CalendarDays}>
            Sembelih {formatSembelih(batch.tanggalPenyembelihanEstimasi)}
          </Spec>
        </div>

        {kolektif && <SlotBar batch={batch} remaining={remaining} />}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="text-[11px] text-gray-400">
              {kolektif ? 'Harga per 1/7 bagian' : 'Harga'}
            </p>
            <p className="font-extrabold text-[#356152] text-lg">
              {formatRupiah(batch.hargaPerSlot)}
            </p>
          </div>
          {soldOut ? (
            <Button disabled type="button">
              Penuh
            </Button>
          ) : (
            <Button
              asChild
              className="bg-[#356152] font-bold text-white hover:bg-[#2b4f43]"
            >
              <Link params={{ batchId: batch.id }} to="/qurban/$batchId">
                Pilih Paket
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Spec({
  icon: Icon,
  children,
}: {
  icon: typeof Scale;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-[#356152]" />
      {children}
    </span>
  );
}

function SlotBar({
  batch,
  remaining,
}: {
  batch: QurbanBatch;
  remaining: number;
}) {
  const filled = batch.totalSlot - remaining;
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>
          {filled} dari {batch.totalSlot} slot terisi
        </span>
        <span>Sisa {remaining}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#356152]"
          style={{ width: `${(filled / batch.totalSlot) * 100}%` }}
        />
      </div>
    </div>
  );
}
