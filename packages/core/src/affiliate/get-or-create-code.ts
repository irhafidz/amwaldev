import { eq } from 'drizzle-orm';
import { affiliateCodes } from '../db/schema';
import type { Database } from '../db/types';
import { generateReferralCode } from './code';

/**
 * Ambil-atau-buat kode referral opak milik satu user [I-4].
 *
 * `userId` adalah primary key `affiliate_codes`, jadi dua permintaan
 * bersamaan untuk user yang sama berlomba pada baris yang sama:
 * `onConflictDoNothing()` tanpa target membiarkan KEDUA jenis konflik
 * lolos tanpa error — konflik `userId` (lawan menang lomba) maupun konflik
 * `code` (tabrakan acak dengan kode user lain, praktis mustahil pada 96 bit
 * entropi). Pembacaan ulang sesudahnya membedakan keduanya: baris untuk
 * `userId` ini sudah ada → lawan menang, pakai kodenya; masih tidak ada →
 * yang tabrakan adalah nilai `code`, coba lagi dengan kode acak baru.
 */
const MAX_GENERATION_ATTEMPTS = 5;

export async function getOrCreateAffiliateCode(
  db: Database,
  userId: string
): Promise<string> {
  const [existing] = await db
    .select({ code: affiliateCodes.code })
    .from(affiliateCodes)
    .where(eq(affiliateCodes.userId, userId))
    .limit(1);

  if (existing) {
    return existing.code;
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = generateReferralCode();

    const [inserted] = await db
      .insert(affiliateCodes)
      .values({ userId, code })
      .onConflictDoNothing()
      .returning({ code: affiliateCodes.code });

    if (inserted) {
      return inserted.code;
    }

    const [row] = await db
      .select({ code: affiliateCodes.code })
      .from(affiliateCodes)
      .where(eq(affiliateCodes.userId, userId))
      .limit(1);

    if (row) {
      return row.code;
    }
  }

  throw new Error('AFFILIATE_CODE_GENERATION_FAILED');
}
