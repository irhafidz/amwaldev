import { describe, expect, test } from 'bun:test';
import {
  activityLabel,
  formatPointsBalance,
  formatPointsDelta,
  formatPointsTimestamp,
} from '../src/components/gamification/format';

/**
 * `I-10c` — the points screen must never dress a ledger row up as something
 * it is not: a penalty is always negative and always visible as such, and a
 * late-night WIB row keeps its own date. Points stay points (PLAN §D2).
 */

describe('points screen — activity labels', () => {
  test('names every activity the ledger can hold', () => {
    expect(activityLabel('REGISTER')).toBe('Pendaftaran akun');
    expect(activityLabel('CHECKIN')).toBe('Check-in harian');
    expect(activityLabel('QUIZ')).toBe('Kuis');
    expect(activityLabel('READ')).toBe('Baca artikel');
    expect(activityLabel('WATCH')).toBe('Tonton video');
    expect(activityLabel('TRANSACTION')).toBe('Transaksi LUNAS');
    expect(activityLabel('PENALTY')).toBe('Tidak check-in');
  });

  test('degrades honestly for an unknown activity instead of guessing', () => {
    expect(activityLabel('SOMETHING_NEW')).toBe('Aktivitas tidak dikenal');
  });
});

describe('points screen — amounts', () => {
  test('always shows the sign, because a penalty is the whole message', () => {
    expect(formatPointsDelta(200)).toBe('+200');
    expect(formatPointsDelta(-20)).toBe('−20');
    expect(formatPointsDelta(0)).toBe('0');
  });

  test('groups the balance the Indonesian way', () => {
    expect(formatPointsBalance(1250)).toBe('1.250');
    expect(formatPointsBalance(0)).toBe('0');
  });
});

describe('points screen — timestamps', () => {
  test('renders the ledger clock in WIB with a colon separator', () => {
    expect(formatPointsTimestamp('2026-09-30T17:30:00.000Z')).toBe(
      '01 Okt 2026, 00:30 WIB'
    );
  });

  test('keeps a 00:30 WIB row on its own date, not the previous day', () => {
    expect(formatPointsTimestamp('2026-09-16T20:00:00.000Z')).toBe(
      '17 Sep 2026, 03:00 WIB'
    );
  });

  test('a malformed instant says so rather than printing "Invalid Date"', () => {
    expect(formatPointsTimestamp('bukan tanggal')).toBe(
      'Waktu tidak diketahui'
    );
  });
});
