import { describe, expect, test } from 'bun:test';
import {
  createOrderId,
  isValidOrderId,
  ORDER_ID_PATTERN,
} from '../../src/payment/order-id';

describe('@amwal/core/payment/order-id', () => {
  test('creates a module-prefixed order id for WAQF/ZAKAT/QURBAN', () => {
    expect(createOrderId('WAQF')).toMatch(ORDER_ID_PATTERN);
    expect(createOrderId('ZAKAT')).toMatch(ORDER_ID_PATTERN);
    expect(createOrderId('QURBAN')).toMatch(ORDER_ID_PATTERN);
  });

  test('creates an INF-prefixed order id for INFAQ (does not match the AMW pattern)', () => {
    const id = createOrderId('INFAQ');
    expect(id.startsWith('INF-')).toBe(true);
    expect(ORDER_ID_PATTERN.test(id)).toBe(false);
  });

  test('rejects an unsupported module', () => {
    // @ts-expect-error deliberately invalid input
    expect(() => createOrderId('ZISWAF')).toThrow('Unsupported payment module');
  });

  test('isValidOrderId matches only well-formed AMW- order ids', () => {
    expect(isValidOrderId(createOrderId('WAQF'))).toBe(true);
    expect(isValidOrderId('not-an-order-id')).toBe(false);
    expect(isValidOrderId('AMW-INFAQ-01J8XYZ')).toBe(false);
  });
});
