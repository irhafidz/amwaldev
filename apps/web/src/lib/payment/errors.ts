import { MayarApiError } from '@amwal/core/payment/mayar.provider';
import { PaymentMethodLimitError } from '@amwal/core/payment/methods';
import { ORPCError } from '@orpc/server';

/**
 * Menerjemahkan kegagalan Mayar saat membuat pembayaran menjadi galat oRPC
 * dengan pesan yang bisa dibaca donatur. Tanpa ini, galat apa pun dari
 * provider menjadi HTTP 500 generik ("Internal server error") dan donatur
 * tidak tahu harus berbuat apa.
 *
 * Pesanan yang gagal dibuat sudah dibersihkan oleh `createPayment` (jangkar
 * PENDING dihapus), jadi mencoba lagi aman.
 */
export async function translatePaymentErrors<T>(
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PaymentMethodLimitError) {
      // Ditolak sebelum pesanan dibuat; pesannya sudah ramah donatur.
      throw new ORPCError('BAD_REQUEST', { message: error.message });
    }
    if (!(error instanceof MayarApiError)) {
      throw error;
    }
    switch (error.kind) {
      case 'duplicate':
        throw new ORPCError('TOO_MANY_REQUESTS', {
          message:
            'Pembayaran dengan nominal dan email yang sama baru saja dibuat. Tunggu 1 menit lalu coba lagi.',
        });
      case 'method_unavailable':
        throw new ORPCError('BAD_REQUEST', {
          message:
            'Metode pembayaran ini sedang tidak tersedia. Silakan pilih metode lain.',
        });
      default:
        throw new ORPCError('SERVICE_UNAVAILABLE', {
          message:
            'Layanan pembayaran sedang tidak tersedia. Silakan coba lagi beberapa saat.',
        });
    }
  }
}
