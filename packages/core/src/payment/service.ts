import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { recordAttribution } from '../affiliate/record-attribution';
import {
  infaqOrders,
  qurbanOrders,
  transactions,
  waqfOrders,
  zakatOrders,
} from '../db/schema';
import type { Database } from '../db/types';
import { reserveSlots } from '../qurban/slots';
import { withoutQrImage } from './mayar-instructions';
import { methodLimitMessage, PaymentMethodLimitError } from './methods';
import {
  formatOrderId,
  type OrderIdModule,
  type PaymentModule,
} from './order-id';
import { nextOrderSequence } from './order-sequence';
import type {
  CreatePaymentPayload,
  CreatePaymentResponse,
  DisbursementDestination,
  GrossAmount,
  PaymentProvider,
  PaymentType,
} from './types';

/**
 * Ported from `apps/server/src/lib/payment/service.ts` (Putaran 17, Batch
 * 3) — the "anchor before charge" transactional pattern is untouched. The
 * only behavioural change: `database` and `paymentProvider` are required
 * parameters, not defaulted to an app-bound singleton (Batch 1's rule).
 */

type WaqfOrderInput = Omit<
  typeof waqfOrders.$inferInsert,
  'id' | 'transactionId'
>;
type ZakatOrderInput = Omit<
  typeof zakatOrders.$inferInsert,
  'id' | 'transactionId'
>;
type QurbanOrderInput = Omit<
  typeof qurbanOrders.$inferInsert,
  'id' | 'transactionId'
>;
type InfaqOrderInput = Omit<
  typeof infaqOrders.$inferInsert,
  | 'id'
  | 'orderId'
  | 'userId'
  | 'status'
  | 'snapToken'
  | 'snapRedirectUrl'
  | 'transactionId'
  | 'createdAt'
  | 'updatedAt'
>;

interface CommonPaymentParams {
  userId: string;
  grossAmount: GrossAmount;
  paymentType: PaymentType;
  disbursementDestination: DisbursementDestination;
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
  description?: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
  /**
   * [I-4] Nilai mentah cookie `amwal_ref`, kalau ada. Opsional dan
   * gagal-terbuka — lihat `recordAttribution()`.
   */
  refCode?: string | null;
}

export type CreatePaymentParams =
  | (CommonPaymentParams & {
      module: 'WAQF';
      order: WaqfOrderInput;
    })
  | (CommonPaymentParams & {
      module: 'ZAKAT';
      order: ZakatOrderInput;
    })
  | (CommonPaymentParams & {
      module: 'QURBAN';
      order: QurbanOrderInput;
      slots: { hewanBatchId: string; jumlahSlot: number };
    })
  | (CommonPaymentParams & {
      module: 'INFAQ';
      order: InfaqOrderInput;
    });

export interface CreatePaymentDeps {
  database: Database;
  paymentProvider: PaymentProvider;
}

export interface CreatePaymentResult {
  orderId: string;
  transactionId: string;
  payment: CreatePaymentResponse;
  transaction: typeof transactions.$inferSelect;
}

function orderIdModuleFor(params: CreatePaymentParams): OrderIdModule {
  if (params.module === 'INFAQ' && params.order.jenis.startsWith('SEDEKAH_')) {
    return 'SEDEKAH';
  }

  return params.module;
}

function toTransactionType(
  module: PaymentModule
): 'WAKAF' | 'ZAKAT' | 'QURBAN' | 'INFAQ' {
  switch (module) {
    case 'WAQF':
      return 'WAKAF';
    case 'ZAKAT':
      return 'ZAKAT';
    case 'QURBAN':
      return 'QURBAN';
    case 'INFAQ':
      return 'INFAQ';
    default:
      throw new Error(`Unsupported payment module: ${module}`);
  }
}

async function insertModuleOrder(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  params: CreatePaymentParams,
  orderId: string,
  transactionId: string,
  userId: string
): Promise<void> {
  if (params.module === 'WAQF') {
    const waqfParams = params as Extract<
      CreatePaymentParams,
      { module: 'WAQF' }
    >;
    await tx.insert(waqfOrders).values({
      ...waqfParams.order,
      id: orderId,
      transactionId,
      wakifId: userId,
    });
    return;
  }

  if (params.module === 'ZAKAT') {
    const zakatParams = params as Extract<
      CreatePaymentParams,
      { module: 'ZAKAT' }
    >;
    await tx.insert(zakatOrders).values({
      ...zakatParams.order,
      id: orderId,
      transactionId,
      muzakkiId: userId,
    });
    return;
  }

  if (params.module === 'INFAQ') {
    const infaqParams = params as Extract<
      CreatePaymentParams,
      { module: 'INFAQ' }
    >;
    await tx.insert(infaqOrders).values({
      ...infaqParams.order,
      id: `INFAQ-${ulid()}`,
      orderId,
      userId,
      transactionId,
      status: 'PENDING',
    });
    return;
  }

  const qurbanParams = params as Extract<
    CreatePaymentParams,
    { module: 'QURBAN' }
  >;
  await tx.insert(qurbanOrders).values({
    ...qurbanParams.order,
    id: orderId,
    transactionId,
    wakifId: userId,
  });

  // Reserve slots in the same transaction as the anchor, so a slot can never
  // be claimed without its order/transaction pair (S10-N-10 + S10-N-11).
  await reserveSlots(
    tx,
    qurbanParams.slots.hewanBatchId,
    qurbanParams.slots.jumlahSlot,
    orderId
  );
}

async function deleteModuleOrder(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  module: PaymentModule,
  orderId: string
): Promise<void> {
  if (module === 'WAQF') {
    await tx.delete(waqfOrders).where(eq(waqfOrders.id, orderId));
    return;
  }
  if (module === 'ZAKAT') {
    await tx.delete(zakatOrders).where(eq(zakatOrders.id, orderId));
    return;
  }
  if (module === 'INFAQ') {
    await tx.delete(infaqOrders).where(eq(infaqOrders.orderId, orderId));
    return;
  }
  await tx.delete(qurbanOrders).where(eq(qurbanOrders.id, orderId));
}

/**
 * Batas waktu pembayaran: dari instruksi (QR/VA) bila ada, lalu dari tautan
 * Mayar. Nilai yang tidak bisa dibaca diabaikan (Riwayat lalu memakai
 * createdAt + 24 jam).
 */
function paymentExpiry(payment: CreatePaymentResponse): string | null {
  const instructions = payment.instructions;
  const fromInstructions =
    instructions && 'expiresAt' in instructions
      ? instructions.expiresAt
      : undefined;
  const raw = fromInstructions ?? payment.expiredAt;
  if (!raw) {
    return null;
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export async function createPayment(
  params: CreatePaymentParams,
  deps: CreatePaymentDeps
): Promise<CreatePaymentResult> {
  const { database, paymentProvider } = deps;
  const transactionId = `AMW-TXN-${ulid()}`;
  const amount = String(params.grossAmount);

  // QA-05: tolak sebelum jangkar PENDING ditulis (dan sebelum slot qurban
  // dipesan), sehingga tidak ada pesanan yatim bila nominal melewati batas.
  const limitMessage = methodLimitMessage(
    String(params.paymentType),
    Number(amount)
  );
  if (limitMessage) {
    throw new PaymentMethodLimitError(limitMessage);
  }

  // Step 1: short DB transaction writes the PENDING anchor before any external call.
  const { orderId } = await database.transaction(async (tx) => {
    const at = new Date();
    const orderIdModule = orderIdModuleFor(params);
    const seq = await nextOrderSequence(tx, { module: orderIdModule, at });
    const nextOrderId = formatOrderId({ module: orderIdModule, at, seq });

    await tx.insert(transactions).values({
      id: transactionId,
      wakifId: params.userId,
      jenisTransaksi: toTransactionType(params.module),
      amount,
      paymentMethod: params.paymentType,
      statusPembayaran: 'PENDING',
      disbursementDestination: params.disbursementDestination,
    });

    await insertModuleOrder(
      tx,
      params,
      nextOrderId,
      transactionId,
      params.userId
    );

    // [I-4] Di dalam transaksi anchor yang sama: atribusi tidak pernah ada
    // tanpa transaksinya, dan sebaliknya. Gagal-terbuka — lihat
    // `recordAttribution()`.
    await recordAttribution(tx, {
      transactionId,
      refCode: params.refCode,
      donorUserId: params.userId,
    });

    return { orderId: nextOrderId };
  });

  const resolvedRedirectUrl = params.redirectUrl
    ? params.redirectUrl.replace(/\{orderId\}|:orderId/g, orderId)
    : undefined;

  const providerPayload: CreatePaymentPayload = {
    orderId,
    grossAmount: params.grossAmount,
    paymentType: params.paymentType,
    disbursementDestination: params.disbursementDestination,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerMobile: params.customerMobile,
    description: params.description,
    redirectUrl: resolvedRedirectUrl,
    metadata: params.metadata,
  };

  // Step 2: external charge happens OUTSIDE the DB transaction.
  let payment: CreatePaymentResponse;
  try {
    payment = await paymentProvider.createTransaction(providerPayload);
    payment.provider = paymentProvider.name;
  } catch (error) {
    // Step 4: provider failed; remove the PENDING anchor so no orphan row survives.
    await database.transaction(async (tx) => {
      await deleteModuleOrder(tx, params.module, orderId);
      await tx.delete(transactions).where(eq(transactions.id, transactionId));
    });
    throw error;
  }

  // Step 3: record provider details after a successful charge.
  const transaction = await database.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        paymentGatewayRef: payment.providerRef,
        paymentMethod: payment.paymentType,
        // QA-02: simpan instruksi supaya pembayaran bisa dilanjutkan dari
        // Riwayat atau perangkat lain, bukan hanya dari sessionStorage tab ini.
        paymentInstructions: withoutQrImage(payment.instructions),
        paymentUrl: payment.redirectUrl || null,
        paymentExpiresAt: paymentExpiry(payment),
      })
      .where(eq(transactions.id, transactionId));

    const [updatedTransaction] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!updatedTransaction) {
      throw new Error(`Transaction anchor not found: ${transactionId}`);
    }
    return updatedTransaction;
  });

  return {
    orderId,
    transactionId,
    payment,
    transaction,
  };
}
