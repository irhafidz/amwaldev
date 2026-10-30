import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  createMidtransSignatureKey,
  verifySha512Signature,
} from '../../src/payment/signature';

/**
 * Instant, no-DB unit test for the SHA-512 signature primitives moved into
 * `@amwal/core/payment/signature` (Putaran 17, Batch 1). This is the
 * "verifikasi SHA512" proof required for the payment extraction — it
 * exercises the exact functions `MidtransPaymentProvider` /
 * `MockPaymentProvider` (moved into `@amwal/core/payment/*.provider` in
 * Batch 3 — see `provider.test.ts` alongside this file for their
 * class-level behavior) call under the hood.
 */

const SERVER_KEY = 'SB-Mid-server-P17-B1-test-key-123456';
const ORDER_ID = 'AMW-WAKAF-01J8XYZ';
const STATUS_CODE = '200';
const GROSS_AMOUNT = '150000.00';

describe('@amwal/core/payment/signature', () => {
  test('createMidtransSignatureKey matches a manually computed SHA-512 hex digest', () => {
    const generated = createMidtransSignatureKey(
      {
        order_id: ORDER_ID,
        status_code: STATUS_CODE,
        gross_amount: GROSS_AMOUNT,
      },
      SERVER_KEY
    );

    const expected = createHash('sha512')
      .update(`${ORDER_ID}${STATUS_CODE}${GROSS_AMOUNT}${SERVER_KEY}`, 'utf8')
      .digest('hex');

    expect(generated).toBe(expected);
    expect(generated).toHaveLength(128); // SHA-512 hex digest length
  });

  test('a different gross_amount produces a different signature', () => {
    const a = createMidtransSignatureKey(
      {
        order_id: ORDER_ID,
        status_code: STATUS_CODE,
        gross_amount: GROSS_AMOUNT,
      },
      SERVER_KEY
    );
    const b = createMidtransSignatureKey(
      {
        order_id: ORDER_ID,
        status_code: STATUS_CODE,
        gross_amount: '150000.01',
      },
      SERVER_KEY
    );

    expect(a).not.toBe(b);
  });

  test('verifySha512Signature accepts a matching signature (case-insensitive)', () => {
    const signature = createMidtransSignatureKey(
      {
        order_id: ORDER_ID,
        status_code: STATUS_CODE,
        gross_amount: GROSS_AMOUNT,
      },
      SERVER_KEY
    );

    expect(verifySha512Signature(signature, signature)).toBe(true);
    expect(verifySha512Signature(signature, signature.toUpperCase())).toBe(
      true
    );
  });

  test('verifySha512Signature rejects a tampered signature', () => {
    const signature = createMidtransSignatureKey(
      {
        order_id: ORDER_ID,
        status_code: STATUS_CODE,
        gross_amount: GROSS_AMOUNT,
      },
      SERVER_KEY
    );
    const tampered = signature.startsWith('a')
      ? `b${signature.slice(1)}`
      : `a${signature.slice(1)}`;

    expect(verifySha512Signature(signature, tampered)).toBe(false);
  });

  test('verifySha512Signature rejects empty strings on either side', () => {
    expect(verifySha512Signature('', 'anything')).toBe(false);
    expect(verifySha512Signature('anything', '')).toBe(false);
    expect(verifySha512Signature('', '')).toBe(false);
  });
});
