import { describe, expect, test } from 'bun:test';
import { formatOrderIdDisplay } from '../../src/lib/payment/order-id-display';

describe('payment order ID display', () => {
  test('groups v2 IDs into readable 2-2-2-2-4 segments', () => {
    expect(formatOrderIdDisplay('600926000001')).toBe('60 09 26 00 0001');
    expect(formatOrderIdDisplay('850926000042')).toBe('85 09 26 00 0042');
  });

  test('leaves legacy IDs untouched', () => {
    const legacy = 'AMW-WAKAF-01J8XYZ000000000000000000';
    expect(formatOrderIdDisplay(legacy)).toBe(legacy);
    expect(formatOrderIdDisplay('INF-01J8XYZ000000000000000000')).toBe(
      'INF-01J8XYZ000000000000000000'
    );
  });
});
