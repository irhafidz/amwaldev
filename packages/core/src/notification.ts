import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import {
  infaqOrders,
  notifications,
  qurbanOrders,
  waqfOrders,
  zakatOrders,
} from './db/schema';
import type { Database } from './db/types';
import type { PaymentModule } from './payment/order-id';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  relatedEntityId?: string;
}

/**
 * Inserts an in-app notification row. Framework-agnostic and env-free — the
 * caller decides when to trigger it (settlement, withdrawal rejection,
 * deposit verification).
 */
export async function createNotification(
  database: Database,
  input: CreateNotificationInput
): Promise<void> {
  await database.insert(notifications).values({
    id: `NTF-${ulid()}`,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
  });
}

/**
 * Resolves the donor user id for a settled order and fires a PAYMENT_SETTLED
 * notification. Best-effort — a missing donor (guest without a row) or any DB
 * error is silently skipped; the webhook's `onSettled` callback wraps it.
 */
export async function createSettlementNotification(
  database: Database,
  module: PaymentModule,
  orderId: string
): Promise<void> {
  let userId: string | null = null;

  if (module === 'WAQF') {
    const [order] = await database
      .select({ wakifId: waqfOrders.wakifId })
      .from(waqfOrders)
      .where(eq(waqfOrders.id, orderId));
    userId = order?.wakifId ?? null;
  } else if (module === 'ZAKAT') {
    const [order] = await database
      .select({ muzakkiId: zakatOrders.muzakkiId })
      .from(zakatOrders)
      .where(eq(zakatOrders.id, orderId));
    userId = order?.muzakkiId ?? null;
  } else if (module === 'INFAQ') {
    const [order] = await database
      .select({ userId: infaqOrders.userId })
      .from(infaqOrders)
      .where(eq(infaqOrders.orderId, orderId));
    userId = order?.userId ?? null;
  } else {
    const [order] = await database
      .select({ wakifId: qurbanOrders.wakifId })
      .from(qurbanOrders)
      .where(eq(qurbanOrders.id, orderId));
    userId = order?.wakifId ?? null;
  }

  if (!userId) {
    return;
  }

  await createNotification(database, {
    userId,
    type: 'PAYMENT_SETTLED',
    title: 'Pembayaran berhasil',
    body: `Pembayaran pesanan ${orderId} telah diterima.`,
    relatedEntityId: orderId,
  });
}
