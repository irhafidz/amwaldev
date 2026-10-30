import {
  findOrCreateCertificate,
  findTransactionContext,
} from '@amwal/core/certificate/service';
import { createSettlementNotification } from '@amwal/core/notification';
import type { PaymentModule } from '@amwal/core/payment/order-id';
import { settleAffiliateReward } from '@/lib/affiliate/settle-hook';
import type { Database } from '@/lib/db';
import { settleTransactionPoints } from '@/lib/gamification/settle-hook';
import { notifySettlement } from '@/lib/whatsapp';

/**
 * Efek samping setelah sebuah donasi resmi LUNAS: WhatsApp ke donatur,
 * notifikasi dalam aplikasi, sertifikat wakaf (SWU), poin Berkah, dan hadiah
 * afiliasi.
 *
 * Satu hook dipakai SEMUA jalur yang bisa menyelesaikan pembayaran — webhook
 * Mayar, cek status saat donatur kembali dari Mayar, dan job rekonsiliasi —
 * supaya hasilnya sama apa pun yang lebih dulu menangkap pembayaran. Tanpa
 * itu, donasi yang diselesaikan lewat cek status (fallback saat webhook belum
 * dikonfigurasi di dasbor Mayar) lunas di buku besar tetapi donaturnya tidak
 * pernah diberi tahu.
 *
 * Idempoten secara struktural: hook hanya dipanggil dari cabang yang
 * memenangkan `UPDATE ... WHERE status != 'LUNAS'`, jadi hanya sekali per
 * transaksi. Setiap langkah best-effort dan berdiri sendiri — satu kegagalan
 * tidak menghalangi yang lain, dan tidak pernah mengubah hasil pembayaran.
 */
async function issueWaqfCertificate(
  db: Database,
  orderId: string
): Promise<void> {
  const context = await findTransactionContext(db, orderId);
  if (context?.transaction) {
    await findOrCreateCertificate(db, context.transaction);
  }
}

export function createSettlementHook(db: Database) {
  return async (
    module: PaymentModule,
    orderId: string,
    amount: string
  ): Promise<void> => {
    await Promise.allSettled([
      notifySettlement(db, module, orderId, amount),
      createSettlementNotification(db, module, orderId),
      module === 'WAQF' ? issueWaqfCertificate(db, orderId) : Promise.resolve(),
      settleTransactionPoints(db, module, orderId),
      settleAffiliateReward(db, module, orderId),
    ]);
  };
}
