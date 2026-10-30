import { withQrImage } from '@amwal/core/payment/mayar-instructions';
import { resumablePayment } from '@amwal/core/payment/resume';
import { parseInstant } from '@amwal/core/time/wib';
import { ORPCError } from '@orpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@/lib/db';
import {
  infaqOrders,
  nadzirProfiles,
  qurbanOrders,
  transactions,
  waqfOrders,
  waqfPrograms,
  zakatOrders,
} from '@/lib/db/schema';
import { protectedProcedure } from '../procedures';

/**
 * oRPC transactions router — donor-facing payment history.
 *
 * This is the one screen in the app that never had a backend at all: the UI
 * (`components/history/*`) shipped in S10-A-11 calling `/api/transactions`,
 * which was never implemented in `apps/server` or anywhere else. Read-only;
 * every row it returns already exists, written by the payment/webhook path.
 *
 * Ownership follows the same rule as the certificate route: a donor sees only
 * rows whose `wakifId` is their own session, an ADMIN sees any. Note the list
 * and the detail enforce it differently on purpose — the list *scopes the
 * query* so another donor's row can never enter the result set, while the
 * detail fetches then checks, because it is addressed by id and must be able
 * to tell "does not exist" (404) from "not yours" (403).
 *
 * A transaction is linked to exactly one of four order tables, none of which
 * share a parent, so the receipt number / program title are gathered with a
 * left join per module and coalesced in TypeScript rather than SQL — keeping
 * the null handling readable and the column list explicit.
 */

const listInput = z
  .object({
    /** ADMIN only — read another donor's history. Ignored for other roles. */
    wakifId: z.string().min(1).optional(),
  })
  .optional();

const selection = {
  id: transactions.id,
  wakifId: transactions.wakifId,
  jenisTransaksi: transactions.jenisTransaksi,
  amount: transactions.amount,
  paymentMethod: transactions.paymentMethod,
  paymentGatewayRef: transactions.paymentGatewayRef,
  statusPembayaran: transactions.statusPembayaran,
  disbursementDestination: transactions.disbursementDestination,
  createdAt: transactions.createdAt,
  paymentExpiresAt: transactions.paymentExpiresAt,
  // Daftar cukup tahu ADA instruksi tersimpan; isinya hanya dikirim detail.
  hasStoredPayment: sql<boolean>`(${transactions.paymentInstructions} is not null or ${transactions.paymentUrl} is not null)`,

  waqfOrderId: waqfOrders.id,
  waqfKwitansi: waqfOrders.nomorKwitansi,
  waqfStatus: waqfOrders.status,
  waqfDonor: waqfOrders.namaWakif,
  waqfAnonymous: waqfOrders.isAnonymous,
  programTitle: waqfPrograms.judul,
  nazhirName: nadzirProfiles.namaLembaga,

  zakatOrderId: zakatOrders.id,
  zakatKwitansi: zakatOrders.nomorKwitansi,
  zakatDonor: zakatOrders.namaMuzakki,

  qurbanOrderId: qurbanOrders.id,
  qurbanDonor: qurbanOrders.namaPengqurban,

  infaqOrderId: infaqOrders.id,
  infaqDonor: infaqOrders.namaPenginfaq,
} as const;

/**
 * One builder for both handlers so the join set — and therefore the row type
 * — cannot drift between the list and the detail.
 */
function selectTransactions(database: Database) {
  return database
    .select(selection)
    .from(transactions)
    .leftJoin(waqfOrders, eq(waqfOrders.transactionId, transactions.id))
    .leftJoin(waqfPrograms, eq(waqfPrograms.id, waqfOrders.waqfProgramId))
    .leftJoin(
      nadzirProfiles,
      eq(nadzirProfiles.id, waqfPrograms.nadzirProfileId)
    )
    .leftJoin(zakatOrders, eq(zakatOrders.transactionId, transactions.id))
    .leftJoin(qurbanOrders, eq(qurbanOrders.transactionId, transactions.id))
    .leftJoin(infaqOrders, eq(infaqOrders.transactionId, transactions.id));
}

type Row = Awaited<ReturnType<typeof selectTransactions>>[number];

/** Shapes one joined row into the flat item the history UI already expects. */
function toItem(row: Row, now: number) {
  // Bentuk minimal untuk menilai "bisa dilanjutkan" tanpa memuat instruksi.
  const canResume =
    resumablePayment(
      {
        statusPembayaran: row.statusPembayaran,
        orderStatus: row.waqfStatus,
        paymentExpiresAt: row.paymentExpiresAt,
        createdAt: row.createdAt,
        paymentUrl: row.hasStoredPayment ? 'stored' : null,
      },
      now
    ) !== null;
  return {
    id: row.id,
    orderId:
      row.waqfOrderId ??
      row.zakatOrderId ??
      row.qurbanOrderId ??
      row.infaqOrderId ??
      undefined,
    nomorKwitansi: row.waqfKwitansi ?? row.zakatKwitansi ?? undefined,
    jenisTransaksi: row.jenisTransaksi,
    programTitle: row.programTitle ?? undefined,
    nazhirName: row.nazhirName ?? undefined,
    amount: row.amount,
    paymentMethod: row.paymentMethod ?? undefined,
    statusPembayaran: row.statusPembayaran,
    status: row.waqfStatus ?? undefined,
    createdAt: row.createdAt,
    // ISO dengan zona waktu: kolom DB naif (UTC) dibaca sebagai waktu lokal
    // oleh `Date.parse` di peramban.
    paymentExpiresAt: row.paymentExpiresAt
      ? parseInstant(row.paymentExpiresAt).toISOString()
      : undefined,
    canResume,
  };
}

const list = protectedProcedure
  .input(listInput)
  .handler(async ({ input, context }) => {
    const user = context.user;
    if (!user) {
      throw new ORPCError('UNAUTHORIZED');
    }

    // An ADMIN may target another donor; everyone else is pinned to their own
    // id regardless of what they send.
    const scopeId =
      user.role === 'ADMIN' && input?.wakifId ? input.wakifId : user.userId;

    const rows = await selectTransactions(context.db)
      .where(eq(transactions.wakifId, scopeId))
      .orderBy(desc(transactions.createdAt));

    const now = Date.now();
    return { data: rows.map((row) => toItem(row, now)) };
  });

const detail = protectedProcedure
  .input(z.object({ transactionId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const user = context.user;
    if (!user) {
      throw new ORPCError('UNAUTHORIZED');
    }

    const [row] = await selectTransactions(context.db).where(
      eq(transactions.id, input.transactionId)
    );

    if (!row) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Transaksi tidak ditemukan',
      });
    }

    if (user.role !== 'ADMIN' && row.wakifId !== user.userId) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Forbidden: Insufficient privileges',
      });
    }

    const now = Date.now();
    const [stored] = await context.db
      .select({
        paymentInstructions: transactions.paymentInstructions,
        paymentUrl: transactions.paymentUrl,
      })
      .from(transactions)
      .where(eq(transactions.id, row.id));
    const resume = resumablePayment(
      {
        statusPembayaran: row.statusPembayaran,
        orderStatus: row.waqfStatus,
        paymentExpiresAt: row.paymentExpiresAt,
        createdAt: row.createdAt,
        paymentInstructions: stored?.paymentInstructions,
        paymentUrl: stored?.paymentUrl,
      },
      now
    );

    return {
      data: {
        ...toItem(row, now),
        // QA-02: instruksi untuk tombol "Lanjutkan Pembayaran" (null bila
        // sudah lunas, gagal, kedaluwarsa, atau tidak ada yang tersimpan).
        resume: resume
          ? {
              ...resume,
              instructions: await withQrImage(resume.instructions),
            }
          : null,
        donorName:
          row.waqfDonor ??
          row.zakatDonor ??
          row.qurbanDonor ??
          row.infaqDonor ??
          undefined,
        isAnonymous: row.waqfAnonymous ?? undefined,
        disbursementDestination: row.disbursementDestination,
        paymentGatewayRef: row.paymentGatewayRef ?? undefined,
      },
    };
  });

export const transactionsRouter = {
  list,
  detail,
};
