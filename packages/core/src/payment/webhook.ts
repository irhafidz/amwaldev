import { and, eq, ne, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import {
  fundPools,
  infaqOrders,
  qurbanAnimalSlots,
  qurbanOrders,
  transactions,
  waqfOrders,
  waqfPrincipalLedgers,
  zakatOrders,
} from '../db/schema';
import type { Database } from '../db/types';
import { moduleFromOrderId, type PaymentModule } from './order-id';
import type { ProviderEvent } from './provider-event';
import { resolveSignedWebhook } from './signed-webhook';
import type { PaymentProvider } from './types';

/**
 * Ported from `apps/server/src/lib/payment/webhook.ts` (Putaran 17, Batch
 * 3) — the idempotency mechanism is untouched: `UPDATE transactions SET
 * status='LUNAS' WHERE id=? AND status != 'LUNAS' RETURNING *` is the atomic
 * guard, so a replayed settlement (or 10 parallel identical webhooks) can
 * only ever increment the ledger once. Only behavioural change: `database`
 * and `paymentProvider` are required, and the WhatsApp settlement
 * notification — which reads an app's own Baileys env — is now an optional
 * injected `onSettled` callback instead of an unconditional import, so this
 * module never assumes any one app's environment.
 */

type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

type OrderAnchor = {
  module: PaymentModule;
  orderId: string;
  transactionId: string;
  waqfProgramId?: string;
};

export interface WebhookHandlerDeps {
  database: Database;
  paymentProvider: PaymentProvider;
  /**
   * Best-effort settlement notification hook. Omit to skip notification
   * entirely (e.g. in tests, or an app that hasn't wired WhatsApp yet) — a
   * missing hook never affects the webhook response or the ledger, exactly
   * like a failing one.
   */
  onSettled?: (
    module: PaymentModule,
    orderId: string,
    amount: string
  ) => Promise<void>;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

async function findOrderAnchor(
  tx: DatabaseTransaction,
  orderId: string
): Promise<OrderAnchor | null> {
  const module = moduleFromOrderId(orderId);

  if (!module) {
    return null;
  }

  if (module === 'WAQF') {
    const [waqfOrder] = await tx
      .select({
        transactionId: waqfOrders.transactionId,
        waqfProgramId: waqfOrders.waqfProgramId,
      })
      .from(waqfOrders)
      .where(eq(waqfOrders.id, orderId));
    return waqfOrder?.transactionId
      ? {
          module,
          orderId,
          transactionId: waqfOrder.transactionId,
          waqfProgramId: waqfOrder.waqfProgramId,
        }
      : null;
  }

  if (module === 'ZAKAT') {
    const [zakatOrder] = await tx
      .select({ transactionId: zakatOrders.transactionId })
      .from(zakatOrders)
      .where(eq(zakatOrders.id, orderId));
    return zakatOrder?.transactionId
      ? { module, orderId, transactionId: zakatOrder.transactionId }
      : null;
  }

  if (module === 'INFAQ') {
    const [infaqOrder] = await tx
      .select({ transactionId: infaqOrders.transactionId })
      .from(infaqOrders)
      .where(eq(infaqOrders.orderId, orderId));
    return infaqOrder?.transactionId
      ? { module, orderId, transactionId: infaqOrder.transactionId }
      : null;
  }

  const [qurbanOrder] = await tx
    .select({ transactionId: qurbanOrders.transactionId })
    .from(qurbanOrders)
    .where(eq(qurbanOrders.id, orderId));

  return qurbanOrder?.transactionId
    ? { module, orderId, transactionId: qurbanOrder.transactionId }
    : null;
}

function moduleFromTransactionType(
  type: 'WAKAF' | 'ZAKAT' | 'INFAQ' | 'QURBAN'
): PaymentModule {
  switch (type) {
    case 'WAKAF':
      return 'WAQF';
    case 'ZAKAT':
      return 'ZAKAT';
    case 'QURBAN':
      return 'QURBAN';
    default:
      return 'INFAQ';
  }
}

/**
 * Pemetaan webhook Mayar: payload tidak menggemakan order ID internal, jadi
 * `providerRef` dari re-fetch dicocokkan ke `payment_gateway_ref` yang sudah
 * unik di tabel `transactions`.
 */
async function findOrderAnchorByProviderRef(
  tx: DatabaseTransaction,
  providerRef: string
): Promise<OrderAnchor | null> {
  const [transaction] = await tx
    .select({
      id: transactions.id,
      jenisTransaksi: transactions.jenisTransaksi,
    })
    .from(transactions)
    .where(eq(transactions.paymentGatewayRef, providerRef));

  if (!transaction) {
    return null;
  }

  const module = moduleFromTransactionType(transaction.jenisTransaksi);

  if (module === 'WAQF') {
    const [order] = await tx
      .select({
        id: waqfOrders.id,
        waqfProgramId: waqfOrders.waqfProgramId,
      })
      .from(waqfOrders)
      .where(eq(waqfOrders.transactionId, transaction.id));

    return order
      ? {
          module,
          orderId: order.id,
          transactionId: transaction.id,
          waqfProgramId: order.waqfProgramId,
        }
      : null;
  }

  if (module === 'ZAKAT') {
    const [order] = await tx
      .select({ id: zakatOrders.id })
      .from(zakatOrders)
      .where(eq(zakatOrders.transactionId, transaction.id));

    return order
      ? { module, orderId: order.id, transactionId: transaction.id }
      : null;
  }

  if (module === 'INFAQ') {
    const [order] = await tx
      .select({ orderId: infaqOrders.orderId })
      .from(infaqOrders)
      .where(eq(infaqOrders.transactionId, transaction.id));

    return order
      ? { module, orderId: order.orderId, transactionId: transaction.id }
      : null;
  }

  const [order] = await tx
    .select({ id: qurbanOrders.id })
    .from(qurbanOrders)
    .where(eq(qurbanOrders.transactionId, transaction.id));

  return order
    ? { module, orderId: order.id, transactionId: transaction.id }
    : null;
}

async function incrementDestinationLedger(
  tx: DatabaseTransaction,
  destination: string,
  amount: string
): Promise<void> {
  const updatedAt = new Date().toISOString();

  await tx
    .insert(fundPools)
    .values({
      id: `FP-${ulid()}`,
      kode: destination,
      nama: destination,
      balance: amount,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: fundPools.kode,
      set: {
        balance: sql`${fundPools.balance} + ${amount}`,
        updatedAt,
      },
    });
}

async function incrementWaqfPrincipal(
  tx: DatabaseTransaction,
  waqfProgramId: string,
  amount: string
): Promise<void> {
  const updatedAt = new Date().toISOString();

  await tx
    .insert(waqfPrincipalLedgers)
    .values({
      id: `WPL-${ulid()}`,
      waqfProgramId,
      pokokDanaTerkumpul: amount,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: waqfPrincipalLedgers.waqfProgramId,
      set: {
        pokokDanaTerkumpul: sql`${waqfPrincipalLedgers.pokokDanaTerkumpul} + ${amount}`,
        updatedAt,
      },
    });
}

async function markOrderSettled(
  tx: DatabaseTransaction,
  module: PaymentModule,
  orderId: string,
  amount: string
): Promise<void> {
  if (module === 'WAQF') {
    await tx
      .update(waqfOrders)
      .set({ status: 'TERVERIFIKASI' })
      .where(eq(waqfOrders.id, orderId));
    return;
  }

  if (module === 'ZAKAT') {
    await tx
      .update(zakatOrders)
      .set({ status: 'TERVERIFIKASI' })
      .where(eq(zakatOrders.id, orderId));
    return;
  }

  if (module === 'INFAQ') {
    await tx
      .update(infaqOrders)
      .set({
        status: 'SETTLED',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(infaqOrders.orderId, orderId));
    return;
  }

  await tx
    .update(qurbanOrders)
    .set({
      statusPembayaran: 'LUNAS',
      nominalDibayar: amount,
      sisaTagihan: '0',
    })
    .where(eq(qurbanOrders.id, orderId));
}

async function markOrderRejected(
  tx: DatabaseTransaction,
  module: PaymentModule,
  orderId: string
): Promise<void> {
  if (module === 'WAQF') {
    await tx
      .update(waqfOrders)
      .set({ status: 'DITOLAK' })
      .where(eq(waqfOrders.id, orderId));
    return;
  }

  if (module === 'ZAKAT') {
    await tx
      .update(zakatOrders)
      .set({ status: 'DITOLAK' })
      .where(eq(zakatOrders.id, orderId));
    return;
  }

  if (module === 'INFAQ') {
    await tx
      .update(infaqOrders)
      .set({
        status: 'FAILED',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(infaqOrders.orderId, orderId));
    return;
  }

  // QURBAN: mark unpaid and release the reserved slots so another buyer can
  // take them (S10-N-10 slot auto-release on cancel/expire).
  await tx
    .update(qurbanOrders)
    .set({ statusPembayaran: 'BELUM_BAYAR' })
    .where(eq(qurbanOrders.id, orderId));
  await tx
    .update(qurbanAnimalSlots)
    .set({ status: 'TERSEDIA', qurbanOrderId: null })
    .where(eq(qurbanAnimalSlots.qurbanOrderId, orderId));
}

export type ApplyProviderEventResult =
  | { status: 'not_found' }
  | { status: 'acknowledged' }
  | { status: 'already_processed' }
  | { status: 'failed' }
  | {
      status: 'settled';
      module: PaymentModule;
      orderId: string;
      amount: string;
      userId: string;
    };

/**
 * Satu-satunya jalur perubahan status pembayaran [I-11].
 *
 * Webhook dan job rekonsiliasi memanggil fungsi yang sama, sehingga keduanya
 * idempoten terhadap satu sama lain — rekonsiliasi yang berjalan bersamaan
 * dengan webhook yang terlambat tidak bisa menghitung ganda. Kalau keduanya
 * punya jalur sendiri, keduanya harus benar sendiri-sendiri, dan itu tidak
 * pernah bertahan lama.
 *
 * Idempotensinya bukan dari pemeriksaan di awal, melainkan dari
 * `UPDATE ... WHERE status != 'LUNAS' RETURNING *`: hanya satu pemanggil yang
 * bisa memenangkan baris itu, sisanya mendapat nol baris dan berhenti.
 *
 * WAJIB dipanggil di dalam transaksi — pemanggil yang menentukan batasnya,
 * supaya perubahan status, ledger, dan status order selalu satu paket.
 */
export async function applyProviderEvent(
  tx: DatabaseTransaction,
  event: ProviderEvent
): Promise<ApplyProviderEventResult> {
  let anchor: OrderAnchor | null = null;
  if (event.orderId) {
    anchor = await findOrderAnchor(tx, event.orderId);
  } else if (event.providerRef) {
    anchor = await findOrderAnchorByProviderRef(tx, event.providerRef);
  }
  if (!anchor) {
    return { status: 'not_found' };
  }

  // GAGAL hanya dari PENDING, sehingga kegagalan yang datang terlambat tidak
  // pernah menurunkan transaksi yang sudah lunas. Ledger sengaja tidak
  // disentuh; slot qurban dilepas untuk pembeli berikutnya.
  if (event.outcome === 'GAGAL') {
    const failedRows = await tx
      .update(transactions)
      .set({ statusPembayaran: 'GAGAL' })
      .where(
        and(
          eq(transactions.id, anchor.transactionId),
          eq(transactions.statusPembayaran, 'PENDING')
        )
      )
      .returning();

    if (!failedRows[0]) {
      return { status: 'already_processed' };
    }

    await markOrderRejected(tx, anchor.module, anchor.orderId);
    return { status: 'failed' };
  }

  if (event.outcome === 'PENDING') {
    return { status: 'acknowledged' };
  }

  const settledRows = await tx
    .update(transactions)
    .set({ statusPembayaran: 'LUNAS' })
    .where(
      and(
        eq(transactions.id, anchor.transactionId),
        ne(transactions.statusPembayaran, 'LUNAS')
      )
    )
    .returning();

  const settled = settledRows[0];
  if (!settled) {
    return { status: 'already_processed' };
  }

  // Nominal hasil re-fetch tidak cocok dengan anchor: peristiwa ditolak dan
  // transaksinya dibiarkan pada status semula. `throw` membatalkan seluruh
  // transaksi termasuk UPDATE di atas, jadi tidak ada perubahan separuh jalan.
  if (
    event.expectedAmount &&
    !amountsMatch(event.expectedAmount, settled.amount)
  ) {
    throw new AmountMismatchError(event.expectedAmount, settled.amount);
  }

  if (anchor.module === 'WAQF' && anchor.waqfProgramId) {
    await incrementWaqfPrincipal(tx, anchor.waqfProgramId, settled.amount);
  } else {
    await incrementDestinationLedger(
      tx,
      settled.disbursementDestination,
      settled.amount
    );
  }
  await markOrderSettled(tx, anchor.module, anchor.orderId, settled.amount);

  return {
    status: 'settled',
    module: anchor.module,
    orderId: anchor.orderId,
    amount: settled.amount,
    userId: settled.wakifId,
  };
}

function amountsMatch(expected: string, anchored: string): boolean {
  const expectedNumber = Number(expected);
  const anchoredNumber = Number(anchored);

  return (
    Number.isFinite(expectedNumber) &&
    Number.isFinite(anchoredNumber) &&
    expectedNumber === anchoredNumber
  );
}

/** Dibedakan dari Error biasa supaya pemanggil bisa membalas 409, bukan 500. */
export class AmountMismatchError extends Error {
  readonly expected: string;
  readonly anchored: string;

  constructor(expected: string, anchored: string) {
    super(`Amount mismatch: provider ${expected}, anchor ${anchored}`);
    this.name = 'AmountMismatchError';
    this.expected = expected;
    this.anchored = anchored;
  }
}

/**
 * Pemetaan hasil ke HTTP, dipisah supaya handler tetap terbaca sebagai empat
 * langkah: parse → verifikasi → terapkan → petakan.
 *
 * `failed` dan `settled` sama-sama 200: provider sudah menyampaikan
 * peristiwanya dengan benar, dan itu yang dikonfirmasi kode status HTTP.
 * Membalas 4xx untuk pembayaran yang gagal akan membuat provider mengirim
 * ulang peristiwa yang sudah kita proses.
 */
function providerEventResponse(result: ApplyProviderEventResult): Response {
  switch (result.status) {
    case 'not_found':
      return jsonResponse({ error: 'Transaction not found' }, 404);
    case 'acknowledged':
      return jsonResponse(
        { ok: true, message: 'Notification acknowledged' },
        200
      );
    case 'already_processed':
      return jsonResponse({ ok: true, message: 'Already processed' }, 200);
    default:
      return jsonResponse({ ok: true }, 200);
  }
}

async function applyEventAndRespond(
  database: Database,
  onSettled: WebhookHandlerDeps['onSettled'],
  event: ProviderEvent
): Promise<Response> {
  let result: ApplyProviderEventResult;

  try {
    result = await database.transaction((tx) => applyProviderEvent(tx, event));
  } catch (error) {
    if (error instanceof AmountMismatchError) {
      return jsonResponse({ error: error.message }, 409);
    }
    throw error;
  }

  // Notifikasi dikirim SETELAH transaksi commit, bukan di dalamnya: pengiriman
  // WhatsApp yang lambat tidak boleh menahan kunci baris transaksi, dan
  // notifikasi tidak boleh terkirim untuk transaksi yang ternyata di-rollback.
  if (result.status === 'settled' && onSettled) {
    try {
      await onSettled(result.module, result.orderId, result.amount);
    } catch {
      // Best-effort: a notification failure must never affect the webhook.
    }
  }

  return providerEventResponse(result);
}

export async function handlePaymentWebhook(
  request: Request,
  deps: WebhookHandlerDeps
): Promise<Response> {
  const { database, paymentProvider, onSettled } = deps;
  const rawBody = await request.text();

  // Satu jalur untuk semua provider. Mock, Midtrans, dan Mayar kini
  // mengimplementasikan `resolveWebhook`; cabang cadangan hanya untuk
  // `PaymentProvider` pihak ketiga (mis. test double) yang belum v2, dan
  // memakai resolver yang sama sehingga tidak ada logika status kedua.
  const resolution = paymentProvider.resolveWebhook
    ? await paymentProvider.resolveWebhook(request, rawBody)
    : resolveSignedWebhook(request, rawBody, (payload, signature) =>
        paymentProvider.verifyWebhookSignature(payload, signature)
      );

  if (resolution.type === 'event') {
    return applyEventAndRespond(database, onSettled, resolution.event);
  }
  if (resolution.type === 'ignored') {
    return jsonResponse({ ok: true, message: 'Ignored event' }, 200);
  }

  return jsonResponse({ error: resolution.message }, resolution.status);
}
