import { parseInstant } from '../time/wib';
import type { PaymentInstructions } from './types';

/**
 * Status tampilan transaksi dan "lanjutkan pembayaran" (QA-01, QA-02, D1).
 *
 * Satu sumber logika untuk server (yang memutuskan apakah instruksi bayar boleh
 * dikirim) dan klien (badge Riwayat, hitung mundur, total donasi). Murni: waktu
 * sekarang selalu diberikan pemanggil, sehingga bisa diuji tanpa jam palsu.
 */

/**
 * Batas waktu untuk transaksi PENDING yang tidak menyimpan `payment_expires_at`
 * (transaksi sebelum migrasi 0019): sama dengan masa berlaku tautan Mayar.
 */
export const PENDING_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

export type PaymentDisplayStatus =
  | 'BERHASIL'
  | 'MENUNGGU'
  | 'KEDALUWARSA'
  | 'GAGAL';

export const PAYMENT_DISPLAY_LABEL: Record<PaymentDisplayStatus, string> = {
  BERHASIL: 'Berhasil',
  MENUNGGU: 'Menunggu Pembayaran',
  KEDALUWARSA: 'Kedaluwarsa',
  GAGAL: 'Gagal',
};

interface StatusInput {
  statusPembayaran: string;
  /** Status pesanan wakaf (`TERVERIFIKASI` / `DITOLAK`), bila ada. */
  orderStatus?: string | null;
  paymentExpiresAt?: string | null;
  createdAt: string;
}

/**
 * Kolom DB `timestamp(3)` tanpa zona waktu datang sebagai string naif dalam
 * UTC ("2026-10-09 01:34:08.767"); `Date.parse` membacanya sebagai waktu LOKAL
 * (WIB = 7 jam lebih awal) sehingga pembayaran baru tampak kedaluwarsa.
 * `parseInstant` adalah aturan tunggal repo untuk nilai seperti itu.
 */
const toMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  try {
    return parseInstant(value).getTime();
  } catch {
    return null;
  }
};

/** Kapan pembayaran PENDING berhenti bisa dibayar (epoch ms). */
export function paymentDeadline(
  input: Pick<StatusInput, 'paymentExpiresAt' | 'createdAt'>
): number {
  const explicit = toMs(input.paymentExpiresAt);
  if (explicit !== null) {
    return explicit;
  }
  return (toMs(input.createdAt) ?? 0) + PENDING_FALLBACK_TTL_MS;
}

export function paymentDisplayStatus(
  input: StatusInput,
  now: number
): PaymentDisplayStatus {
  if (
    input.statusPembayaran === 'LUNAS' ||
    input.orderStatus === 'TERVERIFIKASI'
  ) {
    return 'BERHASIL';
  }
  if (input.statusPembayaran === 'GAGAL' || input.orderStatus === 'DITOLAK') {
    return 'GAGAL';
  }
  if (input.statusPembayaran === 'PENDING' && now >= paymentDeadline(input)) {
    return 'KEDALUWARSA';
  }
  // PENDING yang masih berlaku, dan DP (uang muka, menunggu pelunasan).
  return 'MENUNGGU';
}

export interface ResumablePayment {
  instructions: PaymentInstructions | null;
  url: string | null;
  expiresAt: string;
}

/**
 * Instruksi untuk melanjutkan pembayaran — hanya untuk transaksi PENDING yang
 * belum kedaluwarsa dan benar-benar punya instruksi atau tautan tersimpan.
 * Selain itu `null`, sehingga instruksi lama tidak pernah tampil lagi.
 */
export function resumablePayment(
  input: StatusInput & {
    paymentInstructions?: PaymentInstructions | null;
    paymentUrl?: string | null;
  },
  now: number
): ResumablePayment | null {
  if (input.statusPembayaran !== 'PENDING') {
    return null;
  }
  if (paymentDisplayStatus(input, now) !== 'MENUNGGU') {
    return null;
  }
  const instructions = input.paymentInstructions ?? null;
  const url = input.paymentUrl ?? null;
  if (!(instructions || url)) {
    return null;
  }
  return {
    instructions,
    url,
    expiresAt: new Date(paymentDeadline(input)).toISOString(),
  };
}

/**
 * Ringkasan Riwayat: total donasi BERHASIL saja (D1 — pending tidak pernah
 * dihitung), plus jumlah yang masih menunggu pembayaran.
 */
export function summarizeDonations(
  items: ReadonlyArray<StatusInput & { amount: string | number }>,
  now: number
): { totalBerhasil: number; berhasil: number; menunggu: number } {
  let totalBerhasil = 0;
  let berhasil = 0;
  let menunggu = 0;
  for (const item of items) {
    const status = paymentDisplayStatus(item, now);
    if (status === 'BERHASIL') {
      berhasil += 1;
      totalBerhasil += Number(item.amount) || 0;
    } else if (status === 'MENUNGGU') {
      menunggu += 1;
    }
  }
  return { totalBerhasil, berhasil, menunggu };
}

/** Sisa waktu sebagai jam/menit/detik untuk hitung mundur. */
export function remainingParts(
  deadlineMs: number,
  now: number
): { hours: number; minutes: number; seconds: number; expired: boolean } {
  const left = Math.max(0, deadlineMs - now);
  const totalSeconds = Math.floor(left / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: left === 0,
  };
}
