import {
  type AffiliateModule,
  isEligibleForAffiliateReward,
} from '@amwal/core/affiliate/eligibility';
import { award } from '@amwal/core/gamification/ledger';
import { affiliateRewardPoints } from '@amwal/core/gamification/points';
import type { PaymentModule } from '@amwal/core/payment/order-id';
import { toWibDate } from '@amwal/core/time/wib';
import { and, eq, or, sql } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import {
  affiliateAttributions,
  gamificationPointLedgers,
  infaqOrders,
  qurbanOrders,
  transactions,
  users,
  waqfOrders,
  zakatOrders,
} from '@/lib/db/schema';

/**
 * Settlement slot for affiliate rewards (`I-4`, PLAN §2.3 / §Anti-abuse).
 *
 * Called from the payment webhook's `onSettled` slot — after the settlement
 * transaction has committed, so it can never reward points for something that
 * was rolled back, and inside the webhook's own try/catch, so an affiliate
 * reward failure can never fail a payment acknowledgment (non-blocking).
 *
 * Rewards follow the rule:
 * `poin_afiliasi = min(100 + ⌊nominal / 10.000⌋, 500)`
 * Keyed under `affiliate:{transactionId}` for idempotency.
 */

export interface AffiliateRewardResult {
  transactionId: string;
  referrerUserId: string;
  donorUserId: string;
  points: number;
  /** `false` when already rewarded previously or rejected by anti-abuse rules. */
  awarded: boolean;
  reason?: string;
}

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

async function resolveIsAnonymous(
  database: Database,
  paymentModule: PaymentModule,
  orderId: string
): Promise<boolean> {
  if (paymentModule === 'WAQF') {
    const [row] = await database
      .select({ isAnonymous: waqfOrders.isAnonymous })
      .from(waqfOrders)
      .where(eq(waqfOrders.id, orderId))
      .limit(1);
    return row?.isAnonymous ?? false;
  }
  return false;
}

async function resolveDonorContact(
  database: Database,
  paymentModule: PaymentModule,
  orderId: string,
  donorUser?: { email: string | null; phone: string | null } | null,
  referrerUser?: { email: string | null; phone: string | null } | null
): Promise<{ email: string | null; phone: string | null }> {
  let orderEmail: string | null = null;
  let orderPhone: string | null = null;

  if (paymentModule === 'INFAQ') {
    const [row] = await database
      .select({
        email: infaqOrders.emailPenginfaq,
        phone: infaqOrders.teleponPenginfaq,
      })
      .from(infaqOrders)
      .where(or(eq(infaqOrders.orderId, orderId), eq(infaqOrders.id, orderId)))
      .limit(1);
    orderEmail = row?.email ?? null;
    orderPhone = row?.phone ?? null;
  } else if (paymentModule === 'WAQF') {
    const [row] = await database
      .select({
        phone: waqfOrders.noTelepon,
      })
      .from(waqfOrders)
      .where(eq(waqfOrders.id, orderId))
      .limit(1);
    orderPhone = row?.phone ?? null;
  }

  const email =
    orderEmail && referrerUser?.email && orderEmail === referrerUser.email
      ? orderEmail
      : (donorUser?.email ?? orderEmail);

  const phone =
    orderPhone && referrerUser?.phone && orderPhone === referrerUser.phone
      ? orderPhone
      : (donorUser?.phone ?? orderPhone);

  return { email, phone };
}

/**
 * Awards affiliate reward points to the referrer upon payment settlement.
 * Returns `null` if the order has no attribution or no transaction found.
 */
export async function settleAffiliateReward(
  database: Database,
  paymentModule: PaymentModule,
  orderId: string
): Promise<AffiliateRewardResult | null> {
  const transactionId = await TRANSACTION_ID_LOOKUPS[paymentModule](
    database,
    orderId
  );
  if (!transactionId) {
    return null;
  }

  const [attribution] = await database
    .select()
    .from(affiliateAttributions)
    .where(eq(affiliateAttributions.transactionId, transactionId))
    .limit(1);

  if (!attribution) {
    return null;
  }

  const [transaction] = await database
    .select({
      id: transactions.id,
      wakifId: transactions.wakifId,
      amount: transactions.amount,
      status: transactions.statusPembayaran,
      jenisTransaksi: transactions.jenisTransaksi,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!transaction || transaction.status !== 'LUNAS') {
    return null;
  }

  const rupiah = Number(transaction.amount);
  if (!Number.isSafeInteger(rupiah) || rupiah <= 0) {
    return null;
  }

  const [donorUser] = await database
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, transaction.wakifId))
    .limit(1);

  const [referrerUser] = await database
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, attribution.referrerUserId))
    .limit(1);

  if (!referrerUser) {
    return null;
  }

  const isAnonymous = await resolveIsAnonymous(
    database,
    paymentModule,
    orderId
  );

  const donorContact = await resolveDonorContact(
    database,
    paymentModule,
    orderId,
    donorUser,
    referrerUser
  );

  const moduleType = (
    paymentModule === 'WAQF' ? 'WAKAF' : paymentModule
  ) as AffiliateModule;

  // 1. Static eligibility checks (self-referral, anonymous, fiqh-excluded module, minimum amount, same email/phone)
  const staticEligibility = isEligibleForAffiliateReward({
    referrerUserId: attribution.referrerUserId,
    donorUserId: transaction.wakifId,
    isAnonymous,
    module: moduleType,
    amountRupiah: rupiah,
    referrerEmail: referrerUser.email,
    donorEmail: donorContact.email,
    referrerPhone: referrerUser.phone,
    donorPhone: donorContact.phone,
  });

  if (!staticEligibility.eligible) {
    return {
      transactionId,
      referrerUserId: attribution.referrerUserId,
      donorUserId: transaction.wakifId,
      points: 0,
      awarded: false,
      reason: staticEligibility.reason,
    };
  }

  // 2. Dynamic anti-abuse checks
  const now = new Date();
  const todayWib = toWibDate(now.toISOString());

  // Check existing affiliate awards for this referrer
  const referrerLedgers = await database
    .select({
      id: gamificationPointLedgers.id,
      createdAt: gamificationPointLedgers.createdAt,
      idempotencyKey: gamificationPointLedgers.idempotencyKey,
    })
    .from(gamificationPointLedgers)
    .where(
      and(
        eq(gamificationPointLedgers.userId, attribution.referrerUserId),
        eq(gamificationPointLedgers.activityType, 'AFFILIATE')
      )
    );

  const alreadyAwardedForThisTxn = referrerLedgers.some(
    (row) => row.idempotencyKey === `affiliate:${transactionId}`
  );

  // A: Max 10 rewarded conversions per referrer per WIB day
  const todayRewardedCount = referrerLedgers.filter(
    (row) => toWibDate(row.createdAt) === todayWib
  ).length;

  if (!alreadyAwardedForThisTxn && todayRewardedCount >= 10) {
    return {
      transactionId,
      referrerUserId: attribution.referrerUserId,
      donorUserId: transaction.wakifId,
      points: 0,
      awarded: false,
      reason: 'daily-limit-exceeded',
    };
  }

  // B: Max 1 per referrer-donor pair per 24 hours
  const twentyFourHoursAgo = new Date(
    now.getTime() - 24 * 60 * 60 * 1000
  ).toISOString();

  const recentPairRows = await database
    .select({
      transactionId: affiliateAttributions.transactionId,
    })
    .from(affiliateAttributions)
    .innerJoin(
      transactions,
      eq(affiliateAttributions.transactionId, transactions.id)
    )
    .innerJoin(
      gamificationPointLedgers,
      eq(
        gamificationPointLedgers.idempotencyKey,
        sql`concat('affiliate:', ${transactions.id})`
      )
    )
    .where(
      and(
        eq(affiliateAttributions.referrerUserId, attribution.referrerUserId),
        eq(transactions.wakifId, transaction.wakifId),
        sql`${gamificationPointLedgers.createdAt} >= ${twentyFourHoursAgo}`,
        sql`${affiliateAttributions.transactionId} != ${transactionId}`
      )
    )
    .limit(1);

  if (recentPairRows.length > 0) {
    return {
      transactionId,
      referrerUserId: attribution.referrerUserId,
      donorUserId: transaction.wakifId,
      points: 0,
      awarded: false,
      reason: 'pair-cooldown',
    };
  }

  // 3. Award points idempotently
  const points = affiliateRewardPoints(rupiah);
  const idempotencyKey = `affiliate:${transactionId}`;

  const awarded = await award(database, {
    userId: attribution.referrerUserId,
    activityType: 'AFFILIATE',
    idempotencyKey,
    points,
    sourceRef: transactionId,
  });

  return {
    transactionId,
    referrerUserId: attribution.referrerUserId,
    donorUserId: transaction.wakifId,
    points,
    awarded,
  };
}
