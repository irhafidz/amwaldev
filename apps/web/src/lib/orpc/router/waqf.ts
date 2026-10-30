import { getActive, recordAkadAcceptance, sha256Body } from '@amwal/core/akad';
import { createOrderSchema } from '@amwal/core/contracts/waqf';
import { cleanOptional, resolveGuestDonor } from '@amwal/core/identity/guest';
import { orderPaymentMethod } from '@amwal/core/payment/methods';
import { createPayment } from '@amwal/core/payment/service';
import { toDisbursementDestination } from '@amwal/core/payment/types';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { readReferralCookie } from '@/lib/affiliate/referral-cookie';
import { resolveRequestUser } from '@/lib/auth/core';
import type { Database } from '@/lib/db';
import {
  nadzirProfiles,
  programProgressReports,
  programReceiptAttachments,
  transactions,
  waqfOrders,
  waqfPrincipalLedgers,
  waqfPrograms,
} from '@/lib/db/schema';
import { translatePaymentErrors } from '@/lib/payment/errors';
import { reconcileOrderNow } from '@/lib/payment/reconcile-order';
import { loadResumePayment } from '@/lib/payment/resume';
import { publicOrigin } from '@/lib/public-url';
import { publicMediaColumns, withMediaUrls } from '@/lib/waqf-media';
import { publicProcedure } from '../procedures';

/**
 * oRPC waqf router (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/routes/waqf.ts`. All procedures are public, matching the
 * REST route's own guard-free surface; order creation is the only
 * money-moving procedure and delegates to the same
 * `@amwal/core/payment/service` `createPayment` (anchor-before-charge).
 */

const programSelectColumns = {
  id: waqfPrograms.id,
  nadzirProfileId: waqfPrograms.nadzirProfileId,
  kodeProgram: waqfPrograms.kodeProgram,
  judul: waqfPrograms.judul,
  kategori: waqfPrograms.kategori,
  deskripsi: waqfPrograms.deskripsi,
  targetDana: waqfPrograms.targetDana,
  durasiHari: waqfPrograms.durasiHari,
  jenisWakaf: waqfPrograms.jenisWakaf,
  status: waqfPrograms.status,
  provinsi: waqfPrograms.provinsi,
  kabupatenKota: waqfPrograms.kabupatenKota,
  kecamatan: waqfPrograms.kecamatan,
  kelurahanDesa: waqfPrograms.kelurahanDesa,
  kodeWilayah: waqfPrograms.kodeWilayah,
  createdAt: waqfPrograms.createdAt,
  updatedAt: waqfPrograms.updatedAt,
} as const;

async function enrichProgramRows<
  T extends { id: string; nadzirProfileId: string },
>(database: Database, programs: T[]) {
  const programIds = programs.map((program) => program.id);
  const nadzirProfileIds = [
    ...new Set(programs.map((program) => program.nadzirProfileId)),
  ];

  const [ledgers, profiles] = await Promise.all([
    programIds.length > 0
      ? database
          .select()
          .from(waqfPrincipalLedgers)
          .where(inArray(waqfPrincipalLedgers.waqfProgramId, programIds))
      : Promise.resolve([]),
    nadzirProfileIds.length > 0
      ? database
          .select()
          .from(nadzirProfiles)
          .where(inArray(nadzirProfiles.id, nadzirProfileIds))
      : Promise.resolve([]),
  ]);

  const ledgerByProgram = new Map(
    ledgers.map((ledger) => [ledger.waqfProgramId, ledger])
  );
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return programs.map((program) => {
    const ledger = ledgerByProgram.get(program.id);
    const profile = profileById.get(program.nadzirProfileId);

    return {
      ...program,
      principalLedger: ledger
        ? {
            id: ledger.id,
            pokokDanaTerkumpul: ledger.pokokDanaTerkumpul,
            totalHasilAvailable: ledger.totalHasilAvailable,
            hasilInvestasiTersalurkan: ledger.hasilInvestasiTersalurkan,
            updatedAt: ledger.updatedAt,
          }
        : null,
      nadzirProfile: profile
        ? {
            id: profile.id,
            namaLembaga: profile.namaLembaga,
            kategori: profile.kategori,
            statusVerifikasi: profile.statusVerifikasi,
          }
        : null,
    };
  });
}

const listProgramsInput = z.object({
  category: z.enum(['HABIS_PAKAI', 'PRODUKTIF_KEKAL']).optional(),
  active: z.boolean().optional(),
});

const list = publicProcedure
  .input(listProgramsInput)
  .handler(async ({ input, context }) => {
    const conditions: SQL[] = [];
    if (input.category) {
      conditions.push(eq(waqfPrograms.jenisWakaf, input.category));
    }
    if (input.active) {
      conditions.push(eq(waqfPrograms.status, 'LIVE'));
    }

    const rows = await context.db
      .select({ ...programSelectColumns, ...publicMediaColumns })
      .from(waqfPrograms)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(waqfPrograms.createdAt));

    return {
      data: await enrichProgramRows(context.db, rows.map(withMediaUrls)),
    };
  });

const detail = publicProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const [program] = await context.db
      .select({
        ...programSelectColumns,
        ...publicMediaColumns,
        latestProgressFisik: sql<string | null>`(
          select ${programProgressReports.persentaseFisik}
          from ${programProgressReports}
          where ${programProgressReports.waqfProgramId} = ${waqfPrograms.id}
          order by ${programProgressReports.createdAt} desc
          limit 1
        )`,
      })
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, input.id));

    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }

    const [enriched] = await enrichProgramRows(context.db, [
      withMediaUrls(program),
    ]);

    const [receipts, progressReports] = await Promise.all([
      context.db
        .select({
          id: programReceiptAttachments.id,
          title: programReceiptAttachments.title,
          vendorName: programReceiptAttachments.vendorName,
          nominal: programReceiptAttachments.nominal,
          fileName: programReceiptAttachments.fileName,
          mimeType: programReceiptAttachments.mimeType,
          isPhotoEvidence: programReceiptAttachments.isPhotoEvidence,
          createdAt: programReceiptAttachments.createdAt,
        })
        .from(programReceiptAttachments)
        .where(eq(programReceiptAttachments.waqfProgramId, input.id))
        .orderBy(desc(programReceiptAttachments.createdAt)),
      context.db
        .select({
          id: programProgressReports.id,
          persentaseFisik: programProgressReports.persentaseFisik,
          deskripsi: programProgressReports.deskripsi,
          createdAt: programProgressReports.createdAt,
        })
        .from(programProgressReports)
        .where(eq(programProgressReports.waqfProgramId, input.id))
        .orderBy(desc(programProgressReports.createdAt)),
    ]);

    return {
      data: {
        ...enriched,
        latestProgressFisik: program.latestProgressFisik,
        receipts,
        progressReports,
      },
    };
  });

const donatur = publicProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: waqfOrders.id,
        isAnonymous: waqfOrders.isAnonymous,
        donorName: waqfOrders.namaWakif,
        nominal: waqfOrders.nominal,
        status: waqfOrders.status,
        metodePembayaran: waqfOrders.metodePembayaran,
        createdAt: waqfOrders.createdAt,
      })
      .from(waqfOrders)
      .where(eq(waqfOrders.waqfProgramId, input.id))
      .orderBy(desc(waqfOrders.createdAt))
      .limit(100);

    return {
      data: rows.map((row) => ({
        id: row.id,
        donorName: row.isAnonymous ? 'Hamba Allah' : row.donorName,
        nominal: row.nominal,
        status: row.status,
        metodePembayaran: row.metodePembayaran,
        createdAt: row.createdAt,
      })),
    };
  });

async function validateAkadAcceptance(
  activeAkad: Awaited<ReturnType<typeof getActive>>,
  acceptance: z.infer<typeof createOrderSchema>['akadAcceptance']
) {
  if (!activeAkad) {
    return;
  }
  if (!acceptance) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Persetujuan akad wakaf wajib diterima.',
    });
  }
  if (
    acceptance.templateId !== activeAkad.id ||
    acceptance.version !== activeAkad.version
  ) {
    throw new ORPCError('CONFLICT', {
      message:
        'Versi akad telah diperbarui. Silakan tinjau dan setujui kembali redaksi terbaru.',
    });
  }
  if (acceptance.bodySha256 !== (await sha256Body(activeAkad.body))) {
    throw new ORPCError('CONFLICT', {
      message:
        'Integritas redaksi akad tidak cocok. Silakan muat ulang formulir.',
    });
  }
}

const createOrder = publicProcedure
  .input(createOrderSchema)
  .handler(async ({ input, context }) => {
    const [program] = await context.db
      .select()
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, input.programId));

    if (!program) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Program wakaf tidak ditemukan',
      });
    }

    const [nadzir] = await context.db
      .select({ namaLembaga: nadzirProfiles.namaLembaga })
      .from(nadzirProfiles)
      .where(eq(nadzirProfiles.id, program.nadzirProfileId));

    const activeAkad = await getActive(context.db, 'WAKAF');
    await validateAkadAcceptance(activeAkad, input.akadAcceptance);

    // Sesi login yang sah adalah pemilik order, sehingga donasi muncul di
    // Riwayat akun itu. `resolveGuestDonor` hanya untuk tamu: ia sengaja tidak
    // menautkan email/HP ketikan ke akun terdaftar (QA-01, Fase 2). Prosedur
    // publik tidak mengisi `context.user`, jadi sesi dibaca dari request.
    const sessionUser = await resolveRequestUser(context.request);
    const userId =
      sessionUser?.userId ?? (await resolveGuestDonor(context.db, input));
    const disbursementDestination = toDisbursementDestination(
      nadzir?.namaLembaga || 'Badan Pengelola Wakaf'
    );
    const amount = String(input.amount) as `${number}`;

    const result = await translatePaymentErrors(() =>
      createPayment(
        {
          module: 'WAQF',
          userId,
          grossAmount: amount,
          paymentType: input.paymentType,
          disbursementDestination,
          customerName: input.isAnonymous ? 'Hamba Allah' : input.donorName,
          customerEmail: cleanOptional(input.donorEmail) ?? undefined,
          customerMobile: cleanOptional(input.donorPhone) ?? undefined,
          description: `Donasi Wakaf - ${program.judul}`,
          // Payment providers (Mayar confirmed) reject a relative path here —
          // "redirectUrl must be a valid URL" — so it has to be absolute.
          redirectUrl: `${publicOrigin(context.request)}/wakaf/status?orderId={orderId}`,
          metadata: {
            programId: program.id,
            programTitle: program.judul,
          },
          refCode: readReferralCookie(context.request),
          order: {
            nomorKwitansi: `AMW-${new Date().getFullYear()}-${ulid()}`,
            waqfProgramId: input.programId,
            namaWakif: input.donorName,
            noTelepon: cleanOptional(input.donorPhone) ?? undefined,
            atasNamaWakif: input.donorName,
            doa: cleanOptional(input.doa) ?? undefined,
            isAnonymous: input.isAnonymous,
            bentukWakaf: 'UANG',
            nominal: amount,
            metodePembayaran: orderPaymentMethod(input.paymentType),
          },
        },
        { database: context.db, paymentProvider: context.paymentProvider }
      )
    );

    if (activeAkad && input.akadAcceptance) {
      await recordAkadAcceptance(context.db, {
        transactionId: result.transactionId,
        templateId: activeAkad.id,
        version: activeAkad.version,
        bodySha256: input.akadAcceptance.bodySha256,
      });
    }

    return {
      orderId: result.orderId,
      transactionId: result.transactionId,
      redirectUrl: result.payment.redirectUrl,
      payment: result.payment,
    };
  });

type WaqfOrderRow = typeof waqfOrders.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

/** The order's owner (or an admin) sees their own receipt data, minus internals. */
function ownerOrderView(order: WaqfOrderRow) {
  return {
    id: order.id,
    nomorKwitansi: order.nomorKwitansi,
    namaWakif: order.isAnonymous ? 'Hamba Allah' : order.namaWakif,
    isAnonymous: order.isAnonymous,
    bentukWakaf: order.bentukWakaf,
    nominal: order.nominal,
    metodePembayaran: order.metodePembayaran,
    status: order.status,
    createdAt: order.createdAt,
  };
}

/**
 * Anyone else (guests, other users) gets only what the payment return page
 * needs: no name, phone, address or receipt number, regardless of who donated.
 */
function publicOrderView(order: WaqfOrderRow) {
  return {
    id: order.id,
    nomorKwitansi: null,
    namaWakif: 'Hamba Allah',
    isAnonymous: true,
    bentukWakaf: order.bentukWakaf,
    nominal: order.nominal,
    metodePembayaran: null,
    status: order.status,
    createdAt: order.createdAt,
  };
}

function statusOnlyTransaction(transaction: TransactionRow, isOwner: boolean) {
  return {
    id: isOwner ? transaction.id : null,
    statusPembayaran: transaction.statusPembayaran,
    amount: transaction.amount,
    paymentMethod: isOwner ? transaction.paymentMethod : null,
    paymentGatewayRef: null,
    createdAt: transaction.createdAt,
  };
}

async function loadOrderWithTransaction(db: Database, orderId: string) {
  const [order] = await db
    .select()
    .from(waqfOrders)
    .where(eq(waqfOrders.id, orderId));
  if (!order) {
    return null;
  }

  const [transaction] = order.transactionId
    ? await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, order.transactionId))
    : [undefined];

  return { order, transaction };
}

const orderStatus = publicProcedure
  .input(z.object({ orderId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    let loaded = await loadOrderWithTransaction(context.db, input.orderId);
    if (!loaded) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Order wakaf tidak ditemukan',
      });
    }

    const { transaction: pendingTransaction } = loaded;
    const isPending =
      loaded.order.status !== 'TERVERIFIKASI' ||
      pendingTransaction?.statusPembayaran === 'PENDING';

    if (isPending && pendingTransaction) {
      const reconciled = await reconcileOrderNow({
        db: context.db,
        provider: context.paymentProvider,
        transactionId: pendingTransaction.id,
      });
      if (reconciled) {
        loaded =
          (await loadOrderWithTransaction(context.db, input.orderId)) ?? loaded;
      }
    }

    const { order, transaction } = loaded;
    const [program] = await context.db
      .select({
        id: waqfPrograms.id,
        judul: waqfPrograms.judul,
        kategori: waqfPrograms.kategori,
      })
      .from(waqfPrograms)
      .where(eq(waqfPrograms.id, order.waqfProgramId));

    const viewer = await resolveRequestUser(context.request);
    const isOwner =
      viewer !== null &&
      (viewer.role === 'ADMIN' ||
        (order.wakifId !== null && order.wakifId === viewer.userId));

    return {
      data: {
        access: isOwner ? ('owner' as const) : ('public' as const),
        order: isOwner ? ownerOrderView(order) : publicOrderView(order),
        transaction: transaction
          ? statusOnlyTransaction(transaction, isOwner)
          : null,
        program: program ?? null,
        // QA-02/03: instruksi tersimpan agar pembayaran bisa dilanjutkan.
        payment: await loadResumePayment(context.db, transaction?.id),
      },
    };
  });

/**
 * Profil publik lembaga nazhir (D6, `/lembaga/$id`): identitas, nomor
 * registrasi BWI, wilayah operasional, dan program aktifnya. Hanya lembaga
 * yang sudah terverifikasi; kontak pribadi pengurus (email/telepon akun) dan
 * data bank tidak pernah ikut.
 */
const lembaga = publicProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const [profile] = await context.db
      .select({
        id: nadzirProfiles.id,
        namaLembaga: nadzirProfiles.namaLembaga,
        kategori: nadzirProfiles.kategori,
        statusVerifikasi: nadzirProfiles.statusVerifikasi,
        nomorRegistrasiBwi: nadzirProfiles.nomorRegistrasiBwi,
        kontakPublik: nadzirProfiles.kontakPublik,
        verifiedAt: nadzirProfiles.verifiedAt,
      })
      .from(nadzirProfiles)
      .where(eq(nadzirProfiles.id, input.id));

    if (!profile || profile.statusVerifikasi !== 'VERIFIED') {
      throw new ORPCError('NOT_FOUND', {
        message: 'Profil lembaga tidak ditemukan',
      });
    }

    const rows = await context.db
      .select({ ...programSelectColumns, ...publicMediaColumns })
      .from(waqfPrograms)
      .where(
        and(
          eq(waqfPrograms.nadzirProfileId, profile.id),
          eq(waqfPrograms.status, 'LIVE')
        )
      )
      .orderBy(desc(waqfPrograms.createdAt));
    const programs = await enrichProgramRows(
      context.db,
      rows.map(withMediaUrls)
    );

    const wilayah = [
      ...new Set(
        rows
          .map((row) =>
            [row.kabupatenKota, row.provinsi].filter(Boolean).join(', ')
          )
          .filter(Boolean)
      ),
    ];

    return { data: { ...profile, wilayah, programs } };
  });

export const waqf = {
  list,
  detail,
  donatur,
  lembaga,
  createOrder,
  orderStatus,
};
