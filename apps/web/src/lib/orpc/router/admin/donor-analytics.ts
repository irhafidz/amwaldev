import {
  AKAD_LABELS,
  type AkadCategory,
  akadCategory,
} from '@amwal/core/analytics/akad-category';
import {
  classifyDonor,
  countBySegment,
  type DonorSegment,
  recencyDaysBetween,
  scoreDonor,
} from '@amwal/core/analytics/donor-segments';
import {
  buildRetentionCohorts,
  monthIndex,
  type UserMonthActivity,
} from '@amwal/core/analytics/retention-cohort';
import {
  retentionCohortInput,
  rfmSegmentsInput,
} from '@amwal/core/contracts/admin-analytics';
import { SYSTEM_ANONYMOUS_USER_ID } from '@amwal/core/identity/guest';
import { parseInstant, wibParts } from '@amwal/core/time/wib';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { infaqOrders, transactions, users } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Donor analytics over verified (`LUNAS`) transactions. The system
 * "Hamba Allah" row is skipped: donations with no email/phone all collapse
 * onto it, so it is not a donor that can be segmented or tracked over time.
 *
 * ponytail: rows are aggregated in JS, like the sibling `admin.analytics.*`
 * procedures. Move the grouping into SQL if the donation count outgrows
 * memory (tens of thousands of transactions is fine).
 */

interface Donation {
  userId: string;
  amount: number;
  createdAt: Date;
  akad: AkadCategory;
}

/** Verified donations by real (non-system) donors. */
const verifiedDonorFilter = and(
  eq(transactions.statusPembayaran, 'LUNAS'),
  ne(transactions.wakifId, SYSTEM_ANONYMOUS_USER_ID)
);

async function loadVerifiedDonations(db: Database): Promise<Donation[]> {
  const rows = await db
    .select({
      userId: transactions.wakifId,
      amount: transactions.amount,
      createdAt: transactions.createdAt,
      jenisTransaksi: transactions.jenisTransaksi,
      jenisInfaq: infaqOrders.jenis,
    })
    .from(transactions)
    .leftJoin(infaqOrders, eq(infaqOrders.transactionId, transactions.id))
    .where(verifiedDonorFilter);

  return rows.map((row) => ({
    userId: row.userId,
    amount: Number(row.amount),
    createdAt: parseInstant(row.createdAt),
    akad: akadCategory(row.jenisTransaksi, row.jenisInfaq),
  }));
}

interface DonorAggregate {
  userId: string;
  frequency: number;
  monetary: number;
  lastAt: Date;
  lastAkad: AkadCategory;
  akads: Set<AkadCategory>;
}

function aggregateDonors(donations: readonly Donation[]): DonorAggregate[] {
  const byDonor = new Map<string, DonorAggregate>();
  for (const donation of donations) {
    const current = byDonor.get(donation.userId);
    if (!current) {
      byDonor.set(donation.userId, {
        userId: donation.userId,
        frequency: 1,
        monetary: donation.amount,
        lastAt: donation.createdAt,
        lastAkad: donation.akad,
        akads: new Set([donation.akad]),
      });
      continue;
    }
    current.frequency += 1;
    current.monetary += donation.amount;
    current.akads.add(donation.akad);
    if (donation.createdAt >= current.lastAt) {
      current.lastAt = donation.createdAt;
      current.lastAkad = donation.akad;
    }
  }
  return [...byDonor.values()];
}

/**
 * Profiles of every donor with a verified donation. Selected with a subquery
 * instead of the ids of the donations query, so both reads can run at once.
 */
async function loadDonorProfiles(db: Database) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(
      inArray(
        users.id,
        db
          .select({ id: transactions.wakifId })
          .from(transactions)
          .where(verifiedDonorFilter)
      )
    );
  return new Map(rows.map((row) => [row.id, row]));
}

const getRFMSegments = adminProcedure
  .input(rfmSegmentsInput)
  .handler(async ({ input, context }) => {
    const now = new Date();
    const [donations, profiles] = await Promise.all([
      loadVerifiedDonations(context.db),
      loadDonorProfiles(context.db),
    ]);
    const aggregates = aggregateDonors(donations);

    const donors = aggregates.map((agg) => {
      const metrics = {
        recencyDays: recencyDaysBetween(agg.lastAt.toISOString(), now),
        frequency: agg.frequency,
        monetary: agg.monetary,
        diversity: agg.akads.size,
      };
      const scores = scoreDonor(metrics);
      const profile = profiles.get(agg.userId);
      return {
        donorId: agg.userId,
        name: profile?.name ?? 'Donatur',
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        segment: classifyDonor(metrics, scores),
        recencyDays: metrics.recencyDays,
        lastDonationAt: agg.lastAt.toISOString(),
        frequency: agg.frequency,
        monetary: agg.monetary,
        diversity: agg.akads.size,
        akads: [...agg.akads].map((akad) => AKAD_LABELS[akad]),
        lastAkad: AKAD_LABELS[agg.lastAkad],
        scores,
      };
    });

    const query = input.search?.toLowerCase();
    const digits = query?.replace(/\D/g, '') ?? '';
    const matches = donors
      .filter((donor) => !input.segment || donor.segment === input.segment)
      .filter(
        (donor) =>
          !query ||
          donor.name.toLowerCase().includes(query) ||
          donor.email?.toLowerCase().includes(query) ||
          donor.donorId.toLowerCase().includes(query) ||
          (digits.length > 0 &&
            donor.phone?.replace(/\D/g, '').includes(digits))
      )
      .sort(
        (a, b) => b.monetary - a.monetary || a.donorId.localeCompare(b.donorId)
      );

    const start = (input.page - 1) * input.limit;
    return {
      data: {
        items: matches.slice(start, start + input.limit),
        total: matches.length,
        page: input.page,
        limit: input.limit,
        totalDonors: donors.length,
        // Counted before search/segment filters so the tab badges stay stable.
        segmentCounts: countBySegment(
          donors.map((donor): DonorSegment => donor.segment)
        ),
      },
    };
  });

const getRetentionCohort = adminProcedure
  .input(retentionCohortInput)
  .handler(async ({ input, context }) => {
    const donations = (await loadVerifiedDonations(context.db)).filter(
      (donation) => !input.akad || donation.akad === input.akad
    );

    const byDonorMonth = new Map<string, UserMonthActivity>();
    for (const donation of donations) {
      const parts = wibParts(donation.createdAt);
      const month = monthIndex(parts.year, parts.month);
      const key = `${donation.userId}|${month}`;
      const current = byDonorMonth.get(key);
      if (current) {
        current.amount += donation.amount;
      } else {
        byDonorMonth.set(key, {
          userId: donation.userId,
          month,
          amount: donation.amount,
        });
      }
    }

    const now = wibParts(new Date());
    const { cohorts, summary } = buildRetentionCohorts(
      [...byDonorMonth.values()],
      {
        nowMonth: monthIndex(now.year, now.month),
        months: input.months,
        maxCohorts: input.cohorts,
      }
    );

    return { data: { months: input.months, cohorts, summary } };
  });

export const donorAnalytics = { getRFMSegments, getRetentionCohort };
