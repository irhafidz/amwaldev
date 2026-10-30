import { releaseExpiredSlotHolds } from '@amwal/core/qurban/slots';
import type { Database } from '@/lib/db';

/**
 * Melepas slot qurban yang tertahan pesanan tak terbayar (QA Fase 4). Dipanggil
 * dari pembacaan katalog dan sebelum memesan, sehingga stok yang "penuh" karena
 * pesanan kedaluwarsa pulih tanpa cron terpisah. Dibatasi sekali per
 * `THROTTLE_MS` per proses: UPDATE-nya murah, tetapi katalog dibaca terus.
 */
const THROTTLE_MS = 30_000;

let lastRun = 0;

export async function releaseStaleQurbanSlots(
  database: Database,
  options: { force?: boolean; now?: number } = {}
): Promise<number> {
  const now = options.now ?? Date.now();
  if (!options.force && now - lastRun < THROTTLE_MS) {
    return 0;
  }
  lastRun = now;
  try {
    return await releaseExpiredSlotHolds(database, new Date(now));
  } catch {
    // Pelepasan adalah pemeliharaan: gagalnya tidak boleh menggagalkan
    // pembacaan katalog atau pemesanan.
    return 0;
  }
}
