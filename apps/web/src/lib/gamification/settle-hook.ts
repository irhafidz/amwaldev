import { award } from '@amwal/core/gamification/ledger';
import {
  transactionPointKeys,
  transactionPoints,
} from '@amwal/core/gamification/points';
import type { PaymentModule } from '@amwal/core/payment/order-id';
import { eq, or } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import {
  infaqOrders,
  qurbanOrders,
  transactions,
  waqfOrders,
  zakatOrders,
} from '@/lib/db/schema';

/**
 * Settlement slot for gamification (`I-10b`, PLAN §D2).
 *
 * Called from the payment webhook's `onSettled` slot — after the settlement
 * transaction has committed, so it can never award points for something that
 * was rolled back, and inside the webhook's own try/catch, so a points failure
 * can never fail a payment acknowledgment.
 *
 * Points come from `transactions.amount` (whole rupiah), not from what the
 * gateway echoed: the ledger follows the row that the fiqh invariants already
 * trust. Both rows carry their own idempotency key, so a replayed webhook pays
 * neither half twice.
 */

export interface SettlementPointsResult {
  transactionId: string;
  userId: string;
  base: number;
  amount: number;
  /** `false` when a previous webhook already paid this transaction. */
  awarded: boolean;
}

/**
 * Each module owns its own order table, and each table spells its own column
 * set — one lookup per module keeps every query concretely typed instead of
 * indexing a map of four structurally different tables.
 */
const TRANSACTION_ID_LOOKUPS: Record<
  PaymentModule,
  (database: Database, orderId: string) => Promise<string | null>
> = {
  WAQF: async (database, orderId) => {
    const [row] = await database
      .select({ transactionId: waqfOrders.transactionId })
      .from(waqfOrders)
      .where(eq(waqfOrders.id, orderId))
      .limit(1);
    return row?.transactionId ?? null;
  },
  ZAKAT: async (database, orderId) => {
    const [row] = await database
      .select({ transactionId: zakatOrders.transactionId })
      .from(zakatOrders)
      .where(eq(zakatOrders.id, orderId))
      .limit(1);
    return row?.transactionId ?? null;
  },
  INFAQ: async (database, orderId) => {
    const [row] = await database
      .select({ transactionId: infaqOrders.transactionId })
      .from(infaqOrders)
      .where(or(eq(infaqOrders.orderId, orderId), eq(infaqOrders.id, orderId)))
      .limit(1);
    return row?.transactionId ?? null;
  },
  QURBAN: async (database, orderId) => {
    const [row] = await database
      .select({ transactionId: qurbanOrders.transactionId })
      .from(qurbanOrders)
      .where(eq(qurbanOrders.id, orderId))
      .limit(1);
    return row?.transactionId ?? null;
  },
};

/**
 * Resolves the settled order to its transaction, then to the donor.
 * Returns `null` for a guest donation (`transactions.wakif_id` is required,
 * but an offline/amil-entered order may legitimately have no session user) —
 * points belong to an account, and inventing one is worse than skipping.
 */
async function resolveDonor(
  database: Database,
  paymentModule: PaymentModule,
  orderId: string
): Promise<{ transactionId: string; userId: string; amount: string } | null> {
  const transactionId = await TRANSACTION_ID_LOOKUPS[paymentModule](
    database,
    orderId
  );
  if (!transactionId) {
    return null;
  }

  const [transaction] = await database
    .select({
      userId: transactions.wakifId,
      amount: transactions.amount,
      status: transactions.statusPembayaran,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!transaction || transaction.status !== 'LUNAS') {
    return null;
  }

  return {
    transactionId,
    userId: transaction.userId,
    amount: transaction.amount,
  };
}

/**
 * Awards the two D2 ledger rows. Never throws for a merely ineligible
 * donation: it returns `null` and the webhook carries on.
 */
export async function settleTransactionPoints(
  database: Database,
  paymentModule: PaymentModule,
  orderId: string
): Promise<SettlementPointsResult | null> {
  const donor = await resolveDonor(database, paymentModule, orderId);
  if (!donor) {
    return null;
  }

  // `transactions.amount` is `numeric(18,2)`; D2 pays whole rupiah only, and
  // fractional rupiah is a data defect rather than something to round away.
  const rupiah = Number(donor.amount);
  if (!Number.isInteger(rupiah)) {
    return null;
  }

  const points = transactionPoints(rupiah);
  const keys = transactionPointKeys(donor.transactionId);

  const awarded = await award(database, {
    userId: donor.userId,
    activityType: 'TRANSACTION',
    idempotencyKey: keys.base,
    points: points.base,
    sourceRef: donor.transactionId,
  });
  await award(database, {
    userId: donor.userId,
    activityType: 'TRANSACTION',
    idempotencyKey: keys.amount,
    points: points.amount,
    sourceRef: donor.transactionId,
  });

  return {
    transactionId: donor.transactionId,
    userId: donor.userId,
    base: points.base,
    amount: points.amount,
    awarded,
  };
}
