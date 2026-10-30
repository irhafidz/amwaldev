import { describe, expect, test } from 'bun:test';
import { streakDays } from '../../src/gamification/ledger';
import { settlePenalties } from '../../src/gamification/penalties';
import {
  ACTIVITY_POINTS,
  checkInKey,
  quizKey,
  readKey,
  registerKey,
  watchKey,
} from '../../src/gamification/points';
import { parseInstant, toWibDate } from '../../src/time/wib';

/**
 * `I-10` — the parts of the ledger kernel that are pure arithmetic, kept out
 * of the database tests so a failure points at the rule and not at Postgres.
 */

describe('D6 — registration cutoff', () => {
  test('never charges a day that predates the account', () => {
    const penalties = settlePenalties(
      100,
      new Set(),
      '2026-10-01',
      '2026-09-30'
    );

    expect(penalties.map((penalty) => penalty.date)).toEqual(['2026-09-30']);
    expect(penalties.at(0)?.amount).toBe(20);
  });

  test('a same-day registration has nothing to settle at all', () => {
    expect(settlePenalties(100, new Set(), '2026-10-01', '2026-10-01')).toEqual(
      []
    );
  });
});

describe('streakDays', () => {
  test('counts back from today when today is already checked in', () => {
    const dates = new Set(['2026-10-01', '2026-09-30', '2026-09-29']);
    expect(streakDays(dates, '2026-10-01')).toBe(3);
  });

  test('an open day does not zero the streak', () => {
    const dates = new Set(['2026-09-30', '2026-09-29']);
    expect(streakDays(dates, '2026-10-01')).toBe(2);
  });

  test('a missed day breaks the streak', () => {
    const dates = new Set(['2026-09-29']);
    expect(streakDays(dates, '2026-10-01')).toBe(0);
  });

  test('crosses month boundaries', () => {
    const dates = new Set(['2026-10-01', '2026-09-30']);
    expect(streakDays(dates, '2026-10-01')).toBe(2);
  });
});

describe('WIB calendar dates', () => {
  test('a 00:30 WIB instant belongs to that day, not the previous one', () => {
    expect(toWibDate('2026-09-30 17:30:00.000')).toBe('2026-10-01');
    expect(toWibDate('2026-09-30 16:59:59.000')).toBe('2026-09-30');
  });

  test('naive Postgres timestamps are read as UTC', () => {
    expect(parseInstant('2026-09-30 17:30:00').toISOString()).toBe(
      '2026-09-30T17:30:00.000Z'
    );
  });
});

describe('activity points and idempotency keys', () => {
  test('the fixed awards match the D2/D6 table', () => {
    expect(ACTIVITY_POINTS).toEqual({
      REGISTER: 1000,
      CHECKIN: 50,
      QUIZ: 100,
      READ: 50,
      WATCH: 50,
    });
  });

  test('every activity owns exactly one key shape', () => {
    expect(registerKey('u1')).toBe('register:u1');
    expect(checkInKey('u1', '2026-10-01')).toBe('checkin:u1:2026-10-01');
    expect(quizKey('u1', 'q1')).toBe('quiz:u1:q1');
    expect(readKey('u1', 'c1')).toBe('read:u1:c1');
    expect(watchKey('u1', 'c1')).toBe('watch:u1:c1');
  });
});
