import { describe, expect, test } from 'bun:test';
import { wibParts } from '../src/time/wib';

describe('@amwal/core/time/wib', () => {
  test('converts 17:00 UTC to 00:00 WIB on the next day', () => {
    expect(wibParts(new Date('2026-01-01T17:00:00.000Z'))).toEqual({
      year: 2026,
      month: 1,
      day: 2,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  test('keeps WIB 23:59:59 and 00:00:00 boundaries', () => {
    expect(wibParts(new Date('2026-01-01T16:59:59.000Z'))).toEqual({
      year: 2026,
      month: 1,
      day: 1,
      hour: 23,
      minute: 59,
      second: 59,
    });

    expect(wibParts(new Date('2025-12-31T17:00:00.000Z'))).toEqual({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  test('rolls into the next year at the WIB boundary', () => {
    expect(wibParts(new Date('2026-12-31T17:00:00.000Z'))).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });
});
