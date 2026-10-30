import { getActive, recordAkadAcceptance, sha256Body } from '@amwal/core/akad';
import { createQurbanOrderSchema } from '@amwal/core/contracts/qurban';
import { cleanOptional, resolveGuestDonor } from '@amwal/core/identity/guest';
import { orderPaymentMethod } from '@amwal/core/payment/methods';
import { createPayment } from '@amwal/core/payment/service';
import { toDisbursementDestination } from '@amwal/core/payment/types';
import {
  isWholeCow,
  joinShohibul,
  MAX_SHOHIBUL_PER_COW,
  maxShohibulNames,
} from '@amwal/core/qurban/shohibul';
import { SlotUnavailableError } from '@amwal/core/qurban/slots';
import { ORPCError } from '@orpc/server';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { readReferralCookie } from '@/lib/affiliate/referral-cookie';
import type { SessionUser } from '@/lib/auth/types';
import type { Database } from '@/lib/db';
import {
  hewanBatches,
  qurbanAnimalSlots,
  qurbanOrders,
  transactions,
  users,
} from '@/lib/db/schema';
import { translatePaymentErrors } from '@/lib/payment/errors';
import { assertGuestOrderAllowed } from '@/lib/payment/guest-order-limit';
import { reconcileOrderNow } from '@/lib/payment/reconcile-order';
import { loadResumePayment } from '@/lib/payment/resume';
import { publicOrigin } from '@/lib/public-url';
import { releaseStaleQurbanSlots } from '@/lib/qurban-slot-release';
import { optionalAuthProcedure, publicProcedure } from '../procedures';

/**
 * oRPC qurban router (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/routes/qurban.ts`. `list`/`detail` stay public;
 * `createOrder` requires the WAKIF role, matching
 * `app.use('/orders', requireRole('WAKIF'))` in the original REST route.
 * Slot locking (`reserveSlots`, row-locked + unique-constraint) happens
 * inside `@amwal/core/payment/service`'s `createPayment`, in the same DB
 * transaction as the order/transaction anchor — S10-N-10/S10-N-11 unchanged.
 */

const batchFields = {
  id: hewanBatches.id,
  jenisHewan: hewanBatches.jenisHewan,
  totalSlot: hewanBatches.totalSlot,
  hargaPerSlot: hewanBatches.hargaPerSlot,
  status: hewanBatches.status,
  ras: hewanBatches.ras,
  kelasGrade: hewanBatches.kelasGrade,
  estimasiBeratKg: hewanBatches.estimasiBeratKg,
  jenisKelamin: hewanBatches.jenisKelamin,
  wilayahPenyaluran: hewanBatches.wilayahPenyaluran,
  targetPenerimaManfaat: hewanBatches.targetPenerimaManfaat,
  tanggalPenyembelihanEstimasi: hewanBatches.tanggalPenyembelihanEstimasi,
  galeriFotoUrls: hewanBatches.galeriFotoUrls,
  createdAt: hewanBatches.createdAt,
} as const;

const listBatchesInput = z.object({
  jenisHewan: z.enum(['SAPI', 'KAMBING']).optional(),
  status: z.enum(['TERSEDIA', 'PENUH', 'SELESAI']).optional(),
});

const list = publicProcedure
  .input(listBatchesInput)
  .handler(async ({ input, context }) => {
    await releaseStaleQurbanSlots(context.db);
    const conditions: SQL[] = [];
    if (input.jenisHewan) {
      conditions.push(eq(hewanBatches.jenisHewan, input.jenisHewan));
    }
    if (input.status) {
      conditions.push(eq(hewanBatches.status, input.status));
    }

    const rows = await context.db
      .select({
        ...batchFields,
        // Drizzle renders `${hewanBatches.id}` unqualified inside a subquery,
        // which would bind to the slots table's own `id` — keep it literal.
        availableSlots: sql<number>`(
          select count(*)::int from qurban_animal_slots s
          where s.hewan_batch_id = "hewan_batches"."id"
            and s.status = 'TERSEDIA'
        )`,
      })
      .from(hewanBatches)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(hewanBatches.createdAt);

    return { data: rows };
  });

const detail = publicProcedure
  .input(z.object({ batchId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    await releaseStaleQurbanSlots(context.db);
    const [batch] = await context.db
      .select(batchFields)
      .from(hewanBatches)
      .where(eq(hewanBatches.id, input.batchId));

    if (!batch) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Paket hewan qurban tidak ditemukan',
      });
    }

    const slots = await context.db
      .select()
      .from(qurbanAnimalSlots)
      .where(eq(qurbanAnimalSlots.hewanBatchId, input.batchId))
      .orderBy(qurbanAnimalSlots.nomorSlot);

    const availableSlots = slots.filter(
      (slot) => slot.status === 'TERSEDIA'
    ).length;

    return { data: { batch, slots, availableSlots } };
  });

async function validateAkadAcceptance(
  activeAkad: { id: string; version: number; body: string } | null,
  acceptance?: { templateId: string; version: number; bodySha256: string }
) {
  if (!activeAkad) {
    return;
  }
  if (!acceptance) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Persetujuan akad wakalah qurban wajib diterima.',
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

/** Pesanan qurban BELUM DIBAYAR per nomor WhatsApp tamu (24 jam terakhir). */
const MAX_PENDING_GUEST_ORDERS_PER_PHONE = 3;

/**
 * Pemborongan slot fiktif: slot dikunci begitu pesanan dibuat, dan tidak ada
 * pelepasan otomatis bila tidak dibayar. Pembatas IP (in-memory) mudah
 * dilewati, jadi nomor WhatsApp tamu juga dibatasi lewat DB — bertahan antar
 * restart dan antar instance.
 */
async function assertGuestPendingCap(db: Database, phone: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(qurbanOrders)
    .innerJoin(transactions, eq(transactions.id, qurbanOrders.transactionId))
    .where(
      and(
        eq(qurbanOrders.teleponPengqurban, phone),
        eq(transactions.statusPembayaran, 'PENDING'),
        sql`${transactions.createdAt} > now() - interval '24 hours'`
      )
    );
  if ((row?.count ?? 0) >= MAX_PENDING_GUEST_ORDERS_PER_PHONE) {
    throw new ORPCError('TOO_MANY_REQUESTS', {
      message:
        'Nomor WhatsApp ini masih memiliki pesanan qurban yang belum dibayar. Selesaikan pembayarannya (buka tautan status dari perangkat Anda) atau tunggu hingga kedaluwarsa.',
    });
  }
}

interface QurbanDonor {
  id: string;
  name: string;
}

/** Pemesan: akun yang login, atau tamu (nama wajib, dibatasi, lalu `resolveGuestDonor`). */
async function resolveQurbanDonor(
  context: { db: Database; request: Request; user: SessionUser | null },
  input: z.infer<typeof createQurbanOrderSchema>
): Promise<QurbanDonor> {
  if (context.user) {
    const [donor] = await context.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, context.user.userId));
    if (!donor) {
      throw new ORPCError('UNAUTHORIZED');
    }
    return donor;
  }

  if (!input.donorName) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Nama pemesan wajib diisi.',
    });
  }
  assertGuestOrderAllowed(context.request, 'qurban');
  await assertGuestPendingCap(context.db, input.teleponPengqurban);

  const id = await resolveGuestDonor(context.db, {
    donorName: input.donorName,
    donorEmail: cleanOptional(input.donorEmail) ?? undefined,
    donorPhone: input.teleponPengqurban,
  });
  return { id, name: input.donorName };
}

const createOrder = optionalAuthProcedure
  .input(createQurbanOrderSchema)
  .handler(async ({ input, context }) => {
    // S10-N-11: the binding wakalah contract must be accepted before payment.
    if (input.akadWakalahAccepted !== true) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Akad wakalah wajib disetujui sebelum melanjutkan pembayaran',
      });
    }

    await releaseStaleQurbanSlots(context.db);
    const [batch] = await context.db
      .select({
        hargaPerSlot: hewanBatches.hargaPerSlot,
        status: hewanBatches.status,
        jenisHewan: hewanBatches.jenisHewan,
        totalSlot: hewanBatches.totalSlot,
      })
      .from(hewanBatches)
      .where(eq(hewanBatches.id, input.hewanBatchId));

    if (!batch) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Paket hewan qurban tidak ditemukan',
      });
    }

    if (batch.status !== 'TERSEDIA') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Paket hewan qurban tidak tersedia',
      });
    }

    // QA-13: sapi utuh menampung 1-7 nama dalam satu slot; selain itu satu
    // nama per slot.
    if (
      input.namaShohibul &&
      input.namaShohibul.length >
        maxShohibulNames(batch, input.jumlahSlotDiminta)
    ) {
      throw new ORPCError('BAD_REQUEST', {
        message: isWholeCow(batch)
          ? `Satu sapi utuh maksimal ${MAX_SHOHIBUL_PER_COW} nama shohibul`
          : 'Jumlah nama shohibul melebihi jumlah slot yang dipesan',
      });
    }

    const totalHarga = String(
      Number(batch.hargaPerSlot) * input.jumlahSlotDiminta
    ) as `${number}`;

    // Akad diperiksa sebelum identitas dibuat: penolakan tidak boleh
    // meninggalkan baris donor tamu yatim.
    const activeAkad = await getActive(context.db, 'QURBAN');
    await validateAkadAcceptance(activeAkad, input.akadAcceptance);

    const donor = await resolveQurbanDonor(context, input);

    const akadWakalahText =
      activeAkad?.body ??
      `Saya ${donor.name} dengan ini mewakilkan kepada panitia Qurban Amwal untuk menyembelihkan hewan qurban atas nama saya sesuai syariat Islam`;

    try {
      const result = await translatePaymentErrors(() =>
        createPayment(
          {
            module: 'QURBAN',
            userId: donor.id,
            grossAmount: totalHarga,
            paymentType: input.paymentType,
            disbursementDestination: toDisbursementDestination(
              'Panitia Qurban Amwal'
            ),
            customerName: donor.name,
            customerEmail: cleanOptional(input.donorEmail) ?? undefined,
            customerMobile: input.teleponPengqurban,
            description: `Qurban - ${batch.jenisHewan}`,
            // Mayar menolak path relatif ("redirectUrl must be a valid URL").
            redirectUrl: `${publicOrigin(context.request)}/qurban/status?orderId={orderId}`,
            refCode: readReferralCookie(context.request),
            order: {
              namaPengqurban: donor.name,
              namaShohibul: input.namaShohibul
                ? joinShohibul(input.namaShohibul)
                : undefined,
              namaShohibulList: input.namaShohibul,
              // Nomor dari form (wajib + sudah tervalidasi & ternormalisasi oleh
              // `createQurbanOrderSchema`) — bukan lagi `users.phone` yang bisa kosong.
              teleponPengqurban: input.teleponPengqurban,
              alamatPengqurban:
                cleanOptional(input.alamatPengqurban) ?? undefined,
              jenisHewan: batch.jenisHewan,
              tipeKepemilikan: input.tipeKepemilikan,
              opsiPesan: input.opsiPesan,
              metodePembayaran: orderPaymentMethod(input.paymentType),
              totalHarga,
              akadWakalahText,
              akadWakalahAcceptedAt: new Date().toISOString(),
            },
            slots: {
              hewanBatchId: input.hewanBatchId,
              jumlahSlot: input.jumlahSlotDiminta,
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
    } catch (error) {
      if (error instanceof SlotUnavailableError) {
        throw new ORPCError('BAD_REQUEST', { message: error.message });
      }
      throw error;
    }
  });

type QurbanOrderRow = typeof qurbanOrders.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

/**
 * Non-pemilik (termasuk tamu setelah checkout) hanya mendapat yang dibutuhkan
 * halaman pembayaran. Order ID berurutan bisa ditebak, jadi tanpa nama
 * pemesan, nama shohibul, telepon, alamat, teks akad, atau ID transaksi.
 */
function publicQurbanOrder(order: QurbanOrderRow) {
  return {
    id: order.id,
    jenisHewan: order.jenisHewan,
    tipeKepemilikan: order.tipeKepemilikan,
    opsiPesan: order.opsiPesan,
    metodePembayaran: order.metodePembayaran,
    statusPembayaran: order.statusPembayaran,
    totalHarga: order.totalHarga,
    namaPengqurban: 'Hamba Allah',
    namaShohibul: null,
    namaShohibulList: null,
    createdAt: order.createdAt,
  };
}

function publicTransaction(transaction: TransactionRow | null) {
  return transaction
    ? {
        id: null,
        statusPembayaran: transaction.statusPembayaran,
        paymentMethod: transaction.paymentMethod,
      }
    : null;
}

const orderStatus = optionalAuthProcedure
  .input(z.object({ orderId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const load = async () => {
      const [order] = await context.db
        .select()
        .from(qurbanOrders)
        .where(eq(qurbanOrders.id, input.orderId));
      if (!order) {
        return null;
      }
      const [transaction] = order.transactionId
        ? await context.db
            .select()
            .from(transactions)
            .where(eq(transactions.id, order.transactionId))
        : [undefined];
      return { order, transaction: transaction ?? null };
    };

    let loaded = await load();
    if (!loaded) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Order qurban tidak ditemukan',
      });
    }

    // Fallback bila webhook Mayar belum sampai: tanya Mayar langsung.
    if (loaded.transaction?.statusPembayaran === 'PENDING') {
      const changed = await reconcileOrderNow({
        db: context.db,
        provider: context.paymentProvider,
        transactionId: loaded.transaction.id,
      });
      if (changed) {
        loaded = (await load()) ?? loaded;
      }
    }

    const viewer = context.user;
    const isOwner =
      viewer !== null &&
      (viewer.role === 'ADMIN' ||
        (loaded.order.wakifId !== null &&
          loaded.order.wakifId === viewer.userId));
    const payment = await loadResumePayment(context.db, loaded.transaction?.id);

    return {
      data: isOwner
        ? { ...loaded, payment }
        : {
            order: publicQurbanOrder(loaded.order),
            transaction: publicTransaction(loaded.transaction),
            payment,
          },
    };
  });

export const qurban = {
  list,
  detail,
  createOrder,
  orderStatus,
};
