import { describe, expect, test } from 'bun:test';
import {
  aggregateComposition,
  aggregateTimeSeriesBuckets,
} from '../src/analytics/aggregation';
import { parseAnalyticsPeriod } from '../src/analytics/period';
import { wibParts } from '../src/time/wib';

describe('@amwal/core/analytics/period', () => {
  test('month period starts and ends at WIB boundaries', () => {
    const period = parseAnalyticsPeriod({ year: 2026, month: 1 });
    const start = wibParts(period.startDate);
    const end = wibParts(period.endDate);

    expect(start).toEqual({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
    expect(end).toEqual({
      year: 2026,
      month: 1,
      day: 31,
      hour: 23,
      minute: 59,
      second: 59,
    });
    expect(period.periodLabel).toBe('2026-01');
  });

  test('year period spans January through December', () => {
    const period = parseAnalyticsPeriod({ year: 2026 });
    const start = wibParts(period.startDate);
    const end = wibParts(period.endDate);

    expect(start.month).toBe(1);
    expect(start.day).toBe(1);
    expect(end.month).toBe(12);
    expect(end.day).toBe(31);
    expect(end.hour).toBe(23);
    expect(period.periodLabel).toBe('2026');
  });

  test('rejects invalid month values', () => {
    expect(() => parseAnalyticsPeriod({ year: 2026, month: 0 })).toThrow(
      'INVALID_ANALYTICS_MONTH'
    );
    expect(() => parseAnalyticsPeriod({ year: 2026, month: 13 })).toThrow(
      'INVALID_ANALYTICS_MONTH'
    );
  });
});

describe('@amwal/core/analytics/aggregation', () => {
  test('fills empty daily buckets with zero', () => {
    const buckets = aggregateTimeSeriesBuckets([], {
      year: 2026,
      month: 9,
    });

    expect(buckets).toHaveLength(30);
    expect(buckets.every((bucket) => bucket.amount === 0)).toBe(true);
    expect(buckets[0]?.label).toBe('2026-09-01');
    expect(buckets.at(-1)?.label).toBe('2026-09-30');
  });

  test('fills empty monthly buckets with zero', () => {
    const buckets = aggregateTimeSeriesBuckets([], { year: 2026 });

    expect(buckets).toHaveLength(12);
    expect(buckets.every((bucket) => bucket.amount === 0)).toBe(true);
    expect(buckets.at(-1)?.label).toBe('2026-12');
  });

  test('aggregates composition by module', () => {
    expect(
      aggregateComposition([
        { module: 'WAKAF', amount: 10_000 },
        { module: 'ZAKAT', amount: 5000 },
        { module: 'WAKAF', amount: 20_000 },
      ])
    ).toEqual([
      { module: 'WAKAF', amount: 30_000 },
      { module: 'ZAKAT', amount: 5000 },
    ]);
  });
});
