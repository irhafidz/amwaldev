import { getActive, recordAkadAcceptance, sha256Body } from '@amwal/core/akad';
import {
  calculateZakatSchema,
  createZakatOrderSchema,
  type ZakatPaymentType,
} from '@amwal/core/contracts/zakat';
import { cleanOptional, resolveGuestDonor } from '@amwal/core/identity/guest';
import type { PaymentMethodCode } from '@amwal/core/payment/methods';
import { createPayment } from '@amwal/core/payment/service';
import { toDisbursementDestination } from '@amwal/core/payment/types';
import {
  calculateZakatFitrah,
  calculateZakatMaal,
} from '@amwal/core/zakat/calculator';
import { getActiveFitrahPricePerPerson } from '@amwal/core/zakat/fitrah';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { readReferralCookie } from '@/lib/affiliate/referral-cookie';
import type { SessionUser } from '@/lib/auth/types';
import type { Database } from '@/lib/db';
import { transactions, users, zakatOrders } from '@/lib/db/schema';
import { translatePaymentErrors } from '@/lib/payment/errors';
import { assertGuestOrderAllowed } from '@/lib/payment/guest-order-limit';
import { reconcileOrderNow } from '@/lib/payment/reconcile-order';
import { loadResumePayment } from '@/lib/payment/resume';
import { publicOrigin } from '@/lib/public-url';
import {
  GoldPriceUnavailableError,
  goldPriceService,
} from '@/lib/zakat/gold-price';
import { optionalAuthProcedure, publicProcedure } from '../procedures';

/**
 * oRPC zakat router (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/routes/zakat.ts`. `calculate` and `goldPriceLive` stay
 * public. `createOrder` and `orderStatus` are open to guests (QA-04): a signed-in
 * donor uses their account; a guest supplies a name (D3: always recorded for
 * the niyyah and the amil's books) and may hide it publicly via `isAnonymous`.
 */

function isDigitalPayment(
  paymentType: ZakatPaymentType
): paymentType is PaymentMethodCode {
  return paymentType !== 'tunai' && paymentType !== 'beras';
}

function zakatMethod(
  paymentType: ZakatPaymentType
): 'TUNAI' | 'TRANSFER' | 'BERAS' {
  if (paymentType === 'tunai') {
    return 'TUNAI';
  }
  if (paymentType === 'beras') {
    return 'BERAS';
  }
  return 'TRANSFER';
}

const calculate = publicProcedure
  .input(calculateZakatSchema)
  .handler(async ({ input, context }) => {
    if (input.jenisZakat === 'FITRAH') {
      try {
        const pricePerPerson = await getActiveFitrahPricePerPerson({
          database: context.db,
        });
        const result = calculateZakatFitrah(input.jumlahJiwa, {
          pricePerPerson,
        });
        return {
          data: {
            jenisZakat: 'FITRAH' as const,
            jumlahJiwa: input.jumlahJiwa,
            mencapaiNisab: true,
            nisab: null,
            zakatAmount: result.zakatAmount.toString(),
            hargaAcuan: {
              fitrahPricePerJiwa: pricePerPerson.toString(),
            },
          },
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new ORPCError('BAD_REQUEST', { message: error.message });
        }
        throw error;
      }
    }

    try {
      const livePrice = await goldPriceService.getLivePrice();
      const goldPricePerGram = livePrice.price;
      const result = calculateZakatMaal(
        BigInt(Math.round(input.totalWealth)),
        goldPricePerGram
      );

      return {
        data: {
          jenisZakat: 'MAAL_PENGHASILAN' as const,
          mencapaiNisab: result.wajibZakat,
          nisab: result.nisab.toString(),
          zakatAmount: result.zakatAmount.toString(),
          hargaAcuan: {
            goldPricePerGram: goldPricePerGram.toString(),
            isStale: livePrice.isStale,
            fetchedAt: livePrice.fetchedAt,
            source: livePrice.source,
          },
        },
      };
    } catch (error) {
      if (error instanceof GoldPriceUnavailableError) {
        throw new ORPCError('SERVICE_UNAVAILABLE', { message: error.message });
      }
      throw error;
    }
  });

const goldPriceLive = publicProcedure.handler(async () => {
  try {
    const livePrice = await goldPriceService.getLivePrice();
    return {
      data: {
        price: livePrice.price.toString(),
        isStale: livePrice.isStale,
        fetchedAt: livePrice.fetchedAt,
        source: livePrice.source,
      },
    };
  } catch (error) {
    if (error instanceof GoldPriceUnavailableError) {
      throw new ORPCError('SERVICE_UNAVAILABLE', { message: error.message });
    }
    throw error;
  }
});

interface ZakatDonor {
  id: string;
  name: string;
  phone: string | null;
  email?: string;
}

/**
 * Pemilik order: akun yang login, atau donor tamu (`resolveGuestDonor`).
 * Tamu wajib mengisi nama dan hanya boleh membayar digital — zakat tunai/beras
 * adalah catatan manual yang menunggu verifikasi amil tanpa pembayaran
 * gateway, sehingga membukanya untuk anonim hanya mengundang spam.
 */
async function resolveZakatDonor(
  context: { db: Database; request: Request; user: SessionUser | null },
  input: z.infer<typeof createZakatOrderSchema>
): Promise<ZakatDonor> {
  if (context.user) {
    const [donor] = await context.db
      .select({ id: users.id, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, context.user.userId));
    if (!donor) {
      throw new ORPCError('UNAUTHORIZED');
    }
    return donor;
  }

  if (!isDigitalPayment(input.paymentType)) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'Masuk ke akun Anda untuk mencatat zakat tunai atau beras.',
    });
  }
  if (!input.donorName) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Nama muzakki wajib diisi untuk niat zakat dan pencatatan amil.',
    });
  }
  assertGuestOrderAllowed(context.request, 'zakat');

  const phone = cleanOptional(input.donorPhone);
  const email = cleanOptional(input.donorEmail);
  const id = await resolveGuestDonor(context.db, {
    donorName: input.donorName,
    donorEmail: email ?? undefined,
    donorPhone: phone ?? undefined,
  });
  return {
    id,
    name: input.donorName,
    phone: phone ?? null,
    email: email ?? undefined,
  };
}

const createOrder = optionalAuthProcedure
  .input(createZakatOrderSchema)
  .handler(async ({ input, context }) => {
    const donor = await resolveZakatDonor(context, input);

    const activeAkad = await getActive(context.db, 'ZAKAT');
    if (activeAkad) {
      if (!input.akadAcceptance) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Persetujuan akad zakat wajib diterima.',
        });
      }
      if (
        input.akadAcceptance.templateId !== activeAkad.id ||
        input.akadAcceptance.version !== activeAkad.version
      ) {
        throw new ORPCError('CONFLICT', {
          message:
            'Versi akad telah diperbarui. Silakan tinjau dan setujui kembali redaksi terbaru.',
        });
      }
      if (
        input.akadAcceptance.bodySha256 !== (await sha256Body(activeAkad.body))
      ) {
        throw new ORPCError('CONFLICT', {
          message:
            'Integritas redaksi akad tidak cocok. Silakan muat ulang formulir.',
        });
      }
    }

    const userId = donor.id;
    const amount = String(input.amount) as `${number}`;
    const destination = toDisbursementDestination(input.programId);
    const nomorKwitansi = `AMW-${new Date().getFullYear()}-${ulid()}`;

    if (!isDigitalPayment(input.paymentType)) {
      const orderId = `AMW-ZAKAT-${ulid()}`;
      await context.db.insert(zakatOrders).values({
        id: orderId,
        nomorKwitansi,
        muzakkiId: userId,
        namaMuzakki: donor.name,
        noTelepon: donor.phone,
        isAnonymous: input.isAnonymous,
        jenisZakat: input.jenisZakat,
        metodePembayaran: zakatMethod(input.paymentType),
        nominal: amount,
        jumlahJiwa: input.jumlahJiwa,
        namaDizakatkan: input.namaDizakatkan,
        notes: input.doa,
        transactionId: null,
      });

      return {
        orderId,
        zakatOrderId: orderId,
        paymentType: input.paymentType,
        requiresManualVerification: true,
      };
    }

    // `const` keeps the narrowing (digital method) inside the closure below.
    const paymentType = input.paymentType;
    const result = await translatePaymentErrors(() =>
      createPayment(
        {
          module: 'ZAKAT',
          userId,
          grossAmount: amount,
          paymentType,
          disbursementDestination: destination,
          customerName: input.isAnonymous ? 'Hamba Allah' : donor.name,
          customerEmail: donor.email,
          customerMobile: context.user ? undefined : (donor.phone ?? undefined),
          description: `Zakat - ${input.jenisZakat}`,
          // Mayar menolak path relatif ("redirectUrl must be a valid URL").
          redirectUrl: `${publicOrigin(context.request)}/zakat/status?orderId={orderId}`,
          refCode: readReferralCookie(context.request),
          order: {
            nomorKwitansi,
            namaMuzakki: donor.name,
            noTelepon: donor.phone,
            isAnonymous: input.isAnonymous,
            jenisZakat: input.jenisZakat,
            metodePembayaran: zakatMethod(input.paymentType),
            nominal: amount,
            jumlahJiwa: input.jumlahJiwa,
            namaDizakatkan: input.namaDizakatkan,
            notes: input.doa,
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

type ZakatOrderRow = typeof zakatOrders.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

/**
 * Siapa pun yang memegang order ID (termasuk tamu setelah checkout) boleh
 * membuka halaman status, tetapi ID berurutan bisa ditebak — jadi non-pemilik
 * hanya mendapat apa yang dibutuhkan halaman pembayaran: tanpa nama, telepon,
 * alamat, doa, nama yang dizakatkan, nomor kwitansi, atau ID transaksi.
 */
function publicZakatOrder(order: ZakatOrderRow) {
  return {
    id: order.id,
    jenisZakat: order.jenisZakat,
    metodePembayaran: order.metodePembayaran,
    nominal: order.nominal,
    jumlahJiwa: null,
    namaDizakatkan: null,
    namaMuzakki: 'Hamba Allah',
    isAnonymous: true,
    status: order.status,
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
        .from(zakatOrders)
        .where(eq(zakatOrders.id, input.orderId));
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
        message: 'Order zakat tidak ditemukan',
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
        (loaded.order.muzakkiId !== null &&
          loaded.order.muzakkiId === viewer.userId));
    const payment = await loadResumePayment(context.db, loaded.transaction?.id);

    return {
      data: isOwner
        ? { ...loaded, payment }
        : {
            order: publicZakatOrder(loaded.order),
            transaction: publicTransaction(loaded.transaction),
            payment,
          },
    };
  });

export const zakat = {
  calculate,
  goldPriceLive,
  createOrder,
  orderStatus,
};
