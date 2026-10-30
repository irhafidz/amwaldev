import { describe, expect, test } from 'bun:test';
import { createInfaqSchema } from '../../src/contracts/infaq';
import { createOrderSchema } from '../../src/contracts/waqf';
import { instructionsFromPaymentDetail } from '../../src/payment/mayar-instructions';

/** Bentuk `data.paymentDetail` yang benar-benar dikembalikan Mayar v2 (nilai disamarkan). */
const QR_STRING =
  '00020101021226650013CO.XENDIT.WWW01189360084800000005590215PZbCZzvRMw4gR7x0303UME51370014ID.CO.QRIS.WWW0215ID10200000000000303UME5204581253033605405100065802ID5910Amwal Test6007Jakarta6304ABCD';

describe('instructionsFromPaymentDetail', () => {
  test('QRIS: reads the EMV string and renders a PNG data URL from it', async () => {
    const result = await instructionsFromPaymentDetail({
      type: 'QR_CODE',
      qr_code: {
        amount: 1000,
        channel_code: 'XENDIT',
        channel_properties: {
          qr_string: QR_STRING,
          expires_at: '2026-10-08T05:17:38.397Z',
        },
      },
    });

    expect(result?.type).toBe('qris');
    if (result?.type !== 'qris') {
      throw new Error('expected qris');
    }
    expect(result.qrString).toBe(QR_STRING);
    expect(result.qrImage).toStartWith('data:image/png;base64,');
    expect(result.expiresAt).toBe('2026-10-08T05:17:38.397Z');
  });

  test('Virtual Account: bank code and account number', async () => {
    const result = await instructionsFromPaymentDetail({
      type: 'VIRTUAL_ACCOUNT',
      virtual_account: {
        channel_code: 'BNI',
        channel_properties: {
          virtual_account_number: '8808862065326583',
          expires_at: '2026-10-07T05:18:00.888Z',
        },
      },
    });

    expect(result).toEqual({
      type: 'virtual_account',
      bank: 'BNI',
      accountNumber: '8808862065326583',
      expiresAt: '2026-10-07T05:18:00.888Z',
    });
  });

  test('E-wallet: the first action that has a URL, with its type', async () => {
    const deeplink = await instructionsFromPaymentDetail({
      type: 'EWALLET',
      ewallet: { channel_code: 'GOPAY' },
      actions: [
        {
          action: 'AUTH',
          url: 'https://gopay.co.id/app/merchanttransfer?tref=A1',
          url_type: 'DEEPLINK',
          qr_code: null,
        },
      ],
    });
    const web = await instructionsFromPaymentDetail({
      ewallet: { channel_code: 'DANA' },
      actions: [
        { action: 'NOPE', url: null },
        {
          action: 'AUTH',
          url: 'https://m.dana.id/n/cashier/new/checkout?bizNo=1',
          url_type: 'WEB',
        },
      ],
    });

    expect(deeplink).toEqual({
      type: 'ewallet',
      wallet: 'GOPAY',
      actionUrl: 'https://gopay.co.id/app/merchanttransfer?tref=A1',
      actionType: 'DEEPLINK',
    });
    expect(web).toMatchObject({
      type: 'ewallet',
      wallet: 'DANA',
      actionType: 'WEB',
    });
  });

  test.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'oops'],
    ['an empty object', {}],
    ['a qr_code without a string', { qr_code: { channel_properties: {} } }],
    [
      'a VA without a number',
      { virtual_account: { channel_code: 'BNI', channel_properties: {} } },
    ],
    [
      'an e-wallet without an action URL',
      { ewallet: { channel_code: 'DANA' }, actions: [{ url: null }] },
    ],
    [
      'wrong types',
      { qr_code: 5, virtual_account: [], ewallet: 'x', actions: 'y' },
    ],
  ])(
    '%s gives undefined (the caller falls back to the Mayar link)',
    async (_label, detail) => {
      expect(await instructionsFromPaymentDetail(detail)).toBeUndefined();
    }
  );
});

describe('minimum donation is Rp 1.000 on the server', () => {
  const waqf = {
    programId: 'p1',
    donorName: 'Donatur',
    isAnonymous: false,
  };
  const infaq = {
    jenis: 'INFAQ_UMUM' as const,
    namaPenginfaq: 'Donatur',
  };

  test.each([
    [999, false],
    [1000, true],
    [1500, true],
    [0, false],
    [-5, false],
  ])('wakaf amount %i accepted: %p', (amount, accepted) => {
    expect(createOrderSchema.safeParse({ ...waqf, amount }).success).toBe(
      accepted
    );
  });

  test.each([
    [999, false],
    [1000, true],
    [10_000, true],
  ])('infaq nominal %i accepted: %p', (nominal, accepted) => {
    expect(createInfaqSchema.safeParse({ ...infaq, nominal }).success).toBe(
      accepted
    );
  });

  test('the validation message names the new minimum', () => {
    const result = createOrderSchema.safeParse({ ...waqf, amount: 500 });
    const issues = JSON.stringify(result.error?.issues);

    expect(issues).toContain('Rp 1.000');
    expect(issues).not.toContain('10.000');
  });
});
