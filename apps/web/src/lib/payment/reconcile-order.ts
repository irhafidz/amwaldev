import { reconcilePendingTransactions } from '@amwal/core/payment/reconciliation';
import type { PaymentProvider } from '@amwal/core/payment/types';
import type { Database } from '@/lib/db';
import { createSettlementHook } from './settlement';

/**
 * Cek status real-time untuk satu pesanan: tanya Mayar langsung dan, bila
 * sudah dibayar (atau kedaluwarsa), perbarui basis data.
 *
 * Ini jalur cadangan bila webhook belum sampai — mis. URL webhook belum bisa
 * didaftarkan di dasbor Mayar. Dipanggil oleh prosedur `orderStatus` setiap
 * modul, sehingga halaman tujuan setelah pembayaran (`/wakaf/status`,
 * `/zakat/status`, `/infaq/status`, `/qurban/status`) langsung menampilkan
 * LUNAS begitu Mayar mengonfirmasi.
 *
 * Aman terhadap webhook yang datang bersamaan: yang memutuskan adalah
 * `applyProviderEvent` (satu `UPDATE ... WHERE status != 'LUNAS'`), jadi
 * pembayaran tidak mungkin dihitung dua kali. Status DIAMBIL dari API Mayar
 * dan bukan dari parameter URL — `?status=success` bisa dipalsukan siapa
 * pun, sehingga tidak pernah dipercaya.
 */

/**
 * `orderStatus` publik (tamu mendarat di sini setelah membayar), jadi tiap
 * panggilan bisa memicu permintaan ke Mayar. Satu pertanyaan per transaksi per
 * jendela waktu. ponytail: memori per-proses; pakai penyimpanan bersama bila
 * aplikasi di-scale ke beberapa instance.
 */
const COOLDOWN_MS = 10_000;
const CACHE_LIMIT = 5000;
const lastCheckAt = new Map<string, number>();

function shouldCheck(transactionId: string, now = Date.now()): boolean {
  const last = lastCheckAt.get(transactionId);
  if (last !== undefined && now - last < COOLDOWN_MS) {
    return false;
  }
  if (lastCheckAt.size > CACHE_LIMIT) {
    lastCheckAt.clear();
  }
  lastCheckAt.set(transactionId, now);
  return true;
}

export interface ReconcileOrderParams {
  db: Database;
  provider: PaymentProvider;
  transactionId: string;
}

/**
 * @returns `true` bila status transaksi berubah (LUNAS atau gagal/kedaluwarsa),
 *   artinya pemanggil perlu membaca ulang pesanannya.
 */
export async function reconcileOrderNow({
  db,
  provider,
  transactionId,
}: ReconcileOrderParams): Promise<boolean> {
  if (!shouldCheck(transactionId)) {
    return false;
  }

  try {
    const summary = await reconcilePendingTransactions({
      database: db,
      paymentProvider: provider,
      onlyTransactionIds: [transactionId],
      // Pesanan baru saja dibuat; jeda 15 menit milik job cron tidak berlaku.
      staleMinutes: 0,
      onSettled: createSettlementHook(db),
    });
    return summary.settled + summary.failed > 0;
  } catch {
    // Mayar tidak terjangkau: webhook dan job cron tetap jaring pengamannya.
    return false;
  }
}
