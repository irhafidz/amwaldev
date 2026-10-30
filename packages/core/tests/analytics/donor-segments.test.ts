import { describe, expect, test } from 'bun:test';
import {
  classifyDonor,
  countBySegment,
  DONOR_SEGMENTS,
  recencyDaysBetween,
  scoreDonor,
} from '../../src/analytics/donor-segments';

const segmentOf = (
  recencyDays: number,
  frequency: number,
  monetary: number,
  diversity = 1
) => classifyDonor({ recencyDays, frequency, monetary, diversity });

describe('RFM-D scoring', () => {
  test('scores sit on a 1-5 scale at the documented boundaries', () => {
    expect(
      scoreDonor({
        recencyDays: 0,
        frequency: 10,
        monetary: 10_000_000,
        diversity: 9,
      })
    ).toEqual({
      r: 5,
      f: 5,
      m: 5,
      d: 5,
      composite: 5,
    });
    expect(
      scoreDonor({ recencyDays: 400, frequency: 1, monetary: 0, diversity: 0 })
    ).toEqual({
      r: 1,
      f: 1,
      m: 1,
      d: 1,
      composite: 1,
    });
    expect(
      scoreDonor({
        recencyDays: 31,
        frequency: 3,
        monetary: 500_000,
        diversity: 2,
      }).r
    ).toBe(4);
    expect(
      scoreDonor({
        recencyDays: 91,
        frequency: 5,
        monetary: 99_999,
        diversity: 3,
      })
    ).toMatchObject({
      r: 2,
      f: 4,
      m: 1,
      d: 3,
    });
  });
});

describe('RFM-D segments', () => {
  test('each segment is reachable with the intended profile', () => {
    expect(segmentOf(8, 18, 48_500_000, 4)).toBe('Champion');
    expect(segmentOf(40, 3, 600_000)).toBe('Loyal');
    expect(segmentOf(4, 1, 1_500_000)).toBe('New');
    expect(segmentOf(120, 7, 8_900_000)).toBe('At-Risk');
    expect(segmentOf(194, 4, 3_400_000)).toBe('Lapsed');
    expect(segmentOf(110, 2, 2_100_000)).toBe('Situational');
  });

  test('boundaries: 180 days is still active, 181 is lapsed; one-off donors age into Situational', () => {
    expect(segmentOf(180, 7, 8_900_000)).toBe('At-Risk');
    expect(segmentOf(181, 7, 8_900_000)).toBe('Lapsed');
    expect(segmentOf(60, 1, 100_000)).toBe('New');
    expect(segmentOf(61, 1, 100_000)).toBe('Situational');
  });

  test('a single lapsed donation is Lapsed, never New', () => {
    expect(segmentOf(365, 1, 50_000)).toBe('Lapsed');
  });

  test('countBySegment always returns every segment, including for an empty list', () => {
    const empty = countBySegment([]);
    expect(Object.keys(empty)).toEqual([...DONOR_SEGMENTS]);
    expect(Object.values(empty).every((n) => n === 0)).toBe(true);
    expect(countBySegment(['Loyal', 'Loyal', 'New']).Loyal).toBe(2);
  });
});

describe('recencyDaysBetween', () => {
  test('floors to whole days and never goes negative', () => {
    const now = new Date('2026-10-06T00:00:00Z');
    expect(recencyDaysBetween('2026-10-05T01:00:00Z', now)).toBe(0);
    expect(recencyDaysBetween('2026-10-01T00:00:00Z', now)).toBe(5);
    expect(recencyDaysBetween('2026-10-09T00:00:00Z', now)).toBe(0);
  });
});
