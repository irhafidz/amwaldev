/**
 * Aturan jumlah nama shohibul per pesanan qurban (QA-13).
 *
 * Fiqih: satu sapi sah untuk 1 sampai 7 orang; satu kambing hanya untuk satu
 * orang. Sebuah paket sapi yang dijual utuh (`totalSlot` 1) menampung hingga 7
 * nama dalam SATU slot. Pada paket patungan (`totalSlot` > 1) satu slot
 * adalah satu bagian (1/7), jadi satu nama per slot — perilaku lama.
 */
export const MAX_SHOHIBUL_PER_COW = 7;

export interface ShohibulBatch {
  jenisHewan: 'SAPI' | 'KAMBING';
  totalSlot: number;
}

/** Sapi yang dijual utuh sebagai satu slot. */
export function isWholeCow(batch: ShohibulBatch): boolean {
  return batch.jenisHewan === 'SAPI' && batch.totalSlot === 1;
}

/** Batas nama untuk pesanan `jumlahSlot` slot pada paket ini. */
export function maxShohibulNames(
  batch: ShohibulBatch,
  jumlahSlot: number
): number {
  return isWholeCow(batch)
    ? MAX_SHOHIBUL_PER_COW * jumlahSlot
    : Math.max(jumlahSlot, 1);
}

/** Bentuk gabungan "A, B, C" untuk kolom `nama_shohibul` (pembaca lama). */
export function joinShohibul(names: readonly string[]): string {
  return names.join(', ');
}
