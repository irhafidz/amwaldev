import { count, eq, sum } from 'drizzle-orm';
import { transactions, waqfPrograms } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Canary port of `apps/server/src/routes/admin/overview.ts` `GET /kpi`
 * (Batch 4 original). Same query, same shape, same guard (`ADMIN` only) —
 * this is Batch 0's proof that the oRPC path returns byte-identical business
 * data to the REST path before any other domain is ported. See Gate #4 in
 * docs/PUTARAN-17.md. Relocated from `router/admin.ts` into the
 * `router/admin/` folder alongside its Batch 4 siblings.
 */
const kpi = adminProcedure.handler(async ({ context }) => {
  const [fundsRows, paidRows, totalRows, programRows] = await Promise.all([
    context.db
      .select({ value: sum(transactions.amount) })
      .from(transactions)
      .where(eq(transactions.statusPembayaran, 'LUNAS')),
    context.db
      .select({ value: count() })
      .from(transactions)
      .where(eq(transactions.statusPembayaran, 'LUNAS')),
    context.db.select({ value: count() }).from(transactions),
    context.db
      .select({ value: count() })
      .from(waqfPrograms)
      .where(eq(waqfPrograms.status, 'LIVE')),
  ]);

  return {
    totalFundsCollected: fundsRows[0]?.value ?? '0',
    paidTransactions: Number(paidRows[0]?.value ?? 0),
    totalTransactions: Number(totalRows[0]?.value ?? 0),
    activePrograms: Number(programRows[0]?.value ?? 0),
  };
});

export const overview = { kpi };
