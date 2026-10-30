import { describe, expect, test } from 'bun:test';
import {
  buildVerificationUrl,
  formatWibDate,
  formatWibDateTime,
  initialsOf,
  maskDonorName,
  maskDonorNameForPublic,
  toInstant,
} from '../src/certificate/display';

/**
 * `I-5` — the two defects this file locks down are the reason the ticket
 * exists at all:
 *
 * 1. the clock printed on a certificate must be WIB, including seconds, so a
 *    donation made at 00:30 WIB is not stamped with the previous day; and
 * 2. the QR must point at `/verifikasi/$nomor` on `PUBLIC_APP_URL`, and must
 *    refuse to render at all when that base is missing (the old value,
 *    `https://amwal.id/verify-cert/…`, has no route in this app).
 */
describe('@amwal/core/certificate/display — WIB formatting', () => {
  test('prints the seconds in Asia/Jakarta, not the server zone', () => {
    expect(formatWibDateTime(new Date('2026-09-17T04:05:06.000Z'))).toBe(
      '17 September 2026, 11:05:06 WIB'
    );
  });

  test('a 00:30 WIB donation keeps its own date, not the previous day', () => {
    // 2026-09-30T17:30Z is 1 October 2026, 00:30 WIB — the exact case PLAN
    // §D4 calls out. The old `toLocaleDateString()` printed 30 September.
    expect(formatWibDateTime(new Date('2026-09-30T17:30:00.000Z'))).toBe(
      '01 Oktober 2026, 00:30:00 WIB'
    );
    expect(formatWibDate(new Date('2026-09-30T17:30:00.000Z'))).toBe(
      '01 Oktober 2026'
    );
  });

  test('reads a naive Postgres timestamp as UTC, never as local time', () => {
    // `timestamp(3)` columns arrive as `YYYY-MM-DD HH:mm:ss` with no offset.
    // `new Date('2026-09-30 17:30:00')` would shift the instant by the
    // runtime's own zone offset — exactly the class of bug being fixed.
    expect(formatWibDateTime('2026-09-30 17:30:00')).toBe(
      '01 Oktober 2026, 00:30:00 WIB'
    );
    expect(formatWibDateTime('2026-09-30 17:30:00.123')).toBe(
      '01 Oktober 2026, 00:30:00 WIB'
    );
  });

  test('pads day, hour, minute and second to two digits', () => {
    expect(formatWibDateTime('2026-01-04 02:03:04')).toBe(
      '04 Januari 2026, 09:03:04 WIB'
    );
  });

  test('keeps the 23:59:59 WIB boundary on its own day', () => {
    expect(formatWibDateTime('2026-09-30 16:59:59')).toBe(
      '30 September 2026, 23:59:59 WIB'
    );
    // One second later the calendar day — and the month — roll over.
    expect(formatWibDateTime('2026-09-30 17:00:00')).toBe(
      '01 Oktober 2026, 00:00:00 WIB'
    );
  });

  test('rejects an unparseable date instead of printing "Invalid Date"', () => {
    expect(() => formatWibDateTime('bukan tanggal')).toThrow();
    expect(() => toInstant('bukan tanggal')).toThrow();
  });
});

describe('@amwal/core/certificate/display — donor masking', () => {
  test('never reveals the stored name of an anonymous donation', () => {
    expect(maskDonorName('Budi Santoso', true)).toBe('Hamba Allah (Anonim)');
  });

  test('keeps a named donor and trims surrounding whitespace', () => {
    expect(maskDonorName('  Budi Santoso  ', false)).toBe('Budi Santoso');
  });

  test('returns null when there is genuinely no name to show', () => {
    expect(maskDonorName('   ', false)).toBeNull();
    expect(maskDonorName(null, false)).toBeNull();
    expect(maskDonorName(undefined, false)).toBeNull();
  });

  test('initialsOf keeps at most three initials', () => {
    expect(initialsOf('Budi Santoso')).toBe('B. S.');
    expect(initialsOf('  rahmat   hidayat  ')).toBe('R. H.');
    expect(initialsOf('Siti Aminah Nur Hidayah')).toBe('S. A. N.');
  });

  test('the public mask never hands out a full name', () => {
    expect(maskDonorNameForPublic('Budi Santoso', false)).toBe('B. S.');
    expect(maskDonorNameForPublic('Budi Santoso', true)).toBe(
      'Hamba Allah (Anonim)'
    );
    expect(maskDonorNameForPublic(null, false)).toBeNull();
  });
});

describe('@amwal/core/certificate/display — verification URL', () => {
  test('builds <PUBLIC_APP_URL>/verifikasi/<nomor>', () => {
    expect(buildVerificationUrl('CERT-AMW-2026-0001', 'https://amwal.id')).toBe(
      'https://amwal.id/verifikasi/CERT-AMW-2026-0001'
    );
  });

  test('normalises trailing slashes so the path never doubles up', () => {
    expect(
      buildVerificationUrl('CERT-AMW-2026-0001', 'https://amwal.id///')
    ).toBe('https://amwal.id/verifikasi/CERT-AMW-2026-0001');
  });

  test('escapes a certificate number instead of pasting it into the path', () => {
    expect(buildVerificationUrl('CERT/1?x=1', 'https://amwal.id')).toBe(
      'https://amwal.id/verifikasi/CERT%2F1%3Fx%3D1'
    );
  });

  test('fails closed when the base URL is missing or not http(s)', () => {
    expect(() => buildVerificationUrl('CERT-1', '')).toThrow();
    expect(() => buildVerificationUrl('CERT-1', '   ')).toThrow();
    expect(() => buildVerificationUrl('CERT-1', 'ftp://amwal.id')).toThrow();
  });
});
