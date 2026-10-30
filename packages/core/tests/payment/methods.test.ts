import { describe, expect, test } from 'bun:test';
import {
  categoryOf,
  fallbackMethodForAmount,
  isMethodAllowedForAmount,
  maxAmountFor,
  methodLimitMessage,
  methodsInCategory,
  orderPaymentMethod,
  PAYMENT_METHOD_CODES,
  PAYMENT_METHODS,
  paymentMethodLabel,
  paymentMethodSchema,
  QRIS_MAX_RUPIAH,
} from '../../src/payment/methods';

describe('@amwal/core/payment/methods', () => {
  test('codes are the exact lowercase Mayar v2 paymentMethod values', () => {
    expect([...PAYMENT_METHOD_CODES]).toEqual([
      'qris',
      'va/bsi',
      'va/mandiri',
      'va/bni',
      'va/bri',
      'va/permata',
      'va/cimb',
      'va/bjb',
      'ewallet/gopay',
      'ewallet/dana',
      'ewallet/shopeepay',
      'ewallet/linkaja',
    ]);
    for (const { code } of PAYMENT_METHODS) {
      expect(String(code)).toBe(code.toLowerCase());
    }
  });

  test('every method belongs to exactly one category', () => {
    const total =
      methodsInCategory('qris').length +
      methodsInCategory('va').length +
      methodsInCategory('ewallet').length;
    expect(total).toBe(PAYMENT_METHODS.length);
    expect(methodsInCategory('qris')).toHaveLength(1);
    for (const method of PAYMENT_METHODS) {
      expect(categoryOf(method.code)).toBe(method.category);
    }
  });

  test('schema rejects values Mayar cannot take (and legacy ones)', () => {
    for (const bad of [
      'virtual_account',
      'bank_transfer',
      'ewallet/jenius',
      'ewallet/ovo',
      'outlet/alfamart',
      'QRIS',
      '',
    ]) {
      expect(paymentMethodSchema.safeParse(bad).success).toBe(false);
    }
    expect(paymentMethodSchema.safeParse('va/bni').success).toBe(true);
  });

  test('labels read well for new codes, legacy values and null', () => {
    expect(paymentMethodLabel('qris')).toBe('QRIS');
    expect(paymentMethodLabel('va/bni')).toBe('VA BNI');
    expect(paymentMethodLabel('va/cimb')).toBe('VA CIMB Niaga');
    expect(paymentMethodLabel('ewallet/shopeepay')).toBe('ShopeePay');
    expect(paymentMethodLabel('virtual_account')).toBe('Virtual Account');
    expect(paymentMethodLabel('something-new')).toBe('something-new');
    expect(paymentMethodLabel(null)).toBe('-');
  });

  test('orders keep using the legacy 3-value enum, with no migration', () => {
    expect(orderPaymentMethod('qris')).toBe('QRIS');
    expect(orderPaymentMethod('va/bsi')).toBe('VA');
    expect(orderPaymentMethod('ewallet/dana')).toBe('TRANSFER');
  });
});

describe('batas nominal per metode (QA-05, D7)', () => {
  test('QRIS dibatasi Rp 10.000.000 per transaksi, metode lain tidak', () => {
    expect(QRIS_MAX_RUPIAH).toBe(10_000_000);
    expect(maxAmountFor('qris')).toBe(10_000_000);
    expect(maxAmountFor('va/bni')).toBeNull();
    expect(maxAmountFor('ewallet/gopay')).toBeNull();
  });

  test('tepat di batas masih boleh, satu rupiah di atasnya ditolak', () => {
    expect(isMethodAllowedForAmount('qris', 10_000_000)).toBe(true);
    expect(isMethodAllowedForAmount('qris', 10_000_001)).toBe(false);
    expect(isMethodAllowedForAmount('va/bsi', 500_000_000)).toBe(true);
  });

  test('pesan penolakan mengarahkan ke Virtual Account', () => {
    const message = methodLimitMessage('qris', 15_000_000);
    expect(message).toContain('Rp 10.000.000');
    expect(message).toContain('Virtual Account');
    expect(methodLimitMessage('qris', 9_000_000)).toBeNull();
  });

  test('pilihan QRIS di atas batas dipindah ke Virtual Account, lainnya tetap', () => {
    expect(fallbackMethodForAmount('qris', 15_000_000)).toBe('va/bsi');
    expect(fallbackMethodForAmount('qris', 10_000_000)).toBe('qris');
    expect(fallbackMethodForAmount('ewallet/dana', 15_000_000)).toBe(
      'ewallet/dana'
    );
  });

  test('kode lama di luar daftar tidak dibatasi', () => {
    expect(methodLimitMessage('bank_transfer', 50_000_000)).toBeNull();
  });
});
