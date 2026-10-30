import { describe, expect, test } from 'bun:test';
import {
  buildRetentionCohorts,
  largestRetentionDrop,
  monthIndex,
  monthLabel,
} from '../../src/analytics/retention-cohort';

const jan = monthIndex(2026, 1);
const feb = jan + 1;
const mar = jan + 2;

describe('buildRetentionCohorts', () => {
  test('empty dataset is safe: no cohorts, null retention, zero LTV', () => {
    const { cohorts, summary } = buildRetentionCohorts([], { nowMonth: mar });
    expect(cohorts).toEqual([]);
    expect(summary).toEqual({
      avgRetentionM1: null,
      avgLtv: 0,
      totalDonors: 0,
      firstLabel: null,
      lastLabel: null,
    });
  });

  test('computes retention, LTV and leaves not-yet-reached months null', () => {
    const rows = [
      // Jan cohort: a (Jan, Feb, Mar), b (Jan only)
      { userId: 'a', month: jan, amount: 100 },
      { userId: 'a', month: feb, amount: 50 },
      { userId: 'a', month: mar, amount: 50 },
      { userId: 'b', month: jan, amount: 300 },
      // Feb cohort: c (Feb only)
      { userId: 'c', month: feb, amount: 80 },
    ];
    const { cohorts, summary } = buildRetentionCohorts(rows, {
      nowMonth: mar,
      months: 4,
    });

    expect(cohorts.map((c) => c.label)).toEqual(["Jan '26", "Feb '26"]);
    const [janCohort, febCohort] = cohorts;
    expect(janCohort?.donors).toBe(2);
    expect(janCohort?.avgLtv).toBe(250);
    expect(janCohort?.retention).toEqual([100, 50, 50, null]);
    expect(febCohort?.retention).toEqual([100, 0, null, null]);

    // M+1: 1 of 2 (Jan) + 0 of 1 (Feb) = 1 of 3
    expect(summary.avgRetentionM1).toBe(33.3);
    expect(summary.totalDonors).toBe(3);
    expect(summary.avgLtv).toBe(193);
    expect(summary.firstLabel).toBe("Jan '26");
    expect(summary.lastLabel).toBe("Feb '26");
  });

  test('a single current-month donor has no M+1 yet and does not divide by zero', () => {
    const { cohorts, summary } = buildRetentionCohorts(
      [{ userId: 'x', month: mar, amount: 10 }],
      { nowMonth: mar, months: 3 }
    );
    expect(cohorts[0]?.retention).toEqual([100, null, null]);
    expect(summary.avgRetentionM1).toBeNull();
  });

  test('keeps only the most recent cohorts and handles year boundaries', () => {
    const dec = monthIndex(2025, 12);
    const rows = [
      { userId: 'old', month: dec - 5, amount: 1 },
      { userId: 'dec', month: dec, amount: 1 },
      { userId: 'dec', month: dec + 1, amount: 1 },
    ];
    const { cohorts } = buildRetentionCohorts(rows, {
      nowMonth: dec + 1,
      months: 2,
      maxCohorts: 1,
    });
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]?.label).toBe("Des '25");
    expect(cohorts[0]?.retention).toEqual([100, 100]);
  });
});

describe('monthLabel', () => {
  test('formats Indonesian short month names', () => {
    expect(monthLabel(monthIndex(2026, 5))).toBe("Mei '26");
    expect(monthLabel(monthIndex(2025, 8))).toBe("Agu '25");
  });
});

describe('largestRetentionDrop', () => {
  test('finds the steepest month-to-month fall and skips M+0 -> M+1', () => {
    const drop = largestRetentionDrop([
      { retention: [100, 60, 50, 48] },
      { retention: [100, 80, 30, null] },
    ]);
    // averages: 100, 70, 40, 48 -> biggest drop M+1 (70) -> M+2 (40)
    expect(drop).toEqual({ from: 1, to: 2, fromPct: 70, toPct: 40 });
  });

  test('returns null when there is no trend yet (empty, tiny, or flat data)', () => {
    expect(largestRetentionDrop([])).toBeNull();
    expect(largestRetentionDrop([{ retention: [100, null, null] }])).toBeNull();
    expect(largestRetentionDrop([{ retention: [100, 50, 50, 50] }])).toBeNull();
  });
});
