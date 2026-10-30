import { describe, expect, test } from 'bun:test';
import {
  affiliateRewardPoints,
  transactionPointKeys,
  transactionPoints,
} from '../../src/gamification/points';

describe('transactionPoints (D2)', () => {
  test('awards flat 200 plus ⌊nominal/1.000⌋', () => {
    expect(transactionPoints(100_000)).toEqual({ base: 200, amount: 100 });
    expect(transactionPoints(1000)).toEqual({ base: 200, amount: 1 });
  });

  test('rounds amount down at the 1.000 boundary', () => {
    expect(transactionPoints(999)).toEqual({ base: 200, amount: 0 });
    expect(transactionPoints(1999)).toEqual({ base: 200, amount: 1 });
  });

  test('zero nominal still awards the flat base', () => {
    expect(transactionPoints(0)).toEqual({ base: 200, amount: 0 });
  });

  test('rejects negative and fractional amounts', () => {
    expect(() => transactionPoints(-1)).toThrow();
    expect(() => transactionPoints(1000.5)).toThrow();
  });

  test('idempotency keys are distinct and transaction-scoped', () => {
    const keys = transactionPointKeys('txn-123');
    expect(keys.base).toBe('txn:txn-123');
    expect(keys.amount).toBe('txnamt:txn-123');
    expect(keys.base).not.toBe(keys.amount);
  });
});

describe('affiliateRewardPoints (I-4)', () => {
  test('min(100 + ⌊nominal/10.000⌋, 500)', () => {
    expect(affiliateRewardPoints(10_000)).toBe(101);
    expect(affiliateRewardPoints(100_000)).toBe(110);
  });

  test('caps at 500', () => {
    expect(affiliateRewardPoints(4_000_000)).toBe(500);
    expect(affiliateRewardPoints(10_000_000)).toBe(500);
  });

  test('rejects negative and fractional amounts', () => {
    expect(() => affiliateRewardPoints(-1)).toThrow();
    expect(() => affiliateRewardPoints(10_000.5)).toThrow();
  });
});
