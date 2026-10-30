import { desc, eq } from 'drizzle-orm';
import {
  mauqufAlaihDistributions,
  transactions,
  waqfPrograms,
  zakatDistributions,
} from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';
import { transparencyLedger } from './transparency-ledger';

/**
 * oRPC admin.transparency router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/transparency.ts`. Cross-module audit trail:
 * every payment-gateway `Transaction` (the generic money anchor) plus
 * recorded distributions of waqf yield and zakat. Read-only aggregation —
 * this is the public-facing transparency record, so no donor identity is
 * joined in, only amounts, destinations and status.
 */

const logs = adminProcedure.handler(async ({ context }) => {
  const [txns, waqfDist, zktDist] = await Promise.all([
    context.db
      .select({
        id: transactions.id,
        jenisTransaksi: transactions.jenisTransaksi,
        amount: transactions.amount,
        statusPembayaran: transactions.statusPembayaran,
        disbursementDestination: transactions.disbursementDestination,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .orderBy(desc(transactions.createdAt))
      .limit(200),
    context.db
      .select({
        id: mauqufAlaihDistributions.id,
        namaPenerimaManfaat: mauqufAlaihDistributions.namaPenerimaManfaat,
        nominalDisalurkan: mauqufAlaihDistributions.nominalDisalurkan,
        tanggalPenyaluran: mauqufAlaihDistributions.tanggalPenyaluran,
        judul: waqfPrograms.judul,
      })
      .from(mauqufAlaihDistributions)
      .leftJoin(
        waqfPrograms,
        eq(waqfPrograms.id, mauqufAlaihDistributions.waqfProgramId)
      )
      .orderBy(desc(mauqufAlaihDistributions.id))
      .limit(100),
    context.db
      .select({
        id: zakatDistributions.id,
        jenisZakat: zakatDistributions.jenisZakat,
        nominal: zakatDistributions.nominal,
        beratBerasKg: zakatDistributions.beratBerasKg,
        status: zakatDistributions.status,
        createdAt: zakatDistributions.createdAt,
      })
      .from(zakatDistributions)
      .orderBy(desc(zakatDistributions.createdAt))
      .limit(100),
  ]);

  return {
    data: {
      transactions: txns,
      waqfDistributions: waqfDist,
      zakatDistributions: zktDist,
    },
  };
});

export const transparency = {
  logs,
  ...transparencyLedger,
};
