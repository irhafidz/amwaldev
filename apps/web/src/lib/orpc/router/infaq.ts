import { getActive, recordAkadAcceptance, sha256Body } from '@amwal/core/akad';
import { createInfaqSchema } from '@amwal/core/contracts/infaq';
import { cleanOptional, resolveGuestDonor } from '@amwal/core/identity/guest';
import { createPayment } from '@amwal/core/payment/service';
import { toDisbursementDestination } from '@amwal/core/payment/types';
import { ORPCError } from '@orpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { readReferralCookie } from '@/lib/affiliate/referral-cookie';
import { resolveRequestUser } from '@/lib/auth/core';
import { infaqOrders, transactions } from '@/lib/db/schema';
import { translatePaymentErrors } from '@/lib/payment/errors';
import { reconcileOrderNow } from '@/lib/payment/reconcile-order';
import { loadResumePayment } from '@/lib/payment/resume';
import { publicOrigin } from '@/lib/public-url';
import { publicProcedure } from '../procedures';

/**
 * oRPC infaq router (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/routes/infaq.ts`. Both procedures are public, matching
 * the REST route's own guard-free surface.
 */

type ActiveAkad = NonNullable<Awaited<ReturnType<typeof getActive>>>;

async function assertAkadAcceptance(
  activeAkad: ActiveAkad | null,
  acceptance: z.infer<typeof createInfaqSchema>['akadAcceptance'],
  moduleLabel: string
) {
  if (!activeAkad) {
    return;
  }
  if (!acceptance) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Persetujuan akad untuk ${moduleLabel} wajib diterima.`,
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
  .input(createInfaqSchema)
  .handler(async ({ input, context }) => {
    const akadModule = input.jenis.startsWith('SEDEKAH_') ? 'SEDEKAH' : 'INFAQ';
    const activeAkad = await getActive(context.db, akadModule);
    await assertAkadAcceptance(
      activeAkad,
      input.akadAcceptance,
      akadModule.toLowerCase()
    );

    // Sesi login yang sah adalah pemilik order (lihat waqf.createOrder).
    const sessionUser = await resolveRequestUser(context.request);
    const userId =
      sessionUser?.userId ??
      (await resolveGuestDonor(context.db, {
        donorName: input.namaPenginfaq,
        donorEmail: input.emailPenginfaq,
        donorPhone: input.teleponPenginfaq,
      }));
    const amount = String(input.nominal) as `${number}`;
    const displayName = input.isAnonymous ? 'Hamba Allah' : input.namaPenginfaq;

    const result = await translatePaymentErrors(() =>
      createPayment(
        {
          module: 'INFAQ',
          userId,
          grossAmount: amount,
          paymentType: input.paymentType,
          disbursementDestination: toDisbursementDestination(
            `INFAQ_${input.jenis}`
          ),
          customerName: displayName,
          customerEmail: cleanOptional(input.emailPenginfaq) ?? undefined,
          customerMobile: cleanOptional(input.teleponPenginfaq) ?? undefined,
          description: `Infaq - ${input.jenis}`,
          // Providers reject relative redirect URLs, so this must be absolute.
          redirectUrl: `${publicOrigin(context.request)}/infaq/status?orderId={orderId}`,
          refCode: readReferralCookie(context.request),
          order: {
            namaPenginfaq: displayName,
            teleponPenginfaq: input.teleponPenginfaq || null,
            emailPenginfaq: input.emailPenginfaq || null,
            nominal: amount,
            jenis: input.jenis,
            doa: input.doa || null,
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

    await context.db
      .update(infaqOrders)
      .set({
        snapToken: result.payment.providerRef,
        snapRedirectUrl: result.payment.redirectUrl,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(infaqOrders.orderId, result.orderId));

    return {
      success: true,
      data: {
        orderId: result.orderId,
        snapToken: result.payment.providerRef,
        snapRedirectUrl: result.payment.redirectUrl,
        payment: result.payment,
      },
    };
  });

/** `budi.santoso@gmail.com` -> `b***o@gmail.com` */
function maskEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const [local = '', domain = ''] = email.split('@');
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

/** `6281211004001` -> `6281*****001` */
function maskPhone(phone: string | null): string | null {
  if (!phone) {
    return null;
  }
  if (phone.length <= 7) {
    return `${'*'.repeat(phone.length - 2)}${phone.slice(-2)}`;
  }
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 7)}${phone.slice(-3)}`;
}

const orderStatus = publicProcedure
  .input(z.object({ orderId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const load = async () => {
      const [order] = await context.db
        .select()
        .from(infaqOrders)
        .where(eq(infaqOrders.orderId, input.orderId));
      if (!order) {
        return null;
      }
      const [transaction] = order.transactionId
        ? await context.db
            .select({
              id: transactions.id,
              statusPembayaran: transactions.statusPembayaran,
              paymentMethod: transactions.paymentMethod,
            })
            .from(transactions)
            .where(eq(transactions.id, order.transactionId))
        : [undefined];
      return { order, transaction };
    };

    let loaded = await load();
    if (!loaded) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Order tidak ditemukan',
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

    const { order, transaction } = loaded;
    return {
      success: true,
      // Public lookup by order ID: never echo raw donor contact details.
      data: {
        ...order,
        emailPenginfaq: maskEmail(order.emailPenginfaq),
        teleponPenginfaq: maskPhone(order.teleponPenginfaq),
        transaction: transaction ?? null,
        payment: await loadResumePayment(context.db, transaction?.id),
      },
    };
  });

/** Jumlah baris donatur yang dikirim ke halaman publik. */
const DONOR_LIST_LIMIT = 50;

/**
 * Daftar donatur infaq untuk halaman publik (QA-12), meniru `waqf.donatur`
 * tetapi hanya donasi LUNAS (`SETTLED`; termasuk yang dicatat admin). Nama
 * donatur anonim sudah tersimpan sebagai "Hamba Allah" sejak checkout; kontak
 * dan doa tidak pernah dikirim.
 */
const donatur = publicProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: infaqOrders.id,
      donorName: infaqOrders.namaPenginfaq,
      nominal: infaqOrders.nominal,
      jenis: infaqOrders.jenis,
      createdAt: infaqOrders.createdAt,
    })
    .from(infaqOrders)
    .where(eq(infaqOrders.status, 'SETTLED'))
    .orderBy(desc(infaqOrders.createdAt))
    .limit(DONOR_LIST_LIMIT);

  return {
    data: rows.map((row) => ({
      ...row,
      donorName: row.donorName.trim() || 'Hamba Allah',
    })),
  };
});

export const infaq = {
  createOrder,
  orderStatus,
  donatur,
};
