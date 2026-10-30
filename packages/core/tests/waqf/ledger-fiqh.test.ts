import { describe, expect, test } from 'bun:test';
import type { WaqfLedgerState } from '../../src/waqf/ledger';
import { disburse, recordDonation, recordYield } from '../../src/waqf/ledger';

function amountToBigInt(value: bigint | number): bigint {
  return typeof value === 'number' ? BigInt(value) : value;
}

describe('waqf ledger fiqh invariants', () => {
  test('HABIS_PAKAI disbursement decrements principal and rejects overdraw', () => {
    const initial: WaqfLedgerState = {
      pokokDanaTerkumpul: 1000n,
      totalHasilAvailable: 0n,
      category: 'HABIS_PAKAI',
    };

    const funded = recordDonation(initial, 250);
    expect(amountToBigInt(funded.pokokDanaTerkumpul)).toBe(1250n);

    const disbursed = disburse(funded, 300);
    expect(amountToBigInt(disbursed.pokokDanaTerkumpul)).toBe(950n);
    expect(amountToBigInt(disbursed.totalHasilAvailable)).toBe(0n);

    expect(() => disburse(disbursed, 951)).toThrow('Insufficient principal');
    expect(amountToBigInt(disbursed.pokokDanaTerkumpul)).toBe(950n);
  });

  test('PRODUKTIF_KEKAL disbursement touches only yield and preserves principal', () => {
    const initial: WaqfLedgerState = {
      pokokDanaTerkumpul: 10_000n,
      totalHasilAvailable: 1000n,
      category: 'PRODUKTIF_KEKAL',
    };

    const disbursed = disburse(initial, 400);
    expect(amountToBigInt(disbursed.totalHasilAvailable)).toBe(600n);
    expect(amountToBigInt(disbursed.pokokDanaTerkumpul)).toBe(10_000n);

    expect(() => disburse(disbursed, 601)).toThrow(
      'Insufficient available yield'
    );
    expect(amountToBigInt(disbursed.totalHasilAvailable)).toBe(600n);
    expect(amountToBigInt(disbursed.pokokDanaTerkumpul)).toBe(10_000n);
  });

  test('fiqh property test: principal never decreases over random operation sequences', () => {
    let seed = 12_345;

    const nextRandom = (): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return seed / 4_294_967_296;
    };

    let state: WaqfLedgerState = {
      pokokDanaTerkumpul: 0n,
      totalHasilAvailable: 0n,
      category: 'PRODUKTIF_KEKAL',
    };

    for (let iteration = 0; iteration < 300; iteration += 1) {
      const before = state;
      const beforePrincipal = amountToBigInt(before.pokokDanaTerkumpul);
      const beforeYield = amountToBigInt(before.totalHasilAvailable);
      const roll = nextRandom();

      if (roll < 0.4) {
        const donation = Math.floor(nextRandom() * 10_000) + 1;
        state = recordDonation(state, donation);
      } else if (roll < 0.7) {
        const yieldAmount = Math.floor(nextRandom() * 5000) + 1;
        state = recordYield(state, yieldAmount);
      } else {
        const withdrawal = Math.floor(nextRandom() * 20_000) + 1;
        try {
          state = disburse(state, withdrawal);
        } catch {
          expect(amountToBigInt(state.pokokDanaTerkumpul)).toBe(
            beforePrincipal
          );
          expect(amountToBigInt(state.totalHasilAvailable)).toBe(beforeYield);
        }
      }

      const afterPrincipal = amountToBigInt(state.pokokDanaTerkumpul);
      const afterYield = amountToBigInt(state.totalHasilAvailable);

      expect(afterPrincipal >= beforePrincipal).toBe(true);
      expect(afterPrincipal >= 0n).toBe(true);
      expect(afterYield >= 0n).toBe(true);
    }
  });

  test('fractional or non-safe-integer money is rejected', () => {
    const state: WaqfLedgerState = {
      pokokDanaTerkumpul: 0n,
      totalHasilAvailable: 0n,
      category: 'PRODUKTIF_KEKAL',
    };

    expect(() => recordDonation(state, 1000.5)).toThrow('exact integer');
  });
});
