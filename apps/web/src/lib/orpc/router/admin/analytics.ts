import {
  aggregateComposition,
  aggregateTimeSeriesBuckets,
} from '@amwal/core/analytics/aggregation';
import {
  type AnalyticsPeriod,
  parseAnalyticsPeriod,
} from '@amwal/core/analytics/period';
import { analyticsPeriodSchema } from '@amwal/core/contracts/admin-analytics';
import { parseInstant, wibParts } from '@amwal/core/time/wib';
import { ORPCError } from '@orpc/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { infaqOrders, transactions } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';
import { donorAnalytics } from './donor-analytics';

const MODULE_LABELS = ['Wakaf', 'Zakat', 'Infaq', 'Sedekah', 'Qurban'] as const;

type AnalyticsInput = {
  year: number;
  month?: number;
};
type ModuleLabel = (typeof MODULE_LABELS)[number];

type RawTransaction = {
  amount: string;
  createdAt: string;
  jenisTransaksi: string;
  wakifId: string;
};

type RawCompositionTransaction = RawTransaction & {
  jenisInfaq: string | null;
};

function resolvePeriod(input: AnalyticsInput): AnalyticsPeriod {
  try {
    return parseAnalyticsPeriod(input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'INVALID_ANALYTICS_PERIOD';
    throw new ORPCError('BAD_REQUEST', { message });
  }
}

function periodBounds(period: AnalyticsPeriod): {
  endExclusive: string;
  start: string;
} {
  return {
    start: period.startDate.toISOString(),
    endExclusive: new Date(period.endDate.getTime() + 1000).toISOString(),
  };
}

function bucketLabel(date: Date, input: AnalyticsInput): string {
  const parts = wibParts(date);
  const month = String(parts.month).padStart(2, '0');

  if (input.month === undefined) {
    return `${parts.year}-${month}`;
  }

  return `${parts.year}-${month}-${String(parts.day).padStart(2, '0')}`;
}

function moduleLabel(row: RawCompositionTransaction): ModuleLabel {
  if (row.jenisInfaq?.startsWith('SEDEKAH_')) {
    return 'Sedekah';
  }
  if (row.jenisInfaq?.startsWith('INFAQ_')) {
    return 'Infaq';
  }

  switch (row.jenisTransaksi) {
    case 'WAKAF':
      return 'Wakaf';
    case 'ZAKAT':
      return 'Zakat';
    case 'QURBAN':
      return 'Qurban';
    default:
      return 'Infaq';
  }
}

function loadPeriodTransactions(
  database: Database,
  period: AnalyticsPeriod
): Promise<RawTransaction[]> {
  const bounds = periodBounds(period);

  return database
    .select({
      amount: transactions.amount,
      createdAt: transactions.createdAt,
      jenisTransaksi: transactions.jenisTransaksi,
      wakifId: transactions.wakifId,
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.createdAt, bounds.start),
        lt(transactions.createdAt, bounds.endExclusive)
      )
    );
}

function loadPeriodCompositionTransactions(
  database: Database,
  period: AnalyticsPeriod
): Promise<RawCompositionTransaction[]> {
  const bounds = periodBounds(period);

  return database
    .select({
      amount: transactions.amount,
      createdAt: transactions.createdAt,
      jenisTransaksi: transactions.jenisTransaksi,
      jenisInfaq: infaqOrders.jenis,
      wakifId: transactions.wakifId,
    })
    .from(transactions)
    .leftJoin(infaqOrders, eq(infaqOrders.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.statusPembayaran, 'LUNAS'),
        gte(transactions.createdAt, bounds.start),
        lt(transactions.createdAt, bounds.endExclusive)
      )
    );
}

const trend = adminProcedure
  .input(analyticsPeriodSchema)
  .handler(async ({ context, input }) => {
    const period = resolvePeriod(input);
    const rows = await loadPeriodTransactions(context.db, period);
    const bucketTotals = aggregateTimeSeriesBuckets(
      rows.map((row) => ({
        date: parseInstant(row.createdAt),
        amount: 1,
      })),
      input
    );
    const donorsByBucket = new Map<string, Set<string>>();

    for (const row of rows) {
      const label = bucketLabel(parseInstant(row.createdAt), input);
      const donors = donorsByBucket.get(label) ?? new Set<string>();
      donors.add(row.wakifId);
      donorsByBucket.set(label, donors);
    }

    return {
      data: bucketTotals.map((bucket) => ({
        label: bucket.label,
        uniqueDonors: donorsByBucket.get(bucket.label)?.size ?? 0,
        totalTransactions: bucket.amount,
      })),
    };
  });

const accumulation = adminProcedure
  .input(analyticsPeriodSchema)
  .handler(async ({ context, input }) => {
    const period = resolvePeriod(input);
    const bounds = periodBounds(period);
    const rows = await context.db
      .select({
        amount: transactions.amount,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.statusPembayaran, 'LUNAS'),
          gte(transactions.createdAt, bounds.start),
          lt(transactions.createdAt, bounds.endExclusive)
        )
      );
    const buckets = aggregateTimeSeriesBuckets(
      rows.map((row) => ({
        date: parseInstant(row.createdAt),
        amount: Number(row.amount),
      })),
      input
    );
    let cumulativeAmount = 0;

    return {
      data: buckets.map((bucket) => {
        cumulativeAmount += bucket.amount;

        return {
          label: bucket.label,
          amount: bucket.amount,
          cumulativeAmount,
        };
      }),
    };
  });

const composition = adminProcedure
  .input(analyticsPeriodSchema)
  .handler(async ({ context, input }) => {
    const period = resolvePeriod(input);
    const rows = await loadPeriodCompositionTransactions(context.db, period);
    const grouped = aggregateComposition(
      rows.map((row) => ({
        module: moduleLabel(row),
        amount: Number(row.amount),
      }))
    );
    const amounts = new Map(grouped.map((item) => [item.module, item.amount]));

    return {
      data: MODULE_LABELS.map((module) => ({
        module,
        amount: amounts.get(module) ?? 0,
      })),
    };
  });

export const analytics = {
  trend,
  accumulation,
  composition,
  ...donorAnalytics,
};
