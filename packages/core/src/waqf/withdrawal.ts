import { eq } from 'drizzle-orm';
import {
  fundWithdrawalRequests,
  waqfPrincipalLedgers,
  waqfPrograms,
} from '../db/schema';
import type { Database } from '../db/types';
import { disburse, type WaqfCategory } from './ledger';

/**
 * Ported from `apps/server/src/routes/admin/waqf.ts` (Putaran 17, Batch 4)
 * — the withdrawal-approval orchestration around the pure `disburse()` fiqh
 * invariant (Zone 0). Already DI-clean in the original (`tx` was always a
 * parameter); relocated so both apps' admin surfaces reject an over-draw the
 * same way. `disburse()` itself is untouched (ported Batch 1).
 */

type WithdrawalTx = Parameters<Parameters<Database['transaction']>[0]>[0];

// Money helpers — `numeric(18,2)` columns come back as strings. All ledger
// arithmetic runs in integer cents so it never touches a float.

export function toCents(numericStr: string): bigint {
  const negative = numericStr.trim().startsWith('-');
  const [intPart, fracRaw = ''] = numericStr.trim().replace('-', '').split('.');
  const frac = `${fracRaw}00`.slice(0, 2);
  const cents = BigInt(intPart || '0') * 100n + BigInt(frac);
  return negative ? -cents : cents;
}

export function centsToNumeric(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

export type WithdrawalApprovalResult =
  | { kind: 'notFound' }
  | { kind: 'alreadyReviewed' }
  | { kind: 'ledgerMissing' }
  | { kind: 'approved'; row: typeof fundWithdrawalRequests.$inferSelect };

/**
 * Approving a withdrawal moves money out of a waqf ledger — Zone 0.
 *
 * The fiqh invariant is enforced by the pure `disburse()` function, never by
 * hand-written SQL:
 *   - HABIS_PAKAI     → draws from `pokokDanaTerkumpul`
 *   - PRODUKTIF_KEKAL → draws ONLY from `totalHasilAvailable`; principal is
 *     never touched, `hasilInvestasiTersalurkan` rises by the same amount
 * `disburse()` throws on an over-draw before any row is written (message
 * starts with `Insufficient ` or contains `exact integer amount`), so the
 * whole transaction rolls back and callers map that to a 422/
 * UNPROCESSABLE_CONTENT-shaped response.
 */
export async function approveWithdrawalTx(
  tx: WithdrawalTx,
  input: {
    requestId: string;
    adminId: string;
    adminNotes: string | null;
    now: string;
  }
): Promise<WithdrawalApprovalResult> {
  const [request] = await tx
    .select()
    .from(fundWithdrawalRequests)
    .where(eq(fundWithdrawalRequests.id, input.requestId))
    .limit(1);
  if (!request) {
    return { kind: 'notFound' };
  }
  if (request.status !== 'PENDING') {
    return { kind: 'alreadyReviewed' };
  }

  const [program] = await tx
    .select({ jenisWakaf: waqfPrograms.jenisWakaf })
    .from(waqfPrograms)
    .where(eq(waqfPrograms.id, request.waqfProgramId))
    .limit(1);
  const [ledger] = await tx
    .select()
    .from(waqfPrincipalLedgers)
    .where(eq(waqfPrincipalLedgers.waqfProgramId, request.waqfProgramId))
    .limit(1);
  if (!(program && ledger)) {
    return { kind: 'ledgerMissing' };
  }

  const category = program.jenisWakaf as WaqfCategory;
  const amountCents = toCents(request.amount);
  const nextState = disburse(
    {
      category,
      pokokDanaTerkumpul: toCents(ledger.pokokDanaTerkumpul),
      totalHasilAvailable: toCents(ledger.totalHasilAvailable),
    },
    Number(amountCents)
  );

  const disbursedCents =
    category === 'PRODUKTIF_KEKAL'
      ? toCents(ledger.hasilInvestasiTersalurkan) + amountCents
      : toCents(ledger.hasilInvestasiTersalurkan);

  await tx
    .update(waqfPrincipalLedgers)
    .set({
      pokokDanaTerkumpul: centsToNumeric(BigInt(nextState.pokokDanaTerkumpul)),
      totalHasilAvailable: centsToNumeric(
        BigInt(nextState.totalHasilAvailable)
      ),
      hasilInvestasiTersalurkan: centsToNumeric(disbursedCents),
      updatedAt: input.now,
    })
    .where(eq(waqfPrincipalLedgers.id, ledger.id));

  const [row] = await tx
    .update(fundWithdrawalRequests)
    .set({
      status: 'APPROVED',
      adminNotes: input.adminNotes,
      approvedById: input.adminId,
      reviewedAt: input.now,
    })
    .where(eq(fundWithdrawalRequests.id, input.requestId))
    .returning();

  return { kind: 'approved', row };
}

/** True when `error` is `disburse()`'s over-draw / non-integer-amount rejection. */
export function isWithdrawalInvariantError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return (
    message.startsWith('Insufficient ') ||
    message.includes('exact integer amount')
  );
}
