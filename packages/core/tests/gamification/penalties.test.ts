import { describe, expect, test } from 'bun:test';
import { penaltyKey, settlePenalties } from '../../src/gamification/penalties';

describe('settlePenalties (D6)', () => {
  test('floors balance at 0, never negative', () => {
    const penalties = settlePenalties(30, new Set(), '2026-10-01');
    expect(penalties.length).toBe(7);
    const total = penalties.reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(30);
    expect(penalties[0]?.amount).toBe(20);
    expect(penalties[1]?.amount).toBe(10);
    expect(penalties[2]?.amount).toBe(0);
  });

  test('looks back at most 7 days', () => {
    const penalties = settlePenalties(1000, new Set(), '2026-10-01');
    expect(penalties.length).toBe(7);
    // Every day missed, but only 7 × 20 = 140 is deducted from 1000.
    const total = penalties.reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(140);
  });

  test('skips days the user checked in', () => {
    const penalties = settlePenalties(
      100,
      new Set(['2026-09-30']),
      '2026-10-01'
    );
    expect(penalties.find((p) => p.date === '2026-09-30')).toBeUndefined();
    expect(penalties.length).toBe(6);
  });

  test('emits zero-amount rows when balance is already 0', () => {
    const penalties = settlePenalties(0, new Set(), '2026-10-01');
    expect(penalties.length).toBe(7);
    expect(penalties.every((p) => p.amount === 0)).toBe(true);
  });

  test('crosses month boundary correctly', () => {
    const penalties = settlePenalties(200, new Set(), '2026-10-01');
    expect(penalties[0]?.date).toBe('2026-09-30');
    expect(penalties[1]?.date).toBe('2026-09-29');
  });

  test('penalty idempotency key is user + date scoped', () => {
    expect(penaltyKey('u1', '2026-09-30')).toBe('penalty:u1:2026-09-30');
  });
});
