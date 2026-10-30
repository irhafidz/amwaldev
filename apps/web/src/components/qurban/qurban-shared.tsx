import { Rabbit } from 'lucide-react';
import type { QurbanBatch } from '@/lib/amwal-api/types';

/** Satu batch = satu hewan fisik; lebih dari 1 slot berarti patungan (sapi 1/7). */
export function isKolektif(batch: Pick<QurbanBatch, 'totalSlot'>): boolean {
  return batch.totalSlot > 1;
}

export function batchTitle(batch: QurbanBatch): string {
  return (
    batch.ras || (batch.jenisHewan === 'SAPI' ? 'Paket Sapi' : 'Paket Kambing')
  );
}

export function batchPhoto(batch: Pick<QurbanBatch, 'galeriFotoUrls'>) {
  const urls = batch.galeriFotoUrls;
  return Array.isArray(urls) && typeof urls[0] === 'string' ? urls[0] : null;
}

/** `list` mengembalikan `availableSlots`; fallback ke status bila tidak ada. */
export function remainingSlots(batch: QurbanBatch): number {
  if (batch.availableSlots !== undefined) {
    return batch.availableSlots;
  }
  return batch.status === 'TERSEDIA' ? batch.totalSlot : 0;
}

export function formatSembelih(date: string | null): string {
  if (!date) {
    return 'H+2 Idul Adha';
  }
  return new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', {
    dateStyle: 'long',
  });
}

export function BatchPhoto({
  batch,
  className,
}: {
  batch: QurbanBatch;
  className: string;
}) {
  const src = batchPhoto(batch);
  if (src) {
    return (
      // biome-ignore lint/performance/noImgElement: admin-supplied remote photo URL
      <img
        alt={batchTitle(batch)}
        className={`${className} object-cover`}
        loading="lazy"
        src={src}
      />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center bg-gradient-to-br from-[#356152] to-[#1d352d] text-white`}
    >
      <Rabbit aria-hidden="true" className="size-12 opacity-70" />
    </div>
  );
}
