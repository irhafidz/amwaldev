import { describe, expect, test } from 'bun:test';
import {
  formatOrderId,
  formatProgramCode,
  moduleFromOrderId,
  ORDER_ID_V2_PATTERN,
  parseOrderId,
} from '../src/payment/order-id';

describe('@amwal/core/payment/order-id v2', () => {
  test('pads sequence 1 and 9999 correctly', () => {
    const at = new Date('2026-09-15T00:00:00.000Z');

    expect(formatOrderId({ module: 'WAQF', at, seq: 1 })).toBe('600926000001');
    expect(formatOrderId({ module: 'WAQF', at, seq: 9999 })).toBe(
      '600926009999'
    );
  });

  test('throws ORDER_SEQUENCE_EXHAUSTED for sequence 10000', () => {
    expect(() =>
      formatOrderId({
        module: 'WAQF',
        at: new Date('2026-09-15T00:00:00.000Z'),
        seq: 10_000,
      })
    ).toThrow('ORDER_SEQUENCE_EXHAUSTED');
  });

  test('uses the SEDEKAH module code 85, not INFAQ 80', () => {
    const id = formatOrderId({
      module: 'SEDEKAH',
      at: new Date('2026-09-15T00:00:00.000Z'),
      seq: 1,
    });

    expect(id.startsWith('85')).toBe(true);
    expect(ORDER_ID_V2_PATTERN.test(id)).toBe(true);
  });

  test('parses v2 ids and legacy ids', () => {
    const v2 = formatOrderId({
      module: 'ZAKAT',
      at: new Date('2026-09-15T00:00:00.000Z'),
      seq: 42,
    });

    expect(parseOrderId(v2)).toEqual({
      module: 'ZAKAT',
      subProgram: '00',
      month: 9,
      year: 2026,
      seq: 42,
    });
    expect(moduleFromOrderId('AMW-WAQF-01J8XYZ')).toBe('WAQF');
    expect(moduleFromOrderId('INF-01J8XYZ')).toBe('INFAQ');
    expect(moduleFromOrderId(v2)).toBe('ZAKAT');
  });
});

describe('@amwal/core/payment/order-id formatProgramCode', () => {
  test('pads sequence 1 and 99 into an 8-digit code', () => {
    const at = new Date('2026-09-15T00:00:00.000Z');

    expect(formatProgramCode({ module: 'WAQF', at, seq: 1 })).toBe('60092601');
    expect(formatProgramCode({ module: 'WAQF', at, seq: 99 })).toBe('60092699');
  });

  test('throws PROGRAM_CODE_SEQUENCE_EXHAUSTED for sequence 100', () => {
    expect(() =>
      formatProgramCode({
        module: 'WAQF',
        at: new Date('2026-09-15T00:00:00.000Z'),
        seq: 100,
      })
    ).toThrow('PROGRAM_CODE_SEQUENCE_EXHAUSTED');
  });

  test('throws PROGRAM_CODE_SEQUENCE_INVALID for sequence 0', () => {
    expect(() =>
      formatProgramCode({
        module: 'WAQF',
        at: new Date('2026-09-15T00:00:00.000Z'),
        seq: 0,
      })
    ).toThrow('PROGRAM_CODE_SEQUENCE_INVALID');
  });
});
