import { describe, expect, test } from 'bun:test';
import {
  formatWibDate,
  formatWibDateTime,
  parseDbTimestamp,
} from '../src/lib/format-wib';

/**
 * Murni, tanpa database. Membuktikan bahwa timestamp tanpa zona dari Drizzle
 * dibaca sebagai UTC — bukan sebagai waktu lokal perangkat, yang di perangkat
 * WIB menggeser setiap jam tujuh jam.
 */

describe('format-wib', () => {
  test('string tanpa zona dari Drizzle diperlakukan sebagai UTC', () => {
    expect(parseDbTimestamp('2026-09-17 05:00:00.123').toISOString()).toBe(
      '2026-09-17T05:00:00.123Z'
    );
  });

  test('string yang sudah berzona tidak diberi Z ganda', () => {
    expect(parseDbTimestamp('2026-09-17T05:00:00.000Z').toISOString()).toBe(
      '2026-09-17T05:00:00.000Z'
    );
    expect(
      parseDbTimestamp('2026-09-17T12:00:00.000+07:00').toISOString()
    ).toBe('2026-09-17T05:00:00.000Z');
  });

  test('05:00 UTC tampil sebagai 12:00 WIB', () => {
    expect(formatWibDateTime('2026-09-17 05:00:00')).toBe(
      '17 Sep 2026, 12:00:00 WIB'
    );
  });

  test('17:30 UTC tanggal 31 Agustus sudah 1 September di WIB', () => {
    expect(formatWibDate('2026-08-31 17:30:00')).toBe('01 Sep 2026');
    expect(formatWibDateTime('2026-08-31 17:30:00')).toBe(
      '01 Sep 2026, 00:30:00 WIB'
    );
  });

  test('nilai kosong atau rusak tidak melempar', () => {
    expect(formatWibDateTime(null)).toBe('—');
    expect(formatWibDateTime('')).toBe('—');
    expect(formatWibDate('bukan-tanggal')).toBe('—');
  });
});
