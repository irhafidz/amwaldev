import { describe, expect, test } from 'bun:test';
import { MidtransPaymentProvider } from '../../src/payment/midtrans.provider';
import { MockPaymentProvider } from '../../src/payment/mock.provider';
import { createMidtransSignatureKey } from '../../src/payment/signature';
import type {
  CreatePaymentPayload,
  PaymentProvider,
  WebhookPayload,
} from '../../src/payment/types';
import { toDisbursementDestination } from '../../src/payment/types';

/**
 * Putaran 17, Batch 5 — closes a coverage gap found during the test-suite
 * parity audit: `MidtransPaymentProvider`/`MockPaymentProvider` moved into
 * `@amwal/core/payment/*.provider` in Batch 3 (both `apps/server` and
 * `apps/web` import the identical classes), but only
 * `apps/server/tests/payment/signature.test.ts` exercised them — there was
 * no `packages/core` test for the class-level API surface itself. Ported
 * from that file's `MidtransPaymentProvider`/provider-contract scenarios,
 * import paths repointed to local source (this file lives in the package
 * whose classes it tests).
 */

const SERVER_KEY = 'SB-Mid-server-P17-B5-test-key-123456';
const ORDER_ID = 'AMW-WAKAF-01J8XYZ';
const STATUS_CODE = '200';
const GROSS_AMOUNT = '150000.00';

function createWebhookPayload(): WebhookPayload {
  return {
    order_id: ORDER_ID,
    status_code: STATUS_CODE,
    gross_amount: GROSS_AMOUNT,
    payment_type: 'qris',
    transaction_status: 'settlement',
    fraud_status: 'accept',
  };
}

function createExpectedSignature(
  payload: Pick<WebhookPayload, 'order_id' | 'status_code' | 'gross_amount'>
): string {
  return createMidtransSignatureKey(payload, SERVER_KEY);
}

function flipFirstHexCharacter(value: string): string {
  return value.startsWith('a') ? `b${value.slice(1)}` : `a${value.slice(1)}`;
}

describe('@amwal/core/payment provider classes', () => {
  test('MidtransPaymentProvider accepts a valid SHA-512 signature', () => {
    const provider = new MidtransPaymentProvider(SERVER_KEY);
    const payload = createWebhookPayload();
    const signature = createExpectedSignature(payload);

    expect(provider.verifyWebhookSignature(payload, signature)).toBe(true);
  });

  test('MidtransPaymentProvider rejects a tampered signature or payload', () => {
    const provider = new MidtransPaymentProvider(SERVER_KEY);
    const payload = createWebhookPayload();
    const signature = createExpectedSignature(payload);
    const flippedSignature = flipFirstHexCharacter(signature);

    expect(flippedSignature).not.toBe(signature);
    expect(provider.verifyWebhookSignature(payload, flippedSignature)).toBe(
      false
    );

    const tamperedPayload: WebhookPayload = {
      ...payload,
      gross_amount: '150000.01',
    };
    expect(provider.verifyWebhookSignature(tamperedPayload, signature)).toBe(
      false
    );
  });

  test('MockPaymentProvider.createTransaction returns a dev-simulator redirect', async () => {
    const mockProvider = new MockPaymentProvider(SERVER_KEY);
    const payload: CreatePaymentPayload = {
      orderId: ORDER_ID,
      grossAmount: GROSS_AMOUNT,
      paymentType: 'qris',
      disbursementDestination: toDisbursementDestination(
        'BSI - Rekening Yayasan HETI'
      ),
    };

    const charge = await mockProvider.createTransaction(payload);
    expect(charge.providerRef).toBe(ORDER_ID);
    expect(charge.redirectUrl).toContain('/riwayat');
    expect(charge.paymentType).toBe('qris');
    expect(charge.qrCodeUrl).toContain('/riwayat');
    expect(charge.virtualAccountUrl).toBeUndefined();
    // Layar QRIS native di localhost: QR simulasi yang jelas bukan QRIS asli.
    expect(charge.instructions?.type).toBe('qris');
    if (charge.instructions?.type === 'qris') {
      expect(charge.instructions.qrString).toStartWith('AMWAL-SIMULASI-QRIS|');
      expect(charge.instructions.qrImage).toStartWith('data:image/png;base64,');
    }
  });

  test('MockPaymentProvider simulates VA and e-wallet instructions too', async () => {
    const mockProvider = new MockPaymentProvider(SERVER_KEY);
    const base = {
      orderId: '801026000123',
      grossAmount: GROSS_AMOUNT,
      disbursementDestination: toDisbursementDestination('BSI - Rekening'),
    } as const;

    const va = await mockProvider.createTransaction({
      ...base,
      paymentType: 'va/bni',
    });
    expect(va.instructions).toMatchObject({
      type: 'virtual_account',
      bank: 'BNI',
      accountNumber: '8808001026000123',
    });

    const wallet = await mockProvider.createTransaction({
      ...base,
      paymentType: 'ewallet/gopay',
    });
    expect(wallet.instructions).toMatchObject({
      type: 'ewallet',
      wallet: 'GOPAY',
      actionType: 'WEB',
    });
  });

  test('mock and Midtrans providers both conform to the PaymentProvider contract', () => {
    const mockProvider: PaymentProvider = new MockPaymentProvider(SERVER_KEY);
    const midtransProvider: PaymentProvider = new MidtransPaymentProvider(
      SERVER_KEY
    );
    const providers = [mockProvider, midtransProvider];

    for (const provider of providers) {
      expect(typeof provider.createTransaction).toBe('function');
      expect(typeof provider.verifyWebhookSignature).toBe('function');
    }

    const webhookPayload = createWebhookPayload();
    const signature = createExpectedSignature(webhookPayload);
    for (const provider of providers) {
      expect(provider.verifyWebhookSignature(webhookPayload, signature)).toBe(
        true
      );
    }
  });
});
