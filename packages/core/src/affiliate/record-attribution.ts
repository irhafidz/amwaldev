import { eq } from 'drizzle-orm';
import { affiliateAttributions, affiliateCodes } from '../db/schema';
import type { Database } from '../db/types';

/**
 * Atribusi first-touch [I-4]. Dipanggil SATU KALI, di dalam transaksi anchor
 * yang sama dengan penyisipan `transactions` (`@amwal/core/payment/service`
 * `createPayment`), supaya baris `affiliate_attributions` tidak pernah ada
 * tanpa transaksi yang menyertainya dan sebaliknya.
 *
 * Gagal-terbuka dengan sengaja: kode referral yang tidak dikenal atau
 * self-referral TIDAK PERNAH menggagalkan checkout — keduanya hanya
 * melewatkan pencatatan atribusi. Cookie `amwal_ref` yang basi (kedaluwarsa,
 * kode sudah dihapus) tidak boleh mengganggu jalur uang.
 *
 * Anti-abuse dinamis (maks 10 konversi berpoin per perujuk per hari WIB, maks
 * 1 per pasangan perujuk-donatur per 24 jam) TIDAK diperiksa di sini — itu
 * butuh histori atribusi dan diperiksa terpisah saat hadiah diselesaikan
 * (settle-hook `onSettled`), bukan saat order dibuat. Lihat
 * `@amwal/core/affiliate/eligibility`.
 */

type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

export interface RecordAttributionInput {
  transactionId: string;
  /** Nilai mentah cookie `amwal_ref`; boleh kosong/tidak ada. */
  refCode: string | null | undefined;
  donorUserId: string;
}

export type RecordAttributionOutcome =
  | { recorded: true; referrerUserId: string }
  | {
      recorded: false;
      reason: 'no-ref-code' | 'invalid-code' | 'self-referral';
    };

export async function recordAttribution(
  tx: DatabaseTransaction,
  input: RecordAttributionInput
): Promise<RecordAttributionOutcome> {
  const code = input.refCode?.trim();
  if (!code) {
    return { recorded: false, reason: 'no-ref-code' };
  }

  const [owner] = await tx
    .select({ userId: affiliateCodes.userId })
    .from(affiliateCodes)
    .where(eq(affiliateCodes.code, code))
    .limit(1);

  if (!owner) {
    return { recorded: false, reason: 'invalid-code' };
  }

  if (owner.userId === input.donorUserId) {
    return { recorded: false, reason: 'self-referral' };
  }

  // `transactionId` adalah primary key: paling banyak satu baris per
  // transaksi walau helper ini keliru terpanggil dua kali.
  await tx
    .insert(affiliateAttributions)
    .values({
      transactionId: input.transactionId,
      referrerUserId: owner.userId,
      referralCode: code,
    })
    .onConflictDoNothing();

  return { recorded: true, referrerUserId: owner.userId };
}
