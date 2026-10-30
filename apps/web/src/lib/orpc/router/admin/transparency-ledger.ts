import {
  AKAD_LABELS,
  type AkadCategory,
  akadCategory,
} from '@amwal/core/analytics/akad-category';
import {
  ledgerInput,
  realizationLogInput,
} from '@amwal/core/contracts/admin-transparency';
import { SYSTEM_ANONYMOUS_USER_ID } from '@amwal/core/identity/guest';
import { and, desc, eq, ilike, ne, or, type SQL, sql } from 'drizzle-orm';
import {
  infaqOrders,
  programProgressReports,
  programReceiptAttachments,
  qurbanOrders,
  transactions,
  users,
  waqfOrders,
  waqfPrograms,
  zakatOrders,
} from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Verified = `transactions.status_pembayaran = 'LUNAS'`. Donor names come from
 * the order tables, which carry the anonymity flag, and search only ever runs
 * against the masked name so a query cannot reveal who an anonymous donor is.
 */

const MAX_ALLOCATIONS = 8;
const verified = eq(transactions.statusPembayaran, 'LUNAS');

const isAnonymous = sql<boolean>`(
  coalesce(${waqfOrders.isAnonymous}, false)
  or coalesce(${zakatOrders.isAnonymous}, false)
  or coalesce(${infaqOrders.namaPenginfaq} = 'Hamba Allah', false)
  or ${transactions.wakifId} = ${SYSTEM_ANONYMOUS_USER_ID}
)`;

const donorName = sql<string>`case when ${isAnonymous} then 'Hamba Allah' else coalesce(
  ${waqfOrders.namaWakif}, ${zakatOrders.namaMuzakki},
  ${infaqOrders.namaPenginfaq}, ${qurbanOrders.namaPengqurban},
  ${users.name}, 'Donatur'
) end`;

const isSedekah = sql`${infaqOrders.jenis} like 'SEDEKAH\\_%'`;

/** Mirrors `akadCategory()`; the ledger test asserts the two never drift. */
function akadCondition(akad: AkadCategory): SQL {
  const byType = (type: 'WAKAF' | 'ZAKAT' | 'QURBAN') =>
    sql`(${transactions.jenisTransaksi} = ${type} and not coalesce(${isSedekah}, false))`;
  switch (akad) {
    case 'SEDEKAH':
      return sql`coalesce(${isSedekah}, false)`;
    case 'INFAQ':
      return sql`(${transactions.jenisTransaksi} = 'INFAQ' and not coalesce(${isSedekah}, false))`;
    default:
      return byType(akad);
  }
}

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

function programLabel(row: {
  waqfJudul: string | null;
  infaqJenis: string | null;
  zakatJenis: string | null;
  hewan: string | null;
  destination: string;
}): string {
  if (row.waqfJudul) {
    return row.waqfJudul;
  }
  if (row.infaqJenis) {
    return titleCase(row.infaqJenis);
  }
  if (row.zakatJenis) {
    return `Zakat ${titleCase(row.zakatJenis)}`;
  }
  if (row.hewan) {
    return `Qurban ${titleCase(row.hewan)}`;
  }
  return row.destination;
}

function ledgerFilters(input: { akad?: AkadCategory; search?: string }) {
  const conditions: SQL[] = [verified];
  if (input.akad) {
    conditions.push(akadCondition(input.akad));
  }
  if (input.search) {
    const pattern = `%${input.search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const match = or(
      ilike(transactions.id, pattern),
      sql`${donorName} ilike ${pattern}`
    );
    if (match) {
      conditions.push(match);
    }
  }
  return and(...conditions);
}

const getLedger = adminProcedure
  .input(ledgerInput)
  .handler(async ({ input, context }) => {
    const where = ledgerFilters(input);

    const summaryQuery = context.db
      .select({
        count: sql<number>`count(*)::int`,
        volume: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
        donors: sql<number>`(count(distinct ${transactions.wakifId}) filter (where ${transactions.wakifId} <> ${SYSTEM_ANONYMOUS_USER_ID}))::int`,
      })
      .from(transactions)
      .where(verified);

    const filteredQuery = context.db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions)
      .leftJoin(waqfOrders, eq(waqfOrders.transactionId, transactions.id))
      .leftJoin(zakatOrders, eq(zakatOrders.transactionId, transactions.id))
      .leftJoin(infaqOrders, eq(infaqOrders.transactionId, transactions.id))
      .leftJoin(qurbanOrders, eq(qurbanOrders.transactionId, transactions.id))
      .leftJoin(users, eq(users.id, transactions.wakifId))
      .where(where);

    const rowsQuery = context.db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        paymentMethod: transactions.paymentMethod,
        destination: transactions.disbursementDestination,
        jenisTransaksi: transactions.jenisTransaksi,
        createdAt: transactions.createdAt,
        donorName,
        isAnonymous,
        waqfJudul: waqfPrograms.judul,
        infaqJenis: infaqOrders.jenis,
        zakatJenis: zakatOrders.jenisZakat,
        hewan: qurbanOrders.jenisHewan,
      })
      .from(transactions)
      .leftJoin(waqfOrders, eq(waqfOrders.transactionId, transactions.id))
      .leftJoin(waqfPrograms, eq(waqfPrograms.id, waqfOrders.waqfProgramId))
      .leftJoin(zakatOrders, eq(zakatOrders.transactionId, transactions.id))
      .leftJoin(infaqOrders, eq(infaqOrders.transactionId, transactions.id))
      .leftJoin(qurbanOrders, eq(qurbanOrders.transactionId, transactions.id))
      .leftJoin(users, eq(users.id, transactions.wakifId))
      .where(where)
      .orderBy(desc(transactions.createdAt), transactions.id)
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);

    const programTotalsQuery = context.db
      .select({
        label: waqfPrograms.judul,
        total: sql<string>`sum(${transactions.amount})::text`,
        txCount: sql<number>`count(*)::int`,
        donors: sql<number>`count(distinct ${transactions.wakifId})::int`,
      })
      .from(transactions)
      .innerJoin(waqfOrders, eq(waqfOrders.transactionId, transactions.id))
      .innerJoin(waqfPrograms, eq(waqfPrograms.id, waqfOrders.waqfProgramId))
      .where(verified)
      .groupBy(waqfPrograms.id, waqfPrograms.judul);

    const otherTotalsQuery = context.db
      .select({
        jenisTransaksi: transactions.jenisTransaksi,
        sedekah: sql<boolean>`coalesce(${isSedekah}, false)`,
        total: sql<string>`sum(${transactions.amount})::text`,
        txCount: sql<number>`count(*)::int`,
        donors: sql<number>`count(distinct ${transactions.wakifId})::int`,
      })
      .from(transactions)
      .leftJoin(infaqOrders, eq(infaqOrders.transactionId, transactions.id))
      .where(and(verified, ne(transactions.jenisTransaksi, 'WAKAF')))
      .groupBy(transactions.jenisTransaksi, sql`coalesce(${isSedekah}, false)`);

    // The five reads are independent: one round trip instead of five in a row.
    const [summaryRows, filteredRows, rows, programTotals, otherTotals] =
      await Promise.all([
        summaryQuery,
        filteredQuery,
        rowsQuery,
        programTotalsQuery,
        otherTotalsQuery,
      ]);
    const summary = summaryRows[0];
    const filtered = filteredRows[0];
    const volume = Number(summary?.volume ?? 0);

    const allocations = [
      ...programTotals.map((row) => ({
        kind: 'program' as const,
        label: row.label,
        total: Number(row.total),
        txCount: row.txCount,
        donors: row.donors,
      })),
      ...otherTotals.map((row) => ({
        kind: 'akad' as const,
        label:
          AKAD_LABELS[
            akadCategory(row.jenisTransaksi, row.sedekah ? 'SEDEKAH_' : null)
          ],
        total: Number(row.total),
        txCount: row.txCount,
        donors: row.donors,
      })),
    ]
      .sort((a, b) => b.total - a.total)
      .slice(0, MAX_ALLOCATIONS)
      .map((allocation) => ({
        ...allocation,
        share:
          volume === 0
            ? 0
            : Math.round((allocation.total / volume) * 1000) / 10,
      }));

    return {
      data: {
        summary: {
          totalCount: summary?.count ?? 0,
          totalVolume: volume,
          uniqueDonors: summary?.donors ?? 0,
        },
        allocations,
        items: rows.map((row) => ({
          id: row.id,
          donorName: row.donorName,
          isAnonymous: row.isAnonymous,
          amount: Number(row.amount),
          akad: akadCategory(row.jenisTransaksi, row.infaqJenis),
          program: programLabel(row),
          createdAt: row.createdAt,
          paymentMethod: row.paymentMethod,
        })),
        total: filtered?.total ?? 0,
        page: input.page,
        limit: input.limit,
      },
    };
  });

const getRealizationLog = adminProcedure
  .input(realizationLogInput)
  .handler(async ({ input, context }) => {
    const pattern = input.search
      ? `%${input.search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
      : null;
    const where = pattern
      ? or(
          ilike(programReceiptAttachments.id, pattern),
          ilike(waqfPrograms.judul, pattern),
          ilike(programReceiptAttachments.title, pattern),
          ilike(programReceiptAttachments.vendorName, pattern)
        )
      : undefined;

    const base = context.db
      .select({
        id: programReceiptAttachments.id,
        programTitle: waqfPrograms.judul,
        title: programReceiptAttachments.title,
        vendorName: programReceiptAttachments.vendorName,
        fileName: programReceiptAttachments.fileName,
        nominal: programReceiptAttachments.nominal,
        createdAt: programReceiptAttachments.createdAt,
        progress: programProgressReports.persentaseFisik,
        uploaderName: users.name,
        verification: waqfPrograms.verificationStatus,
      })
      .from(programReceiptAttachments)
      .innerJoin(
        waqfPrograms,
        eq(waqfPrograms.id, programReceiptAttachments.waqfProgramId)
      )
      .leftJoin(
        programProgressReports,
        eq(
          programProgressReports.id,
          programReceiptAttachments.progressReportId
        )
      )
      .leftJoin(users, eq(users.id, programReceiptAttachments.uploadedById));

    const [totals] = await context.db
      .select({
        count: sql<number>`count(*)::int`,
        nominal: sql<string>`coalesce(sum(${programReceiptAttachments.nominal}), 0)::text`,
      })
      .from(programReceiptAttachments)
      .innerJoin(
        waqfPrograms,
        eq(waqfPrograms.id, programReceiptAttachments.waqfProgramId)
      )
      .where(where);

    const rows = await base
      .where(where)
      .orderBy(
        desc(programReceiptAttachments.createdAt),
        programReceiptAttachments.id
      )
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);

    return {
      data: {
        total: totals?.count ?? 0,
        totalNominal: Number(totals?.nominal ?? 0),
        page: input.page,
        limit: input.limit,
        items: rows.map((row) => ({
          id: row.id,
          programTitle: row.programTitle,
          activity: row.title ?? row.vendorName ?? row.fileName,
          vendorName: row.vendorName,
          fileName: row.fileName,
          nominal: row.nominal === null ? null : Number(row.nominal),
          progress: row.progress === null ? null : Number(row.progress),
          uploaderName: row.uploaderName,
          verification: row.verification,
          createdAt: row.createdAt,
        })),
      },
    };
  });

export const transparencyLedger = { getLedger, getRealizationLog };
