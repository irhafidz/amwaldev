import { z } from 'zod';

/**
 * Metode pembayaran yang dibuka Amwal lewat Mayar — satu sumber kebenaran
 * untuk kontrak input, klien Mayar, dan UI checkout.
 *
 * `code` adalah nilai `paymentMethod` API Mayar v2 PERSIS (huruf kecil,
 * `kategori/penyedia`), dari dokumentasi
 * `POST /hl/v2/payments/create`. Kode itu juga yang disimpan di
 * `transactions.payment_method`, jadi riwayat selalu menunjukkan channel
 * yang benar-benar dipakai.
 *
 * Sengaja TIDAK ada:
 * - `ewallet/jenius` — butuh `cashtag` pembayar dan dokumentasinya sendiri
 *   tidak konsisten (`jenius` vs `jeniuspay`); tambahkan setelah diuji.
 * - `outlet/alfamart` — tidak diminta.
 * - OVO, Flip, dan "bank lainnya" — tidak ada dalam daftar nilai
 *   `paymentMethod` Mayar untuk payment request, jadi tidak bisa dipilih
 *   lewat API (hanya muncul bila pembayar memilih sendiri di halaman Mayar).
 *
 * Channel harus aktif di konfigurasi merchant Mayar; kalau tidak, Mayar
 * membalas 400 `Payment method "..." is not available or disabled`.
 */

export const PAYMENT_METHOD_CATEGORIES = ['qris', 'va', 'ewallet'] as const;
export type PaymentMethodCategory = (typeof PAYMENT_METHOD_CATEGORIES)[number];

export const PAYMENT_METHODS = [
  { code: 'qris', category: 'qris', label: 'QRIS' },
  { code: 'va/bsi', category: 'va', label: 'BSI' },
  { code: 'va/mandiri', category: 'va', label: 'Mandiri' },
  { code: 'va/bni', category: 'va', label: 'BNI' },
  { code: 'va/bri', category: 'va', label: 'BRI' },
  { code: 'va/permata', category: 'va', label: 'Permata' },
  { code: 'va/cimb', category: 'va', label: 'CIMB Niaga' },
  { code: 'va/bjb', category: 'va', label: 'BJB' },
  { code: 'ewallet/gopay', category: 'ewallet', label: 'GoPay' },
  { code: 'ewallet/dana', category: 'ewallet', label: 'DANA' },
  { code: 'ewallet/shopeepay', category: 'ewallet', label: 'ShopeePay' },
  { code: 'ewallet/linkaja', category: 'ewallet', label: 'LinkAja' },
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]['code'];

export const PAYMENT_METHOD_CODES = PAYMENT_METHODS.map(
  (method) => method.code
) as [PaymentMethodCode, ...PaymentMethodCode[]];

/**
 * Batas nominal per transaksi QRIS menurut Bank Indonesia (keputusan D7,
 * QA-05). Di atas batas ini Mayar mengalihkan pembayaran ke Virtual Account,
 * jadi donatur yang memilih QRIS tiba-tiba diberi nomor VA.
 */
export const QRIS_MAX_RUPIAH = 10_000_000;

/** Ditolak sebelum pesanan dibuat: nominal melebihi batas metode. */
export class PaymentMethodLimitError extends Error {
  override readonly name = 'PaymentMethodLimitError';
}

/** Nominal maksimum per transaksi; `null` = tidak dibatasi di sisi Amwal. */
export function maxAmountFor(code: PaymentMethodCode): number | null {
  return categoryOf(code) === 'qris' ? QRIS_MAX_RUPIAH : null;
}

/**
 * Alasan metode tidak bisa dipakai untuk nominal ini (untuk UI dan galat
 * server), atau `null` bila boleh. Kode lama di luar daftar tidak dibatasi.
 */
export function methodLimitMessage(
  code: string,
  amount: number
): string | null {
  if (!isPaymentMethodCode(code)) {
    return null;
  }
  const max = maxAmountFor(code);
  if (max === null || amount <= max) {
    return null;
  }
  return `QRIS hanya bisa dipakai untuk pembayaran hingga Rp ${max.toLocaleString('id-ID')} (batas Bank Indonesia). Gunakan Virtual Account untuk nominal di atasnya.`;
}

export function isMethodAllowedForAmount(
  code: PaymentMethodCode,
  amount: number
): boolean {
  return methodLimitMessage(code, amount) === null;
}

/** Metode pengganti bila pilihan saat ini melewati batasnya (QRIS → VA BSI). */
export const LIMIT_FALLBACK_METHOD: PaymentMethodCode = 'va/bsi';

/** Pilihan yang benar-benar bisa dipakai untuk nominal ini. */
export function fallbackMethodForAmount(
  code: PaymentMethodCode,
  amount: number
): PaymentMethodCode {
  return isMethodAllowedForAmount(code, amount) ? code : LIMIT_FALLBACK_METHOD;
}

/** Metode default (dan satu-satunya sebelum multi-payment). */
export const DEFAULT_PAYMENT_METHOD: PaymentMethodCode = 'qris';

export const paymentMethodSchema = z.enum(PAYMENT_METHOD_CODES);

export function isPaymentMethodCode(
  value: unknown
): value is PaymentMethodCode {
  return PAYMENT_METHODS.some((method) => method.code === value);
}

export function methodsInCategory(category: PaymentMethodCategory) {
  return PAYMENT_METHODS.filter((method) => method.category === category);
}

export function categoryOf(code: PaymentMethodCode): PaymentMethodCategory {
  if (code === 'qris') {
    return 'qris';
  }
  return code.startsWith('va/') ? 'va' : 'ewallet';
}

const CATEGORY_LABEL: Record<PaymentMethodCategory, string> = {
  qris: 'QRIS',
  va: 'Virtual Account',
  ewallet: 'E-Wallet',
};

export function categoryLabel(category: PaymentMethodCategory): string {
  return CATEGORY_LABEL[category];
}

/** Nilai lama yang masih ada di riwayat transaksi (sebelum multi-payment). */
const LEGACY_LABEL: Record<string, string> = {
  virtual_account: 'Virtual Account',
  bank_transfer: 'Transfer Bank',
  credit_card: 'Kartu Kredit',
  echannel: 'Mandiri Bill',
  cstore: 'Gerai Retail',
  gopay: 'GoPay',
  tunai: 'Tunai',
  beras: 'Beras',
  QRIS: 'QRIS',
  VA: 'Virtual Account',
  TRANSFER: 'Transfer',
  TUNAI: 'Tunai',
  BERAS: 'Beras',
};

/**
 * Label tampilan untuk nilai `payment_method` apa pun: kode Mayar ("VA BNI",
 * "GoPay"), nilai lama (riwayat DOKU), atau null.
 */
export function paymentMethodLabel(code: string | null | undefined): string {
  if (!code) {
    return '-';
  }
  const method = PAYMENT_METHODS.find((item) => item.code === code);
  if (method) {
    return method.category === 'va' ? `VA ${method.label}` : method.label;
  }
  return LEGACY_LABEL[code] ?? code;
}

/**
 * Kolom `metode_pembayaran` pada tabel pesanan adalah enum lama
 * (TUNAI/TRANSFER/QRIS/VA); e-wallet dicatat sebagai TRANSFER supaya tidak
 * perlu migrasi enum. Channel sebenarnya ada di `transactions.payment_method`.
 */
export function orderPaymentMethod(
  code: PaymentMethodCode
): 'QRIS' | 'VA' | 'TRANSFER' {
  const category = categoryOf(code);
  if (category === 'qris') {
    return 'QRIS';
  }
  return category === 'va' ? 'VA' : 'TRANSFER';
}
