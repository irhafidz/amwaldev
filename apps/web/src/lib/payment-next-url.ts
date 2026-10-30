/**
 * Ke mana donatur dibawa setelah pembayaran dibuat.
 *
 * Bila Mayar sudah mengirim instruksi bayar (QR, nomor VA, atau tautan
 * e-wallet), donatur langsung ke halaman status Amwal yang menampilkannya —
 * tidak perlu membuka halaman Mayar lalu memilih metode lagi. Tanpa instruksi,
 * jalan keluarnya halaman pembayaran Mayar.
 */
export type PaymentModuleKey = 'wakaf' | 'zakat' | 'qurban' | 'infaq';

export function paymentNextUrl(
  module: PaymentModuleKey,
  result: {
    orderId: string;
    redirectUrl: string;
    payment: { instructions?: unknown };
  }
): string {
  return result.payment.instructions
    ? `/${module}/status?orderId=${encodeURIComponent(result.orderId)}`
    : result.redirectUrl;
}
