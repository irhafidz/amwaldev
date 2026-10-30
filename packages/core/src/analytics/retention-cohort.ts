/**
 * Donor retention cohorts (M+0, M+1, ...). Pure: callers hand over one row per
 * (donor, active month) and the current month; nothing here touches the DB or
 * the clock, and every division is guarded so empty or tiny datasets are safe.
 */

/** Months since year 0 in WIB: `year * 12 + (month - 1)`. */
export type MonthIndex = number;

export interface UserMonthActivity {
  userId: string;
  month: MonthIndex;
  /** Verified donations (IDR) the donor made in that month. */
  amount: number;
}

export interface CohortRow {
  /** Acquisition month (the donor's first verified donation). */
  month: MonthIndex;
  label: string;
  donors: number;
  /** Average lifetime giving per donor in this cohort, IDR. */
  avgLtv: number;
  /** `retention[k]` = % of the cohort active in month M+k, `null` if not reached yet. */
  retention: (number | null)[];
}

export interface CohortSummary {
  /** Donor-weighted M+1 retention across cohorts that have reached M+1. */
  avgRetentionM1: number | null;
  avgLtv: number;
  totalDonors: number;
  firstLabel: string | null;
  lastLabel: string | null;
}

export interface CohortOptions {
  nowMonth: MonthIndex;
  /** Number of columns, M+0 .. M+(months-1). */
  months?: number;
  /** Keep only the most recent N acquisition cohorts. */
  maxCohorts?: number;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

export function monthIndex(year: number, month1To12: number): MonthIndex {
  return year * 12 + (month1To12 - 1);
}

export function monthLabel(index: MonthIndex): string {
  const year = Math.floor(index / 12);
  return `${MONTH_NAMES[index % 12]} '${String(year).slice(-2)}`;
}

const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

interface DonorHistory {
  firstMonth: MonthIndex;
  months: Set<MonthIndex>;
  total: number;
}

function groupByDonor(
  rows: readonly UserMonthActivity[]
): Map<string, DonorHistory> {
  const donors = new Map<string, DonorHistory>();
  for (const row of rows) {
    const history = donors.get(row.userId);
    if (history) {
      history.firstMonth = Math.min(history.firstMonth, row.month);
      history.months.add(row.month);
      history.total += row.amount;
    } else {
      donors.set(row.userId, {
        firstMonth: row.month,
        months: new Set([row.month]),
        total: row.amount,
      });
    }
  }
  return donors;
}

function groupByCohort(donors: Map<string, DonorHistory>) {
  const cohorts = new Map<MonthIndex, DonorHistory[]>();
  for (const history of donors.values()) {
    const bucket = cohorts.get(history.firstMonth) ?? [];
    bucket.push(history);
    cohorts.set(history.firstMonth, bucket);
  }
  return cohorts;
}

export function buildRetentionCohorts(
  rows: readonly UserMonthActivity[],
  options: CohortOptions
): { cohorts: CohortRow[]; summary: CohortSummary } {
  const { nowMonth, months = 6, maxCohorts = 12 } = options;
  const cohortMap = groupByCohort(groupByDonor(rows));
  const ordered = [...cohortMap.keys()]
    .sort((a, b) => a - b)
    .slice(-maxCohorts);

  let m1Active = 0;
  let m1Base = 0;
  let totalDonors = 0;
  let totalAmount = 0;

  const cohorts = ordered.map((month): CohortRow => {
    const members = cohortMap.get(month) ?? [];
    const ltv = members.reduce((sum, member) => sum + member.total, 0);
    totalDonors += members.length;
    totalAmount += ltv;

    const retention = Array.from({ length: months }, (_, k) => {
      const target = month + k;
      if (target > nowMonth) {
        return null;
      }
      const active = members.filter((member) => member.months.has(target));
      if (k === 1) {
        m1Active += active.length;
        m1Base += members.length;
      }
      return percent(active.length, members.length);
    });

    return {
      month,
      label: monthLabel(month),
      donors: members.length,
      avgLtv: members.length === 0 ? 0 : Math.round(ltv / members.length),
      retention,
    };
  });

  return {
    cohorts,
    summary: {
      avgRetentionM1: m1Base === 0 ? null : percent(m1Active, m1Base),
      avgLtv: totalDonors === 0 ? 0 : Math.round(totalAmount / totalDonors),
      totalDonors,
      firstLabel: cohorts[0]?.label ?? null,
      lastLabel: cohorts.at(-1)?.label ?? null,
    },
  };
}

export interface RetentionDrop {
  /** Column index the drop starts from (M+from). */
  from: number;
  to: number;
  fromPct: number;
  toPct: number;
}

/**
 * Steepest fall in the cohort-average retention curve between consecutive
 * months, ignoring the trivial M+0 -> M+1 step (M+0 is 100% by definition).
 * `null` when fewer than three columns have any data, i.e. there is no trend
 * to describe yet.
 */
export function largestRetentionDrop(
  cohorts: readonly Pick<CohortRow, 'retention'>[]
): RetentionDrop | null {
  const columns = Math.max(0, ...cohorts.map((c) => c.retention.length));
  const averages = Array.from({ length: columns }, (_, k) => {
    const values = cohorts
      .map((cohort) => cohort.retention[k])
      .filter((value): value is number => typeof value === 'number');
    return values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  });

  let best: RetentionDrop | null = null;
  for (let k = 2; k < averages.length; k += 1) {
    const previous = averages[k - 1];
    const current = averages[k];
    if (previous == null || current == null) {
      continue;
    }
    const drop = previous - current;
    if (drop > 0 && drop > (best ? best.fromPct - best.toPct : 0)) {
      best = {
        from: k - 1,
        to: k,
        fromPct: Math.round(previous * 10) / 10,
        toPct: Math.round(current * 10) / 10,
      };
    }
  }
  return best;
}
